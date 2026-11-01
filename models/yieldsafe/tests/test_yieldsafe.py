"""Golden and contract tests for the Yield-SAFE port and its wrapper.

Golden values: the Yield-SAFE v2 Excel workbook (Cranfield, 2023), default scenario,
as cached by Excel (see conftest.workbook). The port must reproduce every stored
daily value and the workbook's yearly table ("Crop-manager") and summary results.
"""

import copy
import math

import pytest

# Crop-manager columns (0-based) -> yieldsafe.model.yearly() keys
YEARLY_COLUMNS = {
    5: "crop_yield_t_ha", 6: "crop_byproduct_t_ha", 9: "tree_height_m", 10: "tree_dbh_cm", 11: "canopy_cover_pct",
    12: "prune_height_m", 13: "stand_volume_m3_ha", 14: "harvest_volume_m3_ha", 15: "branch_volume_m3_ha",
    16: "harvest_branch_m3_ha", 20: "trees_per_ha", 23: "fruit_t_ha", 25: "irrigation_mm", 26: "drainage_mm",
    27: "tree_carbon_t_ha", 28: "rain_mm", 30: "tree_water_mm", 31: "crop_water_mm", 32: "evaporation_mm",
}
WORKBOOK_SUM_DAYS = 10963 - 7 + 1  # the workbook's SUMIF criteria stop at row 10963


def close(a, b, rel=1e-9):
    return math.isclose(a, b, rel_tol=rel, abs_tol=1e-9)


# ---------- the port against the workbook


@pytest.fixture(scope="module")
def daily(scenario):
    from yieldsafe.model import simulate

    return simulate(scenario)


def test_every_stored_daily_value(workbook, daily):
    for col, expected in workbook["excel_daily"].items():
        got = daily[col]
        assert len(got) == len(expected) == 11549
        for i, (g, e) in enumerate(zip(got, expected)):
            assert close(g, e), f"column {col}, row {i + 7}: port {g} vs workbook {e}"


def test_yearly_table(workbook, scenario, daily):
    from yieldsafe.model import yearly

    y = yearly(scenario, daily, workbook["meta"]["rotation_years"], sum_days=WORKBOOK_SUM_DAYS)
    for a, row in workbook["excel_yearly"].items():
        i = int(a) - 1
        for idx, key in YEARLY_COLUMNS.items():
            assert close(y[key][i], row[idx] or 0.0), f"year {a} {key}: port {y[key][i]} vs workbook {row[idx]}"


def test_known_values(daily):
    # Spot checks a reviewer can find in the workbook ('Yield-SAFE' sheet, row = index + 7).
    assert daily["U"][2] == 55.0  # planted on day 2 with Biomass0
    assert daily["Z"][372 - 7] == pytest.approx(1.39825703, abs=1e-8)
    assert daily["CE"][9 - 7] == pytest.approx(0.43141186, abs=1e-8)


# ---------- the HTTP process


def post(client, body):
    return client.post("/processes/yieldsafe/execution", json=body)


@pytest.fixture(scope="module")
def run(client, workbook_request):
    r = post(client, workbook_request)
    assert r.status_code == 200, r.text
    return r.json()


def test_api_matches_workbook(run, workbook):
    # Truncating the weather cannot change earlier days: the model only looks back.
    out = run["outputs"]
    assert out["years"][0] == 1992 and out["tree_years"][0] == 0 and len(out["years"]) == 30
    states = {9: "tree_height_m", 10: "tree_dbh_cm", 11: "canopy_cover_pct", 13: "stand_volume_m3_ha",
              15: "branch_volume_m3_ha", 20: "trees_per_ha", 27: "tree_carbon_t_ha"}
    for a, row in workbook["excel_yearly"].items():
        i = int(a) - 1  # workbook year a = end of tree year a-1
        if i >= 30:
            continue
        for idx, key in states.items():
            assert close(out["annual"][key][i], row[idx] or 0.0), (a, key)
        if out["annual"]["crop"][i]:
            assert close(out["annual"]["crop_yield_t_ha"][i], row[5]), (a, "crop_yield_t_ha")


def test_api_summary(run, workbook):
    s, rows = run["outputs"]["summary"], [workbook["excel_yearly"][str(a)] for a in range(1, 31)]
    # The workbook's summary (Management G40-H42) over the 30 clean years. Its own maximum
    # (236.38 m3/ha) falls inside them, so it must match exactly.
    assert s["max_stand_volume_m3_ha"] == pytest.approx(workbook["meta"]["summary"]["final_stand_volume_m3_ha"], rel=1e-9)
    assert s["max_stand_biomass_odt_ha"] == pytest.approx(workbook["meta"]["summary"]["final_stand_biomass_odt_ha"], rel=1e-9)
    assert s["mean_crop_yield_t_ha"] == pytest.approx(sum(r[5] for r in rows) / 30, rel=1e-9)
    assert s["final_tree_co2_t_ha"] == pytest.approx(s["final_tree_carbon_t_ha"] * 3.67)


