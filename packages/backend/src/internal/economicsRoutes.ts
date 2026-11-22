// /internal/economics: B · Projects → Economics (22 Nov 2026). Grove team only (mounted behind
// requireRole("grove-team") in routes/internal.ts): assumptions with prices and costs, and farm plans
// on farms kept under a Grove account. Separate from offers and from public users' data.
//
//   GET  /assumptions                 the active version and the list of versions
//   POST /assumptions/import          Grove Data's assumptions/ files → a new version
//   GET  /farms                       farms kept under a Grove account, with fields and designs
//   GET  / · POST / · GET /:id · PUT /:id · DELETE /:id   economic scenarios
//   GET  /:id/result                  the cash flow (three cases), payment checks and "no data"
import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import AssumptionsVersion from "@rw/db/schemas/internal/assumptionsVersion.ts";
import EconomicScenario from "@rw/db/schemas/internal/economicScenario.ts";
import Layer from "@rw/db/schemas/layer.ts";
import Parcel from "@rw/db/schemas/parcel.ts";
import Project from "@rw/db/schemas/project.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { runSystemBasedLayout } from "@rw/modelling/layout-backends/system-layout.node.ts";
import { cropOf, economics, type FieldPlan } from "@rw/modelling/economics/cashflow.ts";
import { inIds } from "../utils/mongoSafety.ts";
import { groveUserIds } from "./groveRefs.ts";
import { designQuantities } from "./designQuantities.ts";
import { ASSUMPTION_FILES, buildAssumptions, cleanScenario, maxRowSpacing, toAssumptions } from "./economics.ts";
import { activePricebook } from "./pricebookRoutes.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 5, fields: 3, fieldSize: 2000, parts: 10 } }).fields(
  ASSUMPTION_FILES.map((name) => ({ name, maxCount: 1 })),
);

function parseUpload(req: express.Request, res: express.Response, next: express.NextFunction) {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).send({ error: `Upload refused: ${err.message}${err.field ? ` (${err.field})` : ""}` });
      return;
    }
    next(err);
  });
}

async function assumptionsDoc(version?: number | null) {
  if (Number.isInteger(version)) {
    const d = await AssumptionsVersion.findOne({ version }).lean();
    if (d) return d as any;
  }
  return (await AssumptionsVersion.findOne().sort({ version: -1 }).lean()) as any;
}

const summary = (d: any) => d && { version: d.version, importedAt: d.importedAt, note: d.note, counts: d.counts, warnings: d.warnings ?? [] };

router.get("/assumptions", async (_req: Req, res) => {
  const [active, versions]: any[] = await Promise.all([
    assumptionsDoc(),
    AssumptionsVersion.find().select("version importedAt note counts").sort({ version: -1 }).limit(50).lean(),
  ]);
  res.send({
    active: summary(active),
    versions,
    // what the page needs to fill in a scenario: payments, crops and the ranges (to show defaults)
    payments: active?.payments ?? [],
    crops: active?.crops ?? [],
    ranges: (active?.ranges ?? []).filter((r: any) => r.age === null || r.age === undefined),
    sources: active?.sources ?? [],
  });
});

router.post("/assumptions/import", parseUpload, async (req: Req, res) => {
  const uploaded = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const files = Object.fromEntries(ASSUMPTION_FILES.map((n) => [n, uploaded[n]?.[0]?.buffer.toString("utf8")]));
  const built = buildAssumptions(files);
  if (!built.ok) {
    res.status(400).send({ error: built.errors.join("; "), errors: built.errors });
    return;
  }
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : undefined;
  await AssumptionsVersion.init();
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest: any = await AssumptionsVersion.findOne().sort({ version: -1 }).select("version").lean();
    try {
      const d = built.data;
      const created = await AssumptionsVersion.create({
        version: (latest?.version ?? 0) + 1,
        importedBy: req.user?._id,
        note,
        counts: { ranges: d.ranges.length, payments: d.payments.length, fruitBerry: d.fruitBerry.length, crops: d.crops.length, sources: d.sources.length },
        warnings: built.warnings,
        ...d,
      });
      res.status(201).send(summary(created.toObject()));
      return;
    } catch (err: any) {
      if (err?.code !== 11000) throw err; // a parallel import took the number: try the next
    }
  }
  res.status(409).send({ error: "Another import ran at the same time; try again" });
});

