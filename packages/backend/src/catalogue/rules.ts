// Plant catalogue rules: who may see and change cultivars, rootstocks and
// hybrid groups, how input is cleaned, and how a design's plants are checked.
// Pure functions (no database) so they can be unit tested; the routes in
// routes/catalogue.ts and routes/systemdesigns.ts load the documents.
import mongoose from "mongoose";
import { hasRole } from "@rw/db/access.ts";
import { PARENTAGE_CERTAINTY } from "@rw/db/schemas/species.ts";
import { VIGOUR } from "@rw/db/schemas/variety.ts";
import { ROOTSTOCK_PROPAGATION } from "@rw/db/schemas/rootstock.ts";

type UserLike = { _id?: unknown; isAdmin?: boolean | null; roles?: readonly string[] | null };
type CatalogueItem = { shared?: boolean | null; owner?: { id?: unknown } | null };

const idOf = (v: unknown): string | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "object" && v !== null && "_id" in v) return String((v as { _id: unknown })._id);
  return String(v);
};

/** Shared entries are visible to everyone; private ones only to the owners listed. */
export function isVisible(item: CatalogueItem, ownerIds: readonly string[]): boolean {
  if (item.shared) return true;
  const owner = idOf(item.owner?.id);
  return owner !== undefined && ownerIds.includes(owner);
}

/** Only the Grove team adds to the shared list; anyone logged in can add private entries. */
export function canCreate(user: UserLike, shared: boolean): boolean {
  return shared ? hasRole(user, "grove-team") : true;
}

/** Shared entries: Grove team. Private entries: their owner (or a Grove admin). */
export function canEdit(user: UserLike, item: CatalogueItem): boolean {
  if (item.shared) return hasRole(user, "grove-team");
  return idOf(item.owner?.id) === idOf(user._id) || hasRole(user, "grove-admin");
}

// ---- input cleaning --------------------------------------------------------

export type Cleaned<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function str(v: unknown, field: string, max: number, errors: string[], required = false) {
  if (v === undefined || v === null || v === "") {
    if (required) errors.push(`${field} is required`);
    return undefined;
  }
  if (typeof v !== "string") {
    errors.push(`${field} must be text`);
    return undefined;
  }
  const t = v.trim();
  if (required && !t) errors.push(`${field} is required`);
  if (t.length > max) errors.push(`${field} is too long (max ${max})`);
  return t || undefined;
}

function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[], errors: string[]) {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    errors.push(`${field} must be one of: ${allowed.join(", ")}`);
    return undefined;
  }
  return v as T;
}

