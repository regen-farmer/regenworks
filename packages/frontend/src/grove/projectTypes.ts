export const STAGES = [
  ["prospect", "Prospect"],
  ["design-offer", "Design & offer"],
  ["signed", "Signed"],
  ["establishment", "Establishment"],
  ["management", "Management"],
  ["closed", "Closed"],
] as const;
export type Stage = (typeof STAGES)[number][0];
export const STAGE_LABEL = Object.fromEntries(STAGES) as Record<Stage, string>;
export const STAGE_COLOR: Record<Stage, string> = {
  prospect: "#9ca3af",
  "design-offer": "#3b82f6",
  signed: "#8b5cf6",
  establishment: "#f59e0b",
  management: "#16a34a",
  closed: "#4b5563",
};

export const TYPES = [
  ["client", "Client"],
  ["own", "Own site"],
  ["tree-sale", "Tree sale only"],
] as const;
export const TYPE_LABEL = Object.fromEntries(TYPES) as Record<string, string>;

export type GroveProject = {
  _id: string;
  name: string;
  type: "client" | "own" | "tree-sale";
  stage: Stage;
  status: "active" | "on-hold" | "archived";
  client?: { name?: string; contactPerson?: string; email?: string; phone?: string };
  farm?: { _id: string; name?: string; lat?: number; lng?: number; size?: number } | null;
  region?: string;
  responsible?: string;
  nextAction?: { text?: string; date?: string | null };
  plantingDate?: string | null;
  contractEnd?: string | null;
  plannedHa?: number | null;
  trees?: number | null;
  signedTrees?: number;
  drafts?: number;
  assignees?: string[];
  notes?: string;
  offers?: number;
  offerValue?: number;
  signedValue?: number;
  updatedAt?: string;
};

export const kroner = (n: number | undefined | null) =>
  n === undefined || n === null || !n ? "" : `${Math.round(n).toLocaleString("da-DK")} kr`;

export const shortDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("da-DK") : "");
