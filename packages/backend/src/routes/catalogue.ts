// Plant catalogue: hybrid groups, cultivars and rootstocks.
//
// One shared list curated by the Grove team, plus private entries each user
// adds for themselves. Reading needs a login; adding to the shared list or
// changing a shared entry needs grove-team. No prices live here.
import express from "express";
import { inIds, isSet } from "../utils/mongoSafety.ts";
import mongoose from "mongoose";
import Species from "@rw/db/schemas/species.ts";
import Variety from "@rw/db/schemas/variety.ts";
import Rootstock from "@rw/db/schemas/rootstock.ts";
import SystemDesign from "@rw/db/schemas/systemdesign.ts";
import UserPreset from "@rw/db/schemas/userpreset.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import middleware from "../middleware/index.ts";
import { requireRole } from "../middleware/access.ts";
import {
  canCreate,
  canEdit,
  forViewer,
  cleanCultivar,
  cleanHybridGroup,
  cleanRootstock,
  type Cleaned,
} from "../catalogue/rules.ts";

type Req = express.Request & { user?: UserDocument };

const router = express.Router();

function badInput(res: express.Response, cleaned: Cleaned<unknown>) {
  if (cleaned.ok) return false;
  res.status(400).send({ error: cleaned.errors.join("; "), errors: cleaned.errors });
  return true;
}

const visibleTo = (req: Req) => ({ $or: [{ shared: true }, { "owner.id": req.user?._id }] });

const CULTIVAR_FIELDS = "name species pedigree pollination ripening vigour description shared owner";
const ROOTSTOCK_FIELDS = "name species propagation vigour notes shared owner";

// Everything the design editor needs in one call.
router.get("/catalogue", middleware.isLoggedIn, async (req: Req, res: express.Response) => {
  const [cultivars, rootstocks, hybridGroups] = await Promise.all([
    Variety.find(visibleTo(req)).select(CULTIVAR_FIELDS).sort({ name: 1 }).lean(),
    Rootstock.find(visibleTo(req)).select(ROOTSTOCK_FIELDS).sort({ name: 1 }).lean(),
    Species.find({ hybrid: isSet() })
      .select("nameCommon genus species family hybrid")
      .sort({ nameCommon: 1 })
      .lean(),
  ]);
  res.send({
    cultivars: cultivars.map((c: any) => forViewer(c, req.user?._id)),
    rootstocks: rootstocks.map((r: any) => forViewer(r, req.user?._id)),
    hybridGroups,
  });
});

/**
 * A shared entry that designs use must stay shared, and a cultivar in use
 * must keep its species; otherwise those designs would point at plants their
 * owners can no longer use.
 */
async function blockedChange(
  field: "variety" | "rootstock",
  existing: { _id: unknown; shared?: boolean; species?: unknown },
  next: { shared: boolean; species?: string },
): Promise<string | null> {
  const unshare = existing.shared && !next.shared;
  const moveSpecies =
    field === "variety" && String(existing.species ?? "") !== String(next.species ?? "");
  if (!unshare && !moveSpecies) return null;
  const [designs, presets] = await Promise.all([
    SystemDesign.countDocuments({ [`rows.sequence.${field}`]: existing._id }),
    UserPreset.countDocuments({ [`systemDesign.rows.sequence.${field}`]: existing._id }),
  ]);
  const used = designs + presets;
  if (!used) return null;
  return `Used in ${used} design${used === 1 ? "" : "s"} or preset${used === 1 ? "" : "s"}, so it can't be ${unshare ? "made private" : "moved to another species"}`;
}

async function speciesExists(id: string | undefined) {
  return !id || (await Species.exists({ _id: id })) !== null;
}

// ---- cultivars ----

router.post("/catalogue/cultivars", middleware.isLoggedIn, async (req: Req, res) => {
  const cleaned = cleanCultivar(req.body);
  if (badInput(res, cleaned) || !cleaned.ok) return;
  if (!canCreate(req.user!, cleaned.value.shared)) {
    res.status(403).send({ error: "Only the Grove team can add to the shared list" });
    return;
  }
  if (!(await speciesExists(cleaned.value.species))) {
    res.status(400).send({ error: "Species not found" });
    return;
  }
  const created = await Variety.create({ ...cleaned.value, owner: { id: req.user!._id } });
  res.status(201).send(created);
});

