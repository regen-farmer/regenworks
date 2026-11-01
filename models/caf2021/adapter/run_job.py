"""Run one CAF2021 job in its own process.

    python -m adapter.run_job <workdir>

Reads <workdir>/request.json (an already validated Caf2021Inputs document), calls the
compiled Fortran subroutine CAF2021 directly through ctypes (no R), and writes
<workdir>/result.json. Fortran module variables persist inside a process, so
every job gets a fresh one; the parent enforces time and memory limits.

Environment:
  CAF2021_LIB     path to the compiled shared library (libcaf2021.so)
  CAF2021_PARAMS  path to upstream parameters/parameters_default.txt
Exit codes: 0 ok, 2 bad input, 3 model error.
"""

from __future__ import annotations

import ctypes
import json
import os
import sys

import numpy as np

from .outputs import INDEX, NOUT, OUTPUTS

NPAR = 200  # PARAMS(200) in set_params.f90
NMAXDAYS = 10_000
NWEATHER = 8


class BadInput(Exception):
    pass


def load_default_parameters(path: str) -> tuple[list[str], np.ndarray]:
    names, values = [], []
    with open(path) as f:
        next(f)  # header
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 2 or not cols[0]:
                continue
            names.append(cols[0])
            values.append(float(cols[1]))
    return names, np.array(values)


def limit_memory() -> None:
    mb = int(os.environ.get("CAF2021_MEMORY_MB", "0") or 0)
    if mb > 0:
        try:
            import resource

            resource.setrlimit(resource.RLIMIT_AS, (mb * 1024 * 1024, mb * 1024 * 1024))
        except (ImportError, ValueError, OSError):
            pass


def calendar(rows: list[tuple[float, float, float]]) -> np.ndarray:
    c = -np.ones((100, 3), order="F")
    for i, r in enumerate(rows):
        c[i] = r
    return c


def tree_calendar(events: list[dict]) -> np.ndarray:
    c = -np.ones((3, 100, 3), order="F")  # (species, event, [year, doy, fraction])
    count = [0, 0, 0]
    for e in sorted(events, key=lambda e: (e["year"], e["doy"])):
        s = e["species"] - 1
        c[s, count[s]] = (e["year"], e["doy"], e["fraction"])
        count[s] += 1
    return c


def run(workdir: str) -> dict:
    with open(os.path.join(workdir, "request.json")) as f:
        inputs = json.load(f)["inputs"]

    names, params = load_default_parameters(os.environ["CAF2021_PARAMS"])
    pindex = {n: i for i, n in enumerate(names)}
    unknown = [k for k in inputs.get("parameters", {}) if k not in pindex]
    if unknown:
        raise BadInput(f"unknown CAF2021 parameter(s): {', '.join(unknown)}")
    for k, v in inputs.get("parameters", {}).items():
        params[pindex[k]] = v
    params[pindex["LAT"]] = inputs["site"]["lat"]
    p = np.zeros(NPAR)
    p[: len(params)] = params

    weather = inputs["weather"]
    ndays = len(weather)
    w = np.zeros((NMAXDAYS, NWEATHER), order="F")
    for i, d in enumerate(weather):
        w[i] = (
            d["year"], d["doy"], d["rad_mj_m2"], d["tmin_c"], d["tmax_c"],
            d["vp_kpa"], d["wind_m_s"], d["rain_mm"],
        )

    m = inputs.get("management", {})
    fert = calendar([(e["year"], e["doy"], e["n_kg_ha"]) for e in sorted(m.get("fertilisation", []), key=lambda e: (e["year"], e["doy"]))])
    prun_c = calendar([(e["year"], e["doy"], e["fraction"]) for e in sorted(m.get("coffee_pruning", []), key=lambda e: (e["year"], e["doy"]))])
    prun_t = tree_calendar(m.get("tree_pruning", []))
    thin_t = tree_calendar(m.get("tree_thinning", []))

    y = np.zeros((ndays, NOUT), order="F")
    lib = ctypes.CDLL(os.environ["CAF2021_LIB"])
    ptr = lambda a: a.ctypes.data_as(ctypes.c_void_p)  # noqa: E731
    lib.caf2021_(
        ptr(p), ptr(w), ptr(fert), ptr(prun_c), ptr(prun_t), ptr(thin_t),
        ctypes.byref(ctypes.c_int(ndays)), ctypes.byref(ctypes.c_int(NOUT)), ptr(y),
    )
    if not np.isfinite(y).all():
        bad = sorted({OUTPUTS[j][0] for j in np.where(~np.isfinite(y).all(axis=0))[0]})[:10]
        raise RuntimeError(f"CAF2021 produced non-finite values (check inputs/parameters): {', '.join(bad)}")

    warnings = []
    tree_dens = [params[pindex[f"TREEDENS0({s})"]] for s in (1, 2, 3)]
    if max(tree_dens) == 0:
        warnings.append("All TREEDENS0(1..3) are 0: this run has no shade trees")

    return {"outputs": summarise(y, params[pindex["CCONC"]], inputs.get("daily_variables", [])), "warnings": warnings}