// Farms kept under a Grove account (Grove's own and its clients'), never a public user's farm.
router.get("/farms", async (_req: Req, res) => {
  const farms: any[] = await Parcel.find({ "owner.id": inIds(await groveUserIds()) }).select("name layers").sort({ name: 1 }).limit(500).lean();
  const layerIds = farms.flatMap((f) => (f.layers ?? []).map(String)).filter(validId);
  const layers: any[] = layerIds.length ? await Layer.find({ _id: inIds(layerIds) }).select("name size projects").lean() : [];
  const projectIds = layers.flatMap((l) => (l.projects ?? []).map(String)).filter(validId);
  const projects: any[] = projectIds.length ? await Project.find({ _id: inIds(projectIds) }).select("name systemdesign").lean() : [];
  const pById = new Map(projects.map((p) => [String(p._id), p]));
  const lById = new Map(layers.map((l) => [String(l._id), l]));
  res.send({
    farms: farms.map((f) => ({
      _id: f._id,
      name: f.name,
      fields: (f.layers ?? []).map((id: any) => lById.get(String(id))).filter(Boolean).map((l: any) => ({
        _id: l._id,
        name: l.name,
        size: l.size,
        scenarios: (l.projects ?? []).map((id: any) => pById.get(String(id))).filter((p: any) => p?.systemdesign).map((p: any) => ({ _id: p._id, name: p.name })),
      })),
    })),
  });
});

/** A scenario's farm, fields and designs must belong together, on a farm kept under a Grove account. */
async function checkFarm(value: Record<string, any>, current?: any): Promise<string | null> {
  const farmId = String(value.farm ?? current?.farm ?? "");
  if (!validId(farmId)) return "Choose a farm";
  const farm: any = await Parcel.findById(farmId).select("owner layers").lean();
  if (!farm?.owner?.id || !(await groveUserIds()).includes(String(farm.owner.id))) return "Only farms kept under a Grove account can be used";
  // another farm without new fields: the old farm's fields go
  if (current && value.farm && String(value.farm) !== String(current.farm) && !value.fields) value.fields = [];
  const fields: any[] = value.fields ?? current?.fields ?? [];
  const own = new Set((farm.layers ?? []).map(String));
  for (const f of fields) {
    if (!own.has(String(f.layer))) return "A field doesn't belong to the farm";
    if (f.scenario) {
      const l: any = await Layer.findById(f.layer).select("projects").lean();
      if (!(l?.projects ?? []).map(String).includes(String(f.scenario))) return "A design doesn't belong to its field";
    }
  }
  return null;
}

router.get("/", async (_req: Req, res) => {
  const list: any[] = await EconomicScenario.find().select("name farm fields updatedAt assumptionsVersion").populate("farm", "name").sort({ updatedAt: -1 }).limit(300).lean();
  res.send({ scenarios: list.map((s) => ({ _id: s._id, name: s.name, farm: s.farm ? { _id: s.farm._id, name: s.farm.name } : null, fields: s.fields?.length ?? 0, updatedAt: s.updatedAt, assumptionsVersion: s.assumptionsVersion })) });
});

router.post("/", async (req: Req, res) => {
  const c = cleanScenario({ name: "New economic scenario", ...req.body });
  if (!c.ok) {
    res.status(400).send({ error: c.error });
    return;
  }
  const bad = await checkFarm(c.value);
  if (bad) {
    res.status(400).send({ error: bad });
    return;
  }
  const latest: any = await AssumptionsVersion.findOne().sort({ version: -1 }).select("version").lean();
  const created = await EconomicScenario.create({ assumptionsVersion: latest?.version ?? null, ...c.value, createdBy: req.user?._id, updatedBy: req.user?._id });
  res.status(201).send({ scenario: created.toObject() });
});

router.get("/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const s = await EconomicScenario.findById(req.params.id).lean();
  if (!s) {
    res.status(404).send({ error: "Not found" });
    return;
  }
  res.send({ scenario: s });
});

router.put("/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const current: any = await EconomicScenario.findById(req.params.id).lean();
  if (!current) {
    res.status(404).send({ error: "Not found" });
    return;
  }
  const c = cleanScenario(req.body);
  if (!c.ok) {
    res.status(400).send({ error: c.error });
    return;
  }
  // the assumptions version is changed on purpose only (a newer version can change the result)
  if (req.body?.assumptionsVersion !== undefined) {
    const v = Number(req.body.assumptionsVersion);
    if (!Number.isInteger(v) || !(await AssumptionsVersion.exists({ version: v }))) {
      res.status(400).send({ error: "No such assumptions version" });
      return;
    }
    c.value.assumptionsVersion = v;
  }
  if (c.value.farm !== undefined || c.value.fields !== undefined) {
    const bad = await checkFarm(c.value, current);
    if (bad) {
      res.status(400).send({ error: bad });
      return;
    }
  }
  const updated = await EconomicScenario.findByIdAndUpdate(req.params.id, { $set: { ...c.value, updatedBy: req.user?._id } }, { new: true, runValidators: true }).lean();
  res.send({ scenario: updated });
});

