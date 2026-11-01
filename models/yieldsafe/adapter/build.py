"""Translate a validated request into a yieldsafe.Scenario and the model output into the response."""

from __future__ import annotations

import dataclasses
from datetime import timedelta

from yieldsafe.model import DAILY_COLUMNS, CropParams, Irrigation, Scenario, SoilParams, YearPlan, simulate, yearly
from yieldsafe.templates import CROPS, SOILS, TREES

from .schema import ANNUAL_KEYS, YieldSafeInputs

NO_CROP = 9  # the workbook fills years without a crop with code 9 (fallow, area 0)


def scenario(inp: YieldSafeInputs) -> tuple[Scenario, list[str]]:
    warnings: list[str] = []
    _, tree = TREES[inp.tree.template]
    tree = dataclasses.replace(tree, **inp.tree.overrides.model_dump(exclude_none=True))
    if not tree.doy_budburst < tree.doy_leaffall:
        raise ValueError("tree.doy_budburst must be before doy_leaffall")

    crops = dict(CROPS)
    for code, ov in inp.crops.items():
        c = int(code)
        changes = ov.model_dump(exclude_none=True)
        crops[c] = dataclasses.replace(crops[c], **changes) if c in crops else CropParams(**changes)

    texture = dict(SOILS[inp.soil.texture])
    texture.pop("label")
    texture.update(inp.soil.overrides)
    soil = SoilParams(
        vwc0=inp.soil.vwc0, water_model=inp.soil.water_model, depth_mm=inp.soil.depth_mm,
        root_shoot_ratio=inp.soil.root_shoot_ratio, **texture,
    )
    if not soil.theta_r < inp.soil.vwc0 <= soil.theta_s:
        raise ValueError(f"soil.vwc0 must be above theta_r ({soil.theta_r}) and at most theta_s ({soil.theta_s})")

    span = _tree_years(inp, len(inp.weather.temp_c))
    if len(inp.years) < span + 1:
        warnings.append(f"years lists {len(inp.years)} tree years for {span} years of weather; the model reads "
                        "next year's crop on harvest days, so list one year more (later years: no crop, no tree events)")

    # Workbook calendar ("Crop-manager"): row y holds the crop and area for tree year y-1,
    # trees planted in tree year y, and trees removed in tree year y-1 (all as the formulas read it).
    plan: dict[int, dict] = {y: {"crop": NO_CROP, "crop_area": 0.0, "trees_planted_ha": 0.0, "trees_harvested_ha": 0.0}
                             for y in range(0, max(span, len(inp.years)) + 3)}
    plan[0]["crop"] = 0
    standing = 0.0
    for i, y in enumerate(inp.years):
        if y.crop:
            plan[i + 1]["crop"] = y.crop
            plan[i + 1]["crop_area"] = y.crop_area
        plan[i]["trees_planted_ha"] = y.trees_planted_per_ha
        plan[i + 1]["trees_harvested_ha"] = y.trees_removed_per_ha
        standing += y.trees_planted_per_ha - y.trees_removed_per_ha
        if standing < -1e-9:
            raise ValueError(f"years[{i}]: more trees removed than standing")

    irr = Irrigation()
    if inp.irrigation is not None:
        irr = Irrigation(enabled=True, **inp.irrigation.model_dump())

    s = Scenario(
        start=inp.weather.start,
        temp_c=list(inp.weather.temp_c), rad_mj=list(inp.weather.rad_mj_m2), rain_mm=list(inp.weather.rain_mm),
        tree=tree, crops=crops, soil=soil, plan={y: YearPlan(**v) for y, v in plan.items()}, irrigation=irr,
        horizontal_prune_interval_years=inp.pruning.interval_years,
        horizontal_prune_fraction=inp.pruning.biomass_fraction,
        pruned_shoots_fraction=inp.pruning.shoots_fraction,
    )
    return s, warnings


def _tree_years(inp: YieldSafeInputs, n_days: int) -> int:
    last = inp.weather.start + timedelta(days=n_days - 1)
    return last.year - inp.weather.start.year + 1


def run(inp: YieldSafeInputs) -> dict:
    s, warnings = scenario(inp)
    d = simulate(s)
    n_years = d["year"][-1] + 1
    y = yearly(s, d, n_years)
    days = [sum(1 for yy in d["year"] if yy == i) for i in range(n_years)]
    if days[-1] < 365:
        warnings.append(f"the last year has {days[-1]} days; its year-end values are for the last simulated day")

    # yearly() is indexed like the workbook (year a = end of tree year a-1).
    annual: dict[str, list] = {k: [] for k in ANNUAL_KEYS}
    for i in range(n_years):
        listed = inp.years[i] if i < len(inp.years) else None
        has_crop = bool(listed and listed.crop)
        annual["crop"].append(listed.crop if has_crop else 0)
        for key in ("crop_yield_t_ha", "crop_byproduct_t_ha"):
            annual[key].append(y[key][i] if has_crop else 0.0)
        for key in ("trees_per_ha", "tree_height_m", "tree_dbh_cm", "canopy_cover_pct", "prune_height_m",
                    "stand_volume_m3_ha", "harvest_volume_m3_ha", "branch_volume_m3_ha", "harvest_branch_m3_ha",
                    "fruit_t_ha", "tree_carbon_t_ha"):
            annual[key].append(y[key][i])
        annual["tree_co2_t_ha"].append(y["tree_carbon_t_ha"][i] * 3.67)
        # Water sums by tree year i (the workbook's SUMIF uses the 1-based year a = i + 1
        # against column D, which is 0-based, so it reports year i+1 under row a; here each
        # year gets its own sums).
        for key, col in (("rain_mm", None), ("irrigation_mm", "CO"), ("drainage_mm", "CL"), ("tree_water_mm", "CN"),
                         ("crop_water_mm", "CM"), ("evaporation_mm", "CK")):
            series = s.rain_mm if col is None else d[col]
            annual[key].append(sum(v for yy, v in zip(d["year"], series) if yy == i))
        annual["days"].append(days[i])

    cropped = [v for v, c in zip(annual["crop_yield_t_ha"], annual["crop"]) if c]
    cumulative_harvest, best = 0.0, 0.0
    for standing, harvested in zip(annual["stand_volume_m3_ha"], annual["harvest_volume_m3_ha"]):
        best = max(best, standing + cumulative_harvest)  # workbook column AD: N + earlier harvests
        cumulative_harvest += harvested
    summary = {
        "mean_crop_yield_t_ha": sum(cropped) / len(cropped) if cropped else 0.0,
        "max_stand_volume_m3_ha": best,
        "max_stand_biomass_odt_ha": best * s.tree.wood_density_g_m3 / 1_000_000,
        "final_tree_carbon_t_ha": annual["tree_carbon_t_ha"][-1],
        "final_tree_co2_t_ha": annual["tree_co2_t_ha"][-1],
    }

    daily = {}
    units = {}
    for name in inp.daily_variables:
        col, unit, _ = DAILY_COLUMNS[name]
        daily[name] = [float(v or 0.0) for v in d[col]]
        units[name] = unit

    return {
        "outputs": {
            "years": [inp.weather.start.year + i for i in range(n_years)],
            "tree_years": list(range(n_years)),
            "annual": annual,
            "summary": summary,
            "daily": daily,
            "daily_units": units,
        },
        "warnings": warnings,
        "first_day": d["date"][0].isoformat(),
        "last_day": d["date"][-1].isoformat(),
    }
