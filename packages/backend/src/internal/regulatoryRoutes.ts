// /internal/regulatory: regulatory map layers on B's screening page (Grove team only; mounted behind
// requireRole("grove-team")). For a field on a farm kept under a Grove account, the backend asks the
// public WFS services which protected areas and lines lie on or near it; the map tiles come straight
// from the public WMS services in the browser. Nothing is stored.
import express from "express";
import mongoose from "mongoose";
import Layer from "@rw/db/schemas/layer.ts";
import { groveUserIds } from "./groveRefs.ts";
import { fieldGeometry } from "./screening.ts";
import { answer, checklistWords, NEAR_M, NOT_COVERED, readFeatures, REG_LAYERS, wfsUrl, widen, wmsTiles, type RegResult } from "./regulatory.ts";

const router = express.Router();
const MAX_BYTES = 6_000_000; // a 300 m window is far below this
const COMPUTE_MS = 8_000; // all layers' distance work together; the rest is "couldn't be checked"

/** One layer's features, read with a byte cap whether or not the service sends a length. */
async function fetchJson(url: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "error", headers: { "User-Agent": "GroveWorks screening" } });
    if (!r.ok || !r.body) {
      ctl.abort(); // close the connection now
      throw new Error(`HTTP ${r.status}`);
    }
    if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("too large");
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > MAX_BYTES) {
        ctl.abort();
        throw new Error("too large");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    clearTimeout(t);
  }
}

/** Every layer checked against the field. `get` fetches a URL's JSON (replaced in tests). */
export async function checkField(geometry: any, get: (url: string) => Promise<any> = fetchJson): Promise<RegResult[]> {
  const bbox = widen({ type: "Feature", properties: {}, geometry });
  // fetch in parallel; the distance work runs layer by layer under one time budget, so the backend stays responsive
  const fetched = await Promise.all(REG_LAYERS.map((layer) => get(wfsUrl(layer, bbox)).then((j) => ({ j }), (e) => ({ e }))));
  const deadline = Date.now() + COMPUTE_MS;
  const out: RegResult[] = [];
  for (const [i, layer] of REG_LAYERS.entries()) {
    const f = fetched[i] as { j?: any; e?: any };
    const read = f.e ? null : readFeatures(f.j, bbox);
    if (!read) {
      if (f.e) console.error("[regulatory] %s failed: %s", layer.typeName, f.e?.name === "AbortError" ? "timeout" : f.e?.message);
      out.push({ id: layer.id, title: layer.title, checklist: layer.checklist, status: "unavailable", distanceM: null, count: 0, note: layer.note, error: "The map service didn't answer" });
      continue;
    }
    out.push(answer(layer, geometry, read.features, read.truncated, deadline));
    await new Promise((r) => setImmediate(r)); // let other requests through between layers
  }
  return out;
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
  const results = await checkField(geometry);
  res.send({ field: { _id: l._id, name: l.name }, near_m: NEAR_M, checkedAt: new Date().toISOString(), results, checklist: checklistWords(results) });
});

export default router;
