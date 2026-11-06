// GET /model-sites-export: the traced model sites as GeoJSON, for grove-data's data jobs
// (GitHub Actions, no user login). Needs the shared key in the X-Model-Sites-Key header;
// the key lives in MODEL_SITES_EXPORT_KEY here and as a GitHub secret in grove-data.
// Without the setting (or with a key under 24 characters) the route answers 404, so it is
// closed by default. Read-only; outlines and layout only, no notes or user ids.
import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import ModelSite from "@rw/db/schemas/internal/modelSite.ts";
import { toFeatureCollection } from "../internal/modelSites.ts";

const router = express.Router();
const digest = (s: string) => createHash("sha256").update(s).digest();

/** True when the key matches the configured one (constant time; keys shorter than 24 characters never match). */
export function exportKeyOk(given: unknown, configured: string | undefined): boolean {
  if (!configured || configured.length < 24 || typeof given !== "string" || !given) return false;
  return timingSafeEqual(digest(given), digest(configured));
}

let warned = false;

router.get("/", async (req, res) => {
  const configured = process.env.MODEL_SITES_EXPORT_KEY;
  if (configured && configured.length < 24 && !warned) {
    console.warn("MODEL_SITES_EXPORT_KEY is shorter than 24 characters: the model-sites export stays closed");
    warned = true;
  }
  if (!configured || configured.length < 24) {
    res.status(404).send({ error: "Not found" });
    return;
  }
  if (!exportKeyOk(req.get("x-model-sites-key"), configured)) {
    res.status(401).send({ error: "Wrong or missing key" });
    return;
  }
  const sites = await ModelSite.find({ status: "traced" })
    .select("name batch status source sourceRef lon lat geometry system species rowBearingDeg alleyWidthM inRowSpacingM plantedYear updatedAt")
    .sort({ _id: 1 })
    .limit(5000)
    .lean();
  res.set("Cache-Control", "no-store").type("application/geo+json").send(toFeatureCollection(sites));
});

export default router;
