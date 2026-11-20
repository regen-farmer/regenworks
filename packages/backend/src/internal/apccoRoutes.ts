// /internal/apcco: section D, APCCO Uganda. Sites, field-data imports, parameter sets and model
// runs (SHAMBA now). Grove team only (requireRole("grove-team") in routes/internal.ts).
import express from "express";
import mongoose from "mongoose";
import { APCCO_MODELS, ApccoDataset, ApccoParameterSet, ApccoRun, ApccoSite, COFFEE_TYPES, DATA_KINDS, PARAM_STATUSES, type DataKind } from "@rw/db/schemas/internal/apcco.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { inIds } from "../utils/mongoSafety.ts";
import { cleanGeometry } from "./modelSites.ts";
import {
  BUILT_IN_SETS,
  RUN_LIMITS,
  SHAMBA_TABLES,
  TEMPLATES,
  boundaryAreaHa,
  buildShambaRequest,
  checkShambaTreeTable,
  cleanShambaScenario,
  draftShambaScenario,
  inputHash,
  parameterLabel,
  parseImport,
  readiness,
  runnerConfig,
  shambaTreeRowNames,
  siteSummary,
  tableFromCsv,
  templateCsv,
  type SiteData,
} from "./apcco.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
router.use(express.json({ limit: "6mb" }));

const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);
const isKind = (k: unknown): k is DataKind => typeof k === "string" && (DATA_KINDS as readonly string[]).includes(k);
const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const userId = (req: Req) => (req.user as any)?._id;
// operators that survive mongoose's global sanitizeFilter (values are built here, never from the request)
const notTrue = () => mongoose.trusted({ $ne: true });
const since = (d: Date) => mongoose.trusted({ $gte: d });

// ---------- sites ----------

function cleanSite(input: any, partial = false): { ok: true; value: any } | { ok: false; error: string } {
  const b = input && typeof input === "object" ? input : {};
  const v: any = {};
  if (!partial || "name" in b) {
    v.name = str(b?.name, 200);
    if (!v.name) return { ok: false, error: "Name missing" };
  }
  if (!partial || "lat" in b || "lon" in b) {
    const lat = Number(b?.lat);
    const lon = Number(b?.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) return { ok: false, error: "Latitude and longitude missing or out of range" };
    v.lat = lat;
    v.lon = lon;
  }
  if ("district" in (b ?? {})) v.district = str(b.district, 200);
  if ("notes" in (b ?? {})) v.notes = str(b.notes, 5000);
  if ("coffeeType" in (b ?? {})) {
    if (!(COFFEE_TYPES as readonly string[]).includes(b.coffeeType)) return { ok: false, error: "Coffee type must be robusta or arabica" };
    v.coffeeType = b.coffeeType;
  }
  if ("areaHa" in (b ?? {})) {
    if (b.areaHa === null || b.areaHa === "") v.areaHa = null;
    else {
      const a = Number(b.areaHa);
      if (!Number.isFinite(a) || a <= 0 || a > 100_000) return { ok: false, error: "Area must be a positive number of hectares" };
      v.areaHa = a;
    }
  }
  if ("boundary" in (b ?? {})) {
    if (b.boundary === null) v.boundary = null;
    else {
      const g = b.boundary?.type === "Feature" ? b.boundary.geometry : b.boundary?.type === "FeatureCollection" ? b.boundary.features?.[0]?.geometry : b.boundary;
      const clean = cleanGeometry(g);
      if (!clean) return { ok: false, error: "The boundary must be a GeoJSON Polygon or MultiPolygon in longitude/latitude" };
      v.boundary = clean;
      v.areaHa = boundaryAreaHa(clean);
      if (!v.areaHa || v.areaHa > 100_000) return { ok: false, error: "The boundary's area must be between 0 and 100,000 ha" };
    }
  }
  if ("archived" in (b ?? {})) v.archived = b.archived === true;
  return { ok: true, value: v };
}

/**
 * A run still "running" well past the timeout was cut off (e.g. the server restarted during the
 * call): mark it failed, so it neither shows as running forever nor blocks the limits.
 */
