// A · Clients & deals: /internal/funnels, /internal/deals, /internal/clients.
// Mounted behind grove-team in routes/internal.ts (money and client contacts).
import express from "express";
import Funnel from "@rw/db/schemas/internal/funnel.ts";
import Client from "@rw/db/schemas/internal/client.ts";
import Deal from "@rw/db/schemas/internal/deal.ts";
import GroveProject from "@rw/db/schemas/internal/groveProject.ts";
import Offer from "@rw/db/schemas/internal/offer.ts";
import Parcel from "@rw/db/schemas/parcel.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { inIds } from "../utils/mongoSafety.ts";
import { offerTotals } from "./offers.ts";
import { farmIsGroves, groveUserIds } from "./groveRefs.ts";
import GroveSetting from "@rw/db/schemas/internal/groveSetting.ts";
import { cleanFunnel, cleanSources, dealReport, DEFAULT_SOURCES, FUNNEL_TEMPLATES, keyFrom, stageSince } from "./funnels.ts";
import {
  DEFAULT_FUNNELS,
  cleanClient,
  cleanDeal,
  dealPlaceForProject,
  firstOpenStage,
  firstStageOfKind,
  isId,
  moveDeal,
  reorder,
  sameClient,
  searchPattern,
  stageOf,
} from "./deals.ts";

type Req = express.Request & { user?: UserDocument };
const bad = (res: express.Response, error: string, status = 400) => res.status(status).send({ error });

/** The funnels, created from DEFAULT_FUNNELS the first time anyone asks. */
export async function ensureFunnels() {
  if ((await Funnel.estimatedDocumentCount()) > 0) return;
  try {
    await Funnel.insertMany(DEFAULT_FUNNELS.map((f) => ({ ...f, stages: f.stages.map((s) => ({ ...s })) })), { ordered: false });
  } catch (err: any) {
    // two requests at once: the unique key keeps one copy of each funnel
    if (err?.code !== 11000 && !err?.writeErrors?.every?.((e: any) => e.code === 11000)) throw err;
  }
}

/** A funnel by id; archived funnels only when reading. */
async function loadFunnel(id: unknown, { forWrite = false } = {}) {
  if (!isId(id)) return null;
  const f: any = await Funnel.findById(id).lean();
  if (!f || (forWrite && f.archived)) return null;
  return f;
}

/** Owner must be Grove staff; a farm must be kept under a Grove account; refs must exist. */
async function checkDealLinks(v: Record<string, any>): Promise<string | null> {
  if (v.client && !(await Client.exists({ _id: v.client }))) return "Client not found";
  if (v.owner && !(await groveUserIds()).includes(String(v.owner))) return "Owner must be a Grove team member";
  if (v.farm && !(await farmIsGroves(String(v.farm)))) return "Farm not found among Grove's farms";
  if (v.groveProject && !(await GroveProject.exists({ _id: v.groveProject }))) return "Project not found";
  return null;
}

/** Client name, farm name and offer totals for a list of deals. */
async function present(deals: any[]) {
  const ids = (k: string) => [...new Set(deals.map((d) => d[k]).filter(Boolean).map(String))].filter(isId);
  const [clients, farms, offers] = await Promise.all([
    ids("client").length ? Client.find({ _id: inIds(ids("client")) }).select("name kind").lean() : [],
    ids("farm").length ? Parcel.find({ _id: inIds(ids("farm")) }).select("name").lean() : [],
    deals.length ? Offer.find({ deal: inIds(deals.map((d) => String(d._id))) }).select("deal status lines.qty lines.unitPrice lines.discountPct discountPct").lean() : [],
  ]);
  const clientBy = new Map((clients as any[]).map((c) => [String(c._id), { _id: c._id, name: c.name, kind: c.kind }]));
  const farmBy = new Map((farms as any[]).map((f) => [String(f._id), { _id: f._id, name: f.name }]));
  const offersBy = new Map<string, { count: number; net: number; accepted: number }>();
  for (const o of offers as any[]) {
    const k = String(o.deal);
    const v = offersBy.get(k) ?? { count: 0, net: 0, accepted: 0 };
    const net = offerTotals(o).net;
    v.count += 1;
    if (o.status === "sent" || o.status === "accepted") v.net += net;
    if (o.status === "accepted") v.accepted += net;
    offersBy.set(k, v);
  }
  return deals.map((d) => ({
    ...d,
    stageSince: stageSince(d),
    history: undefined,
    client: d.client ? clientBy.get(String(d.client)) ?? { _id: d.client } : null,
    farm: d.farm ? farmBy.get(String(d.farm)) ?? { _id: d.farm } : null,
    offers: offersBy.get(String(d._id)) ?? { count: 0, net: 0, accepted: 0 },
  }));
}

