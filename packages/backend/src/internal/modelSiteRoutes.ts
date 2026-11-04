// /internal/model-sites: sites for Grove's landscape model, queued as points and traced
// on the map (outline from the field map or drawn), then read by grove-data's jobs.
// Grove team only (mounted behind requireRole("grove-team") in routes/internal.ts).
import express from "express";
import mongoose from "mongoose";
import ModelSite from "@rw/db/schemas/internal/modelSite.ts";
import { inIds } from "../utils/mongoSafety.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { cleanBatchRename, cleanImport, cleanQueue, cleanSiteUpdate, toFeatureCollection } from "./modelSites.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
// outlines from several field-map fields can pass the app-wide 100 kB body limit; an import file more so
router.use("/import", express.json({ limit: "10mb" }));
router.use(express.json({ limit: "1mb" }));
const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);
const LIST_FIELDS = "name batch status source sourceRef lon lat geometry fieldIds system species rowBearingDeg alleyWidthM inRowSpacingM plantedYear notes updatedAt";

router.get("/", async (req: Req, res) => {
  const q: Record<string, unknown> = {};
  if (typeof req.query.batch === "string" && req.query.batch) q.batch = req.query.batch.slice(0, 80);
  const sites = await ModelSite.find(q).select(LIST_FIELDS).sort({ batch: 1, createdAt: 1, _id: 1 }).limit(5000).lean();
  const batches = await ModelSite.distinct("batch");
  res.send({ sites, batches });
});

router.get("/export.geojson", async (_req: Req, res) => {
  const sites = await ModelSite.find({ status: "traced" }).select(LIST_FIELDS).sort({ _id: 1 }).limit(5000).lean();
  res.type("application/geo+json").send(toFeatureCollection(sites));
});

// add points to the queue; a point within ~30 m of one already in the same batch is skipped
router.post("/queue", async (req: Req, res) => {
  const cleaned = cleanQueue(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.error });
    return;
  }
  const { batch, items, skipped } = cleaned.value;
  const existing: any[] = await ModelSite.find({ batch }).select("lon lat").lean();
  const near = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
    Math.abs(a.lat - b.lat) < 0.0003 && Math.abs(a.lon - b.lon) < 0.0005;
  const fresh = items.filter((it, i) => !existing.some((e) => near(e, it)) && !items.slice(0, i).some((o) => near(o, it)));
  const created = fresh.length
    ? await ModelSite.insertMany(fresh.map((it) => ({ ...it, batch, status: "queued", createdBy: req.user?._id, updatedBy: req.user?._id })))
    : [];
  res.send({ added: created.length, duplicates: items.length - fresh.length, skipped });
});

// import traced sites from a GeoJSON file (e.g. another GroveWorks's export or grove-data's
// model_sites.geojson). A site already imported (same sourceRef) or within ~30 m of one in the
// same batch is skipped, so importing the same file twice adds nothing.
router.post("/import", async (req: Req, res) => {
  const cleaned = cleanImport(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.error });
    return;
  }
  const { items, skipped } = cleaned.value;
  const refs = items.map((it) => it.sourceRef).filter((r): r is string => !!r);
  const batches = [...new Set(items.map((it) => it.batch))];
  const existing: any[] = [
    ...(refs.length ? await ModelSite.find({ sourceRef: inIds(refs) }).select("batch lon lat sourceRef").lean() : []),
    ...(await ModelSite.find({ batch: inIds(batches) }).select("batch lon lat sourceRef").lean()),
  ];
  const seenRefs = new Set(existing.map((e) => e.sourceRef).filter(Boolean));
  const near = (a: { lon: number; lat: number; batch: string }, b: { lon: number; lat: number; batch: string }) =>
    a.batch === b.batch && Math.abs(a.lat - b.lat) < 0.0003 && Math.abs(a.lon - b.lon) < 0.0005;
  const fresh = items.filter((it, i) => !(it.sourceRef && seenRefs.has(it.sourceRef)) && !existing.some((e) => near(e, it)) && !items.slice(0, i).some((o) => near(o, it)));
  const created = fresh.length
    ? await ModelSite.insertMany(fresh.map((it) => ({ ...it, createdBy: req.user?._id, updatedBy: req.user?._id })))
    : [];
  res.send({ added: created.length, duplicates: items.length - fresh.length, skipped });
});

// rename a batch (all its sites); joining an existing batch is allowed
router.post("/rename-batch", async (req: Req, res) => {
  const cleaned = cleanBatchRename(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.error });
    return;
  }
  const { from, to } = cleaned.value;
  const r = await ModelSite.updateMany({ batch: from }, { $set: { batch: to, updatedBy: req.user?._id } });
  res.send({ renamed: r.modifiedCount ?? 0, batch: to });
});

router.put("/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Unknown site" });
    return;
  }
  const cleaned = cleanSiteUpdate(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.error });
    return;
  }
  const { geometry, ...rest } = cleaned.value;
  const update: Record<string, unknown> = { $set: { ...rest, updatedBy: req.user?._id } };
  if (geometry === null) (update as any).$unset = { geometry: 1 };
  else if (geometry) (update.$set as any).geometry = geometry;
  const site = await ModelSite.findByIdAndUpdate(req.params.id, update, { new: true }).select(LIST_FIELDS).lean();
  if (!site) {
    res.status(404).send({ error: "Unknown site" });
    return;
  }
  res.send({ site });
});

router.delete("/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Unknown site" });
    return;
  }
  await ModelSite.deleteOne({ _id: req.params.id });
  res.status(204).end();
});

export default router;
