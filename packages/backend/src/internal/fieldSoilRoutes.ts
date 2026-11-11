// /internal/field-soil/:layerId: soil measured on a field (visit, lab, farmer's analyses), used by the
// screening instead of the national maps. Grove team only (requireRole in routes/internal.ts), and only
// for fields of Grove-owned farms, as the screening itself.
import express from "express";
import mongoose from "mongoose";
import Layer from "@rw/db/schemas/layer.ts";
import Project from "@rw/db/schemas/project.ts";
import FieldSoil from "@rw/db/schemas/internal/fieldSoil.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { groveUserIds } from "./groveRefs.ts";
import { cleanFieldSoil, hasMeasurement } from "./fieldSoil.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
router.use(express.json({ limit: "20kb" }));
const FIELDS = "layer jb ph wetDepthM rootDepthM source sampledOn notes updatedAt";

async function groveField(id: unknown): Promise<boolean> {
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) return false;
  const l: any = await Layer.findById(id).select("owner").lean();
  return !!l && (await groveUserIds()).includes(String(l.owner?.id ?? l.owner));
}

// a scenario's field and its soil, so the layout page can show the form before a screening run
router.get("/scenario/:scenarioId", async (req: Req, res) => {
  const id = req.params.scenarioId;
  const sc: any = mongoose.isValidObjectId(id) ? await Project.findById(id).select("layer").lean() : null;
  const layerId = sc?.layer ? String(sc.layer) : "";
  if (!layerId || !(await groveField(layerId))) {
    res.status(404).send({ error: "Field not found" });
    return;
  }
  const s = await FieldSoil.findOne({ layer: layerId }).select(FIELDS).lean();
  res.send({ layerId, soil: s ?? null });
});

router.get("/:layerId", async (req: Req, res) => {
  if (!(await groveField(req.params.layerId))) {
    res.status(404).send({ error: "Field not found" });
    return;
  }
  const s = await FieldSoil.findOne({ layer: req.params.layerId }).select(FIELDS).lean();
  res.send({ soil: s ?? null });
});

router.put("/:layerId", async (req: Req, res) => {
  if (!(await groveField(req.params.layerId))) {
    res.status(404).send({ error: "Field not found" });
    return;
  }
  const c = cleanFieldSoil(req.body);
  if (!c.ok) {
    res.status(400).send({ error: c.error });
    return;
  }
  if (!hasMeasurement(c.value)) {
    // a record says the field was measured; with nothing measured, clear it instead (DELETE)
    res.status(400).send({ error: "Enter at least one measured value: soil class, pH, wet depth or rooting depth" });
    return;
  }
  const s = await FieldSoil.findOneAndUpdate(
    { layer: req.params.layerId },
    { $set: { ...c.value, updatedBy: req.user?._id }, $setOnInsert: { layer: req.params.layerId } },
    { upsert: true, new: true, runValidators: true, projection: FIELDS },
  ).lean();
  res.send({ soil: s });
});

router.delete("/:layerId", async (req: Req, res) => {
  if (!(await groveField(req.params.layerId))) {
    res.status(404).send({ error: "Field not found" });
    return;
  }
  await FieldSoil.deleteOne({ layer: req.params.layerId });
  res.send({ soil: null });
});

export default router;
