import gzip
import json
import os
import sys
from datetime import date

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # so "import adapter" and "import yieldsafe" work

FIXTURE = os.path.join(HERE, "fixtures", "workbook_default.json.gz")


@pytest.fixture(scope="session")
def workbook() -> dict:
    """The default scenario of the Yield-SAFE v2 workbook (Silsoe weather 1992-2023, AGF poplar
    at 156 trees/ha over a cereal rotation then grass, fine soil) with the values Excel cached.
    Written by tools/from_workbook.py; see tests/fixtures/README.md."""
    with gzip.open(FIXTURE, "rt") as f:
        return json.load(f)


@pytest.fixture(scope="session")
def scenario(workbook):
    from yieldsafe.model import CropParams, Irrigation, Scenario, SoilParams, TreeParams, YearPlan

    w = workbook
    return Scenario(
        start=date.fromisoformat(w["start"]),
        temp_c=w["weather"]["temp_c"], rad_mj=w["weather"]["rad_mj"], rain_mm=w["weather"]["rain_mm"],
        tree=TreeParams(**w["tree"]),
        crops={int(k): CropParams(**v) for k, v in w["crops"].items()},
        soil=SoilParams(**w["soil"]),
        plan={int(k): YearPlan(**v) for k, v in w["plan"].items()},
        irrigation=Irrigation(**w["irrigation"]),
        **w["management"],
    )


CLEAN_DAYS = 10958  # 1992-01-01 .. 2021-12-31


@pytest.fixture(scope="session")
def workbook_request(workbook) -> dict:
    """The same scenario expressed as an API request (templates + crop calendar).

    Only the 30 clean years of weather: the workbook's radiation is negative on every day
    from 2022-01-01 (591 days), which the API rejects. The crop calendar runs one year
    further, because on harvest days the model reads next year's crop."""
    w = workbook
    plan = {int(k): v for k, v in w["plan"].items()}
    years = []
    for i in range(31):
        nxt = plan.get(i + 1, {})
        crop = int(nxt.get("crop", 0))
        years.append({
            "crop": crop if crop != 9 or nxt.get("crop_area", 0) else 0,
            "crop_area": nxt.get("crop_area", 0.0),
            "trees_planted_per_ha": plan.get(i, {}).get("trees_planted_ha", 0.0),
            "trees_removed_per_ha": nxt.get("trees_harvested_ha", 0.0),
        })
    return {
        "inputs": {
            "site": {"lat": 52.0, "lon": -0.42, "name": "Silsoe (workbook default)"},
            "weather": {"start": w["start"], "temp_c": w["weather"]["temp_c"][:CLEAN_DAYS],
                        "rad_mj_m2": w["weather"]["rad_mj"][:CLEAN_DAYS], "rain_mm": w["weather"]["rain_mm"][:CLEAN_DAYS]},
            "tree": {"template": "poplar_upson_agf"},
            "soil": {"texture": "fine_upson_2014", "vwc0": w["soil"]["vwc0"], "depth_mm": w["soil"]["depth_mm"]},
            "years": years,
        }
    }


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from adapter.server import app

    return TestClient(app)
