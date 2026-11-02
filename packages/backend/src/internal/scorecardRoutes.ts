// /internal/scorecard: the Dashboard scorecard. Mounted behind grove-team
// (money). Targets are kept in grove_settings, not in the code.
import express from "express";
import Offer from "@rw/db/schemas/internal/offer.ts";
import Deal from "@rw/db/schemas/internal/deal.ts";
import Funnel from "@rw/db/schemas/internal/funnel.ts";
import GroveProject from "@rw/db/schemas/internal/groveProject.ts";
import GroveSetting from "@rw/db/schemas/internal/groveSetting.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { inIds } from "../utils/mongoSafety.ts";
import { cleanTargets, scorecard, type ScorecardTargets } from "./scorecard.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
const KEY = "scorecard";

router.get("/", async (_req: Req, res) => {
  const setting: any = await GroveSetting.findOne({ key: KEY }).lean();
  const targets: ScorecardTargets = setting?.value ?? {};
  const [offers, deals, funnels, projects] = await Promise.all([
    Offer.find({ status: inIds(["accepted", "sent"]) })
      .select("title client.name status acceptedAt updatedAt offerDate terms lines.qty lines.unitPrice lines.discountPct lines.pricing.unitCostDkk lines.pricing.costHigh lines.pricing.costLow discountPct deal groveProject")
      .limit(2000)
      .lean(),
    Deal.find({ status: "open", archived: false }).select("value funnel").limit(5000).lean(),
    Funnel.find({}).select("name").lean(),
    GroveProject.find({ status: inIds(["active", "on-hold"]) })
      .select("name type stage step status client.name nextAction plantingDate")
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean(),
  ]);
  const funnelName = new Map((funnels as any[]).map((f) => [String(f._id), f.name]));
  const card = scorecard({
    offers: offers as any[],
    openDeals: (deals as any[]).map((d) => ({ value: d.value, funnelName: funnelName.get(String(d.funnel)) })),
    targets,
  });
  const projectBy = new Map((projects as any[]).map((p) => [String(p._id), p]));
  res.send({
    ...card,
    won: card.won.map((w) => {
      const p = w.groveProject ? projectBy.get(String(w.groveProject)) : undefined;
      return { ...w, project: p ? { _id: p._id, name: p.name, stage: p.stage, step: p.step } : null };
    }),
    projects: (projects as any[]).map((p) => ({
      _id: p._id,
      name: p.name,
      type: p.type,
      client: p.client?.name,
      stage: p.stage,
      step: p.step,
      status: p.status,
      nextAction: p.nextAction,
      plantingDate: p.plantingDate,
    })),
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
