// Ownership checks for routes that read or change one user's data.
//
//   router.put("/projects/:id", owns("project"), handler)
//   router.put("/parcels/:id/layers/:pid/...", owns("layer", "pid"), handler)
//
// Lets the request through only when a verified, logged-in user owns the
// record (owner.id), or is a Grove admin. Public scenarios can be read (not
// changed) by anyone when `allowPublic` is set. Records saved without an
// owner fall back to their parent: project → field (layer) → farm (parcel).
import type express from "express";
import mongoose from "mongoose";
import Activity from "@rw/db/schemas/activity.ts";
import Area from "@rw/db/schemas/area.ts";
import Asset from "@rw/db/schemas/asset.ts";
import Budget from "@rw/db/schemas/budget.ts";
import FarmScenarioConfig from "@rw/db/schemas/farmScenarioConfig.ts";
import Layer from "@rw/db/schemas/layer.ts";
import Nursery from "@rw/db/schemas/nursery.ts";
import NurseryProduct from "@rw/db/schemas/nurseryproduct.ts";
import Row from "@rw/db/schemas/row.ts";
import Parcel from "@rw/db/schemas/parcel.ts";
import Project from "@rw/db/schemas/project.ts";
import Rotation from "@rw/db/schemas/rotation.ts";
import Sequence from "@rw/db/schemas/sequence.ts";
import System from "@rw/db/schemas/system.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { hasRole } from "@rw/db/access.ts";

export type OwnedKind =
  | "activity"
  | "area"
  | "asset"
  | "budget"
  | "farmScenarioConfig"
  | "layer"
  | "nursery"
  | "nurseryProduct"
  | "parcel"
  | "posting"
  | "row"
  | "project"
  | "rotation"
  | "sequence"
  | "system";

type Found = { ownerId?: string; isPublic?: boolean } | null;
export type OwnerLookup = (kind: OwnedKind, id: string) => Promise<Found>;

const MODELS: Record<OwnedKind, mongoose.Model<any>> = {
  activity: Activity,
  area: Area,
  asset: Asset,
  budget: Budget,
  farmScenarioConfig: FarmScenarioConfig,
  layer: Layer,
  nursery: Nursery,
  nurseryProduct: NurseryProduct,
  parcel: Parcel,
  posting: null as any, // postings are found through their budget
  row: Row,
  project: Project,
  rotation: Rotation,
  sequence: Sequence,
  system: System,
};

const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

/** Owner of a record from the database, falling back to its parent when unset. */
/** Child records found through the parent that lists them: [parent kind, model, field]. */
const LISTED_IN: Partial<Record<OwnedKind, [OwnedKind, mongoose.Model<any>, string][]>> = {
  row: [
    ["project", Project, "rows"],
    ["layer", Layer, "rows"],
  ],
  area: [
    ["project", Project, "areas"],
    ["layer", Layer, "areas"],
  ],
  posting: [["budget", Budget, "postings"]],
  activity: [["project", Project, "activities"]],
  nurseryProduct: [["nursery", Nursery, "products"]],
};

async function ownerViaParent(kind: OwnedKind, id: string): Promise<Found> {
  for (const [parentKind, model, field] of LISTED_IN[kind] ?? []) {
    const parent: any = await model.findOne({ [field]: id }).select("_id").lean();
    if (parent) return dbOwnerLookup(parentKind, String(parent._id));
  }
  return null;
}

export const dbOwnerLookup: OwnerLookup = async (kind, id) => {
  if (kind === "posting") return ownerViaParent(kind, id);
  const doc: any = await MODELS[kind].findById(id).select("owner user layer isPublic").lean();
  if (!doc) return null;
  // Farm scenario configs store their owner as `user`; everything else as owner.id.
  let ownerId = str(doc.owner?.id ?? (kind === "farmScenarioConfig" ? doc.user : undefined));
  if (!ownerId && kind === "project" && doc.layer) {
    ownerId = (await dbOwnerLookup("layer", String(doc.layer)))?.ownerId;
  }
  if (!ownerId && LISTED_IN[kind]) {
    ownerId = (await ownerViaParent(kind, id))?.ownerId;
  }
  if (!ownerId && kind === "activity" && doc.layer) {
    ownerId = (await dbOwnerLookup("layer", String(doc.layer)))?.ownerId;
  }
  if (!ownerId && kind === "budget") {
    // Older budgets were saved without an owner; they hang off a scenario.
    const project: any = await Project.findOne(
      mongoose.trusted({ $or: [{ "budgets.establishment": doc._id }, { "budgets.management": doc._id }] }),
    )
      .select("_id")
      .lean();
    if (project) ownerId = (await dbOwnerLookup("project", String(project._id)))?.ownerId;
  }
  if (!ownerId && kind === "layer") {
    const parcel: any = await Parcel.findOne({ layers: doc._id }).select("owner").lean();
    ownerId = str(parcel?.owner?.id);
  }
  if (!ownerId) console.warn("[ownership] %s %s has no owner; only Grove admins can use it", kind, id);
  return { ownerId, isPublic: doc.isPublic === true };
};

type Req = express.Request & { user?: UserDocument; idToken?: { email_verified?: boolean } };

/** The decision itself, kept pure so it can be tested on its own. */
export function ownershipDecision(
  user: { _id?: unknown; isAdmin?: boolean | null; roles?: readonly string[] | null } | undefined,
  verified: boolean,
  found: Found,
  opts: { allowPublic?: boolean; method: string },
): 200 | 401 | 403 | 404 {
  const readOnly = opts.method === "GET" || opts.method === "HEAD";
  if (found && opts.allowPublic && readOnly && found.isPublic) return 200;
  if (!user || !verified) return 401;
  if (!found) return 404;
  if (found.ownerId && found.ownerId === str(user._id)) return 200;
  if (hasRole(user, "grove-admin")) return 200;
  return 403;
}

let currentLookup: OwnerLookup = dbOwnerLookup;
/** Tests only: answer ownership lookups without a database. */
export function setOwnerLookupForTests(lookup: OwnerLookup | null) {
  currentLookup = lookup ?? dbOwnerLookup;
}

export function owns(
  kind: OwnedKind,
  param = "id",
  opts: { allowPublic?: boolean; lookup?: OwnerLookup } = {},
) {
  return async (req: Req, res: express.Response, next: express.NextFunction) => {
    const lookup = opts.lookup ?? currentLookup;
    const id = req.params[param];
    if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
      res.status(400).send({ error: "Invalid id" });
      return;
    }
    const found = await lookup(kind, id);
    const status = ownershipDecision(req.user, req.idToken?.email_verified === true, found, {
      allowPublic: opts.allowPublic,
      method: req.method,
    });
    if (status === 200) return next();
    const message = {
      401: "You need to be logged in with a verified email to do that",
      403: "You don't have permission to access this",
      404: "Not found",
    }[status];
    res.status(status).send({ error: message });
  };
}

/** Only the user themselves (or a Grove admin) for /users/:id routes. */
export function isSelf(param = "id") {
  return (req: Req, res: express.Response, next: express.NextFunction) => {
    if (!req.user || req.idToken?.email_verified !== true) {
      res.status(401).send({ error: "You need to be logged in with a verified email to do that" });
      return;
    }
    if (str(req.user._id) === req.params[param] || hasRole(req.user, "grove-admin")) return next();
    res.status(403).send({ error: "You don't have permission to access this" });
  };
}
