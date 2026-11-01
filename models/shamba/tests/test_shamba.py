"""Golden and contract tests for the SHAMBA wrapper.

The golden numbers come from running upstream SHAMBA directly (its own
handle_intervention, use_api=False) on the UG_TS_2016 example at the commit
pinned in the Dockerfile. If the pinned commit changes, re-check them.
"""

import copy

import pytest
from fastapi.testclient import TestClient

from adapter.schema import ExecuteRequest

# t CO2e/ha over 50 years, project minus baseline (negative = removal)
GOLDEN = {
    "total": -185.4602,
    "tree": -82.4047,
    "soil": -92.9697,
    "crop": -10.0858,
    "fire": 0.0,
    "litter": 0.0,
    "fertiliser": 0.0,
}


@pytest.fixture(scope="module")
def client(shamba_src):
    from adapter.server import app

    return TestClient(app)


@pytest.fixture(scope="module")
def uganda_response(client, uganda_request):
    r = client.post("/processes/shamba/execution", json=uganda_request)
    assert r.status_code == 200, r.text
    return r.json()


def test_golden_totals(uganda_response):
    out = uganda_response["outputs"]
    assert out["years"] == 50
    for pool, expected in GOLDEN.items():
        assert out["totals"][pool] == pytest.approx(expected, abs=1e-3), pool


def test_series_are_consistent(uganda_response):
    out = uganda_response["outputs"]
    for name, s in out["pools"].items():
        assert len(s["baseline"]) == len(s["project"]) == len(s["difference"]) == out["years"], name
        for b, p, d in zip(s["baseline"], s["project"], s["difference"]):
            assert d == pytest.approx(p - b)
    pools = out["pools"]
    parts = ("tree", "soil", "crop", "fire", "litter", "fertiliser")
    for i in range(out["years"]):
        assert pools["total"]["difference"][i] == pytest.approx(
            sum(pools[p]["difference"][i] for p in parts), abs=1e-6
        )
    soc = out["soil_carbon_t_c_per_ha"]
    assert len(soc["baseline"]) >= out["years"] and len(soc["project"]) >= out["years"]


def test_provenance(uganda_response, uganda_request):
    run = uganda_response["run"]
    assert run["process"] == "shamba" and run["model_version"] == "1.2"
    assert len(run["input_sha256"]) == 64
    assert run["gwp"] == "AR6"
    # same input -> same hash, key order does not matter
    from adapter.runner import input_sha256

    req = ExecuteRequest.model_validate(uganda_request)
    shuffled = copy.deepcopy(uganda_request)
    shuffled["inputs"]["intervention"] = dict(reversed(list(shuffled["inputs"]["intervention"].items())))
    assert input_sha256(req.inputs) == input_sha256(ExecuteRequest.model_validate(shuffled).inputs)


def test_description_lists_schemas_and_limits(client):
    d = client.get("/processes/shamba").json()
    assert d["id"] == "shamba"
    assert "inputs" in d and "outputs" in d
    assert d["limits"]["maxYears"] == 100
    assert client.get("/processes").json()["processes"][0]["id"] == "shamba"


def test_rejects_bad_schema(client, uganda_request):
    bad = copy.deepcopy(uganda_request)
    bad["inputs"]["site"]["climate"] = bad["inputs"]["site"]["climate"][:11]
    r = client.post("/processes/shamba/execution", json=bad)
    assert r.status_code == 400
    assert "climate" in r.json()["detail"]


def test_rejects_unknown_allometry(client, uganda_request):
    bad = copy.deepcopy(uganda_request)
    bad["inputs"]["options"]["allometry"] = ["chave dry", "my_python_file"]
    assert client.post("/processes/shamba/execution", json=bad).status_code == 400


def test_rejects_too_many_years(client, uganda_request):
    bad = copy.deepcopy(uganda_request)
    bad["inputs"]["intervention"]["yrs_proj"] = 500
    assert client.post("/processes/shamba/execution", json=bad).status_code == 400


def test_missing_model_key_is_bad_input(client, uganda_request):
    bad = copy.deepcopy(uganda_request)
    del bad["inputs"]["intervention"]["base_plant_dens"]
    r = client.post("/processes/shamba/execution", json=bad)
    assert r.status_code == 400
    assert "base_plant_dens" in r.json()["detail"]


def test_token_required_when_configured(shamba_src, uganda_request, monkeypatch):
    import adapter.server as server

    monkeypatch.setattr(server, "API_TOKEN", "s3cret")
    c = TestClient(server.app)
    assert c.get("/health").status_code == 200
    assert c.get("/processes").status_code == 401
    assert c.get("/processes", headers={"Authorization": "Bearer s3cret"}).status_code == 200
