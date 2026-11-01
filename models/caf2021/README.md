# CAF2021 runner

Wraps [CAF2021](https://github.com/MarcelVanOijen/CAF2021)
([Zenodo v1.0](https://doi.org/10.5281/zenodo.5725277)), Marcel van Oijen's
Coffee Agroforestry model. It simulates coffee under up to **three shade-tree
species** day by day: coffee growth and harvest, tree carbon, soil carbon and
nitrogen, nitrogen leaching, runoff and emission, and the water balance. This
runner returns **yearly summaries** and, on request, any of the model's 172
daily output variables.

Used for research in the APCCO project (Uganda).

## How it runs

The Fortran source is compiled into a shared library when the image is built
and called directly from Python (`ctypes`), with no R. The upstream R scripts
are only used once, to produce the golden numbers. Each run gets a **fresh
process**: CAF2021 keeps Fortran module variables between calls, and a second
call in the same process gives different results. A run of 17 years takes well
under a second.

```sh
# gfortran, Python 3.11
git clone https://github.com/MarcelVanOijen/CAF2021 /tmp/CAF2021
cd /tmp/CAF2021/model && gfortran -O3 -fPIC -fdefault-real-8 -c declare_parameters.f90 environment.f90 \
  abovegroundres.f90 management.f90 tree.f90 shade.f90 scaling.f90 coffee.f90 belowgroundres.f90 \
  soil.f90 set_params.f90 CAF2021.f90 && gfortran -shared -o /tmp/libcaf2021.so *.o
pip install -r requirements-test.txt
CAF2021_SRC=/tmp/CAF2021 CAF2021_LIB=/tmp/libcaf2021.so python -m pytest -q tests
```

## Request

`POST /processes/caf2021/execution` with `{"inputs": {...}}`. Full schema:
`schema/request.schema.json`.

| Part | What | OPA |
|---|---|---|
| `site` | `lat` (sets CAF's `LAT`, used for day length), `lon` (recorded only), `name` | I1 |
| `weather` | Consecutive days by `year` + `doy`: `rad_mj_m2`, `tmin_c`, `tmax_c`, `vp_kpa`, `wind_m_s`, `rain_mm`. Up to 10,000 days (~27 years). Leap days optional (CAF's own files use 365-day years) | I1 |
| `parameters` | Overrides of `parameters_default.txt` by name, e.g. `{"TREEDENS0(1)": 0.07}`. Tree parameters come in three slots `(1)`, `(2)`, `(3)`, one per shade-tree species | I2, I3 |
| `management` | `fertilisation` (`year`, `doy`, `n_kg_ha`), `coffee_pruning` (`year`, `doy`, `fraction`), `tree_pruning` and `tree_thinning` (`species` 1–3, `year`, `doy`, `fraction`); up to 100 events per calendar | I4 |
| `daily_variables` | Up to 20 of the 172 output names (listed in `GET /processes/caf2021` → `outputVariables`) | – |

**Default parameters have no shade trees** (`TREEDENS0(1..3) = 0`); set at least
one density, as in the example. The run reports a warning otherwise.

## Response

`outputs.annual.<key>`, one value per year, per hectare: coffee harvest
(t C and kg dry matter), coffee and tree biomass carbon, stem carbon, density
and height per tree species, soil C and N, system carbon, N from fertiliser and
fixation, N leaching/emission/runoff, soil respiration, and the water balance.
Stocks are year-end values, flows are yearly sums. Keys and units:
`schema/response.schema.json`.

Turrialba example (CAF2021's `Turrialba_01_E_AC`: coffee under *Erythrina*,
Aug 2000–2017): 21.5 t C/ha of coffee harvested; tree biomass 18.4 t C/ha and
soil carbon 96.1 t C/ha at the end of 2017.

## Tests

- **Golden:** the wrapper reproduces CAF2021's own R run of `Turrialba_01_E_AC`
  (same compiled source). All 172 daily outputs match to 5×10⁻⁹; the test
  checks yearly harvest, soil and tree carbon, N leaching and emission, and
  tree density.
- Contract: daily variables, missing-trees warning, unknown parameters, `LAT`
  through parameters, weather gaps, too many days, leap years, time-out, token,
  and two runs giving identical results.

## Limits

| Setting | Default |
|---|---|
| `CAF2021_TIMEOUT_S` | 120 s per run |
| `CAF2021_MEMORY_MB` | 1024 MB per run |
| `CAF2021_MAX_CONCURRENT` | 2 runs per container; more get 429 |
| `CAF2021_MAX_BODY_KB` | 4096 KB |
| Days / events / daily variables | 10,000 / 100 per calendar / 20 |
| `CAF2021_API_TOKEN` | Bearer token; set it whenever the container is reachable by others |

## Caveats

- **Licence:** the repository has no licence file; Zenodo lists "Other (Open)".
  Grove uses CAF2021 for research (APCCO), not in the commercial app. Images are
  built in CI but not published.
- **Calibration:** defaults are for Turrialba, Costa Rica (arabica, Erythrina,
  Terminalia). CAF2021 ships Bayesian calibration scripts (R, in `BC/` upstream)
  that could be run as separate batch jobs against APCCO's Uganda data.
