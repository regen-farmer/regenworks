// /internal/projects: the Grove Dashboard. Mounted behind grove-field in
// routes/internal.ts; changes and money need grove-team. Field users see
// only projects they are assigned to, without money or client contacts.
import express from "express";
import mongoose from "mongoose";
import GroveProject from "@rw/db/schemas/internal/groveProject.ts";
import Offer from "@rw/db/schemas/internal/offer.ts";
import Deal from "@rw/db/schemas/internal/deal.ts";
import Parcel from "@rw/db/schemas/parcel.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { canSeeMoney } from "@rw/db/access.ts";
import { requireRole } from "../middleware/access.ts";
import { inIds } from "../utils/mongoSafety.ts";
import { offerTotals } from "./offers.ts";
import User from "@rw/db/schemas/user.ts";
import { GROVE_ROLES } from "@rw/db/access.ts";
import { farmIsGroves, groveUserIds } from "./groveRefs.ts";
import { cleanProject, forFieldUser, summariseOffers, visibleFilter as visibleFor } from "./projects.ts";
import Checklist from "@rw/db/schemas/internal/checklist.ts";
import { cleanDecision, cleanItem, itemKeys, progress, SCREENING, TEMPLATES } from "./checklists.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
const team = requireRole("grove-team");
const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);

/** Offer, signed value and signed trees per project (see summariseOffers). */
async function offerValues(projectIds: unknown[]) {
  const ids = projectIds.map(String).filter(validId);
  const out = new Map<string, ReturnType<typeof summariseOffers>>();
  if (!ids.length) return out;
  const offers: any[] = await Offer.find({ groveProject: inIds(ids) })
    .select("groveProject status lines.qty lines.unitPrice lines.discountPct discountPct")
    .lean();
  const byProject = new Map<string, { status: string; net: number; trees: number }[]>();
  for (const o of offers) {
    const k = String(o.groveProject);
    const list = byProject.get(k) ?? [];
    list.push({ status: o.status, net: offerTotals(o).net, trees: (o.lines ?? []).reduce((n: number, l: any) => n + (l.qty || 0), 0) });
    byProject.set(k, list);
  }
  for (const [k, list] of byProject) out.set(k, summariseOffers(list));
  return out;
}

async function farmsById(ids: unknown[]) {
  const valid = ids.filter(Boolean).map(String).filter(validId);
  if (!valid.length) return new Map<string, any>();
  const farms: any[] = await Parcel.find({ _id: inIds(valid) }).select("name lat lng size").lean();
  return new Map(farms.map((f) => [String(f._id), { _id: f._id, name: f.name, lat: f.lat, lng: f.lng, size: f.size }]));
}

/** Screening progress per project (no money: field users see it too). */
async function screeningProgress(projectIds: unknown[]) {
  const ids = projectIds.map(String).filter(validId);
  if (!ids.length) return new Map<string, ReturnType<typeof progress>>();
  const lists: any[] = await Checklist.find({ project: inIds(ids), kind: "screening" }).select("project items decision").lean();
  return new Map(lists.map((c) => [String(c.project), progress(SCREENING, c)]));
}

async function present(projects: any[], user: UserDocument | undefined) {
  const [values, farms, screening] = await Promise.all([offerValues(projects.map((p) => p._id)), farmsById(projects.map((p) => p.farm)), screeningProgress(projects.map((p) => p._id))]);
  const money = canSeeMoney(user);
  return projects.map((p) => {
    const v = values.get(String(p._id));
    const full = {
      ...p,
      farm: p.farm ? farms.get(String(p.farm)) ?? { _id: p.farm } : null,
      offers: v?.offers ?? 0,
      drafts: v?.drafts ?? 0,
      offerValue: v?.offerValue ?? 0,
      signedValue: v?.signedValue ?? 0,
      // trees is what was typed; signedTrees comes from accepted offers
      signedTrees: v?.signedTrees ?? 0,
      screening: (() => {
        const sp = screening.get(String(p._id));
        return sp ? { done: sp.done, total: sp.total, issues: sp.issues, decision: sp.decision } : null;
      })(),
    };
    return money ? full : forFieldUser(full);
  });
}

const visibleFilter = (user: UserDocument | undefined) => visibleFor(user, canSeeMoney);

