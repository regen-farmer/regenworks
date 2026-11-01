"""Request and response models for the SHAMBA process.

These are the machine-readable contract. `python -m adapter.export_schema`
writes them to ../schema/*.schema.json, and CI checks the files are current.

Mapping to the OPA interfaces (DigitAF D2.9):
  site            -> I1 context (location, monthly climate, soil)
  intervention    -> I3 system design + I4 management, in SHAMBA's own keys
  parameters      -> I2 species parameters (tree/crop tables)
  outputs         -> I8/I9 climate budget (t CO2e per ha per year)
"""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Built-in SHAMBA allometric functions. Custom `project_allometry.py` files
# are deliberately NOT supported: they are arbitrary Python code.
ALLOMETRY_KEYS = (
    "chave dry",
    "chave moist",
    "chave wet",
    "ryan",
    "grevillea",
    "maesopsis",
    "markhamia",
)

MAX_YEARS = 100
MAX_COHORTS = 3

Scalar = Union[float, int, str, None]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MonthlyClimate(_Strict):
    temp_c: float = Field(description="Mean monthly air temperature (°C)", ge=-50, le=60)
    rain_mm: float = Field(description="Monthly rainfall (mm)", ge=0, le=5000)
    evap_mm: float = Field(
        description="Monthly open-pan evaporation (mm). If you only have potential "
        "evapotranspiration, divide it by 0.75 (as SHAMBA does for Open-Meteo data).",
        ge=0,
        le=5000,
    )


class Soil(_Strict):
    soc_t_c_per_ha: float = Field(
        description="Soil organic carbon in the top 30 cm at year 0 (t C/ha). SHAMBA 'Cy0'.",
        ge=0,
        le=10000,
    )
    clay_pct: float = Field(description="Clay content (%)", ge=0, le=100)


class Site(_Strict):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    climate: list[MonthlyClimate] = Field(
        description="Twelve months, January first.", min_length=12, max_length=12
    )
    soil: Soil


class Table(_Strict):
    """A parameter table, written to CSV exactly as given."""

    columns: list[str] = Field(min_length=1, max_length=50)
    rows: list[list[Scalar]] = Field(min_length=1, max_length=500)

    @field_validator("rows")
    @classmethod
    def _row_width(cls, rows, info):
        cols = info.data.get("columns") or []
        for i, row in enumerate(rows):
            if len(row) != len(cols):
                raise ValueError(f"row {i} has {len(row)} values, expected {len(cols)}")
        return rows


class Parameters(_Strict):
    """Optional parameter tables. Any table left out uses SHAMBA's defaults."""

    tree: Optional[Table] = Field(None, description="tree_params.csv")
    crop: Optional[Table] = Field(None, description="crop_params.csv")
    litter: Optional[Table] = Field(None, description="litter_params.csv")
    biomass_pool: Optional[Table] = Field(None, description="biomass_pool_params.csv")


class Options(_Strict):
    n_cohorts: int = Field(1, ge=1, le=MAX_COHORTS, description="Tree cohorts in the project scenario")
    allometry: list[Literal[ALLOMETRY_KEYS]] = Field(  # type: ignore[valid-type]
        default_factory=lambda: ["chave dry", "chave dry"],
        description="One key for the baseline, then one per project cohort.",
    )
    gwp: Literal["SAR", "AR4", "AR5", "AR6"] = "AR6"

    @field_validator("allometry")
    @classmethod
    def _allometry_len(cls, v, info):
        n = info.data.get("n_cohorts", 1)
        if len(v) != n + 1:
            raise ValueError(f"need {n + 1} allometry keys (baseline + {n} cohorts), got {len(v)}")
        return v


class ShambaInputs(_Strict):
    site: Site
    intervention: dict[str, Scalar] = Field(
        description="One row of SHAMBA's input sheet (the 'input' tab of the SHAMBA v1.2 "
        "template), keyed by its column names, e.g. yrs_proj, species1, base_plant_dens. "
        "'lat' and 'lon' are taken from site and may be omitted.",
        max_length=400,
    )
    parameters: Parameters = Field(default_factory=Parameters)
    options: Options = Field(default_factory=Options)

    @field_validator("intervention")
    @classmethod
    def _years(cls, v):
        if "yrs_proj" not in v:
            raise ValueError("intervention.yrs_proj is required")
        try:
            years = int(float(v["yrs_proj"]))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            raise ValueError("intervention.yrs_proj must be a number")
        if not 1 <= years <= MAX_YEARS:
            raise ValueError(f"intervention.yrs_proj must be between 1 and {MAX_YEARS}")
        for k in v:
            if not k.replace("_", "").isalnum() or len(k) > 40:
                raise ValueError(f"invalid key {k!r}")
        return v


class ExecuteRequest(_Strict):
    inputs: ShambaInputs


# ---------- outputs ----------

POOLS = ("total", "tree", "soil", "crop", "fire", "litter", "fertiliser")


class PoolSeries(BaseModel):
    baseline: list[float]
    project: list[float]
    difference: list[float] = Field(description="project - baseline. Negative = net removal.")


class Outputs(BaseModel):
    unit: Literal["t CO2e/ha/yr"] = "t CO2e/ha/yr"
    years: int
    pools: dict[str, PoolSeries] = Field(description=f"Keys: {', '.join(POOLS)}")
    totals: dict[str, float] = Field(
        description="Sum of 'difference' over all years per pool (t CO2e/ha). Negative = net removal."
    )
    soil_carbon_t_c_per_ha: dict[str, list[float]] = Field(
        description="Total soil organic carbon (all RothC pools, top 30 cm) for year 0 to the last year, baseline and project (t C/ha)."
    )


class RunInfo(BaseModel):
    process: str = "shamba"
    model_version: str
    upstream_commit: str
    adapter_version: str
    input_sha256: str
    started_at: str
    duration_s: float
    soil_model: str = "RothC"
    gwp: str
    warnings: list[str]


class ExecuteResponse(BaseModel):
    outputs: Outputs
    run: RunInfo


class Problem(BaseModel):
    """Error body (RFC 7807 style, as OGC API - Processes uses)."""

    type: str
    title: str
    status: int
    detail: str
