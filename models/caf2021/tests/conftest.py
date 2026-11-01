import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # so "import adapter" works


@pytest.fixture(scope="session")
def caf_src() -> str:
    """Upstream CAF2021 checkout and the library compiled from it (see ../README.md)."""
    src = os.environ.get("CAF2021_SRC", "")
    lib = os.environ.get("CAF2021_LIB", "")
    if not os.path.isfile(os.path.join(src, "parameters", "parameters_default.txt")) or not os.path.isfile(lib):
        pytest.skip("set CAF2021_SRC (upstream checkout) and CAF2021_LIB (compiled libcaf2021.so)")
    os.environ.setdefault("CAF2021_PARAMS", os.path.join(src, "parameters", "parameters_default.txt"))
    return src


@pytest.fixture(scope="session")
def turrialba_request(caf_src) -> dict:
    """CAF2021's own example 'Turrialba_01_E_AC' (coffee under Erythrina, 2000-2017),
    rebuilt from the upstream files at test time. Management mirrors
    initialisation/set_CAF2021_Turrialba*.R, *_trees_E_AC.R and *_fert_AC.R."""
    weather = []
    with open(os.path.join(caf_src, "weather", "weather_Turrialba_2000_2017.txt")) as f:
        header = f.readline().split()
        for line in f:
            r = dict(zip(header, line.split()))
            if not r:
                continue
            weather.append(
                {
                    "year": int(r["year"]), "doy": int(r["doy"]), "rad_mj_m2": float(r["GR"]), "tmin_c": float(r["TMIN"]),
                    "tmax_c": float(r["TMAX"]), "vp_kpa": float(r["VP"]), "wind_m_s": float(r["WN"]),
                    "rain_mm": float(r["RAIN"]),
                }
            )
    start = next(i for i, d in enumerate(weather) if (d["year"], d["doy"]) == (2000, 214))
    weather = weather[start : start + 6357]

    fert = [{"year": y, "doy": d, "n_kg_ha": 100.0} for y in range(2002, 2018) for d in (135, 289, 350)]
    prun_c = [{"year": y, "doy": 59, "fraction": 0.28} for y in range(2004, 2018)]
    prun_t = [{"species": 1, "year": 2001, "doy": 266, "fraction": 0.8}] + [
        {"species": 1, "year": y, "doy": d, "fraction": 0.6} for y in range(2002, 2018) for d in (140, 350)
    ]
    thin_t = [
        {"species": 1, "year": 2007, "doy": 124, "fraction": 0.004},
        {"species": 1, "year": 2010, "doy": 124, "fraction": 0.49},
    ]
    return {
        "inputs": {
            "site": {"lat": 9.89, "lon": -83.68, "name": "Turrialba"},
            "weather": weather,
            "parameters": {"TREEDENS0(1)": 0.07},
            "management": {
                "fertilisation": fert, "coffee_pruning": prun_c, "tree_pruning": prun_t, "tree_thinning": thin_t,
            },
        }
    }


@pytest.fixture(scope="session")
def client(caf_src):
    from fastapi.testclient import TestClient

    from adapter.server import app

    return TestClient(app)
