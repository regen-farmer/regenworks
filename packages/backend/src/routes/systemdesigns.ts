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

const router = express.Router();

/** What a design save may change: everything but its id, version and timestamps. */
export function designFields(body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const { _id: _i, __v: _v, createdAt: _c, updatedAt: _u, ...rest } = body;
  return rest;
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
      // Leave rows alone if the request didn't send any.
      const design = Array.isArray(body?.rows) ? { ...body, rows: checked.value } : body;

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
