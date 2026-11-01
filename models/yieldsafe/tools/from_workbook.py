"""Build a Yield-SAFE scenario from the official workbook, and compare the port with it.

    python tools/from_workbook.py "Yield-SAFE v2.xlsx" compare      # every column, every day
    python tools/from_workbook.py "Yield-SAFE v2.xlsx" fixture OUT  # write the golden-test fixture

Reads the workbook's inputs (Management, Tree-, Crop-, Soil-parameters, the crop
calendar and the weather columns) and the values Excel cached at its last
recalculation. Needs openpyxl. The workbook itself is not in this repository: get
"Yield-SAFE v2" from Cranfield University's research data repository (CORD).
"""

from __future__ import annotations

import gzip
import json
import math
import os
import sys
from datetime import date, datetime

import openpyxl
from openpyxl.utils import column_index_from_string as ci

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from yieldsafe.model import (  # noqa: E402
    CropParams, Irrigation, Scenario, SoilParams, TreeParams, YearPlan, simulate, yearly,
)

FIRST, LAST_COL = 7, 99


def num(v, default=0.0):
    return default if v is None or isinstance(v, str) else float(v)


def load(path: str):
    wv = openpyxl.load_workbook(path, data_only=True)
    tp, cp, spp = wv["Tree-parameters"], wv["Crop-parameters"], wv["Soil-parameters"]
    cm, mg, ys = wv["Crop-manager"], wv["Management"], wv["Yield-SAFE"]

    D = lambda r: tp.cell(r, 4).value  # noqa: E731  selected tree, column D
    tree = TreeParams(
        doy_planting=int(D(6)), doy_pruning=int(D(7)), pruning_height_m=num(D(8)),
        prune_biomass_fraction=num(D(9)), prune_shoots_fraction=num(D(10)), max_bole_proportion=num(D(11)),
        max_bole_height_m=num(D(12)), doy_thinning=int(D(13)), site_factor=num(D(14)), n_shoots0=num(D(17)),
        biomass0_g=num(D(18)), bole_height0_m=num(D(19)), ap=num(D(22)), doy_budburst=int(D(23)),
        doy_leaffall=int(D(24)), rue_g_per_mj=num(D(25)), form_factor=num(D(26)),
        water_per_biomass_m3_g=num(D(27)), k_main=num(D(30)), la_max_m2=num(D(31)), la_ratio=num(D(32)),
        ratio_timber=num(D(36)), wood_density_g_m3=num(D(37)), pf_crit=num(D(38)), pwp=num(D(39)),
        sigma_height=num(D(40)), dsigma_density=num(D(41)), canopy_width_depth=num(D(42)), tau_days=num(D(43)),
        moisture_content=num(D(44)), light_a=num(D(46)), light_b=num(D(47)), root_proportion=num(D(48)),
        root_length_m_g=num(D(49)), root_water_coeff=num(D(50)), doy_fruit_set=int(D(51)),
        fruit_proportion=num(D(52)),
    )
    crops = {}
    for c in range(4, 18):
        code = cp.cell(1, c).value
        if code is None or cp.cell(3, c).value is None:
            continue  # empty "New crop" columns
        v = lambda r, c=c: cp.cell(r, c).value  # noqa: E731
        crops[int(code)] = CropParams(
            name=str(v(2)), doy_sowing=int(num(v(3))), doy_harvest=int(num(v(4))), t_base=num(v(5)),
            tsum_emerge=num(v(6)), tsum_rb=num(v(7)), tsum_re=num(v(8)), tsum_harvest=num(v(9)),
            biomass0_g_m2=num(v(11)), lai0=num(v(12)), partition_leaves=num(v(13)), rue_g_per_mj=num(v(15)),
            water_per_biomass_m3_g=num(v(16)), harvest_index=num(v(17)), harvest_index2=num(v(18)),
            k_extinction=num(v(19)), pf_crit=num(v(20)), pwp=num(v(21)), moisture1=num(v(22)),
            moisture2=num(v(23)), sla_m2_g=num(v(24)), site_factor=num(v(25)), irrigated=num(v(27)) == 1,
            critical_deficit_mm=num(v(28)), application_mm=num(v(29)),
        )
    S = lambda r: spp.cell(r, 4).value  # noqa: E731
    soil = SoilParams(
        vwc0=num(S(3)), water_model=num(S(5)) != 0, alpha=num(S(6)), depth_mm=num(S(8)),
        epot_mm_per_mj=num(S(9)), pf_fc=num(S(10)), ks_mm_d=num(S(11)), n_vg=num(S(12)),
        pf_crit_e=num(S(14)), pf_e_offset=num(S(15)), theta_s=num(S(16)), theta_r=num(S(17)),
        root_shoot_ratio=num(S(37)),
    )
    irrigation = Irrigation(
        enabled=str(S(25)).strip().lower() == "yes", start_year=int(num(S(27))), start_doy=int(num(S(28))),
        end_year=int(num(S(29))), end_doy=int(num(S(30))), interval_days=int(num(S(31))), amount_mm=num(S(32)),
    )
    plan = {}
    for r in range(14, 75):
        y = cm.cell(r, 1).value
        if y is None:
            continue
        plan[int(y)] = YearPlan(
            crop=int(num(cm.cell(r, 2).value)), crop_area=num(cm.cell(r, 5).value),
            trees_planted_ha=num(cm.cell(r, 8).value), trees_harvested_ha=num(cm.cell(r, 9).value),
        )
    last = FIRST
    while ys.cell(last + 1, 5).value is not None:
        last += 1
    rows = range(FIRST, last + 1)
    a7 = ys.cell(FIRST, 1).value
    scen = Scenario(
        start=a7.date() if isinstance(a7, datetime) else a7,
        temp_c=[num(ys.cell(r, 5).value) for r in rows],
        rad_mj=[num(ys.cell(r, 6).value) for r in rows],
        rain_mm=[num(ys.cell(r, 7).value) for r in rows],
        tree=tree, crops=crops, soil=soil, plan=plan, irrigation=irrigation,
        horizontal_prune_interval_years=num(mg["AF75"].value), horizontal_prune_fraction=num(mg["AF74"].value),
        pruned_shoots_fraction=num(mg["AF73"].value),
    )
    meta = {
        "weather": str(ys.cell(5, 5).value), "tree": str(mg["G23"].value), "soil": str(mg["G30"].value),
        "system": str(mg["G19"].value), "rotation_years": int(num(mg["G21"].value)),
        "summary": {k: num(mg[c].value) for k, c in (
            ("final_tree_volume_m3_per_tree", "G40"), ("final_stand_volume_m3_ha", "H40"),
            ("final_stand_biomass_odt_ha", "H41"), ("mean_crop_yield_t_ha", "H42"))},
        "crop_manager": {
            str(cm.cell(r, 1).value): [cm.cell(r, c).value for c in range(1, 34)] for r in range(15, 15 + int(num(mg["G21"].value)))
        },
    }
    return scen, ys, rows, meta


