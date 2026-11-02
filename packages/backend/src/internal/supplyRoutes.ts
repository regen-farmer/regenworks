// /internal/supply: forward-order demand against supply. Grove team only.
// The supply plan (own grafting, take rate, supplier capacity) is kept in
// grove_settings, not in the code.
import express from "express";
import Offer from "@rw/db/schemas/internal/offer.ts";
import GroveSetting from "@rw/db/schemas/internal/groveSetting.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { cleanSupplyPlan, supplyBalance, type SupplyRow } from "./supply.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
const KEY = "supply";

router.get("/", async (_req: Req, res) => {
  const setting: any = await GroveSetting.findOne({ key: KEY }).lean();
  const plan: SupplyRow[] = Array.isArray(setting?.value?.rows) ? setting.value.rows : [];
  const offers: any[] = await Offer.find({ "terms.forwardOrder": true })
    .select("title client.name status terms lines.kind lines.latin lines.nameDa lines.cultivar lines.rootstock lines.propagation lines.organic lines.organicRequested lines.form lines.years lines.qty")
    .sort({ updatedAt: -1 })
    .limit(2000)
    .lean();
  res.send({ plan, ...supplyBalance(offers, plan) });
});

router.put("/plan", async (req: Req, res) => {
  const cleaned = cleanSupplyPlan(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.error });
    return;
  }
  await GroveSetting.findOneAndUpdate({ key: KEY }, { $set: { value: { rows: cleaned.value }, updatedBy: req.user?._id } }, { upsert: true });
  res.send({ plan: cleaned.value });
});

export default router;
