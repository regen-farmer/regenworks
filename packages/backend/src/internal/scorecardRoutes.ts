// /internal/scorecard: the Dashboard scorecard. Mounted behind grove-team
// (money). Targets are kept in grove_settings, not in the code.
import express from "express";
import Offer from "@rw/db/schemas/internal/offer.ts";
import Deal from "@rw/db/schemas/internal/deal.ts";
import Funnel from "@rw/db/schemas/internal/funnel.ts";
import Client from "@rw/db/schemas/internal/client.ts";
import GroveProject from "@rw/db/schemas/internal/groveProject.ts";
import GroveSetting from "@rw/db/schemas/internal/groveSetting.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { inIds } from "../utils/mongoSafety.ts";
import { cleanTargets, scorecard, type ScorecardTargets } from "./scorecard.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
const KEY = "scorecard";

router.get("/", async (_req: Req, res) => {
  // One-off for offers accepted before acceptedAt existed: their last change
  // is the best guess, fixed now so later edits (Dinero no., notes) don't move them.
  const undated: any[] = await Offer.find({ status: "accepted", acceptedAt: null }).select("updatedAt").limit(5000).lean();
  if (undated.length) {
    await Offer.bulkWrite(undated.map((o) => ({ updateOne: { filter: { _id: o._id, acceptedAt: null }, update: { $set: { acceptedAt: o.updatedAt ?? new Date() } }, timestamps: false } })));
  }
  const setting: any = await GroveSetting.findOne({ key: KEY }).lean();
  const targets: ScorecardTargets = setting?.value ?? {};
  const [offers, deals, funnels, projects, wonDeals, lostDeals] = await Promise.all([
    Offer.find({ status: inIds(["accepted", "sent"]) })
      .select("title client.name status acceptedAt updatedAt offerDate terms lines.qty lines.unitPrice lines.discountPct lines.pricing.unitCostDkk lines.pricing.costHigh lines.pricing.costLow discountPct deal groveProject")
      .sort({ updatedAt: -1 })
      .limit(5000)
      .lean(),
    Deal.find({ status: "open", archived: false }).select("value funnel forwardOrder").limit(5000).lean(),
    Funnel.find({}).select("name key").lean(),
    GroveProject.find({ status: inIds(["active", "on-hold"]) })
      .select("name type stage step status client.name nextAction plantingDate")
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean(),
    Deal.find({ status: "won" }).select("title client value forwardOrder archived wonAt updatedAt funnel groveProject").sort({ wonAt: -1 }).limit(5000).lean(),
    Deal.find({ status: "lost" }).select("_id").limit(10000).lean(),
  ]);
  const clientIds = [...new Set((wonDeals as any[]).map((d) => String(d.client)).filter(Boolean))];
  const clients: any[] = clientIds.length ? await Client.find({ _id: inIds(clientIds) }).select("name").lean() : [];
  const clientName = new Map(clients.map((c) => [String(c._id), c.name]));
  const funnelName = new Map((funnels as any[]).map((f) => [String(f._id), f.name]));
  const isManagement = new Map((funnels as any[]).map((f) => [String(f._id), f.key === "management"]));
  const card = scorecard({
    offers: offers as any[],
    openDeals: (deals as any[]).map((d) => ({ value: d.value, funnelName: funnelName.get(String(d.funnel)), forwardOrder: !!d.forwardOrder, management: isManagement.get(String(d.funnel)) })),
    wonDeals: (wonDeals as any[]).map((d) => ({
      _id: d._id,
      title: d.title,
      client: clientName.get(String(d.client)),
      funnelName: funnelName.get(String(d.funnel)),
      value: d.value,
      forwardOrder: d.forwardOrder,
      management: isManagement.get(String(d.funnel)),
      archived: d.archived,
      wonAt: d.wonAt,
      updatedAt: d.updatedAt,
      groveProject: d.groveProject,
    })),
    closedDealIds: [...(wonDeals as any[]), ...(lostDeals as any[])].map((d) => d._id),
    targets,
  });
  const projectBy = new Map((projects as any[]).map((p) => [String(p._id), p]));
  res.send({
    ...card,
    won: card.won.map((w) => {
      const p = w.groveProject ? projectBy.get(String(w.groveProject)) : undefined;
      return { ...w, project: p ? { _id: p._id, name: p.name, stage: p.stage, step: p.step } : null };
    }),
  });
});

router.put("/targets", async (req: Req, res) => {
  const cleaned = cleanTargets(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.error });
    return;
  }
  const setting: any = await GroveSetting.findOneAndUpdate(
    { key: KEY },
    { $set: { value: cleaned.value, updatedBy: req.user?._id } },
    { new: true, upsert: true, runValidators: true },
  ).lean();
  res.send({ targets: setting.value });
});

export default router;