/** Put `dealId` in front of `beforeId` within its stage and renumber the stage. */
async function placeInStage(dealId: string, funnel: unknown, stage: string, beforeId?: unknown) {
  const inStage: any[] = await Deal.find({ funnel, stage, archived: false }).select("_id position").sort({ position: 1, _id: 1 }).lean();
  const order = reorder(
    inStage.map((d) => String(d._id)),
    dealId,
    isId(beforeId) ? beforeId : null,
  );
  await Deal.bulkWrite(order.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { position: (i + 1) * 1000 } } } })));
}

async function nextPosition(funnel: unknown, stage: string) {
  const last: any = await Deal.findOne({ funnel, stage, archived: false }).sort({ position: -1 }).select("position").lean();
  return (last?.position ?? 0) + 1000;
}

// ---------- funnels ----------
export const funnelRouter = express.Router();

// ?editor=1: archived funnels too, and how many deals sit in each stage
funnelRouter.get("/", async (req: Req, res) => {
  await ensureFunnels();
  const editor = req.query.editor === "1";
  const funnels: any[] = await Funnel.find(editor ? {} : { archived: false }).sort({ order: 1, name: 1 }).lean();
  if (!editor) {
    res.send({ funnels });
    return;
  }
  const counts: any[] = await Deal.aggregate([{ $group: { _id: { funnel: "$funnel", stage: "$stage" }, n: { $sum: 1 } } }]);
  const countOf = new Map(counts.map((c) => [`${String(c._id.funnel)}|${c._id.stage}`, c.n as number]));
  res.send({
    funnels: funnels.map((f) => ({
      ...f,
      stages: f.stages.map((st: any) => ({ ...st, deals: countOf.get(`${String(f._id)}|${st.key}`) ?? 0 })),
      deals: f.stages.reduce((n: number, st: any) => n + (countOf.get(`${String(f._id)}|${st.key}`) ?? 0), 0),
    })),
    templates: FUNNEL_TEMPLATES,
  });
});

/** A new funnel, from a template or the stages sent. */
funnelRouter.post("/", async (req: Req, res) => {
  const template = FUNNEL_TEMPLATES.find((t) => t.key === req.body?.template);
  const stages = Array.isArray(req.body?.stages) ? req.body.stages : template?.stages;
  // new funnel: every stage gets a fresh key from its name
  const cleaned = cleanFunnel({ ...req.body, stages: (stages ?? []).map((st: any) => ({ ...st, key: undefined })) });
  if (!cleaned.ok) return bad(res, cleaned.error);
  const all: any[] = await Funnel.find({}).select("key order").lean();
  const { removed: _removed, ...value } = cleaned.value;
  try {
    const funnel = await Funnel.create({
      ...value,
      key: keyFrom(value.name, all.map((f) => f.key)),
      order: Math.max(0, ...all.map((f) => f.order ?? 0)) + 1,
    });
    res.status(201).send({ funnel });
  } catch (err: any) {
    if (err?.code === 11000) return bad(res, "Someone made a funnel with that name just now; try again", 409);
    throw err;
  }
});

/** Order of the funnel tabs. */
funnelRouter.put("/order", async (req: Req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(isId)) return bad(res, "Send the funnel ids in order");
  await Funnel.bulkWrite(ids.map((id: string, i: number) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: i + 1 } } } })));
  res.send({ ok: true });
});

/**
 * Rename a funnel or change its stages. A stage with deals in it can't be
 * removed (move them first). `updatedAt` from when the editor loaded the
 * funnel: if someone changed it meanwhile, nothing is saved.
 */