async function sweepStaleRuns() {
  const cutoff = new Date(Date.now() - RUN_LIMITS.timeoutMs - 60_000);
  await ApccoRun.updateMany(
    { status: "running", createdAt: mongoose.trusted({ $lt: cutoff }) },
    { $set: { status: "failed", error: "Interrupted: no answer from the model service (the server may have restarted during the run)", finishedAt: new Date() } },
  );
}

async function loadData(siteId: string): Promise<SiteData> {
  const sets: any[] = await ApccoDataset.find({ site: siteId }).select("kind rows").lean();
  return Object.fromEntries(sets.map((d) => [d.kind, d.rows]));
}

router.get("/sites", async (req: Req, res) => {
  const archived = req.query.archived === "1";
  const sites: any[] = await ApccoSite.find({ archived: archived ? true : notTrue() }).select("name district lat lon areaHa coffeeType archived updatedAt").sort({ name: 1 }).lean();
  const counts: any[] = await ApccoRun.aggregate([{ $match: { site: inIds(sites.map((s) => s._id)) } }, { $group: { _id: "$site", runs: { $sum: 1 } } }]);
  const kinds: any[] = await ApccoDataset.aggregate([{ $match: { site: inIds(sites.map((s) => s._id)) } }, { $group: { _id: "$site", kinds: { $push: "$kind" } } }]);
  res.send({
    sites: sites.map((s) => ({
      ...s,
      runs: counts.find((c) => String(c._id) === String(s._id))?.runs ?? 0,
      data: kinds.find((k) => String(k._id) === String(s._id))?.kinds ?? [],
    })),
  });
});

router.post("/sites", async (req: Req, res) => {
  const c = cleanSite(req.body);
  if (!c.ok) {
    res.status(400).send({ error: c.error });
    return;
  }
  const site = await ApccoSite.create({ coffeeType: "robusta", ...c.value, createdBy: userId(req) });
  res.status(201).send({ site });
});

router.get("/sites/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const site: any = await ApccoSite.findById(req.params.id).lean();
  if (!site) {
    res.status(404).send({ error: "Site not found" });
    return;
  }
  const datasets: any[] = await ApccoDataset.find({ site: site._id }).select("kind filename source warnings updatedAt rows").lean();
  const data = Object.fromEntries(datasets.map((d) => [d.kind, d.rows]));
  res.send({
    site,
    datasets: datasets.map((d) => ({ kind: d.kind, filename: d.filename, source: d.source, warnings: d.warnings, rows: d.rows.length, updatedAt: d.updatedAt })),
    readiness: readiness(site, data),
    runnerConfigured: { shamba: !!runnerConfig("shamba"), dynacof: false, caf2021: false },
  });
});

router.put("/sites/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const c = cleanSite(req.body, true);
  if (!c.ok) {
    res.status(400).send({ error: c.error });
    return;
  }
  const site = await ApccoSite.findByIdAndUpdate(req.params.id, { $set: c.value }, { new: true, runValidators: true }).lean();
  if (!site) {
    res.status(404).send({ error: "Site not found" });
    return;
  }
  res.send({ site });
});

// a site with runs is archived, never deleted: the runs refer to it
router.delete("/sites/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  if (await ApccoRun.exists({ site: req.params.id })) {
    res.status(409).send({ error: "This site has model runs; archive it instead" });
    return;
  }
  const gone = await ApccoSite.findByIdAndDelete(req.params.id);
  if (!gone) {
    res.status(404).send({ error: "Site not found" });
    return;
  }
  await ApccoDataset.deleteMany({ site: req.params.id });
  res.send({ ok: true });
});

// ---------- field data ----------

router.get("/templates", (_req, res) => {
  res.send({
    templates: Object.fromEntries(
      Object.entries(TEMPLATES).map(([k, t]) => [k, { title: t.title, help: t.help, maxRows: t.maxRows, columns: t.columns.map(({ name, type, required, min, max, help }) => ({ name, type, required: !!required, min, max, help })) }]),
    ),
  });
});

router.get("/templates/:kind.csv", (req, res) => {
  if (!isKind(req.params.kind)) {
    res.status(404).send({ error: "Unknown data kind" });
    return;
  }
  res.type("text/csv").attachment(`apcco-${req.params.kind}-template.csv`).send(templateCsv(req.params.kind));
});

