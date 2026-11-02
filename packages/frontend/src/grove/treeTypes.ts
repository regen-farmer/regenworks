// Tree register types and labels, shared by the project panel and the phone page.
export type TreeStatus = "alive" | "weak" | "dead" | "missing";
export type Stats = {
  total: number;
  /** trees looked at: logged one by one, or in a row marked walked */
  seen: number;
  alive: number;
  weak: number;
  dead: number;
  missing: number;
  checked: number;
  replanted: number;
  causes: Record<string, number>;
  survivalPct: number | null;
  mortalityPct: number | null;
};
export type Register = {
  _id: string;
  name: string;
  prefix: string;
  trees: number;
  rowCount: number;
  rowChecks: Record<string, { at: string }>;
  createdAt: string;
  field: Stats & { rowsWalked: number };
  rowStats: (Stats & { row: number; walked: boolean })[];
};
export type RegisterList = { registers: Register[]; causes: [string, string][] };
export type Tree = {
  name: string;
  row: number;
  tree: number;
  species?: string;
  label: string;
  lon: number;
  lat: number;
  positionSource: "design" | "rtk";
  status: TreeStatus;
  cause?: string;
  note?: string;
  checkedAt?: string | null;
  replanted?: number;
  history?: { at: string; status?: string; cause?: string; note?: string; replanted?: boolean }[];
};

export const STATUS: [TreeStatus, string, string][] = [
  ["alive", "Alive", "bg-emerald-700 text-white border-emerald-700"],
  ["weak", "Weak", "bg-amber-500 text-black border-amber-500"],
  ["dead", "Dead", "bg-red-700 text-white border-red-700"],
  ["missing", "Missing", "bg-zinc-700 text-white border-zinc-700"],
];
export const STATUS_EN: Record<string, string> = Object.fromEntries(STATUS.map(([k, l]) => [k, l]));
export const pctText = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n.toLocaleString("da-DK")} %`);
export const shortDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "");