funnelRouter.put("/:id", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  const funnel: any = await Funnel.findById(req.params.id).lean();
  if (!funnel) return bad(res, "Funnel not found", 404);
  if (typeof req.body?.updatedAt !== "string" || new Date(req.body.updatedAt).getTime() !== new Date(funnel.updatedAt).getTime()) {
    return bad(res, "This funnel was changed by someone else meanwhile. Reload and try again.", 409);
  }
  const cleaned = cleanFunnel(req.body, funnel);
  if (!cleaned.ok) return bad(res, cleaned.error);
  const { removed, ...value } = cleaned.value;
  if (removed.length) {
    const inRemoved = await Deal.countDocuments({ funnel: funnel._id, stage: inIds(removed) });
    if (inRemoved) return bad(res, `${inRemoved} deal${inRemoved === 1 ? " is" : "s are"} in a stage you removed (archived deals too). Move them first.`, 409);
  }
  const saved = await Funnel.findOneAndUpdate({ _id: funnel._id, updatedAt: funnel.updatedAt }, { $set: value }, { new: true, runValidators: true }).lean();
  if (!saved) return bad(res, "This funnel was changed by someone else meanwhile. Reload and try again.", 409);
  res.send({ funnel: saved });
});

/** Hide or show a funnel. Its deals stay; the last open funnel can't be hidden. */
funnelRouter.post("/:id/archive", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  if (typeof req.body?.archived !== "boolean") return bad(res, "archived must be true or false");
  const active: any[] = await Funnel.find({ archived: false }).select("_id").lean();
  if (req.body.archived && active.every((f) => String(f._id) === req.params.id)) {
    return bad(res, "Keep at least one funnel", 409);
  }
  const f = await Funnel.findByIdAndUpdate(req.params.id, { $set: { archived: req.body.archived } }, { new: true }).lean();
  if (!f) return bad(res, "Funnel not found", 404);
  res.send({ funnel: f });
});

/** Delete a funnel that never had a deal; otherwise hide it. */
funnelRouter.delete("/:id", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  if (await Deal.exists({ funnel: req.params.id })) return bad(res, "This funnel has deals; hide it instead", 409);
  const r = await Funnel.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return bad(res, "Funnel not found", 404);
  res.status(204).send();
});

// ---------- deals ----------
export const dealRouter = express.Router();

dealRouter.get("/", async (req: Req, res) => {
  const funnel = await loadFunnel(req.query.funnel);
  if (!funnel) return bad(res, "Choose a funnel");
  const archived = req.query.archived === "1";
  const deals = await Deal.find({ funnel: funnel._id, archived }).sort({ position: 1, _id: 1 }).limit(2000).lean();
  res.send({ funnel, deals: await present(deals) });
});

// ---------- deal sources (Settings) ----------
const SOURCES_KEY = "dealSources";
async function sources(): Promise<string[]> {
  const s: any = await GroveSetting.findOne({ key: SOURCES_KEY }).lean();
  return Array.isArray(s?.value?.sources) && s.value.sources.length ? s.value.sources : DEFAULT_SOURCES;
}
dealRouter.get("/sources", async (_req: Req, res) => {
  res.send({ sources: await sources(), defaults: DEFAULT_SOURCES });
});
dealRouter.put("/sources", async (req: Req, res) => {
  const cleaned = cleanSources(req.body);
  if (!cleaned.ok) return bad(res, cleaned.error);
  await GroveSetting.findOneAndUpdate({ key: SOURCES_KEY }, { $set: { value: { sources: cleaned.value }, updatedBy: req.user?._id } }, { upsert: true });
  res.send({ sources: cleaned.value });
});

// ---------- report: by source, win rate and days per stage ----------
dealRouter.get("/report", async (req: Req, res) => {
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);
  const from = day(req.query.from);
  const to = day(req.query.to);
  if ((req.query.from && !from) || (req.query.to && !to)) return bad(res, "Dates as YYYY-MM-DD");
  const [deals, funnels] = await Promise.all([
    Deal.find({}).select("funnel stage status source value archived createdAt history.stage history.funnel history.at").limit(20000).lean(),
    Funnel.find({}).sort({ archived: 1, order: 1 }).lean(),
  ]);
  res.send(dealReport(deals as any[], funnels as any[], { from, to }));
});