def compare(path: str, tol: float = 1e-9) -> int:
    scen, ys, rows, meta = load(path)
    d = simulate(scen)
    worst = {}
    for col in [c for c in d if c.isupper()]:
        cidx = ci(col)
        for i, r in enumerate(rows):
            want = ys.cell(r, cidx).value
            got = d[col][i]
            if want is None or isinstance(want, str):
                if got not in (None, 0, 0.0):
                    worst.setdefault(col, (math.inf, r, want, got))
                continue
            got = 0.0 if got is None else got
            err = abs(got - want) / max(1.0, abs(want))
            if err > worst.get(col, (0,))[0]:
                worst[col] = (err, r, want, got)
    bad = {c: w for c, w in worst.items() if w[0] > tol}
    print(f"{len(rows)} days, {len([c for c in d if c.isupper()])} columns; worst relative error per column:")
    for c, (err, r, want, got) in sorted(worst.items(), key=lambda kv: -kv[1][0])[:15]:
        print(f"  {c:3} {err:.2e} at row {r}: excel={want!r} port={got!r}")
    y = yearly(scen, d, meta["rotation_years"], sum_days=10963 - FIRST + 1)
    cmv = meta["crop_manager"]
    checks = {"crop_yield_t_ha": 5, "crop_byproduct_t_ha": 6, "tree_height_m": 9, "tree_dbh_cm": 10,
              "canopy_cover_pct": 11, "prune_height_m": 12, "stand_volume_m3_ha": 13, "harvest_volume_m3_ha": 14,
              "branch_volume_m3_ha": 15, "harvest_branch_m3_ha": 16, "fruit_t_ha": 23, "tree_carbon_t_ha": 27,
              "rain_mm": 28, "drainage_mm": 26, "tree_water_mm": 30, "crop_water_mm": 31, "evaporation_mm": 32,
              "irrigation_mm": 25, "trees_per_ha": 20}
    ybad = 0
    for key, idx in checks.items():
        for i, a in enumerate(y["year"]):
            want = num(cmv[str(a)][idx])
            if abs(y[key][i] - want) > 1e-9 * max(1, abs(want)):
                ybad += 1
                print(f"  yearly {key} year {a}: excel={want} port={y[key][i]}")
                break
    print("yearly table:", "matches" if not ybad else f"{ybad} columns differ")
    return 1 if (bad or ybad) else 0


def fixture(path: str, out: str) -> None:
    scen, ys, rows, meta = load(path)
    keep = ["H", "U", "Z", "AA", "AN", "AO", "BU", "BY", "CE", "CT"]
    excel = {c: [num(ys.cell(r, ci(c)).value) for r in rows] for c in keep}
    payload = {
        "source": "Yield-SAFE v2 model in Excel (Burgess, Graves, Upson, Palma, Wiltshire 2023, Cranfield University), "
                  "default scenario as published, values cached by Excel",
        "meta": {k: meta[k] for k in ("weather", "tree", "soil", "system", "rotation_years", "summary")},
        "start": scen.start.isoformat(),
        "weather": {"temp_c": scen.temp_c, "rad_mj": scen.rad_mj, "rain_mm": scen.rain_mm},
        "tree": scen.tree.__dict__,
        "crops": {str(k): v.__dict__ for k, v in scen.crops.items()},
        "soil": scen.soil.__dict__,
        "irrigation": scen.irrigation.__dict__,
        "plan": {str(k): v.__dict__ for k, v in scen.plan.items()},
        "management": {"horizontal_prune_interval_years": scen.horizontal_prune_interval_years,
                       "horizontal_prune_fraction": scen.horizontal_prune_fraction,
                       "pruned_shoots_fraction": scen.pruned_shoots_fraction},
        "excel_daily": excel,
        "excel_yearly": {a: [None if isinstance(v, str) else v for v in row] for a, row in meta["crop_manager"].items()},
    }
    with gzip.open(out, "wt") as f:
        json.dump(payload, f, separators=(",", ":"), default=lambda o: o.isoformat() if isinstance(o, date) else str(o))
    print("wrote", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    if sys.argv[2] == "compare":
        sys.exit(compare(sys.argv[1]))
    fixture(sys.argv[1], sys.argv[3])
