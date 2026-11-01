# Yield-SAFE runner

Yield-SAFE v2 (Cranfield University) simulates trees, an arable or grass crop
between them, and the soil water they share, day by day, over a whole tree
rotation. It suits Grove's temperate systems (silvoarable alleys, silvopasture,
orchards, short-rotation coppice) far better than the coffee models next door.

Credit and terms of use: **[NOTICE.md](NOTICE.md)**. In short: research and
education use is fine; commercial use (such as Grove offers) needs the authors'
permission first.

## How this runner differs from the others

The upstream model is an Excel workbook, not code. So instead of wrapping upstream
source, this folder contains a **Python port** (`yieldsafe/`) and proves it is
faithful:

- `yieldsafe/model.py` follows the workbook's "Yield-SAFE" sheet column by column
  (each line names its column), with no dependencies outside the standard library.
- `tools/from_workbook.py compare` runs the port on the workbook's own inputs and
  compares all 85 computed daily columns, for all 11,549 days, plus the yearly table,
  with Excel's cached results. Largest difference: 2×10⁻¹³ (floating-point rounding).
- The golden test (`tests/`) does the same from a committed fixture, so CI needs no
  workbook. See [tests/fixtures/README.md](tests/fixtures/README.md).
- `yieldsafe/templates.py` holds the workbook's parameter sets: 7 trees (three
  poplars, SRC, Miscanthus, wild cherry, apple), 12 crops and 6 soil textures.

A 30-year run takes about 0.3 s, so each run gets its own process (for time and
memory limits) without a worker pool.

## The request

```jsonc
{
  "inputs": {
    "site": {"lat": 56.2, "lon": 9.5, "name": "Ellinglund"},        // recorded only
    "weather": {"start": "2027-01-01",                              // must be 1 January
                "temp_c": [...], "rad_mj_m2": [...], "rain_mm": [...]}, // daily, no gaps
    "tree": {"template": "poplar_upson_agf", "overrides": {"rue_g_per_mj": 1.1}},
    "soil": {"texture": "medium", "vwc0": 0.38, "depth_mm": 1200},
    "crops": {"10": {"site_factor": 0.9}},                          // optional changes; 13-14 = new crops
    "years": [                                                      // index = tree year (0 = first)
      {"crop": 10, "crop_area": 0.8, "trees_planted_per_ha": 156},
      {"crop": 10, "crop_area": 0.8},
      {"crop": 10, "crop_area": 0.8, "trees_removed_per_ha": 40}
    ],
    "daily_variables": ["tree_height_m", "vwc"]
  }
}
```

- **Weather** comes in the request (no network in the container). GroveWorks will
  build it per field (e.g. from NASA POWER or DMI). Radiation must not be negative.
- **years**: one entry per tree year, mirroring the workbook's crop calendar. List
  one year more than the weather covers: on harvest days the model reads next year's
  crop. Trees are planted on `doy_planting` and removed on `doy_thinning`.
- Days of year are **0-based** (0 = 1 January), as in the workbook.
- `GET /processes/yieldsafe` lists the templates, crop codes, daily variables and limits.

The response holds, per calendar year: crop yield and by-product, trees per ha,
height, dbh, canopy cover, stand and harvested volume, branchwood, fruit, tree carbon
and CO₂, and the water balance; a summary (mean crop yield, maximum stand volume and
biomass, final tree carbon); optional daily series; and the provenance record.

## Known quirks (kept on purpose)

The port reproduces the workbook, including behaviour that looks odd. Changing any
of these would break the match with published Yield-SAFE results; a corrected
variant would need its own option and its own validation.

1. **pF:** the workbook writes the van Genuchten term as `(...)^1/n`, which Excel
   reads as `(...)/n`, not as the n-th root.
2. **π = 3.142** in the height, diameter and canopy formulas.
3. **Drainage coefficient** `d = 10^(-pFcritE/2)` uses the evaporation threshold.
4. **Height-to-diameter ratio** ignores tree density: column Y (with `dsigma/density`)
   is computed but not used.
5. **Yearly water sums in the workbook** stop at row 10,963 and are filed one year
   late (the year number is matched against a 0-based column). The API sums each
   tree year over all its days instead.
6. The workbook's own **weather for 2022–2023 has negative radiation**, so its last
   year (negative crop yield, shrinking trees) is not meaningful.

## Run it

```sh
pip install -r requirements-test.txt
python -m pytest -q tests                    # golden + contract tests
python -m adapter.export_schema --check      # schema files current?
uvicorn adapter.server:app --port 8080       # or: docker compose -f ../docker-compose.yml up yieldsafe
```

Check against a downloaded workbook: `python tools/from_workbook.py "Yield-SAFE v2.xlsx" compare` (needs `openpyxl`).

## Not done yet

- Calibration for Danish sites and Grove's species (hazel, chestnut, walnut,
  blackcurrant): the templates are UK poplar, cherry and apple. Use overrides for
  now; calibrate once we have our own growth data (roadmap: growth update Q2 2027).
- Weather builder in GroveWorks (NASA POWER or DMI → this request).
- Permission from the authors for commercial use.