// Short list of deals to link an offer to (open and won, newest first).
dealRouter.get("/options", async (_req: Req, res) => {
  const deals: any[] = await Deal.find({ archived: false, status: inIds(["open", "won"]) }).select("title client status").sort({ updatedAt: -1 }).limit(1000).lean();
  const clients: any[] = deals.length ? await Client.find({ _id: inIds([...new Set(deals.map((d) => String(d.client)))]) }).select("name").lean() : [];
  const nameOf = new Map(clients.map((c) => [String(c._id), c.name]));
  res.send({ deals: deals.map((d) => ({ _id: d._id, title: d.title, status: d.status, clientName: nameOf.get(String(d.client)) ?? "" })) });
});

// One-off: a deal for each Dashboard project that has none yet. A client
// of the same name is reused only if its contact details don't contradict
// the project's; otherwise a new client is made. Safe to run again (one
// deal per project, enforced by a unique index on importedFrom).
dealRouter.post("/import-dashboard", async (req: Req, res) => {
  await ensureFunnels();
  const funnels: any[] = await Funnel.find({ archived: false }).lean();
  const byKey = new Map(funnels.map((f) => [f.key, f]));
  const projects: any[] = await GroveProject.find({}).limit(2000).lean();
  // skip projects already imported, and projects a deal already links to
  // (e.g. made with "Create project" from a won deal)
  const projectIds = projects.map((p) => String(p._id));
  const done = new Set<string>();
  for (const d of (await Deal.find({ importedFrom: inIds(projectIds) }).select("importedFrom").lean()) as any[]) done.add(String(d.importedFrom));
  for (const d of (await Deal.find({ groveProject: inIds(projectIds) }).select("groveProject").lean()) as any[]) done.add(String(d.groveProject));
  const groveFarmOwners = new Set(await groveUserIds());
  let created = 0;
  let clientsCreated = 0;
  for (const p of projects) {
    if (done.has(String(p._id))) continue;
    const place = dealPlaceForProject(p);
    const funnel = byKey.get(place.funnel);
    if (!funnel) continue;
    const stage = stageOf(funnel, place.stage) ?? firstOpenStage(funnel);
    if (!stage) continue;
    if ((await Deal.exists({ importedFrom: p._id })) || (await Deal.exists({ groveProject: p._id }))) continue;
    const contact = { email: p.client?.email, phone: p.client?.phone };
    const clientName = String(p.client?.name || p.name).trim().slice(0, 200);
    const candidates: any[] = await Client.find({ name: clientName, archived: false }).select("_id email phone").limit(20).lean();
    let client: any = candidates.find((c) => sameClient(c, contact));
    let madeClient = false;
    if (!client) {
      madeClient = true;
      client = await Client.create({
        name: clientName,
        kind: "person",
        contactPerson: p.client?.contactPerson,
        email: p.client?.email,
        phone: p.client?.phone,
        region: p.region,
        createdBy: req.user?._id,
      });
      clientsCreated += 1;
    }
    // only a farm still kept under a Grove account
    let farm = null;
    if (p.farm) {
      const f: any = await Parcel.findById(p.farm).select("owner").lean();
      if (f?.owner?.id && groveFarmOwners.has(String(f.owner.id))) farm = p.farm;
    }
    const now = new Date();
    try {
      await Deal.create({
        title: String(p.name).slice(0, 200),
        client: client._id,
        funnel: funnel._id,
        stage: stage.key,
        status: stage.kind,
        position: await nextPosition(funnel._id, stage.key),
        nextAction: p.nextAction ?? {},
        farm,
        groveProject: p._id,
        importedFrom: p._id,
        archived: p.status === "archived",
        wonAt: stage.kind === "won" ? p.updatedAt ?? now : null,
        history: [{ stage: stage.key, funnel: funnel._id, status: stage.kind, at: now, by: req.user?._id, note: "from Dashboard" }],
        createdBy: req.user?._id,
      });
      created += 1;
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
      // imported at the same moment by someone else: drop the client we just made
      // (unless another import has already put its deal on it)
      if (madeClient && !(await Deal.exists({ client: client._id }))) {
        await Client.deleteOne({ _id: client._id });
        clientsCreated -= 1;
      }
    }
  }
  res.send({ created, clientsCreated, skipped: projects.length - created });
});

