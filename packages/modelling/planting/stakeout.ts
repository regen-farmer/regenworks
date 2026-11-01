// RTK stake-out files from a layout, straight from the app.
//
// Same output as scripts/kml-to-stakeout.py, but the rows and tree order come
// from the layout itself (treeRowIndex + position along the row) instead of
// being guessed from distances, and each tree carries its cultivar.
//
// Tree names: <prefix>R<row>T<tree>, e.g. BR03T017 = prefix B, row 3, tree 17.
// Rows are numbered 1.. in layout order, skipping rows without trees; trees
// are numbered 1.. from the row's start. Coordinates: ETRS89 / UTM 32N,
// metres, 3 decimals (1 mm).
import { fromUtm32, toUtm32 } from "./utm.ts";

export type StakeoutTree = {
  name: string;
  row: number;
  tree: number;
  lon: number;
  lat: number;
  e: number;
  n: number;
  /** What to plant here, e.g. "Hazel Corabel on Corylus colurna seedling (organic)". */
  label: string;
  species: string;
};

export type StakeoutRow = { row: number; trees: StakeoutTree[] };

export type StakeoutOptions = {
  /** Letters in front of every point name, e.g. "B". Letters, digits, - and _ only. */
  prefix?: string;
  /** Written in the elevation column; empty by default (use "-99999" if a controller needs a number). */
  nullElevation?: string;
  /** Human label for a tree, e.g. species + cultivar + rootstock. */
  labelOf: (tree: any) => { label: string; species: string };
};

export function cleanPrefix(prefix: string | undefined): string {
  return (prefix ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8);
}

