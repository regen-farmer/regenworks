// Checklists on Grove projects (pure, tested). The screening is the first:
// B · Project development, stage 1. Wording from Kris (2 Nov 2026). The same
// engine can carry the "before establishment" checklist later.
//
// Items are keyed (letters, digits and dashes: no dots, they're map keys in
// MongoDB), so wording can change or items be added without touching saved answers. An answered item that leaves the template is kept, not shown.

export const ITEM_STATES = ["open", "done", "na", "issue"] as const;
export type ItemState = (typeof ITEM_STATES)[number];
export const DECISIONS = ["go", "go-conditions", "no-go"] as const;
export type Decision = (typeof DECISIONS)[number];

export type ChecklistItem = { key: string; text: string; hint?: string };
export type ChecklistSection = { key: string; title: string; items: ChecklistItem[] };
export type ChecklistTemplate = { kind: string; version: number; title: string; sections: ChecklistSection[]; decision: boolean };

export const SCREENING: ChecklistTemplate = {
  kind: "screening",
  version: 1,
  title: "Screening",
  decision: true,
  sections: [
    {
      key: "goals",
      title: "A. Project goals",
      items: [
        {
          key: "goals-primary",
          text: "Write down the primary goals (fruit/nut yield, timber, fodder, shelter, biodiversity, carbon, soil/water protection, animal welfare)",
        },
      ],
    },
    {
      key: "landscape",
      title: "B. Landscape, climate and hydrology",
      items: [
        { key: "landscape-terrain", text: "Map slope, aspect, frost pockets and low spots where cold air or water collects" },
        { key: "landscape-wind", text: "Note prevailing wind exposure and existing shelter (læhegn, woodland, buildings)" },
        { key: "landscape-wet", text: "Map waterlogged areas, springs, ditches and wet hollows" },
        {
          key: "landscape-drains",
          text: "Locate field drains (drænkort from the landowner, old maps, drain outlets)",
          hint: "Avoid planting directly over drain lines, or plan root barriers/offsets",
        },
        { key: "landscape-powerlines", text: "Locate overhead power lines and keep clearance for mature tree height" },
        { key: "landscape-cables", text: "Locate buried cables, pipes and gas lines (LER graveforespørgsel)" },
        { key: "landscape-features", text: "Note existing trees, hedges, stone/earth dikes (sten- og jorddiger), ponds and wildlife features to keep" },
      ],
    },
    {
      key: "regulatory",
      title: "C. Regulatory, conservation and permit checks",
      items: [
        {
          key: "regulatory-p3",
          text: "§3 protected nature on or next to the site (heath, bog, meadow, salt marsh, overdrev, lakes over 100 m², protected watercourses)",
          hint: "Planting in §3 areas normally needs dispensation",
        },
        { key: "regulatory-p15", text: "§15 beach protection line (strandbeskyttelseslinje)" },
        { key: "regulatory-p16", text: "§16 lake and river protection line (sø- og åbeskyttelseslinje, usually 150 m)" },
        { key: "regulatory-p17", text: "§17 forest building line (skovbyggelinje)", hint: "Mainly limits buildings, but check fences/structures" },
        {
          key: "regulatory-p18",
          text: "§18 ancient monument protection line (fortidsmindebeskyttelseslinje, 100 m)",
          hint: "Planting inside it may need dispensation",
        },
        { key: "regulatory-p19", text: "§19 church protection line (kirkebeskyttelseslinje)" },
        { key: "regulatory-fredning", text: "Fredninger (conservation orders) that limit planting or require open views" },
      ],
    },
    {
      key: "soilwater",
      title: "D. Soil and water",
      items: [
        {
          key: "soilwater-soil",
          text: "Note soil type (sandy Jutland soils vs heavy clay on Zealand/Funen) and match species",
          hint: "A Danish soil-type layer in the app comes later",
        },
        { key: "soilwater-source", text: "Identify the water source for irrigation: mains, well/borehole, pond, rainwater, water cart" },
        {
          key: "soilwater-permit",
          text: "Check if a water abstraction permit (vandindvindingstilladelse) is needed, or the existing permit covers trees",
          hint: "Often a project stopper: many don't know a permit is needed. Ponds/basins as alternatives later",
        },
      ],
    },
  ],
};

export const TEMPLATES: Record<string, ChecklistTemplate> = { screening: SCREENING };

export type ItemAnswer = { state: ItemState; note?: string; at?: Date | string; by?: unknown };
export type ChecklistLike = {
  items?: Record<string, ItemAnswer> | Map<string, ItemAnswer>;
  sectionNotes?: Record<string, string> | Map<string, string>;
  decision?: { result?: Decision | null; conditions?: string } | null;
};

const get = <T,>(m: Record<string, T> | Map<string, T> | undefined, k: string): T | undefined =>
  m instanceof Map ? m.get(k) : m?.[k];

/** Done = marked done, not relevant or issue found (an issue is a finding, so the check is done). */
export function progress(t: ChecklistTemplate, c: ChecklistLike | null | undefined) {
  const sections = t.sections.map((s) => {
    const states = s.items.map((i) => get(c?.items, i.key)?.state ?? "open");
    return {
      key: s.key,
      done: states.filter((x) => x !== "open").length,
      total: s.items.length,
      issues: states.filter((x) => x === "issue").length,
    };
  });
  const done = sections.reduce((n, s) => n + s.done, 0);
  const total = sections.reduce((n, s) => n + s.total, 0);
  return { done, total, issues: sections.reduce((n, s) => n + s.issues, 0), sections, decision: c?.decision?.result ?? null };
}

export const itemKeys = (t: ChecklistTemplate) => new Set(t.sections.flatMap((s) => s.items.map((i) => i.key)));

/**
 * A change to one item: its state, its note, or both. Each is saved on its
 * own, so a note typed just before a status click isn't overwritten.
 */
export function cleanItem(body: any): { ok: true; value: { state?: ItemState; note?: string } } | { ok: false; error: string } {
  const out: { state?: ItemState; note?: string } = {};
  if (body?.state !== undefined) {
    if (!ITEM_STATES.includes(body.state)) return { ok: false, error: `State must be one of ${ITEM_STATES.join(", ")}` };
    out.state = body.state;
  }
  if (body?.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") return { ok: false, error: "Note must be text" };
    out.note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  }
  if (out.state === undefined && out.note === undefined) return { ok: false, error: "Send a state or a note" };
  return { ok: true, value: out };
}

/** The template for a kind, or undefined (never an inherited property like "constructor"). */
export const templateOf = (kind: unknown) => (typeof kind === "string" && Object.hasOwn(TEMPLATES, kind) ? TEMPLATES[kind] : undefined);

export function cleanDecision(body: any): { ok: true; value: { result: Decision | null; conditions: string } } | { ok: false; error: string } {
  const r = body?.result;
  if (r !== null && r !== "" && !DECISIONS.includes(r)) return { ok: false, error: `Decision must be one of ${DECISIONS.join(", ")}` };
  if (body?.conditions !== undefined && body.conditions !== null && typeof body.conditions !== "string") return { ok: false, error: "Conditions must be text" };
  return { ok: true, value: { result: r === "" || r === null ? null : r, conditions: typeof body?.conditions === "string" ? body.conditions.trim().slice(0, 3000) : "" } };
}
