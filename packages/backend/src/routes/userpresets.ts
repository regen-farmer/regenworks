import express from "express";
import mongoose from "mongoose";
import UserPreset from "@rw/db/schemas/userpreset.ts";
import middleware from "../middleware/index.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import type { Auth0IDToken } from "../app.ts";

const router = express.Router();

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
        systemDesign,
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

      const preset = await UserPreset.findOneAndUpdate(
        {
          _id: req.params.presetId,
          owner: req.user?._id, // Ensure user owns the preset
        },
        {
          name,
          description,
          systemDesign,
          thumbnail,
          isPublic,
        },
        { new: true },
      );
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
