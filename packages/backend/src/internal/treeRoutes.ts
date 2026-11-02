// /internal/projects/:id/trees: the tree register of a Grove project. Field
// users log trees (status, cause, note) on projects assigned to them, on a
// phone; the Grove team makes and removes registers. No money here.
import express from "express";
import mongoose from "mongoose";
import { canSeeMoney } from "@rw/db/access.ts";
import GroveProject from "@rw/db/schemas/internal/groveProject.ts";
import GroveTree from "@rw/db/schemas/internal/groveTree.ts";
import TreeRegister from "@rw/db/schemas/internal/treeRegister.ts";
import Parcel from "@rw/db/schemas/parcel.ts";
import Project from "@rw/db/schemas/project.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { runSystemBasedLayout } from "@rw/modelling/layout-backends/system-layout.node.ts";
import { plantNamesOf } from "@rw/modelling/planting/plant_details.ts";
import { cleanPrefix } from "@rw/modelling/planting/stakeout.ts";
import { requireRole } from "../middleware/access.ts";
import { isSet } from "../utils/mongoSafety.ts";
import { visibleFilter } from "./projects.ts";
import { CAUSES, checkUpdate, cleanTreeCheck, defaultPrefix, nearest, survival, treesFromLayout } from "./trees.ts";

type Req = express.Request & { user?: UserDocument };
const router = express.Router({ mergeParams: true });
const team = requireRole("grove-team");
const validId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);
const MAX_TREES = 100_000;

async function visibleProject(req: Req, res: express.Response) {
  if (!validId(req.params.id)) {
    res.status(400).send({ error: "Invalid id" });
    return null;
  }
  const project: any = await GroveProject.findOne({ _id: req.params.id, ...visibleFilter(req.user, canSeeMoney) }).select("_id name farm").lean();
  if (!project) res.status(404).send({ error: "Project not found" });
  return project;
}

async function registerOf(req: Req, res: express.Response) {
  const project = await visibleProject(req, res);
  if (!project) return null;
  if (!validId(req.params.registerId)) {
    res.status(400).send({ error: "Invalid register id" });
    return null;
  }
  const register: any = await TreeRegister.findOne({ _id: req.params.registerId, project: project._id }).lean();
  if (!register) res.status(404).send({ error: "Tree register not found" });
  return register ? { project, register } : null;
}

const rowNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : null;
};

/** The registers with survival per row and field. */
router.get("/", async (req: Req, res) => {
  const project = await visibleProject(req, res);
  if (!project) return;
  const registers: any[] = await TreeRegister.find({ project: project._id }).sort({ createdAt: 1 }).lean();
  const out = [];
  for (const r of registers) {
    const trees: any[] = await GroveTree.find({ register: r._id }).select("row status cause checkedAt replanted").lean();
    const s = survival(trees);
    out.push({
      _id: r._id,
      name: r.name,
      prefix: r.prefix,
      design: r.design,
      trees: r.trees,
      rowCount: r.rows,
      rowChecks: r.rowChecks ?? {},
      createdAt: r.createdAt,
      field: s.field,
      rowStats: s.rows,
    });
  }
  res.send({ registers: out, causes: CAUSES });
});

/** The farm's designs (field + scenario) a register can be made from. */
router.get("/designs", team, async (req: Req, res) => {
  const project = await visibleProject(req, res);
  if (!project) return;
  if (!project.farm) {
    res.send({ designs: [] });
    return;
  }
  const farm: any = await Parcel.findById(project.farm)
    .select("layers")
    .populate({ path: "layers", select: "name projects", populate: { path: "projects", select: "name systemdesign" } })
    .lean();
  const designs = (farm?.layers ?? []).flatMap((l: any) =>
    (l?.projects ?? [])
      .filter((p: any) => p?.systemdesign)
      .map((p: any) => ({ _id: p._id, field: l.name, scenario: p.name, prefix: defaultPrefix(l.name) })),
  );
  res.send({ designs });
});

