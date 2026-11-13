import express from "express";
import { owns } from "../middleware/ownership.ts";
import mongoose from "mongoose";

import Project from "@rw/db/schemas/project.ts";
import middleware from "../middleware/index.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import type { Auth0IDToken } from "../app.ts";
import SystemDesign from "@rw/db/schemas/systemdesign.ts";
import { sanitizeMongoDocument, inIds } from "../utils/mongoSafety.ts";
import Variety from "@rw/db/schemas/variety.ts";
import Rootstock from "@rw/db/schemas/rootstock.ts";
import { canEditDesign, checkDesignPlants, referencedIds } from "../catalogue/rules.ts";
import { MIN_SPACING, MIN_TILE_WIDTH } from "@rw/modelling/layout-grid/grid_layout.ts";

const router = express.Router();

/** What a design save may change: everything but its id, version and timestamps. */
export function designFields(body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const { _id: _i, __v: _v, createdAt: _c, updatedAt: _u, ...rest } = body;
  return rest;
}

const CORNERS = ["start-left", "start-right", "end-left", "end-right"];

/**
 * Check the layout tool settings of a design save. Returns the cleaned
 * settings, or an error message. Missing layout = leave as stored.
 */
export function cleanLayout(layout: any): { ok: true; value: any } | { ok: false; error: string } {
  if (layout === undefined) return { ok: true, value: undefined };
  if (layout === null) return { ok: true, value: { mode: "rows" } };
  if (typeof layout !== "object" || Array.isArray(layout)) {
    return { ok: false, error: "Layout settings must be an object" };
  }
  const mode = layout.mode ?? "rows";
  if (mode !== "rows" && mode !== "grid") return { ok: false, error: `Unknown layout tool "${mode}"` };
  const g = layout.grid;
  if (g === undefined || g === null) return { ok: true, value: { mode } };
  if (typeof g !== "object" || Array.isArray(g)) return { ok: false, error: "Grid settings must be an object" };

  const num = (x: any, name: string, min = -Infinity, max = Infinity) => {
    if (x === undefined || x === null || x === "") return null;
    const n = Number(x);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Grid ${name} is out of range`);
    return n;
  };
  try {
    let anchor: [number, number] | null = null;
    if (g.anchor !== undefined && g.anchor !== null) {
      if (!Array.isArray(g.anchor) || g.anchor.length !== 2) throw new Error("Grid start point must be [longitude, latitude]");
      anchor = [num(g.anchor[0], "start longitude", -180, 180)!, num(g.anchor[1], "start latitude", -90, 90)!];
      if (anchor.some((x) => x === null)) throw new Error("Grid start point must be [longitude, latitude]");
    }
    const corner = g.corner ?? null;
    if (corner !== null && !CORNERS.includes(corner)) throw new Error(`Unknown grid corner "${corner}"`);
    const pattern = g.pattern ?? null;
    if (pattern !== null && pattern !== "rectangular" && pattern !== "offset") throw new Error(`Unknown grid pattern "${pattern}"`);
    const rows = num(g.extent?.rows, "number of rows", 0, 100_000);
    return {
      ok: true,
      value: {
        mode,
        grid: {
          anchor,
          corner,
          shiftAlong: num(g.shiftAlong, "shift along", -10_000, 10_000),
          shiftAcross: num(g.shiftAcross, "shift across", -10_000, 10_000),
          pattern,
          locked: g.locked === true,
          extent: {
            rows: rows === null ? null : Math.floor(rows),
            length: num(g.extent?.length, "row length", 0, 100_000),
          },
        },
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Rows the grid layout would refuse (so a saved grid design always lays out,
 * and never drops out of farm totals later). Null when fine.
 */
export function gridRowsProblem(rows: any[]): string | null {
  const width = (rows ?? []).reduce((a, r) => a + Math.max(0, Number(r?.width) || 0), 0);
  if ((rows ?? []).length && width < MIN_TILE_WIDTH) {
    return `Grid rows must be at least ${MIN_TILE_WIDTH} m wide together.`;
  }
  for (const r of rows ?? []) {
    const seq = r?.sequence ?? [];
    const period = seq.reduce((a: number, e: any) => a + Math.max(0, Number(e?.spacingAfter) || 0), 0);
    if (seq.some((e: any) => e?.species) && period > 0 && period < MIN_SPACING) {
      return `Tree spacing along a grid row must be at least ${MIN_SPACING} m.`;
    }
  }
  return null;
}

function storedPlantIds(systemdesign: any) {
  const ids = referencedIds(systemdesign?.rows ?? []);
  return { varieties: new Set(ids.varieties), rootstocks: new Set(ids.rootstocks) };
}

// NESTED AREA SYSTEM NEW ROUTE
router.get(
  "/projects/:projectid/systemdesign",
  owns("project", "projectid", { allowPublic: true }),
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    console.log("new system");
    // FIND LAYER ID
    // try {
    //   const foundLayer = await Layer.findById(req.params.id);
    // FIND ALL SPECIES IN THE DATABASE

    const foundProject = await Project.findById(req.params.projectid).populate("systemdesign");

    if (foundProject) {
      // FIND ALL ANIMALS AND SORT
      try {
        res.send({
          // layer: foundLayer,
          systemdesign: foundProject.systemdesign,
        });
      } catch (err) {
        console.log(err);
      }
    }
    // } catch (err) {
    //   console.log(err);
    // }
  },
);

router.put(
  "/projects/:projectid/set-systemdesign",
  owns("project", "projectid"),
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT
    if (!mongoose.isValidObjectId(req.params.projectid)) {
      res.status(400).send({ error: "Invalid project id" });
      return;
    }
    const foundProject = await Project.findById(req.params.projectid).populate("systemdesign");

    // CHeck if project exists
    if (foundProject) {
      // Only the scenario's owner (or a Grove admin) may change its design.
      const ownerId = foundProject.owner?.id?.toString();
      if (!canEditDesign(req.user, ownerId)) {
        res.status(403).send({ error: "You don't have permission to change this design" });
        return;
      }

      // Check cultivars and rootstocks: they must exist, be shared or belong to
      // the design's owner (not just the editor), and a cultivar must match
      // its species. References already stored are kept or quietly dropped.
      // The page sends the whole design back, including its id and version
      // number (__v). After one save the stored version has moved on, so a
      // second save from the same page would look for a version that is gone
      // (500). The design is replaced as a whole by its owner: drop those fields.
      const body = designFields(sanitizeMongoDocument(req.body));
      const ids = referencedIds(body?.rows ?? []);
      const [varieties, rootstocks] = await Promise.all([
        ids.varieties.length ? Variety.find({ _id: inIds(ids.varieties) }).lean() : [],
        ids.rootstocks.length ? Rootstock.find({ _id: inIds(ids.rootstocks) }).lean() : [],
      ]);
      const checked = checkDesignPlants(
        body?.rows ?? [],
        {
          varieties: new Map(varieties.map((v: any) => [String(v._id), v])),
          rootstocks: new Map(rootstocks.map((r: any) => [String(r._id), r])),
        },
        ownerId ? [ownerId] : [],
        storedPlantIds(foundProject.systemdesign),
      );
      if (!checked.ok) {
        res.status(400).send({ error: checked.errors.join("; "), errors: checked.errors });
        return;
      }
      const layout = cleanLayout(body?.layout);
      if (!layout.ok) {
        res.status(400).send({ error: layout.error });
        return;
      }
      // Leave rows alone if the request didn't send any.
      const design: any = Array.isArray(body?.rows) ? { ...body, rows: checked.value } : { ...body };
      if (layout.value === undefined) delete design.layout;
      else design.layout = layout.value;

      const mode = layout.value?.mode ?? foundProject.systemdesign?.layout?.mode;
      if (mode === "grid") {
        const problem = gridRowsProblem(design.rows ?? foundProject.systemdesign?.rows ?? []);
        if (problem) {
          res.status(400).send({ error: problem });
          return;
        }
      }

      if (foundProject.systemdesign) {
        console.log("##### found system design #####");

        foundProject.systemdesign.set(design);
        await foundProject.systemdesign.save();

        const foundSystemDesign = await SystemDesign.findById(foundProject.systemdesign._id);

        res.send(foundSystemDesign).status(200);
      } else {
        console.log("##### didnt find system design #####");

        const newSystemDesign = await new SystemDesign(design);
        await newSystemDesign.save();
        foundProject.systemdesign = newSystemDesign;
        await foundProject.save();

        res.send(newSystemDesign).status(200);
      }
    } else {
      res.status(400).send({ error: "Project not found" });
    }
  },
);

export default router;
