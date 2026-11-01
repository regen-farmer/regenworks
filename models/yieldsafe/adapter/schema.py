"""Request and response models for the Yield-SAFE process (the machine-readable contract).

`python -m adapter.export_schema` writes them to ../schema/*.schema.json.

Mapping to the OPA interfaces (DigitAF D2.9):
  site, weather          -> I1 context
  tree, crops, soil      -> I2 species and site parameters
  years (crop, area, trees planted/removed), pruning, irrigation -> I3 system design + I4 management
  outputs.annual         -> I5 growth/yield, I8 carbon (tree biomass incl. roots)
"""

from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from yieldsafe.model import DAILY_COLUMNS
from yieldsafe.templates import CROPS, SOILS, TREES

MAX_DAYS = 40_000  # ~109 years of daily weather
MAX_YEARS = 110
TreeTemplate = Literal[tuple(TREES)]  # type: ignore[valid-type]
SoilTexture = Literal[tuple(SOILS)]  # type: ignore[valid-type]
DailyVariable = Literal[tuple(DAILY_COLUMNS)]  # type: ignore[valid-type]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------- inputs


class Site(_Strict):
    lat: float = Field(ge=-90, le=90, description="Recorded only: Yield-SAFE takes radiation directly, not latitude")
    lon: float = Field(ge=-180, le=180, description="Recorded only")
    name: Optional[str] = Field(None, max_length=80)


class Weather(_Strict):
    """Daily series from `start`, one value per day, no gaps (real calendar, leap days included)."""

    start: date = Field(description="Date of the first value; also the start of tree year 0")
    temp_c: list[float] = Field(min_length=366, max_length=MAX_DAYS, description="Daily mean air temperature (degC)")
    rad_mj_m2: list[float] = Field(min_length=366, max_length=MAX_DAYS, description="Global radiation (MJ m-2 d-1)")
    rain_mm: list[float] = Field(min_length=366, max_length=MAX_DAYS, description="Precipitation (mm d-1)")

    @model_validator(mode="after")
    def _check(self):
        if not (len(self.temp_c) == len(self.rad_mj_m2) == len(self.rain_mm)):
            raise ValueError("temp_c, rad_mj_m2 and rain_mm must have the same length")
        if self.start.month != 1 or self.start.day != 1:
            raise ValueError("start must be 1 January (Yield-SAFE counts days of year from the start)")
        for name, series, lo, hi in (("temp_c", self.temp_c, -60, 60), ("rad_mj_m2", self.rad_mj_m2, 0, 50),
                                     ("rain_mm", self.rain_mm, 0, 1000)):
            bad = next((i for i, v in enumerate(series) if not (lo <= v <= hi)), None)
            if bad is not None:
                raise ValueError(f"{name}[{bad}] = {series[bad]} outside {lo}..{hi}")
        return self


class TreeOverrides(_Strict):
    """Any parameter of the chosen template can be replaced. Names and units as in yieldsafe.model.TreeParams."""

    doy_planting: Optional[int] = Field(None, ge=0, le=365, description="Day of year, 0 = 1 January")
    doy_pruning: Optional[int] = Field(None, ge=0, le=365)
    pruning_height_m: Optional[float] = Field(None, ge=0, le=10)
    prune_biomass_fraction: Optional[float] = Field(None, ge=0, le=1)
    prune_shoots_fraction: Optional[float] = Field(None, ge=0, le=1)
    max_bole_proportion: Optional[float] = Field(None, ge=0, le=1)
    max_bole_height_m: Optional[float] = Field(None, ge=0, le=30)
    doy_thinning: Optional[int] = Field(None, ge=0, le=365)
    site_factor: Optional[float] = Field(None, ge=0, le=3)
    n_shoots0: Optional[float] = Field(None, gt=0, le=1000)
    biomass0_g: Optional[float] = Field(None, gt=0, le=1e6)
    bole_height0_m: Optional[float] = Field(None, ge=0, le=10)
    ap: Optional[float] = Field(None, gt=0, le=5)
    doy_budburst: Optional[int] = Field(None, ge=0, le=365)
    doy_leaffall: Optional[int] = Field(None, ge=0, le=365)
    rue_g_per_mj: Optional[float] = Field(None, ge=0, le=5)
    form_factor: Optional[float] = Field(None, gt=0, le=2)
    water_per_biomass_m3_g: Optional[float] = Field(None, ge=0, le=0.01)
    k_main: Optional[float] = Field(None, ge=0, le=0.1)
    la_max_m2: Optional[float] = Field(None, gt=0, le=1e5)
    la_ratio: Optional[float] = Field(None, gt=0, le=1e7)
    ratio_timber: Optional[float] = Field(None, gt=0, le=1)
    wood_density_g_m3: Optional[float] = Field(None, gt=0, le=2e6)
    pf_crit: Optional[float] = Field(None, ge=0, le=7)
    pwp: Optional[float] = Field(None, ge=0, le=7)
    sigma_height: Optional[float] = Field(None, gt=0, le=500)
    canopy_width_depth: Optional[float] = Field(None, ge=0, le=5)
    tau_days: Optional[float] = Field(None, gt=0, le=365)
    moisture_content: Optional[float] = Field(None, ge=0, lt=1)
    light_a: Optional[float] = Field(None, ge=0, le=1000)
    light_b: Optional[float] = Field(None, ge=0, le=0.8)
    root_proportion: Optional[float] = Field(None, ge=0, le=1)
    root_length_m_g: Optional[float] = Field(None, ge=0, le=1e7)
    root_water_coeff: Optional[float] = Field(None, ge=0, le=10)
    doy_fruit_set: Optional[int] = Field(None, ge=0, le=365)
    fruit_proportion: Optional[float] = Field(None, ge=0, le=1)


