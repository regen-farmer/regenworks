import csv
import os
import sys
import time

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # so "import adapter" works

# DynACof's default site (Aquiares, Costa Rica), matching its default parameters.
AQUIARES = {"lat": 9.93833, "lon": -83.72861, "elevation_m": 1040.0, "timezone_offset_h": 6, "name": "Aquiares"}

COLUMNS = {
    "Rain": "rain_mm", "Tair": "tair_c", "Tmax": "tmax_c", "Tmin": "tmin_c", "RH": "rh_pct", "RAD": "rad_mj_m2",
    "PAR": "par_mj_m2", "Pressure": "pressure_hpa", "WindSpeed": "wind_m_s", "CO2": "co2_ppm", "VPD": "vpd_hpa",
    "FDiff": "diffuse_fraction", "DegreeDays": "degree_days",
}


@pytest.fixture(scope="session")
def aquiares_meteo() -> list:
    """Daily weather 1979-2016 from the upstream DynACof.jl_inputs repository (read at test time, not copied)."""
    d = os.environ.get("DYNACOF_INPUTS", "")
    path = os.path.join(d, "meteorology.txt")
    if not os.path.isfile(path):
        pytest.skip("DYNACOF_INPUTS is not set to a checkout of VEZY/DynACof.jl_inputs")
    with open(path, newline="") as f:
        return [
            {"date": r["Date"], **{v: float(r[k]) for k, v in COLUMNS.items()}}
            for r in csv.DictReader(f)
        ]


@pytest.fixture(scope="session")
def aquiares_request(aquiares_meteo) -> dict:
    return {"inputs": {"site": dict(AQUIARES), "meteo": aquiares_meteo}}


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from adapter.server import app

    with TestClient(app) as c:  # starts (and at the end stops) the Julia worker
        deadline = time.time() + 900
        while c.get("/health").json()["status"] != "ok":
            assert time.time() < deadline, "Julia worker did not start"
            time.sleep(1)
        yield c