def col(y, name):
    return y[:, INDEX[name]]


def summarise(y: np.ndarray, cconc: float, daily_vars: list[str]) -> dict:
    years = col(y, "year").astype(int)
    out: dict[str, list[float]] = {}

    def put(key, values):
        out.setdefault(key, []).append(round(float(values), 4))

    uniq = sorted(set(years.tolist()))
    for yr in uniq:
        s = y[years == yr]
        last = s[-1]

        def end(n, f=1.0):
            return last[INDEX[n]] * f

        def total(n, f=1.0):
            return s[:, INDEX[n]].sum() * f

        harv_c = total("harvCP_f")  # kg C m-2
        put("coffee_harvest_t_c_ha", harv_c * 10)
        put("coffee_harvest_dm_kg_ha", harv_c / cconc * 10_000 if cconc else 0.0)
        put("coffee_biomass_t_c_ha", end("C_f", 10))
        put("tree_biomass_t_c_ha", end("CT_f", 10))
        for sp in (1, 2, 3):
            put(f"tree_stem_t_c_ha_{sp}", end(f"CST_t({sp})", 10))
            put(f"tree_density_per_ha_{sp}", end(f"treedens_t({sp})", 10_000))
            put(f"tree_height_m_{sp}", end(f"h_t({sp})"))
        put("soil_c_t_ha", end("Csoil_f", 10))
        put("soil_n_t_ha", end("Nsoil_f", 10))
        put("system_c_t_ha", (end("C_f") + end("CT_f") + end("Csoil_f")) * 10)
        put("n_fertiliser_kg_ha", total("Nfert_f", 10_000))
        put("n_fixation_kg_ha", total("NfixT_f", 10_000))
        put("n_leaching_kg_ha", total("Nleaching_f", 10_000))
        put("n_emission_kg_ha", total("Nemission_f", 10_000))
        put("n_runoff_kg_ha", total("Nrunoff_f", 10_000))
        put("c_soil_respiration_t_ha", total("Rsoil_f", 10))
        put("rain_mm", total("Rain_f"))
        put("drainage_mm", total("Drain_f"))
        put("runoff_mm", total("Runoff_f"))
        put("evaporation_mm", total("Evap_f"))
        put("transpiration_coffee_mm", total("Tran_f"))
        put("transpiration_trees_mm", total("TranT_f"))
        put("days", len(s))

    daily: dict[str, list[float]] = {}
    units: dict[str, str] = {}
    if daily_vars:
        daily["year"] = years.tolist()
        daily["doy"] = col(y, "doy").astype(int).tolist()
        for v in daily_vars:
            daily[v] = [round(float(x), 8) for x in col(y, v)]
            units[v] = OUTPUTS[INDEX[v]][1]
    return {"years": uniq, "annual": out, "daily": daily, "daily_units": units}


def main() -> int:
    workdir = sys.argv[1]
    limit_memory()
    try:
        result = run(workdir)
        code = 0
    except BadInput as e:
        result, code = {"error": "bad_input", "detail": str(e)}, 2
    except MemoryError:
        result, code = {"error": "model_error", "detail": "CAF2021 ran out of its memory limit"}, 3
    except Exception as e:  # noqa: BLE001
        result, code = {"error": "model_error", "detail": f"{type(e).__name__}: {e}"}, 3
    with open(os.path.join(workdir, "result.json"), "w") as f:
        json.dump(result, f)
    return code


if __name__ == "__main__":
    sys.exit(main())