def test_api_complete_water_years(run, workbook):
    # The API sums each tree year over all its days (the workbook stops part-way through year 29
    # and files sums one year late; see README).
    a = run["outputs"]["annual"]
    rain = workbook["weather"]["rain_mm"]
    assert a["rain_mm"][0] == pytest.approx(sum(rain[:366]))
    assert a["rain_mm"][29] == pytest.approx(sum(rain[10958 - 365:10958]))
    assert sum(a["days"]) == 10958 and a["days"][-1] == 365
    assert run["run"]["warnings"] == []


def test_provenance(run):
    r = run["run"]
    assert r["process"] == "yieldsafe" and len(r["input_sha256"]) == 64
    assert r["reference_workbook_sha256"].startswith("4499e230")
    assert r["first_day"] == "1992-01-01" and r["last_day"] == "2021-12-31"


def test_daily_variables(client, workbook_request, workbook):
    body = copy.deepcopy(workbook_request)
    body["inputs"]["daily_variables"] = ["tree_height_m", "vwc"]
    out = post(client, body).json()["outputs"]
    assert len(out["daily"]["tree_height_m"]) == 10958 and out["daily_units"]["vwc"] == "mm mm-1"
    assert out["daily"]["vwc"][100] == pytest.approx(workbook["excel_daily"]["CE"][100], rel=1e-12)


def test_overrides_change_growth(client, workbook_request, run):
    body = copy.deepcopy(workbook_request)
    body["inputs"]["tree"]["overrides"] = {"rue_g_per_mj": 1.0}
    out = post(client, body).json()["outputs"]
    assert out["annual"]["tree_height_m"][20] < run["outputs"]["annual"]["tree_height_m"][20]


def test_thinning_reduces_trees(client, workbook_request):
    body = copy.deepcopy(workbook_request)
    body["inputs"]["years"][10]["trees_removed_per_ha"] = 78
    a = post(client, body).json()["outputs"]["annual"]
    assert a["trees_per_ha"][9] == 156 and a["trees_per_ha"][10] == 78
    assert a["harvest_volume_m3_ha"][10] > 0


# ---------- input validation and the contract


@pytest.mark.parametrize(
    "change, fragment",
    [
        (lambda i: i["weather"].update(start="1992-03-01"), "1 January"),
        (lambda i: i["weather"]["rain_mm"].pop(), "same length"),
        (lambda i: i["weather"]["rad_mj_m2"].__setitem__(5, -2.6), "outside 0..50"),
        (lambda i: i["years"][3].update(crop=13), "not a built-in crop"),
        (lambda i: i["years"][4].update(trees_removed_per_ha=500), "more trees removed"),
        (lambda i: i["tree"].update(template="oak"), "template"),
        (lambda i: i["crops"].update({"13": {"name": "hazel understorey"}}) if "crops" in i else i.update(crops={"13": {"name": "x"}}), "every field"),
        (lambda i: i["soil"].update(vwc0=0.9), "vwc0"),
    ],
)
def test_bad_input(client, workbook_request, change, fragment):
    body = copy.deepcopy(workbook_request)
    change(body["inputs"])
    r = post(client, body)
    assert r.status_code == 400, r.text
    assert r.headers["content-type"].startswith("application/problem+json")
    assert fragment in r.json()["detail"]


def test_description(client):
    d = client.get("/processes/yieldsafe").json()
    assert d["id"] == "yieldsafe" and "poplar_upson_agf" in d["templates"]["trees"]
    assert d["templates"]["crops"]["1"] == "WWheat" and "commercial" in d["upstream"]["licence"]
    assert client.get("/processes").json()["processes"][0]["id"] == "yieldsafe"


def test_token(monkeypatch, workbook_request):
    from fastapi.testclient import TestClient

    import adapter.server as server

    monkeypatch.setattr(server, "API_TOKEN", "secret")
    c = TestClient(server.app)
    assert c.get("/health").status_code == 200
    assert c.get("/processes").status_code == 401
    assert c.get("/processes", headers={"Authorization": "Bearer secret"}).status_code == 200


def test_cli(tmp_path, workbook_request):
    import json

    from adapter.cli import main

    req, res = tmp_path / "req.json", tmp_path / "res.json"
    req.write_text(json.dumps(workbook_request))
    assert main(["cli", str(req), str(res)]) == 0
    assert json.loads(res.read_text())["outputs"]["summary"]["max_stand_volume_m3_ha"] > 200
