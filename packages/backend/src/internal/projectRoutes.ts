// /internal/projects: the Grove Dashboard. Mounted behind grove-field in
// routes/internal.ts; changes and money need grove-team. Field users see
// only projects they are assigned to, without money or client contacts.
import express from "express";
import mongoose from "mongoose";
import GroveProject from "@rw/db/schemas/internal/groveProject.ts";
import Offer from "@rw/db/schemas/internal/offer.ts";
import Parcel from "@rw/db/schemas/parcel.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { canSeeMoney } from "@rw/db/access.ts";
import { requireRole } from "../middleware/access.ts";
import { inIds } from "../utils/mongoSafety.ts";
import { offerTotals } from "./offers.ts";
import { cleanProject, forFieldUser } from "./projects.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
const team = requireRole("grove-team");
const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);

/** Offer value (open offers) and signed value (accepted) per project, excl. VAT. */
async function offerValues(projectIds: unknown[]) {
  const ids = projectIds.map(String).filter(validId);
  if (!ids.length) return new Map<string, { offerValue: number; signedValue: number; offers: number; trees: number }>();
  const offers: any[] = await Offer.find({ groveProject: inIds(ids) })
    .select("groveProject status lines.qty lines.unitPrice lines.discountPct discountPct")
    .lean();
  const out = new Map<string, { offerValue: number; signedValue: number; offers: number; trees: number }>();
  for (const o of offers) {
    const k = String(o.groveProject);
    const v = out.get(k) ?? { offerValue: 0, signedValue: 0, offers: 0, trees: 0 };
    const net = offerTotals(o).net;
    v.offers += 1;
    if (o.status === "accepted") {
      v.signedValue += net;
      v.trees += (o.lines ?? []).reduce((n: number, l: any) => n + (l.qty || 0), 0);
    } else if (o.status !== "declined") v.offerValue += net;
    out.set(k, v);
  }
  return out;
}

async function farmsById(ids: unknown[]) {
  const valid = ids.filter(Boolean).map(String).filter(validId);
  if (!valid.length) return new Map<string, any>();
  const farms: any[] = await Parcel.find({ _id: inIds(valid) }).select("name lat lng size").lean();
  return new Map(farms.map((f) => [String(f._id), { _id: f._id, name: f.name, lat: f.lat, lng: f.lng, size: f.size }]));
}

async function present(projects: any[], user: UserDocument | undefined) {
  const [values, farms] = await Promise.all([offerValues(projects.map((p) => p._id)), farmsById(projects.map((p) => p.farm))]);
  const money = canSeeMoney(user);
  return projects.map((p) => {
    const v = values.get(String(p._id));
    const full = {
      ...p,
      farm: p.farm ? farms.get(String(p.farm)) ?? { _id: p.farm } : null,
      offers: v?.offers ?? 0,
      offerValue: v?.offerValue ?? 0,
      signedValue: v?.signedValue ?? 0,
      trees: p.trees ?? (v?.trees || null),
    };
    return money ? full : forFieldUser(full);
  });
}

/** Field users: only projects they are assigned to. */
const visibleFilter = (user: UserDocument | undefined) =>
  canSeeMoney(user) ? {} : { assignees: user?._id };

router.get("/", async (req: Req, res) => {
  const projects = await GroveProject.find(visibleFilter(req.user)).sort({ updatedAt: -1 }).limit(1000).lean();
  res.send({ projects: await present(projects, req.user) });
});

// Farms the user owns, to link a project to (Grove keeps client farms under
// its own accounts). Another farm can be linked by its id.
router.get("/farms", team, async (req: Req, res) => {
  const farms = await Parcel.find({ "owner.id": req.user?._id }).select("name lat lng size").sort({ name: 1 }).limit(1000).lean();
  res.send({ farms });
});

router.post("/", team, async (req: Req, res) => {
  const cleaned = cleanProject(req.body, { creating: true });
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.errors.join("; "), errors: cleaned.errors });
    return;
  }
  if (cleaned.value.farm && !(await Parcel.exists({ _id: cleaned.value.farm }))) {
    res.status(400).send({ error: "Farm not found" });
    return;
  }
  const created = await GroveProject.create({ ...cleaned.value, createdBy: req.user?._id });
  const [p] = await present([created.toObject()], req.user);
  res.status(201).send({ project: p });
});

router.get("/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const project: any = await GroveProject.findOne({ _id: req.params.id, ...visibleFilter(req.user) }).lean();
  if (!project) {
    res.status(404).send({ error: "Project not found" });
    return;
  }
  const [p] = await present([project], req.user);
  const offers = canSeeMoney(req.user)
    ? (
        await Offer.find({ groveProject: project._id })
          .select("title dineroNumber status validUntil lines.qty lines.unitPrice lines.discountPct discountPct updatedAt")
          .sort({ updatedAt: -1 })
          .lean()
      ).map((o: any) => ({ _id: o._id, title: o.title, dineroNumber: o.dineroNumber, status: o.status, validUntil: o.validUntil, net: offerTotals(o).net }))
    : [];
  res.send({ project: p, offers });
});

router.put("/:id", team, async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const cleaned = cleanProject(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.errors.join("; "), errors: cleaned.errors });
    return;
  }
  if (cleaned.value.farm && !(await Parcel.exists({ _id: cleaned.value.farm }))) {
    res.status(400).send({ error: "Farm not found" });
    return;
  }
  const project = await GroveProject.findById(req.params.id);
  if (!project) {
    res.status(404).send({ error: "Project not found" });
    return;
  }
  project.set(cleaned.value);
  await project.save();
  const [p] = await present([project.toObject()], req.user);
  res.send({ project: p });
});

// Archive or restore many at once (to tidy the list once).
router.post("/bulk-status", team, async (req: Req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(validId).slice(0, 500) : [];
  const status = ["active", "on-hold", "archived"].includes(req.body?.status) ? req.body.status : null;
  if (!ids.length || !status) {
    res.status(400).send({ error: "Give project ids and a status" });
    return;
  }
  const r = await GroveProject.updateMany({ _id: inIds(ids) }, { $set: { status } });
  res.send({ updated: r.modifiedCount });
});

router.delete("/:id", team, async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  // Only empty projects can be deleted; others are archived instead.
  if (await Offer.exists({ groveProject: req.params.id })) {
    res.status(409).send({ error: "This project has offers; archive it instead" });
    return;
  }
  await GroveProject.deleteOne({ _id: req.params.id });
  res.status(204).send();
});

export default router;
