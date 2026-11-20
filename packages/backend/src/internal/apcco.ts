// APCCO Uganda (section D): import templates and checks, summaries of a site's field data,
// what each model still needs, and the translation from field data to a SHAMBA scenario and
// request. Pure functions; the routes are in apccoRoutes.ts.
import { createHash } from "node:crypto";
import area from "@turf/area";
import { parseCsv } from "./csv.ts";
import type { DataKind } from "@rw/db/schemas/internal/apcco.ts";

// ---------- import templates ----------

type Col = {
  name: string;
  type: "text" | "number" | "int" | "date";
  required?: boolean;
  min?: number;
  max?: number;
  help: string;
  example: string;
};

export const TEMPLATES: Record<DataKind, { title: string; help: string; maxRows: number; columns: Col[] }> = {
  "shade-trees": {
    title: "Shade-tree register",
    help: "One row per shade tree (not coffee). Positions from the orthomosaic or a GNSS; sizes measured by hand.",
    maxRows: 20_000,
    columns: [
      { name: "tree_id", type: "text", required: true, help: "Tree number, e.g. MK-014", example: "MK-014" },
      { name: "plot_id", type: "text", help: "Plot it stands in", example: "P1" },
      { name: "species", type: "text", required: true, help: "Latin name, e.g. Albizia coriaria", example: "Albizia coriaria" },
      { name: "lat", type: "number", min: -90, max: 90, help: "Latitude (WGS84)", example: "0.3542" },
      { name: "lon", type: "number", min: -180, max: 180, help: "Longitude (WGS84)", example: "32.7531" },
      { name: "dbh_cm", type: "number", required: true, min: 1, max: 400, help: "Trunk diameter at 1.3 m (cm)", example: "34.5" },
      { name: "height_m", type: "number", min: 0.5, max: 80, help: "Total height (m)", example: "14" },
      { name: "crown_diam_m", type: "number", min: 0, max: 60, help: "Crown diameter, mean of two directions (m)", example: "9.5" },
      { name: "crown_base_m", type: "number", min: 0, max: 60, help: "Height to the lowest live branch (m)", example: "4" },
      { name: "age_years", type: "number", min: 0, max: 300, help: "Age, if known (years)", example: "12" },
      { name: "origin", type: "text", help: "planted or natural", example: "planted" },
      { name: "pruning", type: "text", help: "e.g. none, pollarded 2025", example: "none" },
      { name: "notes", type: "text", help: "", example: "" },
    ],
  },
  "coffee-plots": {
    title: "Coffee plots",
    help: "One row per sample plot (e.g. 10 × 10 m). Coffee is counted per plot, not tree by tree.",
    maxRows: 2_000,
    columns: [
      { name: "plot_id", type: "text", required: true, help: "Plot name", example: "P1" },
      { name: "area_m2", type: "number", required: true, min: 1, max: 100_000, help: "Plot area (m²)", example: "100" },
      { name: "bushes", type: "int", required: true, min: 0, max: 100_000, help: "Coffee bushes in the plot", example: "11" },
      { name: "coffee_type", type: "text", help: "robusta or arabica", example: "robusta" },
      { name: "age_years", type: "number", min: 0, max: 100, help: "Mean bush age (years)", example: "8" },
      { name: "height_m", type: "number", min: 0, max: 15, help: "Mean bush height (m)", example: "2.6" },
      { name: "canopy_diam_m", type: "number", min: 0, max: 10, help: "Mean bush canopy diameter (m)", example: "2.2" },
      { name: "stems_per_bush", type: "number", min: 0, max: 50, help: "Mean number of stems", example: "3" },
      { name: "stem_diam_cm", type: "number", min: 0, max: 50, help: "Mean stem diameter at 15 cm above ground (cm)", example: "6.5" },
      { name: "yield_kg_ha", type: "number", min: 0, max: 20_000, help: "Green coffee yield (kg/ha) in `year`", example: "950" },
      { name: "year", type: "int", min: 1950, max: 2100, help: "Year of the yield", example: "2026" },
      { name: "pruning", type: "text", help: "e.g. stumped 2022", example: "" },
      { name: "notes", type: "text", help: "", example: "" },
    ],
  },
  canopy: {
    title: "Canopy photos (hemispherical)",
    help: "One row per photo point, results from the photo software (e.g. Gap Light Analyzer, Hemisfer).",
    maxRows: 5_000,
    columns: [
      { name: "point_id", type: "text", required: true, help: "Photo point", example: "C07" },
      { name: "plot_id", type: "text", help: "Plot", example: "P1" },
      { name: "lat", type: "number", min: -90, max: 90, help: "Latitude", example: "0.3541" },
      { name: "lon", type: "number", min: -180, max: 180, help: "Longitude", example: "32.7530" },
      { name: "date", type: "date", help: "YYYY-MM-DD", example: "2027-01-15" },
      { name: "height_m", type: "number", min: 0, max: 10, help: "Camera height above ground (m); above the coffee = shade layer only", example: "3" },
      { name: "lai", type: "number", min: 0, max: 15, help: "Leaf area index (m²/m²)", example: "1.8" },
      { name: "openness_pct", type: "number", min: 0, max: 100, help: "Canopy openness (%)", example: "42" },
    ],
  },
  soil: {
    title: "Soil samples",
    help: "One row per sample and layer. Carbon stock 0–30 cm is computed from SOC, bulk density and depth.",
    maxRows: 5_000,
    columns: [
      { name: "sample_id", type: "text", required: true, help: "Sampling point; layers of the same point share it", example: "S3" },
      { name: "plot_id", type: "text", help: "Plot", example: "P1" },
      { name: "lat", type: "number", min: -90, max: 90, help: "Latitude", example: "0.3543" },
      { name: "lon", type: "number", min: -180, max: 180, help: "Longitude", example: "32.7533" },
      { name: "depth_top_cm", type: "number", required: true, min: 0, max: 300, help: "Top of the layer (cm)", example: "0" },
      { name: "depth_bottom_cm", type: "number", required: true, min: 1, max: 300, help: "Bottom of the layer (cm)", example: "30" },
      { name: "soc_pct", type: "number", min: 0, max: 60, help: "Soil organic carbon (%)", example: "1.9" },
      { name: "bulk_density_g_cm3", type: "number", min: 0.1, max: 2.5, help: "Bulk density (g/cm³)", example: "1.25" },
      { name: "clay_pct", type: "number", min: 0, max: 100, help: "Clay (%)", example: "38" },
      { name: "sand_pct", type: "number", min: 0, max: 100, help: "Sand (%)", example: "40" },
      { name: "ph", type: "number", min: 2, max: 11, help: "pH (water)", example: "5.6" },
      { name: "total_n_pct", type: "number", min: 0, max: 5, help: "Total nitrogen (%)", example: "0.16" },
    ],
  },
  "weather-daily": {
    title: "Weather station, daily",
    help: "One row per day from the station on or near the site.",
    maxRows: 40_000,
    columns: [
      { name: "date", type: "date", required: true, help: "YYYY-MM-DD", example: "2027-01-01" },
      { name: "tmin_c", type: "number", min: -10, max: 45, help: "Minimum temperature (°C)", example: "17.2" },
      { name: "tmax_c", type: "number", min: -5, max: 50, help: "Maximum temperature (°C)", example: "28.9" },
      { name: "rain_mm", type: "number", min: 0, max: 500, help: "Rain (mm)", example: "4.2" },
      { name: "rad_mj_m2", type: "number", min: 0, max: 45, help: "Global radiation (MJ/m²/day)", example: "18.5" },
      { name: "rh_pct", type: "number", min: 0, max: 100, help: "Mean relative humidity (%)", example: "74" },
      { name: "wind_m_s", type: "number", min: 0, max: 60, help: "Mean wind speed at 2 m (m/s)", example: "1.6" },
      { name: "pet_mm", type: "number", min: 0, max: 20, help: "Potential evapotranspiration (mm)", example: "3.9" },
    ],
  },
  "climate-monthly": {
    title: "Climate, monthly means",
    help: "Twelve rows (January to December), e.g. long-term means. Used by SHAMBA when there's no full year of station data.",
    maxRows: 12,
    columns: [
      { name: "month", type: "int", required: true, min: 1, max: 12, help: "1 = January", example: "1" },
      { name: "temp_c", type: "number", required: true, min: -10, max: 45, help: "Mean temperature (°C)", example: "22.4" },
      { name: "rain_mm", type: "number", required: true, min: 0, max: 2000, help: "Rain in the month (mm)", example: "68" },
      { name: "pet_mm", type: "number", min: 0, max: 400, help: "Potential evapotranspiration in the month (mm)", example: "121" },
      { name: "evap_mm", type: "number", min: 0, max: 500, help: "Open-pan evaporation in the month (mm); if blank, PET ÷ 0.75", example: "" },
    ],
  },
};

