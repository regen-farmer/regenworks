/** B · Projects: delivering a planting. Selling is A (deals), running the farm C. */
export const STAGES = [
  ["screening", "Screening"],
  ["design", "Design"],
  ["economics", "Economics"],
  ["preparation", "Preparation"],
  ["planting", "Planting"],
  ["handed-over", "Handed over"],
] as const;
export type Stage = (typeof STAGES)[number][0];
export const STAGE_LABEL = Object.fromEntries(STAGES) as Record<Stage, string>;
export const STAGE_COLOR: Record<Stage, string> = {
  screening: "#9ca3af",
  design: "#3b82f6",
  economics: "#8b5cf6",
  preparation: "#f59e0b",
  planting: "#16a34a",
  "handed-over": "#4b5563",
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
  /** where in the stage, e.g. "Staking" */
  step?: string;
  screening?: { done: number; total: number; issues: number; decision: string | null } | null;
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

/** Suggested steps per stage (free text is allowed too). */
export const STEPS: Record<Stage, string[]> = {
  screening: ["Site visit booked", "Site visit", "Checklist", "Decision"],
  design: ["Fields drawn", "Layout", "Plan A/B", "Plan chosen"],
  economics: ["Yield and costs", "Value chain", "Farmer economics", "Plan chosen", "Offer made (on the deal)"],
  preparation: ["Plants ordered", "Site prep", "Stake-out files", "Crew booked"],
  planting: ["Delivery", "Staking", "Planting", "As-planted check"],
  "handed-over": ["To C · care contract", "To C · own site", "Done", "Stopped"],
};

export const stageText = (p: { stage: Stage; step?: string }) => `${STAGE_LABEL[p.stage] ?? p.stage}${p.step ? ` · ${p.step}` : ""}`;

export const kroner = (n: number | undefined | null) =>
  n === undefined || n === null || !n ? "" : `${Math.round(n).toLocaleString("da-DK")} kr`;

export const shortDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("da-DK") : "");