router.delete("/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  await EconomicScenario.deleteOne({ _id: req.params.id });
  res.send({ ok: true });
});

/** The plan per field from each chosen design's generated layout (as the offer and screening do). */
async function fieldPlans(s: any): Promise<{ plans: FieldPlan[]; problems: string[] }> {
  const plans: FieldPlan[] = [];
  const problems: string[] = [];
  const farm: any = await Parcel.findById(s.farm).select("owner layers").lean();
  if (!farm?.owner?.id || !(await groveUserIds()).includes(String(farm.owner.id))) return { plans, problems: ["The farm isn't kept under a Grove account"] };
  const own = new Set((farm.layers ?? []).map(String));
  for (const f of s.fields ?? []) {
    if (!own.has(String(f.layer))) continue;
    const layer: any = await Layer.findById(f.layer).select("name geometry projects").lean();
    if (!layer) continue;
    if (!f.scenario) {
      problems.push(`${layer.name}: no design chosen`);
      continue;
    }
    if (!(layer.projects ?? []).map(String).includes(String(f.scenario))) {
      problems.push(`${layer.name}: the design no longer belongs to the field`);
      continue;
    }
    const p: any = await Project.findById(f.scenario).select("name systemdesign").populate({ path: "systemdesign", populate: { path: "rows.sequence.species", select: "genus species nameCommon" } }).lean();
    if (!p?.systemdesign || !layer.geometry) {
      problems.push(`${layer.name}: the design or the field outline is missing`);
      continue;
    }
    try {
      const layout: any = await runSystemBasedLayout(p.systemdesign, layer.geometry);
      const q = designQuantities(layout, layer.geometry);
      const species = new Map<string, any>();
      for (const row of p.systemdesign.rows ?? []) for (const e of row.sequence ?? []) if (e.species?._id) species.set(String(e.species._id), e.species);
      const counts = new Map<string, { crop_id: string | null; label: string; count: number }>();
      for (const pc of layout.plantCountArray ?? []) {
        const sp = species.get(String(pc.species));
        const crop = cropOf(sp);
        const label = sp?.nameCommon || [sp?.genus, sp?.species].filter(Boolean).join(" ") || "unknown species";
        const key = crop ?? `?${label}`;
        const x = counts.get(key) ?? { crop_id: crop, label, count: 0 };
        x.count += pc.count || 0;
        counts.set(key, x);
      }
      plans.push({
        fieldId: String(layer._id),
        name: `${layer.name} · ${p.name}`,
        fieldHa: q.fieldHa,
        treeHa: q.treeHa,
        maxRowSpacingM: maxRowSpacing(p.systemdesign),
        plants: [...counts.values()],
        plantingYear: f.plantingYear ?? new Date().getFullYear() + 1,
      });
    } catch (err) {
      console.error("[economics] layout failed for scenario %s: %s", String(f.scenario), (err as Error).message);
      problems.push(`${layer.name}: the layout couldn't be generated`);
    }
  }
  return { plans, problems };
}

router.get("/:id/result", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const s: any = await EconomicScenario.findById(req.params.id).lean();
  if (!s) {
    res.status(404).send({ error: "Not found" });
    return;
  }
  const doc = await assumptionsDoc(s.assumptionsVersion);
  if (!doc) {
    res.status(409).send({ error: "No assumptions imported yet: import Grove Data's assumptions files first (Economics → Assumptions)." });
    return;
  }
  const pricebook: any = await activePricebook().catch(() => null);
  const a = toAssumptions(doc, pricebook?.settings?.eurDkk);
  const { plans, problems } = await fieldPlans(s);
  const result = economics(a, plans, {
    horizonYears: s.horizonYears ?? 30,
    discountRate: s.discountRate ?? null,
    crops: s.crops ?? [],
    establishment: s.establishment ?? {},
    management: s.management ?? {},
    baseline: { opportunityPerHa: s.baseline?.opportunityPerHa?.likely !== undefined ? s.baseline.opportunityPerHa : null, organic: !!s.baseline?.organic, paymentsToday: s.baseline?.paymentsToday ?? [], paymentsWithTrees: s.baseline?.paymentsWithTrees ?? null },
  });
  res.send({
    ...result,
    fields: plans.map((p) => ({ fieldId: p.fieldId, name: p.name, fieldHa: p.fieldHa, treeHa: p.treeHa, maxRowSpacingM: p.maxRowSpacingM, plants: p.plants })),
    problems,
    assumptions: summary(doc),
    usingLatest: doc.version === (await AssumptionsVersion.findOne().sort({ version: -1 }).select("version").lean() as any)?.version,
  });
});

export default router;