/** Commas and line breaks would break the CSV; the code field is free text otherwise. */
const csvSafe = (s: string) => s.replace(/[,\r\n"]+/g, " ").replace(/\s+/g, " ").trim();
const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mm = (v: number) => v.toFixed(3);
const pad = (v: number, width: number) => String(v).padStart(width, "0");

export function stakeoutTrees(layout: { treeMarkerArray?: any[] }, options: StakeoutOptions): StakeoutRow[] {
  const prefix = cleanPrefix(options.prefix);
  // Group trees by physical row, keeping layout order inside each row.
  const byRow = new Map<number, any[]>();
  for (const t of layout?.treeMarkerArray ?? []) {
    if (!t?.species || !t?.point?.geometry?.coordinates) continue;
    const key = Number.isInteger(t.treeRowIndex) ? t.treeRowIndex : -1;
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key)!.push(t);
  }
  if (byRow.has(-1)) {
    throw new Error("This layout has no row numbers; refresh the design and export again.");
  }
  const rowKeys = [...byRow.keys()].sort((a, b) => a - b);
  const maxTrees = Math.max(0, ...[...byRow.values()].map((r) => r.length));
  const rowWidth = Math.max(2, String(rowKeys.length).length);
  const treeWidth = Math.max(3, String(maxTrees).length);

  return rowKeys.map((key, i) => {
    const row = i + 1;
    const trees = byRow.get(key)!.map((t, j) => {
      const [lon, lat] = t.point.geometry.coordinates as [number, number];
      const { e, n } = toUtm32(lon, lat);
      const { label, species } = options.labelOf(t);
      return {
        name: `${prefix}R${pad(row, rowWidth)}T${pad(j + 1, treeWidth)}`,
        row,
        tree: j + 1,
        lon,
        lat,
        e,
        n,
        label,
        species,
      };
    });
    return { row, trees };
  });
}

const dist = (a: StakeoutTree, b: StakeoutTree) => Math.hypot(a.e - b.e, a.n - b.n);

function offsetFromLine(p: StakeoutTree, a: StakeoutTree, b: StakeoutTree) {
  const length = dist(a, b);
  if (length === 0) return dist(p, a);
  return Math.abs((b.e - a.e) * (a.n - p.n) - (a.e - p.e) * (b.n - a.n)) / length;
}

export type StakeoutFiles = {
  trees: number;
  rows: number;
  /** Largest error after rounding to mm and projecting back, in millimetres. */
  roundTripMm: number;
  files: Record<string, string>;
};

/**
 * All stake-out files for one field, keyed by file name:
 *  <stem>_trees_NENZ.csv  Name,Easting,Northing,Elevation,Code (no header) =
 *                         Trimble "CSV Grid points E-N"
 *  <stem>_rows_NENZ.csv   row start (S) and end (E) points for line staking
 *  <stem>.dxf             points, labels and row lines
 *  <stem>_check.kml       named trees to check in Google Earth
 *  <stem>_summary.txt     counts, spacing and accuracy checks
 */
export function stakeoutFiles(
  layout: { treeMarkerArray?: any[] },
  stem: string,
  options: StakeoutOptions & { source?: string },
): StakeoutFiles {
  const rows = stakeoutTrees(layout, options);
  const all = rows.flatMap((r) => r.trees);
  if (!all.length) throw new Error("No trees to export.");
  const z = options.nullElevation ?? "";
  const prefix = cleanPrefix(options.prefix);
  const rowWidth = Math.max(2, String(rows.length).length);
  const safeStem = stem.replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "") || "design";

  let roundTrip = 0;
  for (const t of all) {
    const back = fromUtm32(Number(mm(t.e)), Number(mm(t.n)));
    const dE = (back.lon - t.lon) * 111320 * Math.cos((t.lat * Math.PI) / 180);
    const dN = (back.lat - t.lat) * 110574;
    roundTrip = Math.max(roundTrip, Math.hypot(dE, dN));
  }

  const treesCsv = all.map((t) => `${t.name},${mm(t.e)},${mm(t.n)},${z},${csvSafe(t.label)}\n`).join("");
  const rowsCsv = rows
    .map((r) => {
      const a = r.trees[0];
      const b = r.trees[r.trees.length - 1];
      const id = `${prefix}R${pad(r.row, rowWidth)}`;
      return `${id}S,${mm(a.e)},${mm(a.n)},${z},row start\n${id}E,${mm(b.e)},${mm(b.n)},${z},row end\n`;
    })
    .join("");

  const layerOf = (s: string) => s.replace(/[^A-Za-z0-9]/g, "_").slice(0, 31) || "TREES";
  const dxf: string[] = ["0", "SECTION", "2", "ENTITIES"];
  for (const t of all) {
    const layer = layerOf(t.species);
    dxf.push("0", "POINT", "8", layer, "10", mm(t.e), "20", mm(t.n), "30", "0.0");
    dxf.push("0", "TEXT", "8", `${layer}_LABEL`, "10", mm(t.e + 0.2), "20", mm(t.n + 0.2), "30", "0.0", "40", "0.3", "1", t.name);
  }
  for (const r of rows) {
    const a = r.trees[0];
    const b = r.trees[r.trees.length - 1];
    dxf.push("0", "LINE", "8", "ROWS", "10", mm(a.e), "20", mm(a.n), "30", "0.0", "11", mm(b.e), "21", mm(b.n), "31", "0.0");
  }
  dxf.push("0", "ENDSEC", "0", "EOF");

  const kml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    ...all.map(
      (t) =>
        `<Placemark><name>${xml(t.name)}</name><description>${xml(t.label)}</description>` +
        `<Point><coordinates>${t.lon.toFixed(9)},${t.lat.toFixed(9)},0</coordinates></Point></Placemark>`,
    ),
    "</Document></kml>",
  ].join("\n");

  const steps = rows.flatMap((r) => r.trees.slice(1).map((t, i) => dist(r.trees[i], t)));
  const median = steps.length ? [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)] : 0;
  const plants = new Map<string, number>();
  for (const t of all) plants.set(t.label, (plants.get(t.label) ?? 0) + 1);
  const summary = [
    `Source: ${options.source ?? safeStem}`,
    "Grid: ETRS89 / UTM zone 32N (EPSG:25832), metres, 3 decimals (1 mm)",
    `Trees: ${all.length}   Rows: ${rows.length}   Median spacing: ${median.toFixed(2)} m`,
    `Projection round-trip error (worst tree): ${(roundTrip * 1000).toFixed(2)} mm`,
    `Point names: ${prefix}R<row>T<tree>, rows numbered in design order, trees from the row start`,
    "",
    "Plants:",
    ...[...plants.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => `  ${label}: ${n}`),
    "",
    "Rows (trees, length, spacing, straightness = max offset from start-end line):",
    ...rows.map((r) => {
      const a = r.trees[0];
      const b = r.trees[r.trees.length - 1];
      const s = r.trees.slice(1).map((t, i) => dist(r.trees[i], t));
      const spacing = s.length ? `${Math.min(...s).toFixed(2)}-${Math.max(...s).toFixed(2)} m` : "-";
      const bend = Math.max(0, ...r.trees.map((t) => offsetFromLine(t, a, b)));
      return `  R${pad(r.row, rowWidth)}: ${String(r.trees.length).padStart(4)} trees  ${dist(a, b).toFixed(2).padStart(7)} m  spacing ${spacing}  offset ${(bend * 1000).toFixed(0)} mm`;
    }),
    "",
  ].join("\n");

  return {
    trees: all.length,
    rows: rows.length,
    roundTripMm: roundTrip * 1000,
    files: {
      [`${safeStem}_trees_NENZ.csv`]: treesCsv,
      [`${safeStem}_rows_NENZ.csv`]: rowsCsv,
      [`${safeStem}.dxf`]: `${dxf.join("\n")}\n`,
      [`${safeStem}_check.kml`]: kml,
      [`${safeStem}_summary.txt`]: summary,
    },
  };
}
