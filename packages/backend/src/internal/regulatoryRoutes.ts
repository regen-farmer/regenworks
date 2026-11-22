// /internal/regulatory: regulatory map layers on B's screening page (Grove team only; mounted behind
// requireRole("grove-team")). For a field on a farm kept under a Grove account, the backend asks the
// public WFS services which protected areas and lines lie on or near it; the map tiles come straight
// from the public WMS services in the browser. Nothing is stored.
import express from "express";
import mongoose from "mongoose";
import Layer from "@rw/db/schemas/layer.ts";
import { groveUserIds } from "./groveRefs.ts";
import { fieldGeometry } from "./screening.ts";
import { answer, checklistWords, NEAR_M, NOT_COVERED, REG_LAYERS, wfsUrl, widen, wmsTiles, type RegResult } from "./regulatory.ts";

const router = express.Router();
const MAX_BYTES = 20_000_000;

async function features(url: string): Promise<any[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "error", headers: { "User-Agent": "GroveWorks screening" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("too large");
    const j: any = await r.json();
    return Array.isArray(j?.features) ? j.features : [];
  } finally {
    clearTimeout(t);
  }
}

// the layers for the map (public WMS tiles) and the checklist items they answer
router.get("/layers", (_req, res) => {
  res.send({ near_m: NEAR_M, layers: REG_LAYERS.map((l) => ({ id: l.id, title: l.title, checklist: l.checklist, colour: l.colour, tiles: wmsTiles(l), note: l.note })), notCovered: NOT_COVERED });
});

router.get("/field/:layerId", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.layerId)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const l: any = await Layer.findById(req.params.layerId).select("name geometry owner").lean();
  if (!l) {
    res.status(404).send({ error: "Field not found" });
    return;
  }
  if (!l.owner?.id || !(await groveUserIds()).includes(String(l.owner.id))) {
    res.status(403).send({ error: "Only fields on farms kept under a Grove account can be checked" });
    return;
  }
  const geometry = fieldGeometry(l.geometry);
  if (!geometry) {
    res.status(400).send({ error: "The field has no outline" });
    return;
  }
  const bbox = widen({ type: "Feature", properties: {}, geometry });
  const results: RegResult[] = await Promise.all(
    REG_LAYERS.map(async (layer) => {
      try {
        return answer(layer, geometry, await features(wfsUrl(layer, bbox)));
      } catch (e: any) {
        console.error("[regulatory] %s failed: %s", layer.typeName, e?.name === "AbortError" ? "timeout" : e?.message);
        return { id: layer.id, title: layer.title, checklist: layer.checklist, status: "unavailable" as const, distanceM: null, count: 0, note: layer.note, error: "The map service didn't answer" };
      }
    }),
  );
  res.send({ field: { _id: l._id, name: l.name }, near_m: NEAR_M, checkedAt: new Date().toISOString(), results, checklist: checklistWords(results) });
});

export default router;
