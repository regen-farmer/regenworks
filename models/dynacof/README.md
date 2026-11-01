# DynACof runner

Wraps [DynACof.jl](https://github.com/VEZY/DynACof.jl) 1.5.3, the Dynamic
Agroforestry Coffee Crop Model (Vezy et al. 2020). It simulates a coffee
plantation under shade trees day by day (light, carbon allocation, growth,
fruit cohorts and yield, energy and water balance) and this runner returns
**yearly summaries**: green coffee yield, GPP/NPP and biomass carbon for coffee
and shade trees, tree size and density, light under the trees, and the water
balance.

The Julia version is used because it is the maintained one (the R package is
not) and about 100 times faster: 38 years of daily simulation take ~3 s on a
warm worker.

## Run it

```sh
# Julia 1.10 and Python 3.11+
julia --project=worker -e 'using Pkg; Pkg.instantiate()'
pip install -r requirements-test.txt
export DYNACOF_INPUTS=/path/to/DynACof.jl_inputs   # git clone https://github.com/VEZY/DynACof.jl_inputs
python -m pytest -q tests                           # golden test on the Aquiares example (~1 min)
uvicorn adapter.server:app --port 8080

# Or the container
docker compose -f ../docker-compose.yml up --build dynacof
```

## Request

`POST /processes/dynacof/execution` with `{"inputs": {...}}`. Full schema:
`schema/request.schema.json`.

| Part | What | OPA |
|---|---|---|
| `site` | `lat`, `lon`, optional `elevation_m`, `timezone_offset_h`, `name` | I1 |
| `meteo` | Consecutive days: `date`, `tmax_c`, `tmin_c`, `rain_mm`, and `rad_mj_m2` or `par_mj_m2`; optional `rh_pct`, `tair_c`, `pressure_hpa`, `wind_m_s`, `co2_ppm`, `vpd_hpa`, `diffuse_fraction`, `degree_days`. Up to 60 years | I1 |
| `parameters` | Overrides of DynACof's defaults by its own field names, per group `constants`, `site`, `soil`, `coffee`, `tree`, e.g. `{"coffee": {"Stocking_Coffee": 5580}, "tree": {"StockingTree_treeha1": 100}}` | I2, I3, I4 |
| `period` | Optional `[from, to]` to return only part of the simulation | – |
| `daily_variables` | Up to 10 DynACof output columns to also return day by day (e.g. `LAI`, `Yield_green`, `CM_Stem_Tree`) | – |

Overrides must have the same type as the default (DynACof's 1.5.3 defaults are
in its `parameters_struct.jl`). Ranges such as `tree.Fall_Period_Tree` are given
as `[[1, 55], [175, 240], ...]`.

## Response

`outputs.years` and `outputs.annual.<key>` (one value per year). Keys and
units are listed in `schema/response.schema.json`; the main ones:

| Key | Unit |
|---|---|
| `coffee_yield_green_kg_ha` | kg green coffee/ha harvested in the year |
| `coffee_biomass_t_c_ha`, `tree_biomass_t_c_ha` | t C/ha at year end (feeds a carbon budget) |
| `coffee_npp_t_c_ha`, `tree_npp_t_c_ha` | t C/ha/yr |
| `tree_dbh_cm`, `tree_height_m`, `tree_density_per_ha` | at year end |
| `tree_light_transmittance_mean` | fraction of light reaching the coffee |
| `rain_mm`, `evapotranspiration_mm`, `runoff_mm`, `drainage_mm` | mm/yr |

Aquiares example (DynACof's defaults and weather, 1979–2016): 47,830 kg green
coffee/ha over 38 years.

## How it differs from calling `dynacof()` yourself

- **Parameters are typed overrides, not files.** DynACof reads parameter files
  with `evalfile`, i.e. as Julia code, so files are never accepted. Model
  functions (metamodels, allometries) can't be changed.
- **No network.** Weather must be in the request.
- **Long-lived workers.** A fresh Julia process spends ~20 s compiling, so
  the container keeps `DYNACOF_MAX_CONCURRENT` workers warm (default 1). A run
  that passes the time limit gets 504 and its worker is killed and replaced.
  Unlike SHAMBA's one-process-per-run, a worker is reused between runs; each
  run builds its parameters from scratch, so nothing carries over.
- **year and DOY are written by the wrapper.** DynACof 1.5.3 crashes when it has
  to derive DOY itself (`dayofyear` is not imported in `meteo.jl`).

## Known limits of DynACof 1.5.3

- **Coffee monocrop doesn't run.** `dynacof(tree="")` fails inside the model
  (`soil.jl` reads `wleaf_Tree`, which a no-shade run lacks). The runner rejects
  `shade_trees: false` with a clear message until this is fixed upstream.
- **Derived weather matters.** If `vpd_hpa`, `diffuse_fraction` and
  `degree_days` are left out, DynACof computes them itself; on the Aquiares
  example that changes 38-year yield from 47,830 to 40,690 kg/ha. Supply them
  when the weather source has them.
- **Parameterised for Costa Rica.** The defaults are *Coffea arabica* under
  *Erythrina poeppigiana* at 1,040 m in Aquiares. Other sites (e.g. APCCO in
  Uganda, robusta) need their own coffee and tree parameters before results mean
  anything.

## Limits

| Setting | Default |
|---|---|
| `DYNACOF_TIMEOUT_S` | 180 s per run |
| `DYNACOF_MEMORY_MB` | 2048 MB heap hint per worker (set the container limit ~1 GB higher) |
| `DYNACOF_MAX_CONCURRENT` | 1 worker; more requests get 429 |
| `DYNACOF_MAX_BODY_KB` | 8192 KB |
| Days / daily variables | up to 60 years / 10 variables |
| `DYNACOF_API_TOKEN` | Bearer token; set it whenever the container is reachable by others |

Licence: DynACof.jl and its input templates are GPL-3.0. The runner talks to
it over HTTP as a separate program and copies none of its code.
