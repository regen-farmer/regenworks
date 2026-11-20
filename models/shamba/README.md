# SHAMBA runner

Wraps [SHAMBA v1.2](https://github.com/shamba-model/shamba) (Plan Vivo's
Small-Holder Agriculture Mitigation Benefit Assessment model) for GroveWorks.
It returns the yearly greenhouse-gas balance of a **baseline** and a **project**
land use per hectare, split by pool (trees, soil via RothC, crops, fire,
litter, fertiliser), plus soil carbon per year.

## Run it

```sh
# Local Python 3.10, against a checkout of upstream SHAMBA
pip install -r requirements-test.txt
export SHAMBA_SRC=/path/to/shamba/shamba      # the folder that contains model/
python -m pytest -q tests                      # golden test on the Uganda example
uvicorn adapter.server:app --port 8080

# Or the container
docker compose -f ../docker-compose.yml up --build
```

## Request

`POST /processes/shamba/execution` with `{"inputs": {...}}`. Full schema:
`schema/request.schema.json`.

| Part | What | OPA |
|---|---|---|
| `site.lat`, `site.lon` | Location | I1 |
| `site.climate` | 12 months: `temp_c`, `rain_mm`, `evap_mm` (open-pan; PET ÷ 0.75) | I1 |
| `site.soil` | `soc_t_c_per_ha` (top 30 cm at year 0) and `clay_pct` | I1 |
| `intervention` | One row of SHAMBA's input sheet, keyed by its column names (`yrs_proj`, `species1`, `base_plant_dens`, `proj_plant_yr1`, `thin_proj_yr1`, `crop_proj_spp1`, …). See the upstream template `SHAMBA input output template v1.2.xlsx`, tab `input` | I3, I4 |
| `parameters` | Optional tables `tree`, `crop`, `litter`, `biomass_pool` as `{columns, rows}`; missing ones use SHAMBA's defaults | I2 |
| `options` | `n_cohorts` (1–3), `allometry` (baseline + one per cohort, built-in keys only), `gwp` (`SAR`, `AR4`, `AR5`, `AR6`) | – |

`intervention` is intentionally SHAMBA's own vocabulary for now. Translating a
GroveWorks design (rows, species, spacing, management) into these keys is the
next step and belongs in GroveWorks, so this wrapper stays thin.

## Response

`outputs.pools.<pool>.{baseline, project, difference}` per year in
t CO2e/ha/yr, `outputs.totals.<pool>` summed over the period, and
`outputs.soil_carbon_t_c_per_ha.{baseline, project}`. **Negative `difference`
means a net removal.** `run` holds the provenance (see `../README.md`).

Uganda example (SHAMBA's `UG_TS_2016`, 50 years): total −185.5, trees −82.4,
soil −93.0, crops −10.1 t CO2e/ha.

## What changes compared with running SHAMBA by hand

- No network: SHAMBA's Open-Meteo and SoilGrids lookups are switched off
  (`use_api=False`); climate and soil must be in the request.
- No custom `project_allometry.py` (it is arbitrary Python). Built-in keys:
  `chave dry`, `chave moist`, `chave wet`, `ryan`, `grevillea`, `maesopsis`, `markhamia`.
- One plot per request (SHAMBA v1.2 runs one plot at a time anyway).
- Each run happens in a fresh child process (SHAMBA keeps paths in globals),
  with a time and memory limit.
- No plots or CSV files are produced; everything comes back as JSON.

## Limits

| Setting | Default |
|---|---|
| `SHAMBA_TIMEOUT_S` | 120 s per run |
| `SHAMBA_MEMORY_MB` | 1024 MB per run (address space) |
| `SHAMBA_MAX_CONCURRENT` | 2 runs per container; more get 429 |
| `SHAMBA_MAX_BODY_KB` | 512 KB |
| Years / cohorts | 1–100 years, 1–3 cohorts |
| `SHAMBA_API_TOKEN` | Bearer token; set it whenever the container is reachable by others |

## Caveats

- **Licence:** SHAMBA is under the University of Edinburgh's Open Technology
  terms, not an open-source licence. Nothing from SHAMBA is committed here, and
  images are built locally or in CI without being published. Check the terms
  before pushing an image to any registry.
- **Context:** SHAMBA is built and parameterised for tropical smallholder
  systems (the APCCO sites in Uganda fit). Results for Danish sites need local
  tree, crop and soil parameters before they are used anywhere.
- The pinned commit is in `Dockerfile` (`ARG SHAMBA_COMMIT`) and
  `.github/workflows/models.yml`. When moving it, re-run the tests and update
  the golden numbers only if the change in results is explained upstream.
