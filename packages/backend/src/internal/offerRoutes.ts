// /internal/offers: Grove team only (mounted behind requireRole("grove-team")).
import express from "express";
import mongoose from "mongoose";
import Offer from "@rw/db/schemas/internal/offer.ts";
import Project from "@rw/db/schemas/project.ts";
import GroveProject from "@rw/db/schemas/internal/groveProject.ts";
import Deal from "@rw/db/schemas/internal/deal.ts";
import { dealOfferAccepted } from "./dealRoutes.ts";
import { stageAfterOffer } from "./projects.ts";
import Species from "@rw/db/schemas/species.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { runSystemBasedLayout } from "@rw/modelling/layout-backends/system-layout.node.ts";
import { inIds } from "../utils/mongoSafety.ts";
import { activePricebook, pricebookVersion, pricingRates } from "./pricebookRoutes.ts";
import {
  cleanOfferUpdate,
  defaultValidUntil,
  dineroLines,
  lineMargin,
  mergeLines,
  needsDispensation,
  offerTotals,
  priceLine,
  purchaseList,
  type OfferLine,
} from "./offers.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();

const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);

/** Move the dashboard project along when an offer is made or accepted. */
async function moveProjectStage(groveProjectId: unknown, event: "offer-made" | "offer-accepted") {
  if (!validId(String(groveProjectId ?? ""))) return;
  try {
    const p: any = await GroveProject.findById(String(groveProjectId)).select("stage");
    const next = p ? stageAfterOffer(p.stage, event) : null;
    if (next) {
      p.stage = next;
      await p.save();
    }
  } catch (err) {
    // the offer is saved either way; the stage can be set by hand
    console.error("[offers] could not move project stage", err);
  }
}

/** Offer plus everything the screens need: totals, Dinero lines, internal sheet. */
function present(offer: any) {
  const o = offer.toObject ? offer.toObject() : offer;
  return {
    offer: o,
    totals: offerTotals(o),
    dinero: dineroLines(o),
    internal: {
      lines: o.lines.map((l: OfferLine) => ({
        id: String(l._id),
        margin: lineMargin(l),
        dispensation: needsDispensation(l, o.clientOrganic),
        // for sales-priced lines these describe the cost reference, not the client price
        outdated: l.priceSource === "cost+margin" && !!l.pricing?.outdated,
        vatUnclear: l.priceSource === "cost+margin" && !!l.pricing?.vatUnclear,
        costReferenceOutdated: l.priceSource === "sales" && !!l.pricing?.outdated,
        stale: !!l.pricing?.stale,
        pickedMissing: !!l.pricing?.pickedMissing,
        ambiguous: !!l.pricing?.ambiguous,
        unpriced: l.priceSource === "none",
      })),
      purchaseList: purchaseList(o),
    },
  };
}

/** Hybrid info for species that are hybrid groups, keyed by species id. */
async function hybridsFor(speciesIds: unknown[]) {
  const ids = speciesIds.filter((i) => validId(String(i ?? ""))).map(String);
  if (!ids.length) return new Map<string, any>();
  const groups: any[] = await Species.find({ _id: inIds(ids), "hybrid.parents.1": mongoose.trusted({ $exists: true }) })
    .select("genus hybrid")
    .populate("hybrid.parents", "species")
    .lean();
  return new Map(
    groups.map((g) => [String(g._id), { genus: g.genus, parents: (g.hybrid?.parents ?? []).map((p: any) => p?.species).filter(Boolean) }]),
  );
}

/**
 * Price lines with a given pricebook version (or the newest). Returns an
 * error instead of wiping prices when that version can't be loaded.
 */
async function priceAll(
  lines: OfferLine[],
  offer: { marginPct?: number | null; eurDkk?: number | null; pricebookVersion?: number | null; clientOrganic?: boolean },
) {
  const pb = offer.pricebookVersion ? await pricebookVersion(offer.pricebookVersion) : await activePricebook();
  if (offer.pricebookVersion && !pb) return { error: `Pricebook version ${offer.pricebookVersion} not found` } as const;
  const rates = pb ? pricingRates({ marginPct: offer.marginPct ?? undefined, eurDkk: offer.eurDkk ?? undefined }, pb.settings) : null;
  const okRates = rates && !("error" in rates) ? rates : null;
  const hybrids = await hybridsFor(lines.map((l) => l.speciesId));
  const priced = lines.map((l) => priceLine(l, pb ?? null, okRates, hybrids.get(String(l.speciesId)), !!offer.clientOrganic));
  return {
    lines: priced,
    pricebookVersion: pb?.version ?? offer.pricebookVersion ?? null,
    marginPct: okRates?.marginPct ?? offer.marginPct ?? null,
    eurDkk: okRates?.eurDkk ?? offer.eurDkk ?? null,
    warning: !pb ? "No pricebook imported yet" : rates && "error" in rates ? rates.error : undefined,
  };
}

