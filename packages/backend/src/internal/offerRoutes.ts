// /internal/offers: Grove team only (mounted behind requireRole("grove-team")).
import express from "express";
import mongoose from "mongoose";
import Offer from "@rw/db/schemas/internal/offer.ts";
import Project from "@rw/db/schemas/project.ts";
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
  needsDispensation,
  offerTotals,
  priceLine,
  purchaseList,
  type OfferLine,
} from "./offers.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();

const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);

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
        outdated: !!l.pricing?.outdated,
        vatUnclear: !!l.pricing?.vatUnclear,
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

async function priceAll(lines: OfferLine[], offer: { marginPct?: number | null; eurDkk?: number | null; pricebookVersion?: number | null }) {
  const pb = offer.pricebookVersion ? await pricebookVersion(offer.pricebookVersion) : await activePricebook();
  const rates = pb ? pricingRates({ marginPct: offer.marginPct ?? undefined, eurDkk: offer.eurDkk ?? undefined }, pb.settings) : null;
  const hybrids = await hybridsFor(lines.map((l) => l.speciesId));
  const priced = lines.map((l) => priceLine(l, pb ?? null, rates && !("error" in rates) ? rates : null, hybrids.get(String(l.speciesId))));
  return {
    lines: priced,
    pricebookVersion: pb?.version ?? null,
    marginPct: rates && !("error" in rates) ? rates.marginPct : offer.marginPct ?? null,
    eurDkk: rates && !("error" in rates) ? rates.eurDkk : offer.eurDkk ?? null,
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
        { path: "rows.sequence.species" },
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
    const latin = s ? (s.species === "hybrid" ? s.genus : [s.genus, s.species].filter(Boolean).join(" ")) : undefined;
    return {
      latin,
      nameDa: undefined,
      speciesId: p.species,
      varietyId: p.variety,
      rootstockId: p.rootstock,
      cultivar: p.variety ? varieties.get(String(p.variety))?.name : undefined,
      rootstock: p.rootstock ? rootstocks.get(String(p.rootstock))?.name : undefined,
      propagation: p.rootstock ? "grafted" : p.ownRoots ? "seedling" : undefined,
      organic: typeof p.organic === "boolean" ? p.organic : null,
      qty: p.count,
      unitPrice: 0,
      priceSource: "none",
      discountPct: 0,
    } as OfferLine;
  });
}

router.get("/", async (_req: Req, res) => {
  const offers: any[] = await Offer.find()
    .select("dineroNumber title status client.name clientOrganic offerDate validUntil project groveProject lines discountPct updatedAt")
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
  const groveProject = validId(req.body?.groveProjectId) ? req.body.groveProjectId : undefined;
  const priced = await priceAll(lines, { marginPct: cleaned.value.marginPct, eurDkk: cleaned.value.eurDkk });
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
  offer.set(rest);
  if (lines) {
    // Keep what the server knows about each existing line (ids, pricing);
    // a price changed by hand becomes a manual price.
    const before = new Map<string, any>(offer.lines.map((l: any) => [String(l._id), l.toObject()]));
    offer.lines = lines.map((l: any) => {
      const old = l._id ? before.get(String(l._id)) : undefined;
      const priceChanged = old && old.unitPrice !== l.unitPrice;
      return {
        ...l,
        _id: old?._id,
        speciesId: old?.speciesId,
        varietyId: old?.varietyId,
        rootstockId: old?.rootstockId,
        pricing: old?.pricing ?? null,
        priceSource: priceChanged ? "manual" : old ? l.priceSource : l.unitPrice > 0 ? "manual" : "none",
      };
    });
  }
  offer.updatedBy = req.user?._id;
  await offer.save();
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
  const priced = await priceAll(
    offer.lines.map((l: any) => l.toObject()),
    { marginPct: offer.marginPct, eurDkk: offer.eurDkk, pricebookVersion: req.body?.keepVersion ? offer.pricebookVersion : null },
  );
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