function objectId(v: unknown, field: string, errors: string[], required = false) {
  const id = idOf(v);
  if (id === undefined) {
    if (required) errors.push(`${field} is required`);
    return undefined;
  }
  if (!mongoose.isValidObjectId(id)) {
    errors.push(`${field} is not a valid id`);
    return undefined;
  }
  return id;
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

const done = <T>(value: T, errors: string[]): Cleaned<T> =>
  errors.length ? { ok: false, errors } : { ok: true, value };

export type CultivarInput = {
  name: string;
  species: string;
  pedigree?: string;
  pollination?: string;
  ripening?: string;
  vigour?: (typeof VIGOUR)[number];
  description?: string;
  shared: boolean;
};

export function cleanCultivar(body: any): Cleaned<CultivarInput> {
  const errors: string[] = [];
  const value = {
    name: str(body?.name, "Name", 120, errors, true)!,
    species: objectId(body?.species, "Species", errors, true)!,
    pedigree: str(body?.pedigree, "Pedigree", 300, errors),
    pollination: str(body?.pollination, "Pollination", 100, errors),
    ripening: str(body?.ripening, "Ripening", 100, errors),
    vigour: oneOf(body?.vigour, "Vigour", VIGOUR, errors),
    description: str(body?.description, "Description", 2000, errors),
    shared: bool(body?.shared),
  };
  return done(value, errors);
}

export type RootstockInput = {
  name: string;
  species?: string;
  propagation?: (typeof ROOTSTOCK_PROPAGATION)[number];
  vigour?: (typeof VIGOUR)[number];
  notes?: string;
  shared: boolean;
};

export function cleanRootstock(body: any): Cleaned<RootstockInput> {
  const errors: string[] = [];
  const value = {
    name: str(body?.name, "Name", 120, errors, true)!,
    species: objectId(body?.species, "Species", errors),
    propagation: oneOf(body?.propagation, "Propagation", ROOTSTOCK_PROPAGATION, errors),
    vigour: oneOf(body?.vigour, "Vigour", VIGOUR, errors),
    notes: str(body?.notes, "Notes", 1000, errors),
    shared: bool(body?.shared),
  };
  return done(value, errors);
}

export type HybridGroupInput = {
  nameCommon: string;
  genus: string;
  parents: string[];
  parentageCertainty: (typeof PARENTAGE_CERTAINTY)[number];
  growsLike?: string;
};

export function cleanHybridGroup(body: any): Cleaned<HybridGroupInput> {
  const errors: string[] = [];
  const parentsRaw: unknown[] = Array.isArray(body?.parents) ? body.parents : [];
  const parents = [
    ...new Set(parentsRaw.map((p, i) => objectId(p, `Parent ${i + 1}`, errors)).filter(Boolean)),
  ] as string[];
  if (parents.length < 2) errors.push("A hybrid group needs at least two parent species");
  if (parents.length > 8) errors.push("At most eight parent species");
  const growsLike = objectId(body?.growsLike, "Grows like", errors);
  if (growsLike && !parents.includes(growsLike)) errors.push("Grows like must be one of the parents");
  const value = {
    nameCommon: str(body?.nameCommon, "Name", 120, errors, true)!,
    genus: str(body?.genus, "Genus", 60, errors, true)!,
    parents,
    parentageCertainty:
      oneOf(body?.parentageCertainty, "Parentage certainty", PARENTAGE_CERTAINTY, errors) ??
      "uncertain",
    growsLike,
  };
  return done(value, errors);
}

// ---- design plants ---------------------------------------------------------

type CultivarDoc = CatalogueItem & { _id: unknown; name?: string; species?: unknown };
type RootstockDoc = CatalogueItem & { _id: unknown; name?: string };

/** The cultivar and rootstock ids a design refers to, so the caller can load them. */
export function referencedIds(rows: any[]): { varieties: string[]; rootstocks: string[] } {
  const varieties = new Set<string>();
  const rootstocks = new Set<string>();
  for (const row of rows ?? []) {
    for (const entry of row?.sequence ?? []) {
      const v = idOf(entry?.variety);
      const r = idOf(entry?.rootstock);
      if (v && mongoose.isValidObjectId(v)) varieties.add(v);
      if (r && mongoose.isValidObjectId(r)) rootstocks.add(r);
    }
  }
  return { varieties: [...varieties], rootstocks: [...rootstocks] };
}

/**
 * Check and tidy the plant fields of every sequence entry in a design.
 * Blank values become "not decided"; ids are stored as plain strings.
 * Errors name the row and position the way the editor shows them (from 1).
 */
export function checkDesignPlants(
  rows: any[],
  catalogue: { varieties: Map<string, CultivarDoc>; rootstocks: Map<string, RootstockDoc> },
  ownerIds: readonly string[],
): Cleaned<any[]> {
  const errors: string[] = [];
  const cleanRows = (rows ?? []).map((row: any, r: number) => ({
    ...row,
    sequence: (row?.sequence ?? []).map((entry: any, s: number) => {
      const where = `Row ${r + 1}, tree ${s + 1}`;
      const species = idOf(entry?.species);
      const out: any = { species: entry?.species, spacingAfter: entry?.spacingAfter };
      if (entry?._id !== undefined) out._id = entry._id;

      const varietyId = idOf(entry?.variety);
      if (varietyId) {
        const cultivar = catalogue.varieties.get(varietyId);
        if (!cultivar || !isVisible(cultivar, ownerIds)) {
          errors.push(`${where}: cultivar not found`);
        } else if (idOf(cultivar.species) !== species) {
          errors.push(`${where}: cultivar ${cultivar.name ?? ""} belongs to a different species`);
        } else {
          out.variety = varietyId;
        }
      }

      const rootstockId = idOf(entry?.rootstock);
      const ownRoots = bool(entry?.ownRoots);
      if (rootstockId && ownRoots) {
        errors.push(`${where}: choose a rootstock or own roots, not both`);
      } else if (rootstockId) {
        const rootstock = catalogue.rootstocks.get(rootstockId);
        if (!rootstock || !isVisible(rootstock, ownerIds)) errors.push(`${where}: rootstock not found`);
        else out.rootstock = rootstockId;
      } else if (ownRoots) {
        out.ownRoots = true;
      }

      if (entry?.organic === true || entry?.organic === false) out.organic = entry.organic;
      return out;
    }),
  }));
  return done(cleanRows, errors);
}
