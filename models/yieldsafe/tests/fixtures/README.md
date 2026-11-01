# Golden fixture

`workbook_default.json.gz` is the default scenario of the Yield-SAFE v2 workbook
(SHA-256 `4499e230…a94b96`), as downloaded from Cranfield's research data repository:

- weather: the workbook's Silsoe series, 1992-01-01 to 2023-08-14 (11,549 days)
- tree: "Atlantic AGF Poplar Upson", 156 trees/ha planted on day 2 of year 0
- crops: a cereal and bean rotation on 80% of the land, then annual grass; 31-year rotation
- soil: "Fine (Upson 2014)", 1,500 mm deep, initial water content 0.435, water model on

plus the values Excel cached at its last recalculation: 10 daily columns (H, U, Z,
AA, AN, AO, BU, BY, CE, CT) for every day, the yearly "Crop-manager" table and the
summary results (Management G40–H42).

Regenerate with `python tools/from_workbook.py "Yield-SAFE v2.xlsx" fixture tests/fixtures/workbook_default.json.gz`.
`python tools/from_workbook.py "Yield-SAFE v2.xlsx" compare` checks all 85 computed
daily columns, not only the 10 stored here.

**Data error in the workbook:** global radiation is negative on every day from
2022-01-01 (591 days, falling from −2.6). Excel's results for 2022–2023 (the
workbook's year 31: negative crop yield, shrinking trees) come from that. The
engine test still reproduces them; the API tests use 1992–2021 only, because the
API rejects negative radiation.

Same terms as the model: see ../../NOTICE.md.
