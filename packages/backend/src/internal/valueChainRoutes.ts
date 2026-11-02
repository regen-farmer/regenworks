// /internal/value-chains: equipment catalogue and processing lines (Library →
// Value chains). Grove team only: the catalogue holds equipment prices.
import express from "express";
import mongoose from "mongoose";
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

// Import equipment.csv, sent as text/csv (the app's JSON limit is 100 kB, too
// small for a long catalogue). Each import replaces the catalogue and counts up the version.
router.put("/catalogue", express.text({ type: "text/csv", limit: "2mb" }), async (req: Req, res) => {
  const csv = typeof req.body === "string" ? req.body : typeof req.body?.csv === "string" ? req.body.csv : "";
  const parsed = parseEquipmentCsv(csv);
  if (!parsed.ok) {
    res.status(400).send({ error: parsed.error });
    return;
  }
  const prev: any = await GroveSetting.findOne({ key: CATALOGUE }).select("value.version").lean();
  const value = {
    version: (Number(prev?.value?.version) || 0) + 1,
    importedAt: new Date().toISOString(),
    fileName: typeof req.query.fileName === "string" ? req.query.fileName.slice(0, 100) : undefined,
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
  const replace = () => GroveSetting.updateOne({ key: LINES, "value.lines.id": line.id }, { $set: { "value.lines.$": line, updatedBy: req.user?._id } });
  // Add only if no line has this id and the list isn't full: one atomic update,
  // so two saves at once can't add the same line twice or pass the limit.
  const add = () =>
    GroveSetting.updateOne(
      { key: LINES, "value.lines.id": mongoose.trusted({ $ne: line.id }), [`value.lines.${LIMITS.lines - 1}`]: mongoose.trusted({ $exists: false }) },
      { $push: { "value.lines": line }, $set: { updatedBy: req.user?._id } },
    );
  if ((await replace()).matchedCount) return void res.send({ line });
  if ((await add()).matchedCount) return void res.send({ line });
  const doc: any = await GroveSetting.findOne({ key: LINES }).select("value.lines.id").lean();
  if (!doc) {
    try {
      await GroveSetting.create({ key: LINES, value: { lines: [line] }, updatedBy: req.user?._id });
      return void res.send({ line });
    } catch (e: any) {
      if (e?.code !== 11000) throw e; // created at the same moment by another save: fall through
    }
  }
  if ((await replace()).matchedCount || (await add()).matchedCount) return void res.send({ line });
  res.status(400).send({ error: `At most ${LIMITS.lines} lines` });
});

router.delete("/lines/:id", async (req: Req, res) => {
  await GroveSetting.updateOne({ key: LINES }, { $pull: { "value.lines": { id: String(req.params.id) } } });
  res.send({ deleted: req.params.id });
});

export default router;