/** Make a register from a design: every tree, named like the stake-out files. */
router.post("/", team, async (req: Req, res) => {
  const project = await visibleProject(req, res);
  if (!project) return;
  const designId = req.body?.design;
  const prefix = cleanPrefix(typeof req.body?.prefix === "string" ? req.body.prefix : "");
  if (!validId(designId)) {
    res.status(400).send({ error: "Choose a design" });
    return;
  }
  if (!prefix) {
    res.status(400).send({ error: "Enter a tree-ID prefix (letters and digits), so trees in two fields don't share IDs" });
    return;
  }
  const design: any = await Project.findById(designId)
    .populate("layer")
    .populate({
      path: "systemdesign",
      populate: [{ path: "rows.sequence.species" }, { path: "rows.sequence.variety", select: "name" }, { path: "rows.sequence.rootstock", select: "name" }],
    })
    .exec();
  if (!design?.systemdesign || !design?.layer?.geometry) {
    res.status(400).send({ error: "That design has no field or system design" });
    return;
  }
  // only a design on this project's farm
  if (!project.farm || !(await Parcel.exists({ _id: project.farm, layers: design.layer._id }))) {
    res.status(400).send({ error: "That design isn't on this project's farm" });
    return;
  }
  if (await TreeRegister.exists({ project: project._id, $or: [{ design: design._id }, { prefix }] })) {
    res.status(409).send({ error: "This project already has a register for that design or with that prefix" });
    return;
  }
  let trees;
  try {
    const layout = await runSystemBasedLayout(design.systemdesign, design.layer.geometry);
    trees = treesFromLayout(layout, plantNamesOf(design.systemdesign), prefix);
  } catch (err) {
    console.error("[trees] layout failed for design %s: %s", String(design._id), (err as Error).message);
    res.status(422).send({ error: `Could not lay out the design: ${(err as Error).message}` });
    return;
  }
  if (!trees.length) {
    res.status(400).send({ error: "The design has no trees" });
    return;
  }
  if (trees.length > MAX_TREES) {
    res.status(400).send({ error: `The design has ${trees.length} trees; the register takes at most ${MAX_TREES}` });
    return;
  }
  const name = [design.layer.name, design.name].filter(Boolean).join(" · ").slice(0, 200) || "Field";
  let register: any;
  try {
    register = await TreeRegister.create({
      project: project._id,
      design: design._id,
      name,
      prefix,
      trees: trees.length,
      rows: new Set(trees.map((t) => t.row)).size,
      createdBy: req.user?._id,
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      res.status(409).send({ error: "This project already has a register for that design or with that prefix" });
      return;
    }
    throw err;
  }
  try {
    for (let i = 0; i < trees.length; i += 2000) {
      await GroveTree.insertMany(
        trees.slice(i, i + 2000).map((t) => ({ ...t, register: register._id, project: project._id })),
        { ordered: false },
      );
    }
  } catch (err) {
    // no half registers
    await GroveTree.deleteMany({ register: register._id });
    await TreeRegister.deleteOne({ _id: register._id });
    throw err;
  }
  res.status(201).send({ _id: register._id, name, prefix, trees: trees.length, rows: register.rows });
});

/** Remove a register; only while no tree in it has been checked, so field records are never lost by a click. */
router.delete("/:registerId", team, async (req: Req, res) => {
  const found = await registerOf(req, res);
  if (!found) return;
  if (await GroveTree.exists({ register: found.register._id, checkedAt: isSet() })) {
    res.status(409).send({ error: "Trees in this register have been checked; it can't be deleted" });
    return;
  }
  await GroveTree.deleteMany({ register: found.register._id });
  await TreeRegister.deleteOne({ _id: found.register._id });
  res.status(204).send();
});

const TREE_FIELDS = "name row tree species label lon lat positionSource status cause note checkedAt replanted";

/** One row's trees, in order along the row. */
router.get("/:registerId/rows/:row", async (req: Req, res) => {
  const row = rowNumber(req.params.row);
  if (row === null) {
    res.status(400).send({ error: "Invalid row" });
    return;
  }
  const found = await registerOf(req, res);
  if (!found) return;
  const trees = await GroveTree.find({ register: found.register._id, row }).select(TREE_FIELDS).sort({ tree: 1 }).lean();
  res.send({ row, trees, checked: found.register.rowChecks?.[String(row)] ?? null });
});

/** The trees nearest the phone's position. */
router.get("/:registerId/near", async (req: Req, res) => {
  const lon = Number(req.query.lon);
  const lat = Number(req.query.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.status(400).send({ error: "Send lon and lat" });
    return;
  }
  const found = await registerOf(req, res);
  if (!found) return;
  const trees: any[] = await GroveTree.find({ register: found.register._id }).select("name row tree lon lat").lean();
  res.send({ trees: nearest(trees, lon, lat, 5) });
});

/** One tree with its history. */
router.get("/:registerId/trees/:name", async (req: Req, res) => {
  const found = await registerOf(req, res);
  if (!found) return;
  const tree = await GroveTree.findOne({ register: found.register._id, name: String(req.params.name) }).select(`${TREE_FIELDS} history`).lean();
  if (!tree) {
    res.status(404).send({ error: "Tree not found" });
    return;
  }
  res.send({ tree });
});

/** Log a check of one tree. */
router.put("/:registerId/trees/:name", async (req: Req, res) => {
  const cleaned = cleanTreeCheck(req.body);
  if (!cleaned.ok) {
    res.status(400).send({ error: cleaned.error });
    return;
  }
  const found = await registerOf(req, res);
  if (!found) return;
  const tree = await GroveTree.findOneAndUpdate({ register: found.register._id, name: String(req.params.name) }, checkUpdate(cleaned.value, req.user?._id), {
    new: true,
    runValidators: true,
    projection: TREE_FIELDS,
  }).lean();
  if (!tree) {
    res.status(404).send({ error: "Tree not found" });
    return;
  }
  res.send({ tree });
});

/** Mark a row as walked: every tree in it was looked at (the ones not logged are alive). */
router.put("/:registerId/rows/:row/checked", async (req: Req, res) => {
  const row = rowNumber(req.params.row);
  if (row === null) {
    res.status(400).send({ error: "Invalid row" });
    return;
  }
  const found = await registerOf(req, res);
  if (!found) return;
  if (row > found.register.rows) {
    res.status(404).send({ error: "No such row" });
    return;
  }
  const at = new Date();
  await TreeRegister.updateOne({ _id: found.register._id }, { $set: { [`rowChecks.${row}`]: { at, by: req.user?._id } } });
  res.send({ row, checked: { at } });
});

const csvCell = (v: unknown) => {
  const s = String(v ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/^[=+\-@]+/, "");
  return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The register as CSV, e.g. for the guarantee count. */
router.get("/:registerId/export.csv", async (req: Req, res) => {
  const found = await registerOf(req, res);
  if (!found) return;
  const trees: any[] = await GroveTree.find({ register: found.register._id }).select(TREE_FIELDS).sort({ row: 1, tree: 1 }).lean();
  const head = ["tree_id", "row", "tree", "plant", "status", "cause", "note", "checked", "replanted", "lon", "lat", "position"];
  const lines = trees.map((t) =>
    [t.name, t.row, t.tree, t.label, t.status, t.cause ?? "", t.note ?? "", t.checkedAt ? new Date(t.checkedAt).toISOString().slice(0, 10) : "", t.replanted || 0, t.lon, t.lat, t.positionSource]
      .map(csvCell)
      .join(","),
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="tree-register-${found.register.prefix || "field"}.csv"`);
  res.send(`﻿${[head.join(","), ...lines].join("\n")}\n`);
});

export default router;
