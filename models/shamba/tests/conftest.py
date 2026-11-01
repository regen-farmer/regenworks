import csv
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # so "import adapter" works

EXAMPLE = os.path.join("projects", "examples", "UG_TS_2016", "input")


def _shamba_src() -> str:
    src = os.environ.get("SHAMBA_SRC", "")
    if not os.path.isdir(os.path.join(src, "model")):
        pytest.skip("SHAMBA_SRC is not set to the upstream 'shamba/shamba' folder")
    return src


def _num(v: str):
    try:
        f = float(v)
    except ValueError:
        return v
    return int(f) if f.is_integer() and "." not in v else f


def _table(path: str) -> dict:
    with open(path, newline="") as f:
        rows = list(csv.reader(f))
    return {"columns": rows[0], "rows": [[_num(v) for v in r] for r in rows[1:] if r]}


@pytest.fixture(scope="session")
def shamba_src() -> str:
    return _shamba_src()


@pytest.fixture(scope="session")
def uganda_request(shamba_src) -> dict:
    """SHAMBA's own Uganda example (UG_TS_2016), as a GroveWorks request.

    Built from the upstream files at test time, so no SHAMBA data is copied
    into this repository.
    """
    d = os.path.join(shamba_src, EXAMPLE)
    with open(os.path.join(d, "WL_input.csv"), newline="") as f:
        row = next(csv.DictReader(f))
    with open(os.path.join(d, "climate.csv"), newline="") as f:
        climate = [
            {"temp_c": float(r["Temp"]), "rain_mm": float(r["Rain"]), "evap_mm": float(r["evap"])}
            for r in csv.DictReader(f)
        ]
    with open(os.path.join(d, "soil-info.csv"), newline="") as f:
        soil = next(r for r in csv.DictReader(f) if r["plot_name"] == row["plot_name"])

    intervention = {k: _num(v) for k, v in row.items() if k not in ("lat", "lon", "plot_name")}
    return {
        "inputs": {
            "site": {
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "climate": climate,
                "soil": {"soc_t_c_per_ha": float(soil["Cy0"]), "clay_pct": float(soil["clay"])},
            },
            "intervention": intervention,
            "parameters": {
                "tree": _table(os.path.join(d, "tree_params.csv")),
                "crop": _table(os.path.join(d, "crop_params.csv")),
                "litter": _table(os.path.join(d, "litter_params.csv")),
                "biomass_pool": _table(os.path.join(d, "biomass_pool_params.csv")),
            },
            "options": {"n_cohorts": 1, "allometry": ["chave dry", "chave dry"], "gwp": "AR6"},
        }
    }