export function templateCsv(kind: DataKind): string {
  const t = TEMPLATES[kind];
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [t.columns.map((c) => c.name).join(","), t.columns.map((c) => q(c.example)).join(",")].join("\n") + "\n";
}

export type ImportResult =
  | { ok: true; rows: Record<string, string | number | null>[]; warnings: string[] }
  | { ok: false; errors: string[] };

const MAX_ERRORS = 50;

/**
 * Check a CSV against its template. All or nothing: any error refuses the file, with up to 50
 * errors listed by row and column. Decimal commas are accepted ("12,5" in a quoted field).
 * Unknown columns are ignored (and named in the warnings).
 */
export function parseImport(kind: DataKind, text: string): ImportResult {
  const t = TEMPLATES[kind];
  if (!t) return { ok: false, errors: ["Unknown data kind"] };
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (err) {
    return { ok: false, errors: [`The file is too large (${(err as Error).message})`] };
  }
  table = table.filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return { ok: false, errors: ["The file has no data rows (a header line and at least one row are needed)"] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const errors: string[] = [];
  const warnings: string[] = [];
  const missing = t.columns.filter((c) => c.required && !header.includes(c.name)).map((c) => c.name);
  if (missing.length) return { ok: false, errors: [`Missing column(s): ${missing.join(", ")}. Download the template for the column names.`] };
  const unknown = header.filter((h) => h && !t.columns.some((c) => c.name === h));
  if (unknown.length) warnings.push(`Ignored column(s): ${unknown.join(", ")}`);
  if (table.length - 1 > t.maxRows) return { ok: false, errors: [`Too many rows: ${table.length - 1} (max ${t.maxRows})`] };

  const rows: Record<string, string | number | null>[] = [];
  for (let i = 1; i < table.length; i++) {
    const line = i + 1; // as a spreadsheet numbers it
    const out: Record<string, string | number | null> = {};
    for (const col of t.columns) {
      const at = header.indexOf(col.name);
      const raw = at >= 0 ? (table[i][at] ?? "").trim() : "";
      if (raw === "") {
        if (col.required) errors.push(`Row ${line}: ${col.name} is empty`);
        out[col.name] = null;
        continue;
      }
      if (col.type === "text") {
        out[col.name] = raw.slice(0, 500);
        continue;
      }
      if (col.type === "date") {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
        if (!m || !d || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) errors.push(`Row ${line}: ${col.name} "${raw}" is not a date (YYYY-MM-DD)`);
        else out[col.name] = raw;
        continue;
      }
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n)) errors.push(`Row ${line}: ${col.name} "${raw}" is not a number`);
      else if (col.type === "int" && !Number.isInteger(n)) errors.push(`Row ${line}: ${col.name} "${raw}" must be a whole number`);
      else if ((col.min !== undefined && n < col.min) || (col.max !== undefined && n > col.max)) errors.push(`Row ${line}: ${col.name} ${raw} is outside ${col.min}–${col.max}`);
      else out[col.name] = n;
    }
    rows.push(out);
    if (errors.length >= MAX_ERRORS) break;
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };

  // checks across rows
  const dup = (key: string, label: string) => {
    const seen = new Set<string>();
    for (const r of rows) {
      const k = String(r[key] ?? "");
      if (k && seen.has(k)) errors.push(`${label} ${k} appears more than once`);
      seen.add(k);
    }
  };
  if (kind === "shade-trees") dup("tree_id", "Tree");
  if (kind === "coffee-plots") dup("plot_id", "Plot");
  if (kind === "canopy") dup("point_id", "Photo point");
  if (kind === "weather-daily") dup("date", "Date");
  if (kind === "climate-monthly") {
    dup("month", "Month");
    if (rows.length !== 12) errors.push(`Twelve months are needed, the file has ${rows.length}`);
  }
  if (kind === "soil") {
    for (const r of rows) if ((r.depth_bottom_cm as number) <= (r.depth_top_cm as number)) errors.push(`Sample ${r.sample_id}: the bottom of the layer must be below the top`);
    // layers of one sampling point must not overlap (a 0–30 composite next to 0–15 and 15–30 would count twice)
    const byPoint = new Map<string, Record<string, any>[]>();
    for (const r of rows) {
      const g = byPoint.get(String(r.sample_id));
      if (g) g.push(r);
      else byPoint.set(String(r.sample_id), [r]);
    }
    for (const [id, layers] of byPoint) {
      const sorted = [...layers].sort((a, b) => a.depth_top_cm - b.depth_top_cm);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].depth_top_cm < sorted[i - 1].depth_bottom_cm) {
          errors.push(`Sample ${id}: layers ${sorted[i - 1].depth_top_cm}–${sorted[i - 1].depth_bottom_cm} cm and ${sorted[i].depth_top_cm}–${sorted[i].depth_bottom_cm} cm overlap; give a composite sample its own sample_id`);
          break;
        }
      }
    }
  }
  if (kind === "weather-daily") {
    for (const r of rows) if (r.tmin_c !== null && r.tmax_c !== null && (r.tmin_c as number) > (r.tmax_c as number)) errors.push(`${r.date}: minimum temperature above the maximum`);
  }
  if (kind === "coffee-plots") {
    const other = rows.filter((r) => r.coffee_type && !["robusta", "arabica"].includes(String(r.coffee_type).toLowerCase()));
    if (other.length) warnings.push(`coffee_type other than robusta/arabica in ${other.length} plot(s)`);
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };
  return { ok: true, rows, warnings };
}