router.put("/catalogue/cultivars/:id", middleware.isLoggedIn, async (req: Req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const existing = await Variety.findById(req.params.id);
  if (!existing) {
    res.status(404).send({ error: "Cultivar not found" });
    return;
  }
  const cleaned = cleanCultivar(req.body);
  if (badInput(res, cleaned) || !cleaned.ok) return;
  // Must be allowed to edit it as it is now, and as it will be (sharing needs grove-team).
  if (!canEdit(req.user!, existing) || !canCreate(req.user!, cleaned.value.shared)) {
    res.status(403).send({ error: "You can't change this cultivar" });
    return;
  }
  const blocked = await blockedChange("variety", existing, cleaned.value);
  if (blocked) {
    res.status(409).send({ error: blocked });
    return;
  }
  if (!(await speciesExists(cleaned.value.species))) {
    res.status(400).send({ error: "Species not found" });
    return;
  }
  existing.set(cleaned.value);
  await existing.save();
  res.send(existing);
});

// ---- rootstocks ----

router.post("/catalogue/rootstocks", middleware.isLoggedIn, async (req: Req, res) => {
  const cleaned = cleanRootstock(req.body);
  if (badInput(res, cleaned) || !cleaned.ok) return;
  if (!canCreate(req.user!, cleaned.value.shared)) {
    res.status(403).send({ error: "Only the Grove team can add to the shared list" });
    return;
  }
  if (!(await speciesExists(cleaned.value.species))) {
    res.status(400).send({ error: "Species not found" });
    return;
  }
  const created = await Rootstock.create({ ...cleaned.value, owner: { id: req.user!._id } });
  res.status(201).send(created);
});

router.put("/catalogue/rootstocks/:id", middleware.isLoggedIn, async (req: Req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const existing = await Rootstock.findById(req.params.id);
  if (!existing) {
    res.status(404).send({ error: "Rootstock not found" });
    return;
  }
  const cleaned = cleanRootstock(req.body);
  if (badInput(res, cleaned) || !cleaned.ok) return;
  if (!canEdit(req.user!, existing) || !canCreate(req.user!, cleaned.value.shared)) {
    res.status(403).send({ error: "You can't change this rootstock" });
    return;
  }
  const blocked = await blockedChange("rootstock", existing, cleaned.value);
  if (blocked) {
    res.status(409).send({ error: blocked });
    return;
  }
  if (!(await speciesExists(cleaned.value.species))) {
    res.status(400).send({ error: "Species not found" });
    return;
  }
  existing.set(cleaned.value);
  await existing.save();
  res.send(existing);
});

// ---- hybrid groups (species entries; Grove team only) ----

// Fields copied from the "grows like" parent so layout, 3D and growth work
// for the group until it has figures of its own.
const INHERITED = ["family", "form", "height", "width", "lifespan", "classsyntropic", "origin"];

async function hybridGroupDoc(value: ReturnType<typeof cleanHybridGroup> & { ok: true }) {
  const v = value.value;
  const parents = await Species.find({ _id: inIds(v.parents) })
    .select(INHERITED.join(" "))
    .lean();
  if (parents.length !== v.parents.length) return null;
  const model = parents.find((p) => String(p._id) === v.growsLike) ?? parents[0];
  const inherited = Object.fromEntries(INHERITED.map((k) => [k, (model as any)[k]]));
  return {
    ...inherited,
    nameCommon: v.nameCommon,
    genus: v.genus,
    species: "hybrid",
    hybrid: {
      parents: v.parents,
      parentageCertainty: v.parentageCertainty,
      growsLike: v.growsLike ?? null,
    },
  };
}

router.post("/catalogue/hybrid-groups", requireRole("grove-team"), async (req: Req, res) => {
  const cleaned = cleanHybridGroup(req.body);
  if (badInput(res, cleaned) || !cleaned.ok) return;
  const doc = await hybridGroupDoc(cleaned);
  if (!doc) {
    res.status(400).send({ error: "A parent species was not found" });
    return;
  }
  const created = await Species.create(doc);
  res.status(201).send(created);
});

router.put("/catalogue/hybrid-groups/:id", requireRole("grove-team"), async (req: Req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const existing = await Species.findById(req.params.id);
  if (!existing?.hybrid) {
    res.status(404).send({ error: "Hybrid group not found" });
    return;
  }
  const cleaned = cleanHybridGroup(req.body);
  if (badInput(res, cleaned) || !cleaned.ok) return;
  if (cleaned.value.parents.includes(String(existing._id))) {
    res.status(400).send({ error: "A hybrid group can't be its own parent" });
    return;
  }
  const doc = await hybridGroupDoc(cleaned);
  if (!doc) {
    res.status(400).send({ error: "A parent species was not found" });
    return;
  }
  // Keep growth figures someone has already set on the group itself.
  const { nameCommon, genus, hybrid } = doc;
  existing.set({ nameCommon, genus, hybrid });
  await existing.save();
  res.send(existing);
});

export default router;
