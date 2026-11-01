"""Golden and contract tests for the CAF2021 wrapper.

Golden numbers: CAF2021's own example 'Turrialba_01_E_AC' run through its R
interface (initialise_CAF2021_Turrialba_01_E_AC.R + run_model()) at the pinned
commit, with the library compiled from the same Fortran source. The wrapper
calls the Fortran directly (no R) and must reproduce them.
"""

import copy

import pytest

# year -> value, from the R run (see module docstring)
GOLDEN = {
    "coffee_harvest_t_c_ha": {2001: 0.0, 2010: 1.2828, 2017: 1.4815},
    "soil_c_t_ha": {2001: 101.2471, 2010: 99.9534, 2017: 96.0957},
    "tree_biomass_t_c_ha": {2001: 1.1903, 2010: 8.9569, 2017: 18.3873},
    "coffee_biomass_t_c_ha": {2001: 4.7237, 2010: 8.0268, 2017: 9.4362},
    "n_leaching_kg_ha": {2001: 509.2495, 2010: 335.6478, 2017: 100.9131},
    "n_emission_kg_ha": {2001: 28.3429, 2010: 18.4303, 2017: 15.9339},
    "tree_density_per_ha_1": {2001: 700.0, 2010: 355.572, 2017: 355.572},
}
GOLDEN_TOTAL_HARVEST_T_C_HA = 21.48


def post(client, body):
    return client.post("/processes/caf2021/execution", json=body)


@pytest.fixture(scope="module")
def turrialba(client, turrialba_request):
    r = post(client, turrialba_request)
    assert r.status_code == 200, r.text
    return r.json()


def test_golden(turrialba):
    out = turrialba["outputs"]
    assert out["years"][0] == 2000 and out["years"][-1] == 2017
    for key, per_year in GOLDEN.items():
        values = dict(zip(out["years"], out["annual"][key]))
        for year, expected in per_year.items():
            assert values[year] == pytest.approx(expected, abs=2e-3), (key, year)
    assert sum(out["annual"]["coffee_harvest_t_c_ha"]) == pytest.approx(GOLDEN_TOTAL_HARVEST_T_C_HA, abs=2e-3)


def test_shape_and_provenance(turrialba):
    out, run = turrialba["outputs"], turrialba["run"]
    for key, values in out["annual"].items():
        assert len(values) == len(out["years"]), key
    assert sum(out["annual"]["days"]) == 6357
    assert run["first_day"] == "2000-214" and run["warnings"] == []
    assert len(run["input_sha256"]) == 64


def test_daily_variables(client, turrialba_request):
    body = copy.deepcopy(turrialba_request)
    body["inputs"]["daily_variables"] = ["Csoil_f", "LAI(1)"]
    out = post(client, body).json()["outputs"]
    assert len(out["daily"]["Csoil_f"]) == len(out["daily"]["doy"]) == 6357
    assert out["daily_units"]["Csoil_f"] == "kgC m-2"
    # daily soil C on the last day equals the annual year-end value (t C/ha = 10 x kg C/m2)
    assert out["daily"]["Csoil_f"][-1] * 10 == pytest.approx(out["annual"]["soil_c_t_ha"][-1], abs=1e-3)


def test_no_trees_warns(client, turrialba_request):
    body = copy.deepcopy(turrialba_request)
    body["inputs"]["parameters"] = {}
    body["inputs"]["weather"] = body["inputs"]["weather"][:400]
    r = post(client, body)
    assert r.status_code == 200, r.text
    assert any("no shade trees" in w for w in r.json()["run"]["warnings"])
    assert max(r.json()["outputs"]["annual"]["tree_biomass_t_c_ha"]) == 0


@pytest.mark.parametrize(
    "change, needle",
    [
        (lambda b: b["parameters"].update({"NOT_A_PARAM": 1.0}), "NOT_A_PARAM"),
        (lambda b: b["parameters"].update({"LAT": 1.0}), "LAT"),
        (lambda b: b.update({"daily_variables": ["nope"]}), "nope"),
        (lambda b: b["weather"].pop(5), "consecutive"),
        (lambda b: b["management"]["tree_thinning"].append({"species": 4, "year": 2005, "doy": 1, "fraction": 0.1}), "species"),
    ],
)
def test_rejections(client, turrialba_request, change, needle):
    body = copy.deepcopy(turrialba_request)
    body["inputs"]["weather"] = body["inputs"]["weather"][:400]
    change(body["inputs"])
    r = post(client, body)
    assert r.status_code == 400, r.text
    assert needle in r.json()["detail"]


def test_too_many_days(client, turrialba_request):
    body = copy.deepcopy(turrialba_request)
    w = body["inputs"]["weather"][0]
    body["inputs"]["weather"] = [dict(w, year=1990 + i // 365, doy=1 + i % 365) for i in range(10_001)]
    assert post(client, body).status_code == 400


def test_leap_years_accepted(client, turrialba_request):
    body = copy.deepcopy(turrialba_request)
    w = body["inputs"]["weather"][0]
    body["inputs"]["weather"] = [dict(w, year=2000, doy=d) for d in range(360, 367)] + [dict(w, year=2001, doy=d) for d in (1, 2)]
    assert post(client, body).status_code == 200


def test_timeout(client, turrialba_request, monkeypatch):
    import adapter.runner as runner

    monkeypatch.setattr(runner, "TIMEOUT_S", 0.01)
    assert post(client, turrialba_request).status_code == 504


def test_token(client, monkeypatch):
    import adapter.server as server

    monkeypatch.setattr(server, "API_TOKEN", "s3cret")
    assert client.get("/health").status_code == 200
    assert client.get("/processes").status_code == 401
    d = client.get("/processes/caf2021", headers={"Authorization": "Bearer s3cret"}).json()
    assert len(d["outputVariables"]) == 172


def test_runs_are_independent(client, turrialba_request, turrialba):
    """CAF2021 keeps Fortran module state between calls in one process (a second
    in-process call gives different results), so each run gets a fresh process.
    Two runs through the API must therefore be identical."""
    again = post(client, turrialba_request).json()["outputs"]["annual"]
    assert again == turrialba["outputs"]["annual"]
