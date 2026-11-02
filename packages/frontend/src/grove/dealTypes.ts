// A · Clients & deals: shapes shared by the funnel board, deal and client pages.
export type StageKind = "open" | "won" | "lost";
export type FunnelStage = { key: string; name: string; kind: StageKind; targetDays?: number | null };
export type Funnel = { _id: string; key: string; name: string; description?: string; order?: number; archived?: boolean; updatedAt?: string; stages: FunnelStage[] };

export type ClientRef = { _id: string; name?: string; kind?: string };
export type Client = {
  _id: string;
  name: string;
  kind: "person" | "company";
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  region?: string;
  source?: string;
  notes?: string;
  archived?: boolean;
  deals?: number;
  open?: number;
  won?: number;
  wonValue?: number;
};

export type Deal = {
  _id: string;
  title: string;
  client: ClientRef | null;
  funnel: string;
  stage: string;
  status: StageKind;
  position: number;
  value?: number | null;
  expectedClose?: string | null;
  owner?: string | null;
  source?: string;
  sourceDetail?: string;
  /** when the deal came into its current stage */
  stageSince?: string | null;
  nextAction?: { text?: string; date?: string | null };
  farm?: { _id: string; name?: string } | null;
  groveProject?: string | null;
  lostReason?: string;
  wonAt?: string | null;
  lostAt?: string | null;
  archived?: boolean;
  notes?: string;
  offers?: { count: number; net: number; accepted: number };
  history?: { stage: string; funnel?: string; status: StageKind; at: string; by?: string; note?: string }[];
  createdAt?: string;
  updatedAt?: string;
};

export const STATUS_LABEL: Record<StageKind, string> = { open: "Open", won: "Won", lost: "Lost" };
/** Whole days since a date. */
export const daysSince = (iso: string | null | undefined, now = Date.now()) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86_400_000) : null);

/** Days in the current stage, and whether that's past the stage's target time. */
export function stageAge(d: Pick<Deal, "stageSince" | "status">, stage: FunnelStage | undefined) {
  const days = daysSince(d.stageSince);
  return { days, over: d.status === "open" && !!stage?.targetDays && days !== null && days > stage.targetDays };
}

export const dkk = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "" : `${Math.round(n).toLocaleString("da-DK")} kr`;

/** yyyy-mm-dd for date inputs (local day). */
export const day = (d: string | null | undefined) => {
  if (!d) return "";
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
/** A picked day saved at noon, so time zones never move it a day. */
export const noon = (v: string) => (v ? `${v}T12:00:00` : null);
export const shortDay = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : "");
export const overdue = (d: string | null | undefined) => !!d && new Date(d).getTime() < new Date().setHours(0, 0, 0, 0);