/** Plant lines from a scenario's design: one line per distinct plant. */
async function linesFromScenario(projectId: string): Promise<OfferLine[] | null> {
  const project: any = await Project.findById(projectId)
    .populate("layer")
    .populate({
      path: "systemdesign",
      populate: [
        { path: "rows.sequence.species", populate: { path: "hybrid.parents", select: "species" } },
        { path: "rows.sequence.variety", select: "name" },
        { path: "rows.sequence.rootstock", select: "name propagation" },
      ],
    })
    .exec();
  if (!project?.systemdesign || !project?.layer?.geometry) return null;
  const layout = await runSystemBasedLayout(project.systemdesign, project.layer.geometry);
  const species = new Map<string, any>();
  const varieties = new Map<string, any>();
  const rootstocks = new Map<string, any>();
  for (const row of project.systemdesign.rows ?? []) {
    for (const e of row.sequence ?? []) {
      if (e.species?._id) species.set(String(e.species._id), e.species);
      if (e.variety?._id) varieties.set(String(e.variety._id), e.variety);
      if (e.rootstock?._id) rootstocks.set(String(e.rootstock._id), e.rootstock);
    }
  }
  return (layout.plantCountArray ?? []).map((p: any) => {
    const s = species.get(String(p.species));
    const parents = (s?.hybrid?.parents ?? []).map((x: any) => x?.species).filter(Boolean);
    const latin = s
      ? s.hybrid && parents.length >= 2
        ? `${s.genus} ${parents.join(" × ")}`
        : [s.genus, s.species].filter(Boolean).join(" ")
      : undefined;
    return {
      latin,
      nameDa: undefined,
      speciesId: p.species,
      varietyId: p.variety,
      rootstockId: p.rootstock,
      cultivar: p.variety ? varieties.get(String(p.variety))?.name : undefined,
      rootstock: p.rootstock ? rootstocks.get(String(p.rootstock))?.name : undefined,
      propagation: p.rootstock ? "grafted" : p.ownRoots ? "own-rooted" : undefined,
      organic: typeof p.organic === "boolean" ? p.organic : null,
      organicRequested: typeof p.organic === "boolean" ? p.organic : null,
      qty: p.count,
      unitPrice: 0,
      priceSource: "none",
      discountPct: 0,
    } as OfferLine;
  });
}

router.get("/", async (_req: Req, res) => {
  const offers: any[] = await Offer.find()
    .select("dineroNumber title status client.name clientOrganic offerDate validUntil project groveProject deal lines discountPct updatedAt")
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean();
  res.send({
    offers: offers.map((o) => ({ ...o, lines: undefined, lineCount: o.lines?.length ?? 0, totals: offerTotals(o) })),
  });
});

router.post("/", async (req: Req, res) => {
  const cleaned = cleanOfferUpdate({ ...req.body, lines: undefined, status: undefined });
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.errors.join("; "), errors: cleaned.errors });
    return;
  }
  let lines: OfferLine[] = [];
  const projectId = req.body?.projectId;
  if (projectId !== undefined) {
    if (!validId(projectId)) {
      res.status(400).send({ error: "Invalid scenario id" });
      return;
    }
    const fromDesign = await linesFromScenario(projectId);
    if (!fromDesign) {
      res.status(400).send({ error: "This scenario has no design or field boundary to make an offer from" });
      return;
    }
    lines = fromDesign;
  }
  let groveProject: string | undefined;
  if (req.body?.groveProjectId !== undefined) {
    if (!validId(req.body.groveProjectId) || !(await GroveProject.exists({ _id: req.body.groveProjectId }))) {
      res.status(400).send({ error: "Dashboard project not found" });
      return;
    }
    groveProject = req.body.groveProjectId;
  }
  if (cleaned.value.deal && !(await Deal.exists({ _id: cleaned.value.deal }))) {
    res.status(400).send({ error: "Deal not found" });
    return;
  }
  const priced = await priceAll(lines, {
    marginPct: cleaned.value.marginPct,
    eurDkk: cleaned.value.eurDkk,
    clientOrganic: cleaned.value.clientOrganic,
  });
  if ("error" in priced) {
    res.status(409).send({ error: priced.error });
    return;
  }
  const offer = await Offer.create({
    ...cleaned.value,
    status: "draft",
    project: projectId,
    groveProject,
    validUntil: cleaned.value.validUntil ?? defaultValidUntil(cleaned.value.offerDate),
    pricebookVersion: priced.pricebookVersion,
    marginPct: priced.marginPct,
    eurDkk: priced.eurDkk,
    lines: priced.lines,
    createdBy: req.user?._id,
    updatedBy: req.user?._id,
  });
  await moveProjectStage(groveProject, "offer-made");
  res.status(201).send({ ...present(offer), warning: priced.warning });
});

router.get("/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const offer = await Offer.findById(req.params.id);
  if (!offer) {
    res.status(404).send({ error: "Offer not found" });
    return;
  }
  res.send(present(offer));
});