router.get("/sites/:id/data/:kind", async (req: Req, res) => {
  if (!validId(req.params.id) || !isKind(req.params.kind)) {
    res.status(400).send({ error: "Invalid id or kind" });
    return;
  }
  const d: any = await ApccoDataset.findOne({ site: req.params.id, kind: req.params.kind }).lean();
  res.send({ dataset: d ?? null });
});

// import a CSV: { csv, filename?, source? }; replaces the site's data of that kind
router.post("/sites/:id/data/:kind", async (req: Req, res) => {
  if (!validId(req.params.id) || !isKind(req.params.kind)) {
    res.status(400).send({ error: "Invalid id or kind" });
    return;
  }
  if (!(await ApccoSite.exists({ _id: req.params.id }))) {
    res.status(404).send({ error: "Site not found" });
    return;
  }
  if (typeof req.body?.csv !== "string") {
    res.status(400).send({ error: "CSV text missing" });
    return;
  }
  const r = parseImport(req.params.kind, req.body.csv);
  if (!r.ok) {
    res.status(400).send({ error: "The file wasn't imported", errors: r.errors });
    return;
  }
  const d = await ApccoDataset.findOneAndUpdate(
    { site: req.params.id, kind: req.params.kind },
    { $set: { rows: r.rows, filename: str(req.body.filename, 300), source: str(req.body.source, 200), warnings: r.warnings, importedBy: userId(req) } },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  res.send({ rows: r.rows.length, warnings: r.warnings, updatedAt: (d as any)?.updatedAt });
});

router.delete("/sites/:id/data/:kind", async (req: Req, res) => {
  if (!validId(req.params.id) || !isKind(req.params.kind)) {
    res.status(400).send({ error: "Invalid id or kind" });
    return;
  }
  await ApccoDataset.deleteOne({ site: req.params.id, kind: req.params.kind });
  res.send({ ok: true });
});

// ---------- parameter sets ----------

async function ensureBuiltIns() {
  for (const b of BUILT_IN_SETS) {
    try {
      await ApccoParameterSet.updateOne({ model: b.model, builtIn: true }, { $setOnInsert: { ...b, builtIn: true } }, { upsert: true });
    } catch (err: any) {
      if (err?.code !== 11000) throw err; // two first visits at once: the other one created it
    }
  }
}

const setView = (p: any) => ({ ...p, label: parameterLabel(p) });

router.get("/parameter-sets", async (req: Req, res) => {
  await ensureBuiltIns();
  const q: any = { archived: notTrue() };
  if (typeof req.query.model === "string" && (APCCO_MODELS as readonly string[]).includes(req.query.model)) q.model = req.query.model;
  const sets: any[] = await ApccoParameterSet.find(q).sort({ model: 1, builtIn: -1, name: 1, version: 1 }).lean();
  // sets are frozen by successful runs only (a failed run used nothing from the set's results)
  const used: any[] = await ApccoRun.aggregate([{ $match: { status: "done" } }, { $group: { _id: "$parameterSet", runs: { $sum: 1 } } }]);
  res.send({ sets: sets.map((s) => ({ ...setView(s), runs: used.find((u) => String(u._id) === String(s._id))?.runs ?? 0 })) });
});

function cleanParamSet(b: any): { ok: true; value: any } | { ok: false; error: string } {
  if (!(APCCO_MODELS as readonly string[]).includes(b?.model)) return { ok: false, error: "Unknown model" };
  if (!(PARAM_STATUSES as readonly string[]).includes(b?.status) || b.status === "original") return { ok: false, error: "Status must be literature or calibrated (the original sets are built in)" };
  const name = str(b.name, 120);
  const version = str(b.version, 20) || "v1";
  if (!name) return { ok: false, error: "Name missing" };
  const dataset = str(b.dataset, 120);
  if (b.status === "calibrated" && !dataset) return { ok: false, error: "Name the dataset a calibrated set was fitted to" };
  if (b.coffeeType && !(COFFEE_TYPES as readonly string[]).includes(b.coffeeType)) return { ok: false, error: "Coffee type must be robusta or arabica" };
  const values: any = {};
  if (b.model === "shamba") {
    const tables: any = {};
    for (const key of SHAMBA_TABLES) {
      const text = b.tables?.[key];
      if (typeof text !== "string" || !text.trim()) continue;
      const t = tableFromCsv(text);
      if (typeof t === "string") return { ok: false, error: `${key} table: ${t}` };
      if (key === "tree") {
        const problem = checkShambaTreeTable(t);
        if (problem) return { ok: false, error: problem };
      }
      tables[key] = t;
    }
    values.tables = tables;
  }
  return { ok: true, value: { model: b.model, name, status: b.status, version, dataset: dataset || undefined, coffeeType: b.coffeeType || undefined, source: str(b.source, 2000), notes: str(b.notes, 5000), values } };
}

router.post("/parameter-sets", async (req: Req, res) => {
  const c = cleanParamSet(req.body);
  if (!c.ok) {
    res.status(400).send({ error: c.error });
    return;
  }
  try {
    const set = await ApccoParameterSet.create({ ...c.value, createdBy: userId(req) });
    res.status(201).send({ set: setView(set.toObject()) });
  } catch (err: any) {
    if (err?.code === 11000) res.status(409).send({ error: "A set with this name, status, dataset and version already exists; give it a new version" });
    else throw err;
  }
});

// a set that has been used in runs is frozen (runs must stay reproducible): make a new version instead
router.put("/parameter-sets/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const set: any = await ApccoParameterSet.findById(req.params.id).lean();
  if (!set) {
    res.status(404).send({ error: "Parameter set not found" });
    return;
  }
  if (set.builtIn) {
    res.status(409).send({ error: "Built-in sets can't be changed" });
    return;
  }
  if (req.body?.archived === true || req.body?.archived === false) {
    await ApccoParameterSet.updateOne({ _id: set._id }, { $set: { archived: req.body.archived } });
    res.send({ ok: true });
    return;
  }
  if (await ApccoRun.exists({ parameterSet: set._id, status: "done" })) {
    res.status(409).send({ error: "This set has been used in runs; save the changes as a new version" });
    return;
  }
  const c = cleanParamSet({ ...req.body, model: set.model });
  if (!c.ok) {
    res.status(400).send({ error: c.error });
    return;
  }
  try {
    const updated = await ApccoParameterSet.findByIdAndUpdate(set._id, { $set: c.value }, { new: true, runValidators: true }).lean();
    res.send({ set: setView(updated) });
  } catch (err: any) {
    if (err?.code === 11000) res.status(409).send({ error: "A set with this name, status, dataset and version already exists" });
    else throw err;
  }
});