class Tree(_Strict):
    template: TreeTemplate = Field(description="Parameter set from the Yield-SAFE v2 workbook (worksheet C.1)")
    overrides: TreeOverrides = Field(default_factory=TreeOverrides)


class CropOverrides(_Strict):
    """Names and units as in yieldsafe.model.CropParams. For a new crop code (13 or 14) every field is required."""

    name: Optional[str] = Field(None, max_length=40)
    doy_sowing: Optional[int] = Field(None, ge=-365, le=365, description="Negative = sown the previous autumn")
    doy_harvest: Optional[int] = Field(None, ge=0, le=365)
    t_base: Optional[float] = Field(None, ge=-10, le=20)
    tsum_emerge: Optional[float] = Field(None, ge=0, le=5000)
    tsum_rb: Optional[float] = Field(None, ge=0, le=10000)
    tsum_re: Optional[float] = Field(None, ge=0, le=10000)
    tsum_harvest: Optional[float] = Field(None, ge=0, le=10000)
    biomass0_g_m2: Optional[float] = Field(None, ge=0, le=1000)
    lai0: Optional[float] = Field(None, ge=0, le=10)
    partition_leaves: Optional[float] = Field(None, ge=0, le=1)
    rue_g_per_mj: Optional[float] = Field(None, ge=0, le=5)
    water_per_biomass_m3_g: Optional[float] = Field(None, ge=0, le=0.01)
    harvest_index: Optional[float] = Field(None, ge=0, le=1)
    harvest_index2: Optional[float] = Field(None, ge=0, le=1)
    k_extinction: Optional[float] = Field(None, ge=0, le=2)
    pf_crit: Optional[float] = Field(None, ge=0, le=7)
    pwp: Optional[float] = Field(None, ge=0, le=7)
    moisture1: Optional[float] = Field(None, ge=0, lt=1)
    moisture2: Optional[float] = Field(None, ge=0, le=10)
    sla_m2_g: Optional[float] = Field(None, ge=0, le=1)
    site_factor: Optional[float] = Field(None, ge=0, le=3)
    irrigated: Optional[bool] = None
    critical_deficit_mm: Optional[float] = Field(None, ge=0, le=10000)
    application_mm: Optional[float] = Field(None, ge=0, le=1000)


class Soil(_Strict):
    texture: SoilTexture = Field(description="Soil class from the workbook (worksheet C.3)")
    vwc0: float = Field(gt=0, lt=1, description="Initial volumetric water content (mm/mm)")
    depth_mm: float = Field(gt=0, le=10000, description="Effective soil (rooting) depth")
    water_model: bool = Field(True, description="False = no water limitation (the workbook's water switch)")
    root_shoot_ratio: float = Field(0.25, ge=0, le=5, description="Used for root carbon")
    overrides: dict[Literal["alpha", "epot_mm_per_mj", "pf_fc", "ks_mm_d", "n_vg", "pf_crit_e", "pf_e_offset",
                            "theta_s", "theta_r"], float] = Field(default_factory=dict)


class Year(_Strict):
    """One tree year (0 = the year of `weather.start`). Mirrors a row of the workbook's crop calendar."""

    crop: int = Field(0, ge=0, le=14, description="Crop code (1-12 built-in, 13-14 custom, 0 = none); see /processes/yieldsafe")
    crop_area: float = Field(0, ge=0, le=1, description="Share of the land cropped (alley width / total)")
    trees_planted_per_ha: float = Field(0, ge=0, le=20000, description="Planted on tree.doy_planting of this year")
    trees_removed_per_ha: float = Field(0, ge=0, le=20000, description="Thinned or felled on tree.doy_thinning of this year")


class Pruning(_Strict):
    """The workbook's 'horizontal prune' (management sheet AF73-AF75)."""

    interval_years: float = Field(80, gt=0, le=200)
    biomass_fraction: float = Field(0, ge=0, le=1)
    shoots_fraction: float = Field(0, ge=0, le=1)


class Irrigation(_Strict):
    start_year: int = Field(0, ge=0, le=MAX_YEARS)
    start_doy: int = Field(0, ge=0, le=365)
    end_year: int = Field(60, ge=0, le=MAX_YEARS)
    end_doy: int = Field(180, ge=0, le=365)
    interval_days: int = Field(10, ge=1, le=365)
    amount_mm: float = Field(100, ge=0, le=500)