dealRouter.post("/", async (req: Req, res) => {
  const cleaned = cleanDeal(req.body, { creating: true });
  if (!cleaned.ok) return bad(res, cleaned.errors.join("; "));
  const funnel = await loadFunnel(req.body?.funnel, { forWrite: true });
  if (!funnel) return bad(res, "Funnel not found");
  const stage = req.body?.stage !== undefined ? stageOf(funnel, req.body.stage) : firstOpenStage(funnel);
  if (!stage) return bad(res, "Stage not found in this funnel");
  // an existing client, or a new one made from `newClient`
  let clientId = cleaned.value.client;
  if (!clientId) {
    const c = cleanClient(req.body?.newClient, { creating: true });
    if (!c.ok) return bad(res, c.errors.join("; "));
    const problem = await checkDealLinks({ ...cleaned.value, client: undefined });
    if (problem) return bad(res, problem);
    clientId = (await Client.create({ ...c.value, createdBy: req.user?._id }))._id;
  } else {
    const problem = await checkDealLinks(cleaned.value);
    if (problem) return bad(res, problem);
  }
  const now = new Date();
  const deal = await Deal.create({
    ...cleaned.value,
    client: clientId,
    funnel: funnel._id,
    stage: stage.key,
    status: stage.kind,
    wonAt: stage.kind === "won" ? now : null,
    lostAt: stage.kind === "lost" ? now : null,
    position: await nextPosition(funnel._id, stage.key),
    owner: cleaned.value.owner ?? req.user?._id ?? null,
    history: [{ stage: stage.key, funnel: funnel._id, status: stage.kind, at: now, by: req.user?._id }],
    createdBy: req.user?._id,
  });
  const [d] = await present([deal.toObject()]);
  res.status(201).send({ deal: d });
});

dealRouter.get("/:id", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  const deal: any = await Deal.findById(req.params.id).lean();
  if (!deal) return bad(res, "Deal not found", 404);
  const [[d], client, funnel, offers, project] = await Promise.all([
    present([deal]),
    Client.findById(deal.client).lean(),
    Funnel.findById(deal.funnel).lean(),
    Offer.find({ deal: deal._id }).select("title dineroNumber status validUntil lines.qty lines.unitPrice lines.discountPct discountPct updatedAt").sort({ updatedAt: -1 }).lean(),
    deal.groveProject ? GroveProject.findById(deal.groveProject).select("name stage status").lean() : null,
  ]);
  res.send({
    deal: { ...d, history: deal.history ?? [] },
    client,
    funnel,
    project,
    offers: (offers as any[]).map((o) => ({ _id: o._id, title: o.title, dineroNumber: o.dineroNumber, status: o.status, validUntil: o.validUntil, net: offerTotals(o).net })),
  });
});

dealRouter.put("/:id", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  const cleaned = cleanDeal(req.body);
  if (!cleaned.ok) return bad(res, cleaned.errors.join("; "));
  const problem = await checkDealLinks(cleaned.value);
  if (problem) return bad(res, problem);
  const deal: any = await Deal.findById(req.params.id);
  if (!deal) return bad(res, "Deal not found", 404);
  const { nextAction, ...rest } = cleaned.value;
  deal.set(rest);
  if (nextAction) for (const [k, v] of Object.entries(nextAction)) deal.set(`nextAction.${k}`, v);
  if (rest.archived === false && deal.isModified("archived")) deal.position = await nextPosition(deal.funnel, deal.stage);
  await deal.save();
  const [d] = await present([deal.toObject()]);
  res.send({ deal: d });
});

// Delete a deal. Only without offers; otherwise archive it, so offers keep their deal.
dealRouter.delete("/:id", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  if (await Offer.exists({ deal: req.params.id })) return bad(res, "This deal has offers; archive it instead", 409);
  const r = await Deal.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return bad(res, "Deal not found", 404);
  res.status(204).send();
});

