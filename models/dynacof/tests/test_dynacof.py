"""Golden and contract tests for the DynACof wrapper.

Golden numbers: DynACof.jl 1.5.3 run directly (default parameters, the
upstream Aquiares weather 1979-2016) with import_parameters("package"),
meteorology(), rotation() and mainfun(), exactly as dynacof() does. The
wrapper reproduces them to 1e-4.
"""

import copy

import pytest

GOLDEN_TOTAL_YIELD = 47829.613  # kg green coffee / ha over 38 years
GOLDEN_YIELD = {1988: 1491.1314, 1998: 1330.6465, 2016: 1319.2959}  # kg/ha
GOLDEN_COFFEE_GPP_1979 = 8.741  # t C/ha
GOLDEN_TREE_NPP_2016 = 5.5281  # t C/ha


def post(client, body):
    return client.post("/processes/dynacof/execution", json=body)


@pytest.fixture(scope="module")
def aquiares(client, aquiares_request):
    r = post(client, aquiares_request)
    assert r.status_code == 200, r.text
    return r.json()


def by_year(out, key):
    return dict(zip(out["years"], out["annual"][key]))


def test_golden(aquiares):
    out = aquiares["outputs"]
    assert out["years"][0] == 1979 and out["years"][-1] == 2016
    assert sum(out["annual"]["coffee_yield_green_kg_ha"]) == pytest.approx(GOLDEN_TOTAL_YIELD, abs=0.05)
    y = by_year(out, "coffee_yield_green_kg_ha")
    for year, expected in GOLDEN_YIELD.items():
        assert y[year] == pytest.approx(expected, abs=1e-3), year
    assert by_year(out, "coffee_gpp_t_c_ha")[1979] == pytest.approx(GOLDEN_COFFEE_GPP_1979, abs=1e-3)
    assert by_year(out, "tree_npp_t_c_ha")[2016] == pytest.approx(GOLDEN_TREE_NPP_2016, abs=1e-3)


def test_shape_and_provenance(aquiares):
    out, run = aquiares["outputs"], aquiares["run"]
    n = len(out["years"])
    for key, values in out["annual"].items():
        assert len(values) == n, key
    assert sum(out["annual"]["days"]) == 13880
    assert out["shade_trees"] is True and out["cycles"] == 1
    assert out["daily"] == {}
    assert run["model_version"] == "1.5.3" and len(run["input_sha256"]) == 64
    assert run["first_date"] == "1979-01-01" and run["last_date"] == "2016-12-31"


def test_monocrop_rejected_until_fixed_upstream(client, aquiares_request):
    """DynACof 1.5.3's own dynacof(tree="") fails (soil.jl reads wleaf_Tree)."""
    body = copy.deepcopy(aquiares_request)
    body["inputs"]["meteo"] = body["inputs"]["meteo"][:365]
    body["inputs"]["shade_trees"] = False
    r = post(client, body)
    assert r.status_code == 400
    assert "monocrop" in r.json()["detail"]


def test_parameter_override_and_daily(client, aquiares_request):
    body = copy.deepcopy(aquiares_request)
    body["inputs"]["meteo"] = body["inputs"]["meteo"][: 365 * 3]
    body["inputs"]["parameters"] = {"tree": {"StockingTree_treeha1": 100.0}}
    body["inputs"]["daily_variables"] = ["LAI", "Yield_green"]
    r = post(client, body)
    assert r.status_code == 200, r.text
    out = r.json()["outputs"]
    assert out["annual"]["tree_density_per_ha"][0] == pytest.approx(100.0)
    assert len(out["daily"]["date"]) == len(out["daily"]["LAI"]) == 365 * 3


@pytest.mark.parametrize(
    "change, needle",
    [
        (lambda b: b["parameters"].update({"tree": {"NoSuchThing": 1.0}}), "NoSuchThing"),
        (lambda b: b["parameters"].update({"coffee": {"lue": 1.0}}), "lue"),
        (lambda b: b["parameters"].update({"coffee": {"AgeCoffeeMax": 2.5}}), "AgeCoffeeMax"),
        (lambda b: b.update({"daily_variables": ["NotAColumn"]}), "NotAColumn"),
    ],
)
def test_bad_parameters(client, aquiares_request, change, needle):
    body = copy.deepcopy(aquiares_request)
    body["inputs"]["meteo"] = body["inputs"]["meteo"][:400]
    body["inputs"].setdefault("parameters", {})
    change(body["inputs"])
    r = post(client, body)
    assert r.status_code == 400, r.text
    assert needle in r.json()["detail"]


def test_schema_rejections(client, aquiares_request):
    gap = copy.deepcopy(aquiares_request)
    del gap["inputs"]["meteo"][10]
    assert post(client, gap).status_code == 400
    site_param = copy.deepcopy(aquiares_request)
    site_param["inputs"]["parameters"] = {"site": {"Latitude": 1.0}}
    assert post(client, site_param).status_code == 400


def test_not_ready_gives_503(client, aquiares_request, monkeypatch):
    import adapter.server as server

    monkeypatch.setattr(server._ready, "is_set", lambda: False)
    assert post(client, aquiares_request).status_code == 503
    assert client.get("/health").json()["status"] == "starting"


def test_token(client, monkeypatch):
    import adapter.server as server

    monkeypatch.setattr(server, "API_TOKEN", "s3cret")
    assert client.get("/health").status_code == 200
    assert client.get("/processes").status_code == 401
    assert client.get("/processes", headers={"Authorization": "Bearer s3cret"}).status_code == 200


def test_timeout_replaces_worker(client, aquiares_request, monkeypatch):
    """Runs last: a job over the limit gets 504, and the next job still works."""
    import adapter.runner as runner

    monkeypatch.setattr(runner, "TIMEOUT_S", 0.5)
    r = post(client, aquiares_request)
    assert r.status_code == 504, r.text
    monkeypatch.setattr(runner, "TIMEOUT_S", 900)
    body = copy.deepcopy(aquiares_request)
    body["inputs"]["meteo"] = body["inputs"]["meteo"][:365]
    assert post(client, body).status_code == 200