class YieldSafeInputs(_Strict):
    site: Site
    weather: Weather
    tree: Tree
    soil: Soil
    crops: dict[Literal["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"], CropOverrides] = Field(
        default_factory=dict,
        description="Changes to the built-in crops by code, or complete new crops under codes 13 and 14",
    )
    years: list[Year] = Field(min_length=1, max_length=MAX_YEARS, description="Index = tree year; years not listed have no crop and no tree events")
    pruning: Pruning = Field(default_factory=Pruning)
    irrigation: Optional[Irrigation] = None
    daily_variables: list[DailyVariable] = Field(default_factory=list, max_length=len(DAILY_COLUMNS))

    @field_validator("crops")
    @classmethod
    def _new_crops_complete(cls, v):
        for code, c in v.items():
            if int(code) not in CROPS:
                missing = [k for k, val in c.model_dump().items() if val is None]
                if missing:
                    raise ValueError(f"crop {code} is not built in, so every field is needed (missing: {', '.join(missing)})")
        return v

    @model_validator(mode="after")
    def _crops_exist(self):
        known = set(CROPS) | {int(k) for k in self.crops}
        for i, y in enumerate(self.years):
            if y.crop and y.crop not in known:
                raise ValueError(f"years[{i}].crop {y.crop} is not a built-in crop and not defined in crops")
        if not any(y.trees_planted_per_ha > 0 for y in self.years) and not any(y.crop for y in self.years):
            raise ValueError("nothing to simulate: no trees planted and no crops")
        return self


class ExecuteRequest(_Strict):
    inputs: YieldSafeInputs


# ---------- outputs

ANNUAL_KEYS = {
    "crop": "Crop code grown in the year",
    "crop_yield_t_ha": "Crop yield per cropped area at the end of the season (t/ha, at crop moisture)",
    "crop_byproduct_t_ha": "Crop by-product, e.g. straw (t/ha of cropped area)",
    "trees_per_ha": "Standing trees at year end",
    "tree_height_m": "Tree height at year end (m)",
    "tree_dbh_cm": "Diameter at breast height at year end (cm)",
    "canopy_cover_pct": "Canopy area (% of land, capped at 100)",
    "prune_height_m": "Clear stem height (m)",
    "stand_volume_m3_ha": "Standing timber volume at year end plus timber harvested in the year (m3/ha)",
    "harvest_volume_m3_ha": "Timber removed by thinning or felling in the year (m3/ha)",
    "branch_volume_m3_ha": "Branchwood volume at year end (m3/ha)",
    "harvest_branch_m3_ha": "Branchwood removed in the year (m3/ha)",
    "fruit_t_ha": "Tree fruit harvested in the year (t/ha)",
    "tree_carbon_t_ha": "Carbon in trees including roots at year end (t C/ha)",
    "tree_co2_t_ha": "The same as CO2 (t CO2/ha, x3.67)",
    "rain_mm": "Precipitation (mm/yr)",
    "irrigation_mm": "Irrigation (mm/yr)",
    "drainage_mm": "Flow to groundwater (mm/yr)",
    "tree_water_mm": "Tree water uptake (mm/yr)",
    "crop_water_mm": "Crop water uptake (mm/yr)",
    "evaporation_mm": "Soil evaporation (mm/yr)",
    "days": "Simulated days in the year",
}


class Summary(BaseModel):
    mean_crop_yield_t_ha: float = Field(description="Mean of crop_yield_t_ha over years with a crop, as the workbook's summary (cropped area)")
    max_stand_volume_m3_ha: float = Field(description="Largest standing + cumulative harvested timber volume (workbook 'final tree vol')")
    max_stand_biomass_odt_ha: float = Field(description="The same as oven-dry tonnes (x wood density)")
    final_tree_carbon_t_ha: float
    final_tree_co2_t_ha: float


class Outputs(BaseModel):
    years: list[int] = Field(description="Calendar years; values are for the end of each year")
    tree_years: list[int] = Field(description="Tree year (0 = first) for each entry in 'years'")
    annual: dict[str, list[Optional[float]]] = Field(
        description="One value per year. " + "; ".join(f"{k}: {v}" for k, v in ANNUAL_KEYS.items())
    )
    summary: Summary
    daily: dict[str, list[float]] = Field(description="Only when daily_variables is set; dates follow weather.start")
    daily_units: dict[str, str]


class RunInfo(BaseModel):
    process: str = "yieldsafe"
    model_version: str
    reference_workbook_sha256: str = Field(description="The Excel workbook the port is tested against")
    adapter_version: str
    input_sha256: str
    started_at: str
    duration_s: float
    first_day: str
    last_day: str
    warnings: list[str]


class ExecuteResponse(BaseModel):
    outputs: Outputs
    run: RunInfo
