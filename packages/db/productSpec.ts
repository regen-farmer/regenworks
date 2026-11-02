// One definition of a plant product, shared by the price overview, offer
// lines and the supply plan (A · Deals), so what is sold, priced and produced
// is the same thing: species · cultivar · rootstock (or own roots) ·
// propagation · organic · bare root or container · production years.
// Used in the backend and the web app. Designs (B) don't look at stock.

export const FORMS = ["bare-root", "container", "root-ball"] as const;
export type Form = (typeof FORMS)[number];
export const FORM_EN: Record<Form, string> = { "bare-root": "Bare root", container: "Container", "root-ball": "Root ball" };
export const FORM_DA: Record<Form, string> = { "bare-root": "barrodet", container: "i potte", "root-ball": "med klump" };

export type Propagation = "grafted" | "seedling" | "own-rooted" | "cutting";
export const PROPAGATIONS: Propagation[] = ["grafted", "seedling", "own-rooted", "cutting"];

export type ProductSpec = {
  latin?: string;
  cultivar?: string;
  /** empty for own-rooted plants and seedlings */
  rootstock?: string;
  propagation?: Propagation | string;
  /** true organic, false not organic, undefined not stated */
  organic?: boolean | null;
  form?: Form | string;
  /** production years in nursery notation: "1", "1+1", "2+0", "1+2" */
  years?: string;
};

const norm = (s: string | undefined | null) =>
  (s ?? "")
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[åÅ]/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();

/** Genus + species, hybrid marks skipped: "Malus x domestica 'Ingrid Marie'" -> "malus domestica". */
export const speciesOf = (latin: string | undefined) =>
  norm(latin)
    .split(" ")
    .filter((w) => w && w !== "x" && w !== "+")
    .slice(0, 2)
    .join(" ");

const SEEDLING_WORDS = /\b(seedling|seedlings|froformeret|kimplante|zaailing)\b/g;
/** "Corylus colurna seedling" and "corylus colurna" are the same rootstock. */
export const rootstockOf = (r: string | undefined) => norm(r).replace(SEEDLING_WORDS, "").replace(/\s+/g, " ").trim();

/**
 * Production years: "1+1", "2+0", "1/1", "1-0" -> "1+1", "2+0", "1+1", "1+0";
 * "1", "2 ans", "1 år", "2 years", "2 jahre" -> the number. Anything else undefined.
 */
export function cleanYears(v: unknown): string | undefined {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const t = String(v).trim().toLowerCase();
  const m = t.match(/^(\d)(?:\s*[+/-]\s*(\d))?$/);
  if (m) return m[2] !== undefined ? `${m[1]}+${m[2]}` : m[1];
  const y = t.match(/^(\d)\s*(?:ans?|år|aar|years?|yrs?|jahre?|jaar|jarig)$/);
  return y ? y[1] : undefined;
}

/** Grove's own products: grafted 1+1, seedlings 1 (Kris, 2 Nov). Others: unknown. */
export const defaultYears = (propagation: string | undefined) => (propagation === "grafted" ? "1+1" : propagation === "seedling" ? "1" : undefined);

/** Bare root, container or root ball from price-list text ("C2", "P9", "bare root", "barrodet", "wurzelnackt"). */
export function formOf(...texts: (string | undefined)[]): Form | undefined {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (!t) return undefined;
  // WG = wortelgoed (Dutch nurseries), racines nues (French)
  if (/bare\s*-?\s*root|barrod|wurzelnackt|wortelgoed|\bwg\b|racines? nues?|naked|\bbr\b|\bb\.r\.?\b/.test(t)) return "bare-root";
  if (/root\s*-?\s*ball|klump|ballen|kluit|motte|\brb\b/.test(t)) return "root-ball";
  if (/\bc\s?\d+(\.\d+)?\s?l?\b|container|conteneur|godet|airpot|\bpot\b|potte|\bp\s?\d+\b|liter|\bltr\b|\d+\s?l\b/.test(t)) return "container";
  return undefined;
}

/**
 * The key two products share only if they are the same product: every field
 * must agree (a field left out only equals a field left out). Grafted plants
 * on different rootstocks, or 1+1 vs 2+0, are different products.
 */
export function specKey(p: ProductSpec): string {
  const organic = p.organic === true ? "org" : p.organic === false ? "conv" : "";
  return [speciesOf(p.latin), norm(p.cultivar), rootstockOf(p.rootstock), norm(p.propagation as string), organic, norm(p.form as string), cleanYears(p.years) ?? ""].join("|");
}

/** Which fields a spec leaves open (to show "rootstock not set" on an order line). */
export function missingFields(p: ProductSpec): string[] {
  const out: string[] = [];
  if (!p.propagation) out.push("propagation");
  if (p.propagation === "grafted" && !p.rootstock) out.push("rootstock");
  if (p.organic !== true && p.organic !== false) out.push("organic");
  if (!p.form) out.push("bare root/container");
  if (!cleanYears(p.years)) out.push("years");
  return out;
}

/** "Corylus avellana 'Corabel' on C. colurna · grafted · organic · bare root · 1+1" */
export function specLabel(p: ProductSpec): string {
  const name = [p.latin, p.cultivar ? `'${p.cultivar}'` : ""].filter(Boolean).join(" ");
  const on = p.rootstock ? ` on ${p.rootstock}` : "";
  const bits = [
    p.propagation,
    p.organic === true ? "organic" : p.organic === false ? "not organic" : "",
    p.form && (FORMS as readonly string[]).includes(p.form) ? FORM_EN[p.form as Form].toLowerCase() : p.form,
    cleanYears(p.years),
  ].filter(Boolean);
  return `${name}${on}${bits.length ? ` · ${bits.join(" · ")}` : ""}`;
}

/**
 * Could two specs be the same product? Fields that both state must agree
 * (species and cultivar always); a field only one of them states is
 * "unknown": possible, but not confirmed (e.g. a supplier list without
 * production years).
 */
export function compareSpecs(a: ProductSpec, b: ProductSpec): { same: boolean; exact: boolean; differs: string[]; unknown: string[] } {
  const differs: string[] = [];
  const unknown: string[] = [];
  if (speciesOf(a.latin) !== speciesOf(b.latin)) differs.push("species");
  if (norm(a.cultivar) !== norm(b.cultivar)) differs.push("cultivar");
  const check = (name: string, x: string | undefined, y: string | undefined) => {
    if (x && y) {
      if (x !== y) differs.push(name);
    } else if (x || y) unknown.push(name);
  };
  check("rootstock", rootstockOf(a.rootstock) || undefined, rootstockOf(b.rootstock) || undefined);
  check("propagation", norm(a.propagation as string) || undefined, norm(b.propagation as string) || undefined);
  check("organic", a.organic === true || a.organic === false ? String(a.organic) : undefined, b.organic === true || b.organic === false ? String(b.organic) : undefined);
  check("form", norm(a.form as string) || undefined, norm(b.form as string) || undefined);
  check("years", cleanYears(a.years), cleanYears(b.years));
  // a seedling or own-rooted plant has no rootstock: not "unknown"
  const noRootstock = (p: ProductSpec) => !!p.propagation && p.propagation !== "grafted";
  if (unknown.includes("rootstock") && (noRootstock(a) || noRootstock(b)) && !(a.rootstock && b.rootstock)) unknown.splice(unknown.indexOf("rootstock"), 1);
  return { same: differs.length === 0, exact: differs.length === 0 && unknown.length === 0, differs, unknown };
}