/** A linked farm must be kept under a Grove account; assignees must be Grove users. */
async function checkLinks(v: Record<string, any>): Promise<string | null> {
  if (v.farm && !(await farmIsGroves(String(v.farm)))) return "Farm not found among Grove's farms";
  if (v.assignees?.length) {
    const grove = new Set(await groveUserIds());
    if (!v.assignees.every((id: string) => grove.has(String(id)))) return "Assignees must be Grove team members";
  }
  return null;
}

router.get("/", async (req: Req, res) => {
  const projects = await GroveProject.find(visibleFilter(req.user)).sort({ updatedAt: -1 }).limit(1000).lean();
  res.send({ projects: await present(projects, req.user) });
});

// Farms kept under Grove accounts (the user's own and colleagues'), to link
// a project to; with whether a project already uses them.
router.get("/farms", team, async (_req: Req, res) => {
  const ids = await groveUserIds();
  const farms: any[] = await Parcel.find({ "owner.id": inIds(ids) }).select("name lat lng size owner").sort({ name: 1 }).limit(2000).lean();
  const linked = new Set((await GroveProject.find({ farm: inIds(farms.map((f) => String(f._id))) }).select("farm").lean()).map((p: any) => String(p.farm)));
  res.send({ farms: farms.map((f) => ({ _id: f._id, name: f.name, lat: f.lat, lng: f.lng, size: f.size, linked: linked.has(String(f._id)) })) });
});

// People who can be assigned to projects (users with a Grove role).
router.get("/people", team, async (_req: Req, res) => {
  const users: any[] = await User.find({ $or: [{ isAdmin: true }, { roles: mongoose.trusted({ $in: [...GROVE_ROLES] }) }] })
    .select("email name roles isAdmin")
    .limit(200)
    .lean();
  res.send({ people: users.map((u) => ({ _id: u._id, email: u.email, name: u.name, roles: u.roles, isAdmin: u.isAdmin })) });
});

// One-off tidy-up: make projects from Grove farms that have none yet, e.g.
// old test farms straight into "archived".
router.post("/import-farms", team, async (req: Req, res) => {
  const farmIds: string[] = Array.isArray(req.body?.farmIds) ? req.body.farmIds.filter(validId).slice(0, 500) : [];
  const cleaned = cleanProject({ type: req.body?.type ?? "client", stage: req.body?.stage ?? "prospect", status: req.body?.status ?? "active" });
  if (!farmIds.length || !cleaned.ok) {
    res.status(400).send({ error: cleaned.ok ? "Choose farms" : cleaned.errors.join("; ") });
    return;
  }
  const allowed = new Set(await groveUserIds());
  const farms: any[] = await Parcel.find({ _id: inIds(farmIds) }).select("name owner").lean();
  const already = new Set((await GroveProject.find({ farm: inIds(farmIds) }).select("farm").lean()).map((p: any) => String(p.farm)));
  const toCreate = farms
    .filter((f) => allowed.has(String(f.owner?.id)) && !already.has(String(f._id)))
    .map((f) => ({ ...cleaned.value, name: String(f.name || "Farm").slice(0, 200), farm: f._id, createdBy: req.user?._id }));
  if (toCreate.length) await GroveProject.insertMany(toCreate);
  res.send({ created: toCreate.length, skipped: farmIds.length - toCreate.length });
});

router.post("/", team, async (req: Req, res) => {
  const cleaned = cleanProject(req.body, { creating: true });
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.errors.join("; "), errors: cleaned.errors });
    return;
  }
  const problem = await checkLinks(cleaned.value);
  if (problem) {
    res.status(400).send({ error: problem });
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
  const project: any = await GroveProject.findById(req.params.id);
  if (!project) {
    res.status(404).send({ error: "Project not found" });
    return;
  }
  // Check only what changes: a farm or person that was fine when linked
  // never blocks saving later. Assignees who are no longer Grove users are
  // dropped.
  const changes: Record<string, any> = {};
  if (cleaned.value.farm && String(cleaned.value.farm) !== String(project.farm ?? "")) changes.farm = cleaned.value.farm;
  if (cleaned.value.assignees) {
    const before = new Set((project.assignees ?? []).map(String));
    changes.assignees = cleaned.value.assignees.filter((id: string) => !before.has(String(id)));
    const grove = new Set(await groveUserIds());
    cleaned.value.assignees = cleaned.value.assignees.filter((id: string) => grove.has(String(id)) || !before.has(String(id)));
  }
  const problem = await checkLinks(changes);
  if (problem) {
    res.status(400).send({ error: problem });
    return;
  }
  // client and next action: merge the keys that were sent
  const { client, nextAction, ...rest } = cleaned.value;
  project.set(rest);
  if (client) project.client = { ...(project.client?.toObject?.() ?? project.client ?? {}), ...client };
  if (nextAction) project.nextAction = { ...(project.nextAction?.toObject?.() ?? project.nextAction ?? {}), ...nextAction };
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
  if (await Deal.exists({ groveProject: req.params.id })) {
    res.status(409).send({ error: "A deal links to this project; archive it instead" });
    return;
  }
  await GroveProject.deleteOne({ _id: req.params.id });
  res.status(204).send();
});