router.delete("/parameter-sets/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const set: any = await ApccoParameterSet.findById(req.params.id).lean();
  if (!set) {
    res.status(404).send({ error: "Parameter set not found" });
    return;
  }
  if (set.builtIn || (await ApccoRun.exists({ parameterSet: set._id }))) {
    res.status(409).send({ error: set.builtIn ? "Built-in sets can't be deleted" : "Used in runs; archive it instead" });
    return;
  }
  await ApccoParameterSet.deleteOne({ _id: set._id });
  res.send({ ok: true });
});

// ---------- SHAMBA ----------

router.get("/sites/:id/shamba/draft", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const site: any = await ApccoSite.findById(req.params.id).lean();
  if (!site) {
    res.status(404).send({ error: "Site not found" });
    return;
  }
  const summary = siteSummary(site, await loadData(site._id));
  res.send({ ...draftShambaScenario(summary), summary, defaultTreeRows: shambaTreeRowNames(undefined) });
});

router.get("/sites/:id/runs", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  await sweepStaleRuns();
  const runs: any[] = await ApccoRun.find({ site: req.params.id })
    .select("model parameterLabel status error createdAt finishedAt inputSha256 outputs.totals outputs.years scenario.years scenario.baseline")
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("createdBy", "email")
    .lean();
  res.send({ runs });
});

router.get("/runs/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const run: any = await ApccoRun.findById(req.params.id).populate("createdBy", "email").lean();
  if (!run) {
    res.status(404).send({ error: "Run not found" });
    return;
  }
  res.send({ run });
});

