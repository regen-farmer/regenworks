"""Request and response models for the DynACof process (the machine-readable contract).

`python -m adapter.export_schema` writes them to ../schema/*.schema.json.

Mapping to the OPA interfaces (DigitAF D2.9):
  site, meteo        -> I1 context (location, daily weather)
  shade_trees,
  parameters.coffee/tree/soil -> I2 species + I3 system design + I4 management
  outputs.annual     -> I5 yield and growth; biomass carbon feeds I8
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_DAYS = 60 * 366
MAX_DAILY_VARIABLES = 10
NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")

ParamValue = Union[float, int, bool, str, list[float], list[list[int]]]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MeteoDay(_Strict):
    date: dt.date
    tmax_c: float = Field(ge=-50, le=60)
    tmin_c: float = Field(ge=-60, le=50)
    rain_mm: float = Field(0.0, ge=0, le=1000)
    rad_mj_m2: Optional[float] = Field(None, ge=0, le=50, description="Incident shortwave radiation (MJ m-2 d-1)")
    par_mj_m2: Optional[float] = Field(None, ge=0, le=25, description="Incident PAR (MJ m-2 d-1); used if rad is missing")
    rh_pct: Optional[float] = Field(None, ge=0, le=100)
    tair_c: Optional[float] = Field(None, ge=-50, le=60, description="Mean air temperature; else (tmax+tmin)/2")
    pressure_hpa: Optional[float] = Field(None, ge=300, le=1100)
    wind_m_s: Optional[float] = Field(None, ge=0, le=60)
    co2_ppm: Optional[float] = Field(None, ge=150, le=2000)
    vpd_hpa: Optional[float] = Field(None, ge=0, le=100)
    diffuse_fraction: Optional[float] = Field(None, ge=0, le=1)
    degree_days: Optional[float] = Field(None, ge=0, le=100)


class Site(_Strict):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    elevation_m: Optional[float] = Field(None, ge=-500, le=6000)
    timezone_offset_h: Optional[int] = Field(
        None, ge=-14, le=14, description="DynACof 'TimezoneCF': hours to add to local time to get UTC (Costa Rica = 6)"
    )
    name: Optional[str] = Field(None, max_length=80)


class Parameters(_Strict):
    """Overrides of DynACof's default parameters (Vezy et al. 2019, Aquiares, Costa Rica).

    Keys are DynACof's own field names, e.g. coffee.Stocking_Coffee, tree.StockingTree_treeha1,
    tree.Tree_Species. Values must have the same type as the default. Model functions
    (metamodels, allometries) can't be changed. Ranges such as tree.Fall_Period_Tree are
    given as [[from, to], ...].
    """

    constants: dict[str, ParamValue] = Field(default_factory=dict, max_length=100)
    site: dict[str, ParamValue] = Field(default_factory=dict, max_length=100)
    soil: dict[str, ParamValue] = Field(default_factory=dict, max_length=100)
    coffee: dict[str, ParamValue] = Field(default_factory=dict, max_length=200)
    tree: dict[str, ParamValue] = Field(default_factory=dict, max_length=200)

    @field_validator("constants", "site", "soil", "coffee", "tree")
    @classmethod
    def _names(cls, v):
        for k in v:
            if not NAME.match(k):
                raise ValueError(f"invalid parameter name {k!r}")
        return v

    @field_validator("site")
    @classmethod
    def _site_from_site(cls, v):
        taken = {"Latitude", "Longitude", "Elevation", "TimezoneCF", "Location"} & set(v)
        if taken:
            raise ValueError(f"set {', '.join(sorted(taken))} through 'site', not parameters.site")
        return v


class DynacofInputs(_Strict):
    site: Site
    meteo: list[MeteoDay] = Field(min_length=1, max_length=MAX_DAYS, description="Consecutive days, oldest first")
    shade_trees: bool = Field(
        True,
        description="False would run a coffee monocrop, but DynACof 1.5.3 fails on that path "
        "(soil.jl reads wleaf_Tree, which a no-shade run doesn't have), so it is rejected for now.",
    )
    period: Optional[tuple[dt.date, dt.date]] = Field(None, description="Only return this date range")
    parameters: Parameters = Field(default_factory=Parameters)
    daily_variables: list[str] = Field(
        default_factory=list,
        max_length=MAX_DAILY_VARIABLES,
        description="DynACof output columns to return day by day, e.g. LAI, Yield_green, CM_Stem_Tree",
    )

    @field_validator("daily_variables")
    @classmethod
    def _vars(cls, v):
        for k in v:
            if not NAME.match(k):
                raise ValueError(f"invalid variable name {k!r}")
        return v

    @model_validator(mode="after")
    def _meteo_checks(self):
        days = self.meteo
        for a, b in zip(days, days[1:]):
            if (b.date - a.date).days != 1:
                raise ValueError(f"meteo must be consecutive days; gap or disorder after {a.date}")
        if all(d.rad_mj_m2 is None for d in days) and all(d.par_mj_m2 is None for d in days):
            raise ValueError("meteo needs rad_mj_m2 or par_mj_m2")
        for d in days:
            if d.tmin_c > d.tmax_c:
                raise ValueError(f"tmin_c > tmax_c on {d.date}")
        if not self.shade_trees:
            raise ValueError(
                "shade_trees=false (coffee monocrop) fails inside DynACof 1.5.3 itself; "
                "not supported until fixed upstream"
            )
        if self.period and self.period[0] > self.period[1]:
            raise ValueError("period start is after its end")
        return self


class ExecuteRequest(_Strict):
    inputs: DynacofInputs


# ---------- outputs ----------

ANNUAL_KEYS = {
    "coffee_yield_green_kg_ha": "Green coffee bean yield harvested in the year (kg/ha)",
    "coffee_gpp_t_c_ha": "Coffee gross primary production (t C/ha/yr)",
    "coffee_npp_t_c_ha": "Coffee net primary production (t C/ha/yr)",
    "coffee_lai_mean": "Mean coffee leaf area index",
    "coffee_biomass_t_c_ha": "Coffee biomass carbon at year end: leaves, shoots, stump + coarse roots, fine roots, fruit (t C/ha)",
    "coffee_reserves_t_c_ha": "Coffee carbon reserves at year end (t C/ha)",
    "tree_gpp_t_c_ha": "Shade tree gross primary production (t C/ha/yr)",
    "tree_npp_t_c_ha": "Shade tree net primary production (t C/ha/yr)",
    "tree_lai_mean": "Mean shade tree leaf area index",
    "tree_biomass_t_c_ha": "Shade tree biomass carbon at year end: leaves, stem, branches, coarse + fine roots (t C/ha)",
    "tree_dbh_cm": "Shade tree diameter at breast height at year end (cm)",
    "tree_height_m": "Shade tree height at year end (m)",
    "tree_density_per_ha": "Shade trees per hectare at year end",
    "tree_light_transmittance_mean": "Mean fraction of light passing the shade tree canopy",
    "rain_mm": "Rainfall (mm)",
    "evapotranspiration_mm": "System evapotranspiration (mm)",
    "runoff_mm": "Surface runoff (mm)",
    "drainage_mm": "Drainage below the root zone (mm)",
    "days": "Simulated days in the year",
}


class Outputs(BaseModel):
    years: list[int]
    annual: dict[str, list[float]] = Field(
        description="One value per year in 'years'. Keys: " + "; ".join(f"{k}: {v}" for k, v in ANNUAL_KEYS.items())
    )
    daily: dict[str, list[Union[float, str]]] = Field(
        description="Only when daily_variables is set: 'date' plus one list per variable"
    )
    cycles: int = Field(description="Plantation cycles simulated (a new one starts after coffee.AgeCoffeeMax years)")
    shade_trees: bool


class RunInfo(BaseModel):
    process: str = "dynacof"
    model_version: str
    adapter_version: str
    input_sha256: str
    started_at: str
    duration_s: float
    model_seconds: float
    first_date: str
    last_date: str
    warnings: list[str]


class ExecuteResponse(BaseModel):
    outputs: Outputs
    run: RunInfo