// ---- checklists (screening) ----
// Field users can fill in checklists on projects assigned to them; the
// decision (go / no-go) is the Grove team's.

async function visibleProject(req: Req, res: express.Response) {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return null;
  }
  const project: any = await GroveProject.findOne({ _id: req.params.id, ...visibleFilter(req.user) }).select("_id name").lean();
  if (!project) {
    res.status(404).send({ error: "Project not found" });
    return null;
  }
  return project;
}

function templateFor(req: Req, res: express.Response) {
  const t = TEMPLATES[String(req.params.kind)];
  if (!t) res.status(404).send({ error: "Unknown checklist" });
  return t;
}

async function presentChecklist(projectId: unknown, kind: string) {
  const t = TEMPLATES[kind];
  const c: any = await Checklist.findOne({ project: projectId, kind }).lean();
  return {
    template: t,
    checklist: c ? { items: c.items ?? {}, sectionNotes: c.sectionNotes ?? {}, decision: c.decision ?? null, updatedAt: c.updatedAt } : { items: {}, sectionNotes: {}, decision: null },
    progress: progress(t, c),
  };
}

router.get("/:id/checklists/:kind", async (req: Req, res) => {
  const t = templateFor(req, res);
  if (!t) return;
  const project = await visibleProject(req, res);
  if (!project) return;
  res.send(await presentChecklist(project._id, t.kind));
});

router.put("/:id/checklists/:kind/items/:key", async (req: Req, res) => {
  const t = templateFor(req, res);
  if (!t) return;
  if (!itemKeys(t).has(String(req.params.key))) {
    res.status(404).send({ error: "Unknown item" });
    return;
  }
  const cleaned = cleanItem(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.error });
    return;
  }
  const project = await visibleProject(req, res);
  if (!project) return;
  // one item at a time, so two people filling in different items don't overwrite each other
  await Checklist.findOneAndUpdate(
    { project: project._id, kind: t.kind },
    { $set: { [`items.${req.params.key}`]: { ...cleaned.value, at: new Date(), by: req.user?._id }, templateVersion: t.version } },
    { upsert: true, runValidators: true },
  );
  res.send(await presentChecklist(project._id, t.kind));
});

router.put("/:id/checklists/:kind/sections/:key", async (req: Req, res) => {
  const t = templateFor(req, res);
  if (!t) return;
  if (!t.sections.some((s) => s.key === req.params.key)) {
    res.status(404).send({ error: "Unknown section" });
    return;
  }
  if (req.body?.note !== undefined && req.body.note !== null && typeof req.body.note !== "string") {
    res.status(400).send({ error: "Note must be text" });
    return;
  }
  const project = await visibleProject(req, res);
  if (!project) return;
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 3000) : "";
  await Checklist.findOneAndUpdate({ project: project._id, kind: t.kind }, { $set: { [`sectionNotes.${req.params.key}`]: note } }, { upsert: true, runValidators: true });
  res.send(await presentChecklist(project._id, t.kind));
});

router.put("/:id/checklists/:kind/decision", team, async (req: Req, res) => {
  const t = templateFor(req, res);
  if (!t) return;
  if (!t.decision) {
    res.status(400).send({ error: "This checklist has no decision" });
    return;
  }
  const cleaned = cleanDecision(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.error });
    return;
  }
  const project = await visibleProject(req, res);
  if (!project) return;
  await Checklist.findOneAndUpdate(
    { project: project._id, kind: t.kind },
    { $set: { decision: { ...cleaned.value, at: cleaned.value.result ? new Date() : null, by: cleaned.value.result ? req.user?._id : null } } },
    { upsert: true, runValidators: true },
  );
  res.send(await presentChecklist(project._id, t.kind));
});

export default router;