/** Call the runner. Returns the parsed body, or throws with the runner's error detail. */
async function callRunner(model: string, request: unknown) {
  const cfg = runnerConfig(model)!;
  const res = await fetch(`${cfg.url}/processes/${model}/execution`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(RUN_LIMITS.timeoutMs),
    redirect: "error",
  });
  if (Number(res.headers.get("content-length") ?? 0) > RUN_LIMITS.maxResponseBytes) throw new Error("The model's answer was too large");
  const text = await res.text();
  if (Buffer.byteLength(text) > RUN_LIMITS.maxResponseBytes) throw new Error("The model's answer was too large");
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`The model service answered ${res.status} without JSON`);
  }
  if (!res.ok) throw new Error(body?.detail || body?.title || `The model service answered ${res.status}`);
  if (!body?.outputs || !body?.run) throw new Error("The model's answer has no outputs");
  return body;
}

// run SHAMBA: { parameterSetId, scenario }
router.post("/sites/:id/runs/shamba", async (req: Req, res) => {
  if (!validId(req.params.id) || !validId(req.body?.parameterSetId)) {
    res.status(400).send({ error: "Invalid site or parameter set" });
    return;
  }
  if (!runnerConfig("shamba")) {
    res.status(503).send({ error: "The SHAMBA service isn't set up yet (MODEL_SHAMBA_URL and MODEL_SHAMBA_TOKEN on the backend)." });
    return;
  }
  const [site, set]: any[] = await Promise.all([ApccoSite.findById(req.params.id).lean(), ApccoParameterSet.findOne({ _id: req.body.parameterSetId, model: "shamba", archived: notTrue() }).lean()]);
  if (!site || !set) {
    res.status(404).send({ error: site ? "Parameter set not found" : "Site not found" });
    return;
  }
  const sc = cleanShambaScenario(req.body.scenario);
  if (!sc.ok) {
    res.status(400).send({ error: sc.error });
    return;
  }
  const summary = siteSummary(site, await loadData(site._id));
  if (!summary.climate.climate) {
    res.status(400).send({ error: summary.climate.problem });
    return;
  }
  if (summary.soil.socTcHa0to30 === null || summary.soil.clayPct === null) {
    res.status(400).send({ error: "Soil carbon 0–30 cm and clay are needed: import soil samples" });
    return;
  }

  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  if ((await ApccoRun.countDocuments({ createdBy: userId(req), createdAt: since(dayAgo) })) >= RUN_LIMITS.perUserPerDay) {
    res.status(429).send({ error: `At most ${RUN_LIMITS.perUserPerDay} runs per person per day` });
    return;
  }
  await sweepStaleRuns();
  const stale = new Date(Date.now() - RUN_LIMITS.timeoutMs - 60_000);
  if ((await ApccoRun.countDocuments({ status: "running", createdAt: since(stale) })) >= RUN_LIMITS.concurrent) {
    res.status(429).send({ error: "Other model runs are going; try again in a minute" });
    return;
  }

  const request = buildShambaRequest(site, summary.climate.climate, { socTcHa: summary.soil.socTcHa0to30, clayPct: summary.soil.clayPct }, sc.value, set.values?.tables);
  const run: any = await ApccoRun.create({
    site: site._id,
    model: "shamba",
    parameterSet: set._id,
    parameterLabel: parameterLabel(set),
    scenario: sc.value,
    request,
    inputSha256: inputHash(request),
    status: "running",
    createdBy: userId(req),
  });
  try {
    const body = await callRunner("shamba", request);
    await ApccoRun.updateOne({ _id: run._id }, { $set: { status: "done", outputs: body.outputs, provenance: body.run, finishedAt: new Date() } });
  } catch (err) {
    await ApccoRun.updateOne({ _id: run._id }, { $set: { status: "failed", error: String((err as Error).message).slice(0, 5000), finishedAt: new Date() } });
  }
  const done: any = await ApccoRun.findById(run._id).lean();
  res.status(done.status === "done" ? 201 : 502).send({ run: done });
});

export default router;
