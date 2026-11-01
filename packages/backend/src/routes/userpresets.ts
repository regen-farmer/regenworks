import express from "express";
import UserPreset from "@rw/db/schemas/userpreset.ts";
import middleware from "../middleware/index.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import type { Auth0IDToken } from "../app.ts";
import { sanitizeMongoDocument } from "../utils/mongoSafety.ts";
import Variety from "@rw/db/schemas/variety.ts";
import Rootstock from "@rw/db/schemas/rootstock.ts";
import { referencedIds, stripUnusablePlants } from "../catalogue/rules.ts";

const router = express.Router();

/**
 * Remove cultivar/rootstock references other users of the preset couldn't
 * use: public presets keep shared entries only, private ones also the owner's.
 */
async function presetDesign(systemDesign: any, ownerId: string | undefined, isPublic: boolean) {
  if (!systemDesign || !Array.isArray(systemDesign.rows)) return systemDesign;
  const ids = referencedIds(systemDesign.rows);
  if (!ids.varieties.length && !ids.rootstocks.length) return systemDesign;
  const [varieties, rootstocks] = await Promise.all([
    Variety.find({ _id: { $in: ids.varieties } }).lean(),
    Rootstock.find({ _id: { $in: ids.rootstocks } }).lean(),
  ]);
  return {
    ...systemDesign,
    rows: stripUnusablePlants(
      systemDesign.rows,
      {
        varieties: new Map(varieties.map((v: any) => [String(v._id), v])),
        rootstocks: new Map(rootstocks.map((r: any) => [String(r._id), r])),
      },
      isPublic || !ownerId ? [] : [ownerId],
    ),
  };
}

// GET all user's presets
router.get(
  "/userpresets",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const presets = await UserPreset.find({ owner: req.user?._id }).sort({ createdAt: -1 });
      // Don't populate to keep only IDs
      res.json({ presets });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch presets" });
    }
  },
);

// GET public presets (for sharing)
router.get(
  "/userpresets/public",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const presets = await UserPreset.find({ isPublic: true })
        .sort({ createdAt: -1 })
        .populate("owner", "email");
      // Don't populate species to keep only IDs
      res.json({ presets });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch public presets" });
    }
  },
);

// GET single preset
router.get(
  "/userpresets/:presetId",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const preset = await UserPreset.findOne({
        _id: req.params.presetId,
        $or: [{ owner: req.user?._id }, { isPublic: true }],
      });
      // Don't populate to keep only IDs

      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      res.json({ preset });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch preset" });
    }
  },
);

// CREATE new preset
router.post(
  "/userpresets",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const { name, description, systemDesign, thumbnail, isPublic } = req.body;

      const newPreset = new UserPreset({
        owner: req.user?._id,
        name,
        description,
        systemDesign:
          systemDesign === undefined
            ? undefined
            : await presetDesign(
                sanitizeMongoDocument(systemDesign),
                req.user?._id.toString(),
                !!isPublic,
              ),
        thumbnail,
        isPublic: isPublic || false,
      });

      const savedPreset = await newPreset.save();
      // Don't populate the species to keep only IDs in frontend

      res.status(201).json({ preset: savedPreset });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create preset" });
    }
  },
);

// UPDATE preset
router.put(
  "/userpresets/:presetId",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const { name, description, systemDesign, thumbnail, isPublic } = req.body;

      const preset = await UserPreset.findOne({
        _id: req.params.presetId,
        owner: req.user?._id, // Ensure user owns the preset
      });

      const willBePublic = isPublic ?? preset?.isPublic ?? false;
      const clean = sanitizeMongoDocument({ name, description, systemDesign, thumbnail, isPublic });
      if (clean.systemDesign) {
        clean.systemDesign = await presetDesign(
          clean.systemDesign,
          req.user?._id.toString(),
          !!willBePublic,
        );
      } else if (willBePublic && preset?.systemDesign) {
        // Made public without sending the design: tidy the stored one.
        const stored = (preset.systemDesign as any).toObject?.() ?? preset.systemDesign;
        clean.systemDesign = await presetDesign(stored, req.user?._id.toString(), true);
      }
      preset?.set(clean);
      await preset?.save();
      // Don't populate to keep only IDs

      if (!preset) {
        return res.status(404).json({ error: "Preset not found or unauthorized" });
      }

      res.json({ preset });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update preset" });
    }
  },
);

// DELETE preset
router.delete(
  "/userpresets/:presetId",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const result = await UserPreset.deleteOne({
        _id: req.params.presetId,
        owner: req.user?._id, // Ensure user owns the preset
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "Preset not found or unauthorized" });
      }

      res.json({ message: "Preset deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete preset" });
    }
  },
);

export default router;