router.put("/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const offer: any = await Offer.findById(req.params.id);
  if (!offer) {
    res.status(404).send({ error: "Offer not found" });
    return;
  }
  const cleaned = cleanOfferUpdate(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.errors.join("; "), errors: cleaned.errors });
    return;
  }
  const { lines, ...rest } = cleaned.value;
  if (rest.groveProject && !(await GroveProject.exists({ _id: rest.groveProject }))) {
    res.status(400).send({ error: "Dashboard project not found" });
    return;
  }
  if (rest.deal && !(await Deal.exists({ _id: rest.deal }))) {
    res.status(400).send({ error: "Deal not found" });
    return;
  }
  const linkedNow = rest.groveProject && String(rest.groveProject) !== String(offer.groveProject ?? "");
  // An accepted offer is what the client signed: only its Dinero number and
  // notes can change.
  if (offer.status === "accepted") {
    // linking to a dashboard project is internal bookkeeping, not the offer itself
    const allowed = new Set(["dineroNumber", "notes", "groveProject", "deal"]);
    const changed = Object.keys(cleaned.value).filter((k) => !allowed.has(k) && !(k === "status" && cleaned.value.status === "accepted"));
    if (changed.length) {
      res.status(409).send({ error: "This offer is accepted and locked; only the Dinero number, notes and links to a project or deal can change" });
      return;
    }
  }
  // Move "valid until" with the offer date while it is still the default.
  if (rest.offerDate && !rest.validUntil && offer.validUntil && offer.offerDate) {
    const wasDefault = defaultValidUntil(offer.offerDate).toISOString().slice(0, 10) === new Date(offer.validUntil).toISOString().slice(0, 10);
    if (wasDefault) rest.validUntil = defaultValidUntil(rest.offerDate);
  }
  const ratesChanged =
    (rest.marginPct !== undefined && rest.marginPct !== offer.marginPct) ||
    (rest.eurDkk !== undefined && rest.eurDkk !== offer.eurDkk) ||
    (rest.clientOrganic !== undefined && rest.clientOrganic !== offer.clientOrganic);
  offer.set(rest);
  let merged = lines ? mergeLines(offer.lines.map((l: any) => l.toObject()), lines) : offer.lines.map((l: any) => l.toObject());
  // New or changed plants, and a new margin/rate, are priced again with the
  // offer's own pricebook version (hand-set prices are kept).
  const needsPricing = offer.status !== "accepted" && (ratesChanged || merged.some((l: any) => l.priceSource === "none" && l.latin));
  if (needsPricing) {
    const priced = await priceAll(merged, offer);
    if ("error" in priced) {
      res.status(409).send({ error: priced.error });
      return;
    }
    merged = priced.lines;
    offer.marginPct = priced.marginPct;
    offer.eurDkk = priced.eurDkk;
    offer.pricebookVersion ??= priced.pricebookVersion;
  }
  if (lines || needsPricing) offer.lines = merged;
  const becameAccepted = rest.status === "accepted" && offer.isModified("status");
  offer.updatedBy = req.user?._id;
  await offer.save();
  if (linkedNow) await moveProjectStage(offer.groveProject, offer.status === "accepted" ? "offer-accepted" : "offer-made");
  if (becameAccepted) await moveProjectStage(offer.groveProject, "offer-accepted");
  // Only the moment of acceptance moves a deal; linking an already accepted
  // offer to a deal later doesn't (it could be the wrong deal).
  if (becameAccepted) await dealOfferAccepted(offer.deal, req.user?._id);
  res.send(present(offer));
});

// Price again from the pricebook (current version unless this offer is
// locked to one). Lines with a hand-set price are left alone.
router.post("/:id/reprice", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const offer: any = await Offer.findById(req.params.id);
  if (!offer) {
    res.status(404).send({ error: "Offer not found" });
    return;
  }
  if (offer.status === "accepted") {
    res.status(409).send({ error: "This offer is accepted; prices are locked" });
    return;
  }
  // Default: price again with the version this offer already uses. Moving to
  // the newest pricebook is a separate, explicit choice, and only for drafts.
  const latest = req.body?.latest === true;
  if (latest && offer.status !== "draft") {
    res.status(409).send({ error: "Only draft offers can move to a newer pricebook; this one has been sent" });
    return;
  }
  const priced = await priceAll(offer.lines.map((l: any) => l.toObject()), {
    marginPct: offer.marginPct,
    eurDkk: offer.eurDkk,
    clientOrganic: offer.clientOrganic,
    pricebookVersion: latest ? null : offer.pricebookVersion,
  });
  if ("error" in priced) {
    res.status(409).send({ error: priced.error });
    return;
  }
  offer.lines = priced.lines;
  offer.pricebookVersion = priced.pricebookVersion;
  offer.marginPct = priced.marginPct;
  offer.eurDkk = priced.eurDkk;
  offer.updatedBy = req.user?._id;
  await offer.save();
  res.send({ ...present(offer), warning: priced.warning });
});

router.delete("/:id", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const offer: any = await Offer.findById(req.params.id).select("status").lean();
  if (!offer) {
    res.status(404).send({ error: "Offer not found" });
    return;
  }
  if (offer.status === "accepted") {
    res.status(409).send({ error: "Accepted offers can't be deleted" });
    return;
  }
  await Offer.deleteOne({ _id: req.params.id });
  res.status(204).send();
});

export default router;
