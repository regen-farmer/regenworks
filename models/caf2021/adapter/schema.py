"""Request and response models for the CAF2021 process (the machine-readable contract).

`python -m adapter.export_schema` writes them to ../schema/*.schema.json.

Mapping to the OPA interfaces (DigitAF D2.9):
  site, weather      -> I1 context
  parameters         -> I2 species (coffee + up to 3 shade-tree species) and I3 system
  management         -> I4 (fertiliser, coffee pruning, tree pruning and thinning)
  outputs.annual     -> I5 yield/growth, I8 carbon and nitrogen budget inputs
"""

from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .outputs import INDEX

MAX_DAYS = 10_000  # NMAXDAYS in CAF2021's environment.f90
MAX_EVENTS = 100  # rows in each management calendar
MAX_DAILY_VARIABLES = 20
PARAM_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,31}(\([1-6]\))?$")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WeatherDay(_Strict):
    """One day, identified CAF-style by year and day of year. Leap days are
    optional: the model steps through the rows, so both real calendars and
    365-day series (as in CAF2021's own example files) are accepted."""

    year: int = Field(ge=1800, le=2300)
    doy: int = Field(ge=1, le=366)
    rad_mj_m2: float = Field(ge=0, le=50, description="Global radiation (MJ m-2 d-1), CAF 'GR'")
    tmin_c: float = Field(ge=-60, le=50)
    tmax_c: float = Field(ge=-50, le=60)
    vp_kpa: float = Field(ge=0, le=10, description="Vapour pressure (kPa), CAF 'VP'")
    wind_m_s: float = Field(ge=0, le=60, description="Wind speed (m s-1), CAF 'WN'")
    rain_mm: float = Field(ge=0, le=1000)


class Site(_Strict):
    lat: float = Field(ge=-90, le=90, description="Sets CAF parameter LAT (day length)")
    lon: float = Field(ge=-180, le=180, description="Recorded only; CAF does not use longitude")
    name: Optional[str] = Field(None, max_length=80)


class Event(_Strict):
    year: int = Field(ge=1800, le=2300)
    doy: int = Field(ge=1, le=366)


class Fertilisation(Event):
    n_kg_ha: float = Field(ge=0, le=1000, description="Nitrogen applied (kg N/ha)")


class CoffeePruning(Event):
    fraction: float = Field(ge=0, le=1, description="Fraction of coffee biomass pruned")


class TreeEvent(Event):
    species: Literal[1, 2, 3] = Field(description="Shade-tree species slot 1-3 (see parameters ...(1), ...(2), ...(3))")
    fraction: float = Field(ge=0, le=1, description="Pruning: fraction of branches/leaves removed; thinning: fraction of trees removed")


class Management(_Strict):
    fertilisation: list[Fertilisation] = Field(default_factory=list, max_length=MAX_EVENTS)
    coffee_pruning: list[CoffeePruning] = Field(default_factory=list, max_length=MAX_EVENTS)
    tree_pruning: list[TreeEvent] = Field(default_factory=list, max_length=3 * MAX_EVENTS)
    tree_thinning: list[TreeEvent] = Field(default_factory=list, max_length=3 * MAX_EVENTS)

    @model_validator(mode="after")
    def _per_species(self):
        for name in ("tree_pruning", "tree_thinning"):
            events = getattr(self, name)
            for s in (1, 2, 3):
                if sum(e.species == s for e in events) > MAX_EVENTS:
                    raise ValueError(f"{name}: more than {MAX_EVENTS} events for species {s}")
        return self


