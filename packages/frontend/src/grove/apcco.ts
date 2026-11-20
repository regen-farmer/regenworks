// D · APCCO Uganda: shared types and helpers for the section's pages (routes/grove/apcco/).
// Grove team only; the backend enforces it on every /internal/apcco route.
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export type DataKind = "shade-trees" | "coffee-plots" | "canopy" | "soil" | "weather-daily" | "climate-monthly";
export const DATA_KINDS: DataKind[] = ["shade-trees", "coffee-plots", "canopy", "soil", "weather-daily", "climate-monthly"];
export type Model = "shamba" | "dynacof" | "caf2021";
export const MODEL_NAMES: Record<Model, string> = { shamba: "SHAMBA (carbon)", dynacof: "DynACof (coffee growth and yield)", caf2021: "CAF2021 (coffee agroforestry)" };

export type Site = {
  _id: string;
  name: string;
  district?: string;
  lat: number;
  lon: number;
  areaHa?: number | null;
  boundary?: any;
  coffeeType: "robusta" | "arabica";
  notes?: string;
  archived?: boolean;
  runs?: number;
  data?: DataKind[];
};

export type Check = { item: string; ok: boolean; detail: string };

export type ParameterSet = {
  _id: string;
  model: Model;
  name: string;
  status: "original" | "literature" | "calibrated";
  coffeeType?: string;
  dataset?: string;
  version: string;
  source?: string;
  notes?: string;
  values?: any;
  builtIn?: boolean;
  label: string;
  runs: number;
};

export type Growth = { age: number; diamCm: number };
export type Cohort = { label: string; treeParam: number; allometry: string; densityPerHa: number; plantYear: number; growth: Growth[] };
export type ShambaScenario = { years: number; baseline: "none" | "coffee"; baselineAllometry: string; mortality: number; cohorts: Cohort[]; gwp: string };
export const ALLOMETRY = ["chave dry", "chave moist", "chave wet", "ryan", "grevillea", "maesopsis", "markhamia"];
export const GWP = ["SAR", "AR4", "AR5", "AR6"];

export type Run = {
  _id: string;
  model: Model;
  parameterLabel: string;
  status: "running" | "done" | "failed";
  error?: string;
  createdAt: string;
  finishedAt?: string;
  inputSha256: string;
  scenario?: ShambaScenario;
  request?: any;
  outputs?: {
    years: number;
    unit: string;
    pools: Record<string, { baseline: number[]; project: number[]; difference: number[] }>;
    totals: Record<string, number>;
    soil_carbon_t_c_per_ha: { baseline: number[]; project: number[] };
  };
  provenance?: Record<string, any>;
  createdBy?: { email?: string };
};

/** POST/PUT JSON and keep the whole error body (the import's row errors), unlike apiFetch. */
export async function sendJson(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<{ ok: boolean; status: number; body: any }> {
  const defaults = apiFetchOptions();
  const headers = new Headers(defaults.headers);
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${BACKEND_URL}${path}`, { ...defaults, method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let parsed: any = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = { error: `Server error (${res.status})` };
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

/** Save text as a file in the browser. */
export function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A run's yearly results as CSV: per pool baseline, project and difference, plus soil carbon. */
export function runCsv(run: Run): string {
  const o = run.outputs;
  if (!o) return "";
  const pools = Object.keys(o.pools);
  const head = ["year", ...pools.flatMap((p) => [`${p}_baseline`, `${p}_project`, `${p}_difference`]), "soil_c_baseline_t_c_ha", "soil_c_project_t_c_ha"];
  const lines = [head.join(",")];
  for (let y = 0; y < o.years; y++) {
    lines.push([y + 1, ...pools.flatMap((p) => [o.pools[p].baseline[y], o.pools[p].project[y], o.pools[p].difference[y]]), o.soil_carbon_t_c_per_ha.baseline[y + 1], o.soil_carbon_t_c_per_ha.project[y + 1]].map((v) => (v === undefined ? "" : String(v))).join(","));
  }
  return lines.join("\n") + "\n";
}

export const fmt = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : x.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d }));

export const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";
export const btn = "px-2 py-1 rounded-sm border border-zinc-300 dark:border-slate-600 text-sm hover:bg-zinc-100 dark:hover:bg-slate-700 disabled:opacity-50";
export const primary = "px-2 py-1 rounded-sm text-sm bg-green-700 text-white hover:bg-green-800 disabled:opacity-50";
export const card = "rounded-sm border border-zinc-300 dark:border-slate-600 p-3";