// Move a card: to another stage (or another funnel), in front of `before`.
dealRouter.post("/:id/move", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  const deal: any = await Deal.findById(req.params.id);
  if (!deal) return bad(res, "Deal not found", 404);
  if (deal.archived) return bad(res, "Restore the deal before moving it");
  // Won and lost deals stay put on the board; changing them is a deliberate
  // step on the deal page ("Change stage"), which sends confirm: true.
  if (deal.status !== "open" && req.body?.confirm !== true) return bad(res, "This deal is closed. Open it and use Change stage.", 409);
  const funnel = await loadFunnel(req.body?.funnel !== undefined ? req.body.funnel : String(deal.funnel), { forWrite: true });
  if (!funnel) return bad(res, "Funnel not found");
  if (req.body?.lostReason !== undefined && req.body.lostReason !== null && typeof req.body.lostReason !== "string") return bad(res, "lostReason must be text");
  const moved = moveDeal(deal.toObject(), funnel, req.body?.stage, { by: req.user?._id ?? null, lostReason: req.body?.lostReason ?? undefined });
  if (!moved) return bad(res, "Stage not found in this funnel");
  deal.set(moved.patch);
  await deal.save();
  await placeInStage(String(deal._id), funnel._id, moved.stage.key, req.body?.before);
  const fresh: any = await Deal.findById(deal._id).lean();
  const [d] = await present([fresh]);
  res.send({ deal: d, wonNow: moved.wonNow });
});

// Optional next steps after a deal is won: a project in B, or a follow-up
// deal for the same client (e.g. a care contract in Management clients).
dealRouter.post("/:id/handover", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  const deal: any = await Deal.findById(req.params.id);
  if (!deal) return bad(res, "Deal not found", 404);
  if (deal.archived || deal.status === "lost") return bad(res, "Restore or reopen the deal first", 409);
  const action = req.body?.action;
  if (action === "project") {
    if (deal.groveProject && (await GroveProject.exists({ _id: deal.groveProject }))) {
      res.send({ project: { _id: deal.groveProject }, existing: true });
      return;
    }
    const [client, funnel]: any[] = await Promise.all([Client.findById(deal.client).lean(), Funnel.findById(deal.funnel).select("key").lean()]);
    const project = await GroveProject.create({
      name: deal.title,
      type: funnel?.key === "tree-sales" ? "tree-sale" : "client",
      stage: deal.status === "won" ? "signed" : "prospect",
      status: "active",
      client: { name: client?.name, contactPerson: client?.contactPerson, email: client?.email, phone: client?.phone },
      farm: deal.farm ?? null,
      region: client?.region,
      createdBy: req.user?._id,
    });
    // link only if nobody linked a project meanwhile; otherwise drop ours
    const linked = await Deal.findOneAndUpdate({ _id: deal._id, groveProject: deal.groveProject ?? null }, { $set: { groveProject: project._id } }, { new: true }).lean();
    if (!linked) {
      await GroveProject.deleteOne({ _id: project._id });
      const now: any = await Deal.findById(deal._id).select("groveProject").lean();
      res.send({ project: { _id: now?.groveProject }, existing: true });
      return;
    }
    res.status(201).send({ project: { _id: project._id }, existing: false });
    return;
  }
  if (action === "followup") {
    const funnel = await loadFunnel(req.body?.funnel, { forWrite: true });
    if (!funnel) return bad(res, "Funnel not found");
    const stage = firstOpenStage(funnel);
    if (!stage) return bad(res, "This funnel has no stages");
    const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim().slice(0, 200) : `${deal.title} · follow-up`;
    const now = new Date();
    const created = await Deal.create({
      title,
      client: deal.client,
      funnel: funnel._id,
      stage: stage.key,
      status: stage.kind,
      position: await nextPosition(funnel._id, stage.key),
      farm: deal.farm ?? null,
      groveProject: deal.groveProject ?? null,
      owner: deal.owner ?? req.user?._id ?? null,
      // where the client first came from stays with them
      source: deal.source || "Re-purchase",
      sourceDetail: deal.sourceDetail,
      history: [{ stage: stage.key, funnel: funnel._id, status: stage.kind, at: now, by: req.user?._id, note: `follow-up of ${String(deal.title).slice(0, 150)}` }],
      createdBy: req.user?._id,
    });
    res.status(201).send({ deal: { _id: created._id } });
    return;
  }
  bad(res, "Unknown action");
});

