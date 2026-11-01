"""Run one SHAMBA job in its own process.

    python -m adapter.run_job <workdir>

Reads <workdir>/request.json (an already validated ShambaInputs document),
writes SHAMBA's input files into <workdir>/input, runs the model with
use_api=False (no network), and writes <workdir>/result.json.

SHAMBA keeps its paths in module-level globals, so every job gets a fresh
process. The parent (runner.py) enforces the time and memory limits.

Exit codes: 0 ok, 2 bad input (missing or unusable value), 3 model error.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

GWP_NAMES = {
    "SAR": "GWP SAR (1995)",
    "AR4": "GWP AR4 (2007)",
    "AR5": "GWP AR5 (2013)",
    "AR6": "GWP AR6 (2021)",
}
PLOT_ID = 0


class _Collect(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.WARNING)
        self.messages: list[str] = []

    def emit(self, record):
        msg = record.getMessage()
        if msg not in self.messages and len(self.messages) < 50:
            self.messages.append(msg)


def _write_csv(path: str, columns: list, rows: list) -> None:
    with open(path, "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(columns)
        w.writerows(["" if v is None else v for v in row] for row in rows)


def write_inputs(inputs: dict, input_dir: str) -> dict:
    """Write SHAMBA's input files. Returns the intervention row as SHAMBA reads it."""
    os.makedirs(input_dir, exist_ok=True)
    site = inputs["site"]

    _write_csv(
        os.path.join(input_dir, "climate.csv"),
        ["Temp", "Rain", "evap"],
        [[m["temp_c"], m["rain_mm"], m["evap_mm"]] for m in site["climate"]],
    )
    _write_csv(
        os.path.join(input_dir, "soil-info.csv"),
        ["plot_name", "Cy0", "clay"],
        [[PLOT_ID, site["soil"]["soc_t_c_per_ha"], site["soil"]["clay_pct"]]],
    )

    files = {
        "tree": "tree_params.csv",
        "crop": "crop_params.csv",
        "litter": "litter_params.csv",
        "biomass_pool": "biomass_pool_params.csv",
    }
    for key, name in files.items():
        table = (inputs.get("parameters") or {}).get(key)
        if table:
            _write_csv(os.path.join(input_dir, name), table["columns"], table["rows"])

    row = {k: ("" if v is None else str(v)) for k, v in inputs["intervention"].items()}
    row["lat"] = str(site["lat"])
    row["lon"] = str(site["lon"])
    row["plot_name"] = str(PLOT_ID)  # soil-info.csv is keyed on this
    return row


def limit_memory() -> None:
    """Cap this process's address space (Linux). Set by the parent via SHAMBA_MEMORY_MB.

    Done here rather than with subprocess preexec_fn, which is unsafe when the
    parent has threads (the HTTP server runs jobs from a thread pool).
    """
    mb = int(os.environ.get("SHAMBA_MEMORY_MB", "0") or 0)
    if mb <= 0:
        return
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (mb * 1024 * 1024, mb * 1024 * 1024))
    except (ImportError, ValueError, OSError):
        pass


def run(workdir: str) -> dict:
    src = os.environ.get("SHAMBA_SRC")
    if not src or not os.path.isdir(os.path.join(src, "model")):
        raise RuntimeError("SHAMBA_SRC must point at the upstream 'shamba/shamba' folder")
    sys.path.insert(0, src)
    os.environ.setdefault("MPLBACKEND", "Agg")

    with open(os.path.join(workdir, "request.json")) as f:
        job = json.load(f)
    inputs = job["inputs"]

    collector = _Collect()
    logging.getLogger().addHandler(collector)
    logging.getLogger().setLevel(logging.WARNING)

    from model import configuration  # noqa: E402  (needs SHAMBA_SRC on sys.path)

    input_dir = os.path.join(workdir, "input")
    configuration.SAVE_DIR = workdir
    configuration.INPUT_DIR = input_dir
    configuration.OUTPUT_DIR = os.path.join(workdir, "output")
    os.makedirs(configuration.OUTPUT_DIR, exist_ok=True)

    row = write_inputs(inputs, input_dir)

    import model.soil_models.forward_soil_model as forward  # noqa: E402
    import model.soil_models.inverse_soil_model as inverse  # noqa: E402
    from model.common.calculate_emissions import handle_intervention  # noqa: E402
    from model.common.constants import GWP_list  # noqa: E402
    from model.soil_models.soil_model_types import SoilModelType  # noqa: E402

    opts = inputs.get("options") or {}
    gwp_key = opts.get("gwp", "AR6")
    started = time.time()
    r = handle_intervention(
        intervention_input=row,
        create_forward_soil_model=forward.get_soil_model(SoilModelType.ROTH_C).create,
        create_inverse_soil_model=inverse.get_soil_model(SoilModelType.ROTH_C).create,
        n_cohorts=int(opts.get("n_cohorts", 1)),
        plot_index=0,
        allometry=list(opts.get("allometry", ["chave dry", "chave dry"])),
        gwp=GWP_list[GWP_NAMES[gwp_key]],
        use_api=False,
    )

    def series(base, proj):
        b = [float(x) for x in base]
        p = [float(x) for x in proj]
        return {"baseline": b, "project": p, "difference": [q - a for a, q in zip(b, p)]}

    pools = {
        "total": series(r.emit_base_emissions, r.emit_project_emissions),
        "tree": series(r.tree_base_emissions, r.tree_project_emissions),
        "soil": series(r.soil_base_emissions, r.soil_project_emissions),
        "crop": series(r.crop_base_emissions, r.crop_project_emissions),
        "fire": series(r.fire_base_emissions, r.fire_project_emissions),
        "litter": series(r.litter_base_emissions, r.litter_project_emissions),
        "fertiliser": series(r.fertiliser_base_emissions, r.fertiliser_project_emissions),
    }

    def soc_totals(data):
        import numpy as np

        soc = np.asarray(data.SOC, dtype=float)
        return [float(x) for x in (soc.sum(axis=1) if soc.ndim == 2 else soc)]

    return {
        "outputs": {
            "unit": "t CO2e/ha/yr",
            "years": len(pools["total"]["difference"]),
            "pools": pools,
            "totals": {k: sum(v["difference"]) for k, v in pools.items()},
            "soil_carbon_t_c_per_ha": {
                "baseline": soc_totals(r.base_forward_soil_data),
                "project": soc_totals(r.project_forward_soil_data),
            },
        },
        "run": {
            "started_at": datetime.fromtimestamp(started, timezone.utc).isoformat(),
            "model_seconds": round(time.time() - started, 3),
            "gwp": gwp_key,
            "warnings": collector.messages,
        },
    }


def main() -> int:
    workdir = sys.argv[1]
    limit_memory()
    try:
        result = run(workdir)
        code = 0
    except KeyError as e:
        result = {"error": "bad_input", "detail": f"missing input value {e}"}
        code = 2
    except (ValueError, IndexError) as e:
        result = {"error": "bad_input", "detail": f"{type(e).__name__}: {e}"}
        code = 2
    except MemoryError:
        result = {"error": "model_error", "detail": "SHAMBA ran out of its memory limit"}
        code = 3
    except Exception as e:  # noqa: BLE001  (report anything else as a model error)
        result = {"error": "model_error", "detail": f"{type(e).__name__}: {e}"}
        code = 3
    with open(os.path.join(workdir, "result.json"), "w") as f:
        json.dump(result, f)
    return code


if __name__ == "__main__":
    sys.exit(main())