class Caf2021Inputs(_Strict):
    site: Site
    weather: list[WeatherDay] = Field(min_length=1, max_length=MAX_DAYS, description="Consecutive days, oldest first")
    parameters: dict[str, float] = Field(
        default_factory=dict,
        max_length=200,
        description="Overrides of CAF2021's parameters_default.txt (column 1) by name, e.g. "
        "'TREEDENS0(1)': 0.07 (trees per m2 of species 1). Unknown names are rejected. LAT comes from site.lat.",
    )
    management: Management = Field(default_factory=Management)
    daily_variables: list[str] = Field(
        default_factory=list,
        max_length=MAX_DAILY_VARIABLES,
        description="CAF2021 output columns to return day by day, e.g. 'Csoil_f', 'LAI(1)'",
    )

    @field_validator("parameters")
    @classmethod
    def _param_names(cls, v):
        for k in v:
            if not PARAM_NAME.match(k):
                raise ValueError(f"invalid parameter name {k!r}")
        if "LAT" in v:
            raise ValueError("set LAT through site.lat, not parameters")
        return v

    @field_validator("daily_variables")
    @classmethod
    def _vars(cls, v):
        unknown = [x for x in v if x not in INDEX]
        if unknown:
            raise ValueError(f"unknown output variable(s): {', '.join(unknown)}")
        return v

    @model_validator(mode="after")
    def _weather(self):
        w = self.weather
        for a, b in zip(w, w[1:]):
            same_year = b.year == a.year and b.doy == a.doy + 1
            new_year = b.year == a.year + 1 and b.doy == 1 and a.doy in (365, 366)
            if not (same_year or new_year):
                raise ValueError(f"weather must be consecutive days; gap or disorder after {a.year}-{a.doy:03d}")
        for d in w:
            if d.tmin_c > d.tmax_c:
                raise ValueError(f"tmin_c > tmax_c on {d.year}-{d.doy:03d}")
        return self


class ExecuteRequest(_Strict):
    inputs: Caf2021Inputs


# ---------- outputs ----------

ANNUAL_KEYS = {
    "coffee_harvest_t_c_ha": "Coffee beans harvested in the year (t C/ha)",
    "coffee_harvest_dm_kg_ha": "Coffee beans harvested in the year (kg dry matter/ha), harvest C / CCONC",
    "coffee_biomass_t_c_ha": "Coffee biomass carbon at year end, C_f (t C/ha)",
    "tree_biomass_t_c_ha": "Shade-tree biomass carbon at year end, all species, CT_f (t C/ha)",
    "tree_stem_t_c_ha_1": "Stem carbon of tree species 1 at year end (t C/ha); _2, _3 likewise",
    "tree_stem_t_c_ha_2": "",
    "tree_stem_t_c_ha_3": "",
    "tree_density_per_ha_1": "Trees per ha of species 1 at year end; _2, _3 likewise",
    "tree_density_per_ha_2": "",
    "tree_density_per_ha_3": "",
    "tree_height_m_1": "Height of tree species 1 at year end (m); _2, _3 likewise",
    "tree_height_m_2": "",
    "tree_height_m_3": "",
    "soil_c_t_ha": "Soil organic carbon at year end, Csoil_f (t C/ha)",
    "soil_n_t_ha": "Soil organic nitrogen at year end, Nsoil_f (t N/ha)",
    "system_c_t_ha": "Coffee + trees + soil carbon at year end (t C/ha)",
    "n_fertiliser_kg_ha": "Fertiliser N applied (kg N/ha/yr)",
    "n_fixation_kg_ha": "N fixed by trees (kg N/ha/yr)",
    "n_leaching_kg_ha": "N leached (kg N/ha/yr)",
    "n_emission_kg_ha": "Gaseous N emission (kg N/ha/yr), Nemission_f",
    "n_runoff_kg_ha": "N lost in runoff (kg N/ha/yr)",
    "c_soil_respiration_t_ha": "Soil respiration (t C/ha/yr)",
    "rain_mm": "Rain (mm/yr)",
    "drainage_mm": "Drainage (mm/yr)",
    "runoff_mm": "Runoff (mm/yr)",
    "evaporation_mm": "Soil evaporation (mm/yr)",
    "transpiration_coffee_mm": "Coffee transpiration (mm/yr)",
    "transpiration_trees_mm": "Tree transpiration (mm/yr)",
    "days": "Simulated days in the year",
}


class Outputs(BaseModel):
    years: list[int]
    annual: dict[str, list[float]] = Field(
        description="One value per year in 'years'. "
        + "; ".join(f"{k}: {v}" for k, v in ANNUAL_KEYS.items() if v)
    )
    daily: dict[str, list[float]] = Field(
        description="Only when daily_variables is set: 'year' and 'doy' plus one list per variable (CAF units)"
    )
    daily_units: dict[str, str]


class RunInfo(BaseModel):
    process: str = "caf2021"
    model_version: str
    upstream_commit: str
    adapter_version: str
    input_sha256: str
    started_at: str
    duration_s: float
    first_day: str = Field(description="year-doy of the first simulated day")
    last_day: str
    warnings: list[str]


class ExecuteResponse(BaseModel):
    outputs: Outputs
    run: RunInfo
