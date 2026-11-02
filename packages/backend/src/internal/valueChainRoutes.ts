// /internal/value-chains: equipment catalogue and processing lines (Library →
// Value chains). Grove team only: the catalogue holds equipment prices.
import express from "express";
import GroveSetting from "@rw/db/schemas/internal/groveSetting.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { cleanLines, LIMITS, parseEquipmentCsv } from "./valueChains.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
const CATALOGUE = "equipment-catalogue";
const LINES = "value-chain-lines";

router.get("/", async (_req: Req, res) => {
  const [cat, lines]: any[] = await Promise.all([GroveSetting.findOne({ key: CATALOGUE }).lean(), GroveSetting.findOne({ key: LINES }).lean()]);
  res.send({
    catalogue: cat?.value?.items ? { version: cat.value.version ?? 1, importedAt: cat.value.importedAt, fileName: cat.value.fileName, items: cat.value.items } : null,
    lines: Array.isArray(lines?.value?.lines) ? lines.value.lines : [],
  });
});

// Import equipment.csv (sent as text, within the app's 100 kB JSON limit).
// Each import replaces the catalogue and counts up the version.
router.put("/catalogue", async (req: Req, res) => {
  const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
  const parsed = parseEquipmentCsv(csv);
  if (!parsed.ok) {
    res.status(400).send({ error: parsed.error });
    return;
  }
  const prev: any = await GroveSetting.findOne({ key: CATALOGUE }).select("value.version").lean();
  const value = {
    version: (Number(prev?.value?.version) || 0) + 1,
    importedAt: new Date().toISOString(),
    fileName: typeof req.body?.fileName === "string" ? req.body.fileName.slice(0, 100) : undefined,
    items: parsed.value,
  };
  await GroveSetting.findOneAndUpdate({ key: CATALOGUE }, { $set: { value, updatedBy: req.user?._id } }, { upsert: true });
  res.send({ catalogue: value });
});

// Save one line (create or replace). Each line is its own update, so two
// people working on different lines don't overwrite each other.
router.put("/lines/:id", async (req: Req, res) => {
  const raw = req.body?.line;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    res.status(400).send({ error: "Send the line as { line: {...} }" });
    return;
  }
  const cleaned = cleanLines({ lines: [{ ...raw, id: req.params.id, updatedAt: new Date().toISOString() }] });
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.error });
    return;
  }
  const line = cleaned.value[0];
  const replaced = await GroveSetting.findOneAndUpdate({ key: LINES, "value.lines.id": line.id }, { $set: { "value.lines.$": line, updatedBy: req.user?._id } });
  if (!replaced) {
    const doc: any = await GroveSetting.findOne({ key: LINES }).select("value.lines.id").lean();
    if ((doc?.value?.lines?.length ?? 0) >= LIMITS.lines) {
      res.status(400).send({ error: `At most ${LIMITS.lines} lines` });
      return;
    }
    await GroveSetting.updateOne({ key: LINES }, { $push: { "value.lines": line }, $set: { updatedBy: req.user?._id } }, { upsert: true });
  }
  res.send({ line });
});

router.delete("/lines/:id", async (req: Req, res) => {
  await GroveSetting.updateOne({ key: LINES }, { $pull: { "value.lines": { id: String(req.params.id) } } });
  res.send({ deleted: req.params.id });
});

export default router;