// ---------- site summaries ----------

type Rows = Record<string, any>[];
export type SiteData = Partial<Record<DataKind, Rows>>;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nums = (rows: Rows | undefined, key: string) => (rows ?? []).map((r) => r[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
const round = (x: number | null, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Area in ha from a GeoJSON Polygon/MultiPolygon, or null. */
export function boundaryAreaHa(boundary: any): number | null {
  if (!boundary || !["Polygon", "MultiPolygon"].includes(boundary.type)) return null;
  try {
    const m2 = area({ type: "Feature", properties: {}, geometry: boundary } as any);
    return m2 > 0 ? m2 / 10_000 : null;
  } catch {
    return null;
  }
}

/** Shade trees per species: count, per ha, mean DBH, basal area and mean age where known. */
export function shadeSummary(trees: Rows | undefined, areaHa: number | null) {
  const groups = new Map<string, Rows>();
  for (const t of trees ?? []) {
    const k = String(t.species ?? "").trim() || "unknown";
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  const species = [...groups.entries()].map(([name, rows]) => {
    const dbh = nums(rows, "dbh_cm");
    const basalM2 = dbh.reduce((a, d) => a + Math.PI * (d / 200) ** 2, 0);
    return {
      species: name,
      count: rows.length,
      perHa: areaHa ? round(rows.length / areaHa, 1) : null,
      meanDbhCm: round(mean(dbh), 1),
      meanHeightM: round(mean(nums(rows, "height_m")), 1),
      meanCrownM: round(mean(nums(rows, "crown_diam_m")), 1),
      meanAgeYears: round(mean(nums(rows, "age_years")), 1),
      withAge: nums(rows, "age_years").length,
      basalAreaM2: round(basalM2, 3),
    };
  });
  species.sort((a, b) => (b.basalAreaM2 ?? 0) - (a.basalAreaM2 ?? 0));
  return { trees: (trees ?? []).length, perHa: areaHa ? round((trees ?? []).length / areaHa, 1) : null, species };
}

/** Coffee: bushes per ha (total bushes ÷ total plot area), mean age, stem diameter, yield. */
export function coffeeSummary(plots: Rows | undefined) {
  const p = plots ?? [];
  const areaM2 = p.reduce((a, r) => a + (r.area_m2 ?? 0), 0);
  const bushes = p.reduce((a, r) => a + (r.bushes ?? 0), 0);
  const types = [...new Set(p.map((r) => String(r.coffee_type ?? "").toLowerCase()).filter(Boolean))];
  return {
    plots: p.length,
    bushesPerHa: areaM2 > 0 ? Math.round((bushes / areaM2) * 10_000) : null,
    meanAgeYears: round(mean(nums(p, "age_years")), 1),
    meanHeightM: round(mean(nums(p, "height_m")), 2),
    meanStemDiamCm: round(mean(nums(p, "stem_diam_cm")), 1),
    meanStems: round(mean(nums(p, "stems_per_bush")), 1),
    meanYieldKgHa: round(mean(nums(p, "yield_kg_ha")), 0),
    coffeeTypes: types,
  };
}

/**
 * Soil organic carbon stock 0–30 cm (t C/ha) and clay (%), averaged over sampling points that
 * cover the whole 0–30 cm. Per layer: SOC(%) × bulk density (g/cm³) × thickness (cm) = t C/ha.
 */
export function soilSummary(samples: Rows | undefined) {
  const byPoint = new Map<string, Rows>();
  for (const s of samples ?? []) {
    const g = byPoint.get(String(s.sample_id));
    if (g) g.push(s);
    else byPoint.set(String(s.sample_id), [s]);
  }
  const stocks: number[] = [];
  const clays: number[] = [];
  let partial = 0;
  for (const layers of byPoint.values()) {
    let covered = 0;
    let stock = 0;
    let clayW = 0;
    let clayCm = 0;
    let complete = true;
    for (const l of layers) {
      const top = Math.max(0, l.depth_top_cm);
      const bottom = Math.min(30, l.depth_bottom_cm);
      const cm = bottom - top;
      if (cm <= 0) continue;
      covered += cm;
      if (typeof l.soc_pct === "number" && typeof l.bulk_density_g_cm3 === "number") stock += l.soc_pct * l.bulk_density_g_cm3 * cm;
      else complete = false;
      if (typeof l.clay_pct === "number") {
        clayW += l.clay_pct * cm;
        clayCm += cm;
      }
    }
    if (covered >= 29.5 && complete) stocks.push(stock);
    else if (covered > 0) partial++;
    if (clayCm > 0) clays.push(clayW / clayCm);
  }
  return {
    points: byPoint.size,
    socTcHa0to30: round(mean(stocks), 1),
    pointsWithStock: stocks.length,
    pointsPartial: partial,
    clayPct: round(mean(clays), 1),
    meanPh: round(mean(nums(samples, "ph")), 1),
    meanTotalNPct: round(mean(nums(samples, "total_n_pct")), 3),
  };
}

/** Canopy photos: mean LAI and openness, split by whether the camera was above the coffee (≥ 2 m). */
export function canopySummary(points: Rows | undefined) {
  const p = points ?? [];
  const above = p.filter((r) => typeof r.height_m === "number" && r.height_m >= 2);
  return {
    points: p.length,
    meanLai: round(mean(nums(p, "lai")), 2),
    meanOpennessPct: round(mean(nums(p, "openness_pct")), 1),
    shadeLayerLai: round(mean(nums(above, "lai")), 2),
  };
}

export type MonthlyClimate = { temp_c: number; rain_mm: number; evap_mm: number }[];

/**
 * Twelve months of climate for SHAMBA. From the monthly import when there is one; otherwise from
 * daily station data with every calendar month covered (≥ 25 days each, averaged over years).
 * Open-pan evaporation = PET ÷ 0.75 when only PET is given (as SHAMBA does).
 */
export function monthlyClimate(data: SiteData): { climate: MonthlyClimate | null; from: string; problem?: string } {
  const monthly = data["climate-monthly"];
  if (monthly?.length === 12) {
    const sorted = [...monthly].sort((a, b) => a.month - b.month);
    if (sorted.some((m) => m.evap_mm === null && m.pet_mm === null)) return { climate: null, from: "monthly import", problem: "Monthly climate needs evap_mm or pet_mm for every month" };
    return {
      climate: sorted.map((m) => ({ temp_c: m.temp_c, rain_mm: m.rain_mm, evap_mm: round(m.evap_mm ?? m.pet_mm / 0.75, 1)! })),
      from: "monthly import",
    };
  }
  const daily = data["weather-daily"];
  if (!daily?.length) return { climate: null, from: "", problem: "No climate data: import monthly climate or a year of daily weather" };
  // per year-month: mean temperature, rain sum, PET sum, day count
  const ym = new Map<string, { t: number[]; rain: number; rainDays: number; pet: number; petDays: number; days: number }>();
  for (const d of daily) {
    const key = String(d.date).slice(0, 7);
    const e = ym.get(key) ?? { t: [], rain: 0, rainDays: 0, pet: 0, petDays: 0, days: 0 };
    e.days++;
    if (typeof d.tmin_c === "number" && typeof d.tmax_c === "number") e.t.push((d.tmin_c + d.tmax_c) / 2);
    if (typeof d.rain_mm === "number") {
      e.rain += d.rain_mm;
      e.rainDays++;
    }
    if (typeof d.pet_mm === "number") {
      e.pet += d.pet_mm;
      e.petDays++;
    }
    ym.set(key, e);
  }
  const out: MonthlyClimate = [];
  const short: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const months = [...ym.entries()].filter(([k, e]) => Number(k.slice(5, 7)) === m && e.days >= 25 && e.rainDays >= 25 && e.petDays >= 25 && e.t.length >= 25);
    if (!months.length) {
      short.push(m);
      continue;
    }
    // scale sums to the full month where a few days are missing
    const daysIn = (k: string) => new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).getUTCDate();
    out.push({
      temp_c: round(mean(months.map(([, e]) => mean(e.t)!)), 1)!,
      rain_mm: round(mean(months.map(([k, e]) => (e.rain / e.rainDays) * daysIn(k))), 1)!,
      evap_mm: round(mean(months.map(([k, e]) => (e.pet / e.petDays / 0.75) * daysIn(k))), 1)!,
    });
  }
  if (short.length) return { climate: null, from: "daily weather", problem: `Daily weather doesn't cover month(s) ${short.join(", ")} with temperature, rain and PET (≥ 25 days each). Import monthly climate instead.` };
  return { climate: out, from: "daily weather" };
}

export function siteSummary(site: { areaHa?: number | null; boundary?: any }, data: SiteData) {
  const areaHa = boundaryAreaHa(site.boundary) ?? site.areaHa ?? null;
  return {
    areaHa: round(areaHa, 3),
    shade: shadeSummary(data["shade-trees"], areaHa),
    coffee: coffeeSummary(data["coffee-plots"]),
    soil: soilSummary(data.soil),
    canopy: canopySummary(data.canopy),
    climate: monthlyClimate(data),
    weatherDays: data["weather-daily"]?.length ?? 0,
  };
}

// ---------- what each model needs ----------

export type Check = { item: string; ok: boolean; detail: string };

export function readiness(site: { lat?: number; lon?: number; areaHa?: number | null; boundary?: any }, data: SiteData) {
  const s = siteSummary(site, data);
  const has = (ok: boolean, item: string, detail: string): Check => ({ item, ok, detail });
  const location = has(typeof site.lat === "number" && typeof site.lon === "number", "Location", "Latitude and longitude of the site");
  const areaOk = has(!!s.areaHa, "Site area", s.areaHa ? `${s.areaHa} ha` : "Draw or import the boundary, or enter the area (ha), to turn counts into trees per ha");
  const climate = has(!!s.climate.climate, "Climate (12 months)", s.climate.climate ? `From ${s.climate.from}` : (s.climate.problem ?? ""));
  const soil = has(s.soil.socTcHa0to30 !== null && s.soil.clayPct !== null, "Soil carbon 0–30 cm and clay", s.soil.socTcHa0to30 !== null ? `${s.soil.socTcHa0to30} t C/ha, clay ${s.soil.clayPct ?? "–"} % (${s.soil.pointsWithStock} point(s))` : "Soil samples covering 0–30 cm with SOC, bulk density and clay");
  const coffee = has(!!s.coffee.bushesPerHa, "Coffee density", s.coffee.bushesPerHa ? `${s.coffee.bushesPerHa} bushes/ha from ${s.coffee.plots} plot(s)` : "Coffee plots with area and bush counts");
  const shade = has(s.shade.trees > 0, "Shade-tree register", s.shade.trees ? `${s.shade.trees} trees, ${s.shade.species.length} species` : "Shade trees with species and DBH");
  const growth = has(
    s.shade.species.some((sp) => sp.withAge > 0) && s.coffee.meanAgeYears !== null && s.coffee.meanStemDiamCm !== null,
    "Growth (diameter and age)",
    "Age of at least some shade trees, and coffee age and stem diameter, to estimate growth curves (or enter them by hand)",
  );
  const weather = has(s.weatherDays >= 365, "Daily weather (≥ 1 year)", s.weatherDays ? `${s.weatherDays} days` : "Daily station data, or NASA POWER/ERA5 (coming)");
  const lai = has(s.canopy.points > 0, "Canopy LAI / openness", s.canopy.points ? `${s.canopy.points} photo point(s), mean LAI ${s.canopy.meanLai ?? "–"}` : "Hemispherical photos");
  const soilN = has(s.soil.meanTotalNPct !== null, "Soil nitrogen", s.soil.meanTotalNPct !== null ? `${s.soil.meanTotalNPct} %` : "Total N in the soil samples");
  const yields = has(s.coffee.meanYieldKgHa !== null, "Coffee yields (for calibration)", s.coffee.meanYieldKgHa !== null ? `${s.coffee.meanYieldKgHa} kg/ha` : "Yields per plot");
  const heights = has(s.shade.species.some((sp) => sp.meanHeightM !== null && sp.meanCrownM !== null), "Shade-tree height and crown", "Height and crown diameter in the register");
  return {
    summary: s,
    models: {
      shamba: { checks: [location, areaOk, climate, soil, coffee, shade, growth], runnable: true },
      dynacof: { checks: [location, weather, coffee, shade, heights, lai, soil, yields], runnable: false },
      caf2021: { checks: [location, weather, coffee, shade, heights, lai, soil, soilN, yields], runnable: false },
    },
  };
}

// ---------- SHAMBA scenario ----------

export const SHAMBA_ALLOMETRY = ["chave dry", "chave moist", "chave wet", "ryan", "grevillea", "maesopsis", "markhamia"] as const;
export const SHAMBA_GWP = ["SAR", "AR4", "AR5", "AR6"] as const;

/**
 * One SHAMBA tree cohort. SHAMBA ties a cohort's tree parameters and its growth curve to its
 * species number: cohort k is species k, uses row k of the parameter set's tree table and the
 * curve keys age/diam (k = 1) or spK_age/spK_diam. So the order of the cohorts is the order of
 * the rows in the tree table (SHAMBA's defaults: 1 default, 2 enterolobium, 3 faidherbia).
 */
export type Cohort = {
  label: string;
  allometry: (typeof SHAMBA_ALLOMETRY)[number];
  /** Trees per ha, a whole number (SHAMBA reads it as an integer) */
  densityPerHa: number;
  plantYear: number;
  /** Growth curve: six (age, diameter cm) points, age ascending, starting at age 0 */
  growth: { age: number; diamCm: number }[];
};

export type ShambaScenario = {
  years: number;
  /** "none": no trees in the baseline. "coffee": the first cohort's coffee without shade trees */
  baseline: "none" | "coffee";
  baselineAllometry: (typeof SHAMBA_ALLOMETRY)[number];
  /** Yearly mortality in the project (fraction) */
  mortality: number;
  cohorts: Cohort[];
  gwp: (typeof SHAMBA_GWP)[number];
};

/**
 * A growth curve from one observed (age, diameter) pair: the mean annual increment until that
 * age, then half of it. A first estimate only; the form shows it for editing, and calibration
 * replaces it.
 */
export function growthFrom(ageYears: number | null, diamCm: number | null, years: number) {
  const a = Math.max(2, ageYears ?? 0);
  const mai = ageYears && diamCm ? diamCm / Math.max(1, ageYears) : 1;
  const ages = [0, Math.round(a / 2), Math.round(a), Math.round(a + (years - a) / 3), Math.round(a + (2 * (years - a)) / 3), Math.max(years, Math.round(a) + 3)];
  const uniq = ages.map((x, i) => (i > 0 && x <= ages[i - 1] ? ages[i - 1] + 1 : x));
  for (let i = 1; i < uniq.length; i++) if (uniq[i] <= uniq[i - 1]) uniq[i] = uniq[i - 1] + 1;
  return uniq.map((age) => ({ age, diamCm: round(age <= a ? mai * age : mai * a + 0.5 * mai * (age - a), 1)! }));
}

/** A first SHAMBA scenario from the site's data: coffee + the two largest shade species (by basal area), the rest together. */
export function draftShambaScenario(summary: ReturnType<typeof siteSummary>): { scenario: ShambaScenario; notes: string[] } {
  const years = 30;
  const notes: string[] = [];
  const cohorts: Cohort[] = [];
  const c = summary.coffee;
  cohorts.push({
    label: `Coffee (${c.coffeeTypes[0] ?? "robusta"})`,
    allometry: "chave moist",
    densityPerHa: c.bushesPerHa ?? 1100,
    plantYear: 0,
    growth: growthFrom(c.meanAgeYears, c.meanStemDiamCm, years),
  });
  if (!c.bushesPerHa) notes.push("Coffee density is a placeholder (1,100/ha) until coffee plots are imported.");
  notes.push("⚠️ SHAMBA has no coffee allometry; the coffee cohort uses a generic tropical equation on stem diameter. Treat coffee biomass as indicative until a calibrated set is used.");

  const sp = summary.shade.species.filter((s) => s.species !== "unknown");
  const area = summary.areaHa;
  const top = sp.slice(0, 2);
  const rest = sp.slice(2);
  const shadeCohort = (label: string, group: typeof sp): Cohort => {
    const count = group.reduce((a, s) => a + s.count, 0);
    const ageVals = group.filter((s) => s.meanAgeYears !== null);
    const age = ageVals.length ? ageVals.reduce((a, s) => a + s.meanAgeYears! * s.count, 0) / ageVals.reduce((a, s) => a + s.count, 0) : null;
    const dbh = group.reduce((a, s) => a + (s.meanDbhCm ?? 0) * s.count, 0) / Math.max(1, count);
    if (age === null) notes.push(`${label}: no ages in the register, so its growth curve assumes 1 cm/year. Enter the curve by hand or add ages.`);
    return {
      label,
      allometry: "chave moist",
      densityPerHa: area ? Math.round(count / area) : 0,
      plantYear: 0,
      growth: growthFrom(age, age === null ? null : dbh, years),
    };
  };
  for (const s of top) cohorts.push(shadeCohort(s.species, [s]));
  if (rest.length) {
    const merged = shadeCohort(`Other shade trees (${rest.length} species)`, rest);
    if (cohorts.length < 3) cohorts.push(merged);
    else {
      // fold the rest into the second shade cohort's density (SHAMBA allows 3 cohorts)
      cohorts[2].densityPerHa = area ? Math.round((top[1].count + rest.reduce((a, s) => a + s.count, 0)) / area) : 0;
      cohorts[2].label += ` + ${rest.length} other species`;
    }
  }
  if (!area && sp.length) notes.push("No site area, so shade-tree densities are 0: add the boundary or the area (ha).");
  for (const k of cohorts.slice(1)) if (k.densityPerHa === 0 && area) notes.push(`${k.label}: fewer than 0.5 trees per ha, so 0 after rounding (SHAMBA counts whole trees per ha).`);
  notes.push("Cohort 1 uses row 1 of the parameter set's tree table, cohort 2 row 2, cohort 3 row 3 (SHAMBA's rule). For robusta and Ugandan shade trees, use a set whose tree table has those three rows in that order.");
  if (!sp.length) notes.push("No shade trees imported yet; the project has coffee only.");
  notes.push("Trees are planted in year 0 and grow along their curves, as SHAMBA models a planting; the baseline is coffee without shade trees by default.");
  return {
    scenario: { years, baseline: "coffee", baselineAllometry: "chave moist", mortality: 0.02, cohorts: cohorts.slice(0, 3), gwp: "AR6" },
    notes,
  };
}

const isNum = (x: unknown, lo: number, hi: number): x is number => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;

/** Check a scenario sent from the form. */
export function cleanShambaScenario(x: any): { ok: true; value: ShambaScenario } | { ok: false; error: string } {
  if (!x || typeof x !== "object") return { ok: false, error: "Scenario missing" };
  if (!isNum(x.years, 1, 100) || !Number.isInteger(x.years)) return { ok: false, error: "Years must be a whole number from 1 to 100" };
  if (!["none", "coffee"].includes(x.baseline)) return { ok: false, error: "Baseline must be 'none' or 'coffee'" };
  if (!SHAMBA_ALLOMETRY.includes(x.baselineAllometry)) return { ok: false, error: "Unknown baseline allometry" };
  if (!isNum(x.mortality, 0, 0.5)) return { ok: false, error: "Mortality must be between 0 and 0.5 per year" };
  if (!SHAMBA_GWP.includes(x.gwp)) return { ok: false, error: "Unknown GWP set" };
  if (!Array.isArray(x.cohorts) || x.cohorts.length < 1 || x.cohorts.length > 3) return { ok: false, error: "One to three cohorts" };
  const cohorts: Cohort[] = [];
  for (const [i, c] of x.cohorts.entries()) {
    const n = `Cohort ${i + 1}`;
    if (typeof c?.label !== "string" || !c.label.trim()) return { ok: false, error: `${n}: name missing` };
    if (!SHAMBA_ALLOMETRY.includes(c.allometry)) return { ok: false, error: `${n}: unknown allometry` };
    if (!isNum(c.densityPerHa, 0, 20_000) || !Number.isInteger(c.densityPerHa)) return { ok: false, error: `${n}: density must be a whole number of trees per ha (0–20,000)` };
    if (!isNum(c.plantYear, 0, x.years) || !Number.isInteger(c.plantYear)) return { ok: false, error: `${n}: planting year must be within the period` };
    if (!Array.isArray(c.growth) || c.growth.length !== 6) return { ok: false, error: `${n}: the growth curve needs six points` };
    for (let k = 0; k < 6; k++) {
      const p = c.growth[k];
      if (!isNum(p?.age, 0, 300) || !isNum(p?.diamCm, 0, 400)) return { ok: false, error: `${n}: growth point ${k + 1} out of range` };
      if (k === 0 && p.age !== 0) return { ok: false, error: `${n}: the growth curve starts at age 0` };
      if (k > 0 && (p.age <= c.growth[k - 1].age || p.diamCm < c.growth[k - 1].diamCm)) return { ok: false, error: `${n}: growth ages must rise and diameters must not fall` };
    }
    cohorts.push({ label: c.label.trim().slice(0, 120), allometry: c.allometry, densityPerHa: c.densityPerHa, plantYear: c.plantYear, growth: c.growth.map((p: any) => ({ age: p.age, diamCm: p.diamCm })) });
  }
  return { ok: true, value: { years: x.years, baseline: x.baseline, baselineAllometry: x.baselineAllometry, mortality: x.mortality, cohorts, gwp: x.gwp } };
}

/**
 * The SHAMBA runner request (models/shamba, OGC Processes-style) for a site, scenario and
 * parameter set. Settings the data doesn't cover (litter, fire, ground cover) follow SHAMBA's
 * Uganda example; crops are off (SHAMBA has no coffee or banana crop).
 */
export function buildShambaRequest(site: { lat: number; lon: number }, climate: MonthlyClimate, soil: { socTcHa: number; clayPct: number }, sc: ShambaScenario, tables: Record<string, any> | undefined) {
  const iv: Record<string, number> = {
    yrs_proj: sc.years,
    yr_mon: 0,
    analysis_no: 0,
    // baseline: coffee only (cohort 1 = species 1: its tree parameters and curve) or no trees
    species_base: 1,
    base_plant_dens: sc.baseline === "coffee" ? sc.cohorts[0].densityPerHa : 0,
    base_plant_yr: 0,
    base_mort: sc.baseline === "coffee" ? sc.mortality : 0,
    proj_mort: sc.mortality,
    // no thinning (SHAMBA still needs every key)
    thin_base_yr1: 0, thin_base_pc1: 0, thin_base_yr2: 0, thin_base_pc2: 0,
    thin_proj_yr1: 0, thin_proj_pc1: 0, thin_proj_yr2: 0, thin_proj_pc2: 0,
    thin_proj_yr3: 0, thin_proj_pc3: 0, thin_proj_yr4: 0, thin_proj_pc4: 0,
    thin_base_br: 0, thin_base_st: 0, thin_proj_br: 0, thin_proj_st: 0,
    mort_base_br: 0, mort_base_st: 0, mort_proj_br: 0, mort_proj_st: 0,
    fire_pres_base: 0, fire_int_base: 1, fire_off_base: 1,
    fire_pres_proj: 0, fire_int_proj: 1, fire_off_proj: 1,
    base_lit_int: 1, base_lit_qty: 0, base_sf_int: 1, base_sf_qty: 0, base_sf_n: 0,
    proj_lit_int: 1, proj_lit_qty: 0, proj_sf_int: 1, proj_sf_qty: 0, proj_sf_n: 0,
    base_cvr_pres: 1, base_cvr_mth_st: 0, base_cvr_mth_en: 12,
    proj_cvr_pres: 1, proj_cvr_mth_st: 0, proj_cvr_mth_en: 12,
  };
  for (let k = 1; k <= 3; k++) {
    for (const side of ["base", "proj"]) {
      iv[`crop_${side}_spp${k}`] = 0;
      iv[`crop_${side}_yd${k}`] = 0;
      iv[`crop_${side}_left${k}`] = 0;
      iv[`crop_${side}_start${k}`] = 0;
      iv[`crop_${side}_end${k}`] = 0;
    }
  }
  sc.cohorts.forEach((c, i) => {
    const k = i + 1;
    iv[`species${k}`] = k; // SHAMBA: species k → tree-table row k and the spK_ growth curve
    iv[`proj_plant_yr${k}`] = c.plantYear;
    iv[`proj_plant_dens${k}`] = c.densityPerHa;
    const pre = k === 1 ? "" : `sp${k}_`;
    c.growth.forEach((p, j) => {
      iv[`${pre}age${j + 1}`] = p.age;
      iv[`${pre}diam${j + 1}`] = p.diamCm;
    });
  });
  const parameters: Record<string, any> = {};
  for (const key of ["tree", "crop", "litter", "biomass_pool"]) if (tables?.[key]) parameters[key] = tables[key];
  return {
    inputs: {
      site: { lat: site.lat, lon: site.lon, climate, soil: { soc_t_c_per_ha: soil.socTcHa, clay_pct: soil.clayPct } },
      intervention: iv,
      parameters,
      options: { n_cohorts: sc.cohorts.length, allometry: [sc.baselineAllometry, ...sc.cohorts.map((c) => c.allometry)], gwp: sc.gwp },
    },
  };
}

/** SHA-256 of a request with keys sorted, so the same input always gives the same hash. */
export function inputHash(x: unknown): string {
  const canon = (v: any): any => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  return createHash("sha256").update(JSON.stringify(canon(x))).digest("hex");
}

// ---------- parameter sets ----------

export const SHAMBA_TABLES = ["tree", "crop", "litter", "biomass_pool"] as const;

/** A parameter table from CSV text ({columns, rows}), numbers where they parse. */
export function tableFromCsv(text: string): { columns: string[]; rows: (string | number | null)[][] } | string {
  let t: string[][];
  try {
    t = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  } catch (err) {
    return (err as Error).message;
  }
  if (t.length < 2) return "needs a header line and at least one row";
  if (t[0].length > 50 || t.length - 1 > 500) return "at most 50 columns and 500 rows";
  const width = t[0].length;
  const rows = t.slice(1).map((r) => {
    const cells = [...r, ...Array(Math.max(0, width - r.length)).fill("")].slice(0, width);
    return cells.map((c) => {
      const s = c.trim();
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : s.slice(0, 200);
    });
  });
  return { columns: t[0].map((c) => c.trim()), rows };
}

/** SHAMBA reads the first three rows of the tree table by position, columns 3–10 as numbers. */
export function checkShambaTreeTable(t: { columns: string[]; rows: (string | number | null)[][] }): string | null {
  if (t.columns.length < 10) return "the tree table needs SHAMBA's 10 columns (Sc, Name, N_leaf, N_branch, N_stem, N_croot, N_Froot, C, rs, wood_dens)";
  if (t.rows.length < 3) return "the tree table needs at least 3 rows: one per cohort (coffee, then two shade-tree groups)";
  for (let r = 0; r < 3; r++) for (let c = 2; c <= 9; c++) if (typeof t.rows[r][c] !== "number") return `tree table row ${r + 1}, column ${t.columns[c] || c + 1}: a number is needed`;
  return null;
}

/** Names of the first three tree-table rows (the cohorts' parameters), for the form. */
export function shambaTreeRowNames(tables: any): string[] {
  const rows: any[] | undefined = tables?.tree?.rows;
  if (!rows?.length) return ["default", "enterolobium", "faidherbia"];
  return rows.slice(0, 3).map((r, i) => String(r[r.length - 1] ?? r[1] ?? `row ${i + 1}`));
}

export function parameterLabel(p: { model: string; name: string; status: string; dataset?: string | null; version: string }) {
  const model = { shamba: "SHAMBA", dynacof: "DynACof", caf2021: "CAF2021" }[p.model] ?? p.model;
  return [model, p.name, p.status, p.dataset, p.version].filter(Boolean).join(" · ");
}

/** The built-in "original" set per model: the model's own defaults (nothing overridden). */
export const BUILT_IN_SETS = [
  { model: "shamba", name: "SHAMBA v1.2 defaults", status: "original", version: "v1.2", source: "SHAMBA v1.2 default parameter files (shamba-model/shamba)", values: {} },
  { model: "dynacof", name: "DynACof defaults (arabica, Costa Rica)", status: "original", coffeeType: "arabica", version: "1.5.3", source: "DynACof.jl 1.5.3 defaults (Aquiares, Coffea arabica under Erythrina)", values: {} },
  { model: "caf2021", name: "CAF2021 defaults (arabica, Turrialba)", status: "original", coffeeType: "arabica", version: "2021", source: "CAF2021 example parameters (Turrialba, Coffea arabica)", values: {} },
] as const;

// ---------- the model runner ----------

/** Runner address and token for a model (MODEL_SHAMBA_URL, MODEL_SHAMBA_TOKEN), or null if not set up. */
export function runnerConfig(model: string): { url: string; token: string } | null {
  const key = model.toUpperCase();
  const url = process.env[`MODEL_${key}_URL`]?.replace(/\/+$/, "");
  const token = process.env[`MODEL_${key}_TOKEN`];
  if (!url || !token || !/^https?:\/\//.test(url)) return null;
  return { url, token };
}

export const RUN_LIMITS = { perUserPerDay: 20, concurrent: 3, timeoutMs: 180_000, maxResponseBytes: 5_000_000 };
