// /internal/screening: run grove-twin's screening model on a field or on a scenario's design.
// Grove team only (mounted behind requireRole("grove-team") in routes/internal.ts). GroveWorks
// forwards the field outline (and the design's trees) to the screening service with a shared key
// (SCREENING_URL, SCREENING_KEY); nothing is stored.
import express from "express";
import mongoose from "mongoose";
import Layer from "@rw/db/schemas/layer.ts";
import Parcel from "@rw/db/schemas/parcel.ts";
import Project from "@rw/db/schemas/project.ts";
import GroveProject from "@rw/db/schemas/internal/groveProject.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { inIds } from "../utils/mongoSafety.ts";
import { canSeeMoney } from "@rw/db/access.ts";
import { groveUserIds } from "./groveRefs.ts";
import { visibleFilter } from "./projects.ts";
import { ALL_MODEL_SPECIES, MAX_RESULT_BYTES, cleanSpecies, designSpecies, fieldGeometry, pickResult, serviceConfig } from "./screening.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router();
const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);

// the fields of a Grove project's linked farm, to choose one to screen
router.get("/project/:id/fields", async (req: Req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return;
  }
  const p: any = await GroveProject.findOne({ _id: req.params.id, ...visibleFilter(req.user, canSeeMoney) }).select("farm").lean();
  if (!p) {
    res.status(404).send({ error: "Project not found" });
    return;
  }
  if (!p.farm) {
    res.send({ fields: [], configured: !!serviceConfig() });
    return;
  }
  const farm: any = await Parcel.findById(p.farm).select("name layers").lean();
  const layers: any[] = farm?.layers?.length ? await Layer.find({ _id: inIds(farm.layers.map(String).filter(validId)) }).select("name geometry size").lean() : [];
  res.send({
    farm: farm ? { _id: farm._id, name: farm.name } : null,
    fields: layers.map((l) => ({ _id: l._id, name: l.name, size: l.size, geometry: fieldGeometry(l.geometry) })).filter((l) => l.geometry),
    configured: !!serviceConfig(),
  });
});

// run the screening: { fieldId } for a field, or { scenarioId } for a scenario's field and design
router.post("/run", async (req: Req, res) => {
  const cfg = serviceConfig();
  if (!cfg) {
    res.status(503).send({ error: "The screening service isn't set up yet (SCREENING_URL and SCREENING_KEY on the backend)." });
    return;
  }
  const { fieldId, scenarioId } = req.body ?? {};
  let geometry: ReturnType<typeof fieldGeometry> = null;
  let species = cleanSpecies(req.body?.species);
  let notCovered: string[] = [];
  let fieldName: string | undefined;
  let owner: unknown;
  if (validId(scenarioId)) {
    const sc: any = await Project.findById(scenarioId)
      .select("layer systemdesign")
      .populate("layer", "name geometry owner")
      .populate({ path: "systemdesign", select: "rows", populate: { path: "rows.sequence.species", select: "nameCommon genus species" } })
      .lean();
    if (!sc?.layer) {
      res.status(404).send({ error: "Scenario not found" });
      return;
    }
    owner = sc.layer.owner?.id;
    geometry = fieldGeometry(sc.layer.geometry);
    fieldName = sc.layer.name;
    const ds = designSpecies(sc.systemdesign?.rows);
    notCovered = ds.notCovered;
    if (!species.length) species = ds.covered;
    if (!species.length) {
      res.status(400).send({ error: "None of the trees in this design are in the screening model yet (walnut, chestnut, hazel, aronia, sea buckthorn, blackcurrant).", notCovered });
      return;
    }
  } else if (validId(fieldId)) {
    const l: any = await Layer.findById(fieldId).select("name geometry owner").lean();
    if (!l) {
      res.status(404).send({ error: "Field not found" });
      return;
    }
    owner = l.owner?.id;
    geometry = fieldGeometry(l.geometry);
    fieldName = l.name;
  } else {
    res.status(400).send({ error: "Send a fieldId or a scenarioId" });
    return;
  }
  // only fields kept under a Grove account (Grove's own and its clients' farms), never a public user's field
  if (!owner || !(await groveUserIds()).includes(String(owner))) {
    res.status(403).send({ error: "Only fields on farms kept under a Grove account can be screened" });
    return;
  }
  if (!geometry) {
    res.status(400).send({ error: "The field has no outline to screen" });
    return;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 120_000);
  try {
    const r = await fetch(`${cfg.url}/screen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Screening-Key": cfg.key },
      body: JSON.stringify({ outline: geometry, species: species.length ? species : ALL_MODEL_SPECIES.slice(0, 3), layers: true }),
      signal: ctl.signal,
      redirect: "error", // the key must not follow a redirect elsewhere
    });
    if (Number(r.headers.get("content-length") ?? 0) > MAX_RESULT_BYTES) {
      res.status(502).send({ error: "The screening service sent too much" });
      return;
    }
    const body: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      // the service's own message (e.g. "not screened yet") is meant for the screen; never pass on a 401 as is
      const status = r.status === 404 || r.status === 400 ? r.status : 502;
      res.status(status).send({ error: r.status === 401 ? "The screening service rejected the key" : (typeof body.detail === "string" ? body.detail.slice(0, 300) : "The screening service failed") });
      return;
    }
    res.send({ ...pickResult(body), field: fieldName, notCovered });
  } catch (e: any) {
    // the cause (DNS, TLS, refused, a redirect) for the backend's logs; never the key
    console.error("screening service call failed:", e?.name, e?.message, e?.cause?.code ?? e?.cause?.message ?? "");
    res.status(504).send({ error: e?.name === "AbortError" ? "The screening service took too long" : "The screening service can't be reached" });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