// ---------- clients ----------
export const clientRouter = express.Router();

clientRouter.get("/", async (req: Req, res) => {
  const filter: Record<string, any> = { archived: req.query.archived === "1" };
  if (typeof req.query.q === "string" && req.query.q.trim()) filter.name = searchPattern(req.query.q.trim());
  const clients: any[] = await Client.find(filter).sort({ name: 1 }).limit(1000).lean();
  const deals: any[] = clients.length ? await Deal.find({ client: inIds(clients.map((c) => String(c._id))), archived: false }).select("client status value").lean() : [];
  const stats = new Map<string, { deals: number; open: number; won: number; wonValue: number }>();
  for (const d of deals) {
    const s = stats.get(String(d.client)) ?? { deals: 0, open: 0, won: 0, wonValue: 0 };
    s.deals += 1;
    if (d.status === "open") s.open += 1;
    if (d.status === "won") {
      s.won += 1;
      s.wonValue += d.value ?? 0;
    }
    stats.set(String(d.client), s);
  }
  res.send({ clients: clients.map((c) => ({ ...c, ...(stats.get(String(c._id)) ?? { deals: 0, open: 0, won: 0, wonValue: 0 }) })) });
});

clientRouter.post("/", async (req: Req, res) => {
  const cleaned = cleanClient(req.body, { creating: true });
  if (!cleaned.ok) return bad(res, cleaned.errors.join("; "));
  const client = await Client.create({ ...cleaned.value, createdBy: req.user?._id });
  res.status(201).send({ client });
});

clientRouter.get("/:id", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  const client: any = await Client.findById(req.params.id).lean();
  if (!client) return bad(res, "Client not found", 404);
  const deals: any[] = await Deal.find({ client: client._id }).sort({ createdAt: -1 }).limit(500).lean();
  const funnels: any[] = await Funnel.find({}).lean();
  const funnelBy = new Map(funnels.map((f) => [String(f._id), f]));
  const presented = await present(deals);
  res.send({
    client,
    deals: presented.map((d: any) => {
      const f = funnelBy.get(String(d.funnel));
      return { ...d, funnelName: f?.name, stageName: f ? stageOf(f, d.stage)?.name : d.stage };
    }),
  });
});

clientRouter.put("/:id", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  const cleaned = cleanClient(req.body);
  if (!cleaned.ok) return bad(res, cleaned.errors.join("; "));
  const client = await Client.findByIdAndUpdate(req.params.id, { $set: cleaned.value }, { new: true, runValidators: true }).lean();
  if (!client) return bad(res, "Client not found", 404);
  res.send({ client });
});

// Delete a client. Only without deals; otherwise archive it.
clientRouter.delete("/:id", async (req: Req, res) => {
  if (!isId(req.params.id)) return bad(res, "Invalid id");
  if (await Deal.exists({ client: req.params.id })) return bad(res, "This client has deals; archive it instead", 409);
  const r = await Client.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return bad(res, "Client not found", 404);
  res.status(204).send();
});

/** When an offer linked to a deal is accepted, an open deal moves to its funnel's won stage. */
export async function dealOfferAccepted(dealId: unknown, by: unknown) {
  if (!isId(String(dealId ?? ""))) return;
  try {
    const deal: any = await Deal.findById(String(dealId));
    if (!deal || deal.status !== "open" || deal.archived) return;
    const funnel: any = await Funnel.findById(deal.funnel).lean();
    const won = funnel && firstStageOfKind(funnel, "won");
    if (!won) return;
    const moved = moveDeal(deal.toObject(), funnel, won.key, { by: (by as any) ?? null, note: "offer accepted" });
    if (!moved) return;
    deal.set(moved.patch);
    deal.position = await nextPosition(funnel._id, won.key);
    await deal.save();
  } catch (err) {
    console.error("[deal] could not move deal %s after offer accepted: %s", String(dealId), (err as Error).message);
  }
}

