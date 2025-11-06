import express from "express";
import type { Request } from "express";
import { Types } from "mongoose";
import middleware from "../middleware/index.ts";
import FarmScenarioConfig from "@rw/db/schemas/farmScenarioConfig.ts";
import Parcel from "@rw/db/schemas/parcel.ts";
import Layer from "@rw/db/schemas/layer.ts";
import Project from "@rw/db/schemas/project.ts";
import { type UserDocument } from "@rw/db/schemas/user.ts";
import type { Auth0IDToken } from "../app.ts";

const router = express.Router();

type AuthRequest = Request & {
  user?: UserDocument;
  idToken?: Auth0IDToken;
};

// GET /farmscenarioconfigs - List all configs for current user
router.get("/farmscenarioconfigs", middleware.isLoggedIn, async (req: AuthRequest, res) => {
  try {
    const configs = await FarmScenarioConfig.find({ user: req.user!._id })
      .populate("parcel", "name description")
      .sort("-updatedAt");
    
    res.send(configs);
  } catch (error) {
    console.error("Error fetching farm planting plan configs:", error);
    res.status(500).send({ error: "Failed to fetch configurations" });
  }
});

// GET /parcels/:parcelId/farmscenarioconfigs - Get configs for a specific parcel
router.get("/parcels/:parcelId/farmscenarioconfigs", middleware.isLoggedIn, async (req: AuthRequest, res) => {
  try {
    // Check parcel ownership
    const parcel = await Parcel.findById(req.params.parcelId);
    if (!parcel) {
      return res.status(404).send({ error: "Parcel not found" });
    }
    if (parcel.owner.id.toString() !== req.user!._id.toString()) {
      return res.status(403).send({ error: "Unauthorized" });
    }

    const configs = await FarmScenarioConfig.find({ 
      user: req.user!._id,
      parcel: req.params.parcelId 
    }).sort("-updatedAt");
    
    res.send(configs);
  } catch (error) {
    console.error("Error fetching parcel configs:", error);
    res.status(500).send({ error: "Failed to fetch configurations" });
  }
});

// GET /farmscenarioconfigs/:id - Get a specific config with full population
router.get("/farmscenarioconfigs/:id", middleware.isLoggedIn, async (req: AuthRequest, res) => {
  try {
    const config = await FarmScenarioConfig.findById(req.params.id)
      .populate("parcel")
      .populate({
        path: "fieldScenarios.layer",
        select: "name description geometry lat lng"
      })
      .populate({
        path: "fieldScenarios.project",
        select: "name description systemdesign",
        populate: {
          path: "systemdesign"
        }
      });
    
    if (!config) {
      return res.status(404).send({ error: "Configuration not found" });
    }
    
    // Check ownership or public access
    if (config.user.toString() !== req.user!._id.toString() && !config.isPublic) {
      return res.status(403).send({ error: "Unauthorized" });
    }
    
    const configData = config.toObject({ virtuals: true });
    res.status(200).send(configData);
  } catch (error) {
    console.error("Error fetching config:", error);
    res.status(500).send({ error: "Failed to fetch configuration" });
  }
});

// POST /farmscenarioconfigs - Create a new config
router.post("/farmscenarioconfigs", middleware.isLoggedIn, async (req: AuthRequest, res) => {
  try {
    console.log("Creating farm planting plan config with body:", JSON.stringify(req.body, null, 2));
    
    // Verify parcel ownership
    const parcel = await Parcel.findById(req.body.parcel);
    if (!parcel) {
      return res.status(404).send({ error: "Parcel not found" });
    }
    if (parcel.owner.id.toString() !== req.user!._id.toString()) {
      return res.status(403).send({ error: "Unauthorized to create config for this parcel" });
    }
    
    // Verify layer ownership for all field scenarios
    if (req.body.fieldScenarios && req.body.fieldScenarios.length > 0) {
      for (const fieldScenario of req.body.fieldScenarios) {
        // Skip if layer is not provided (might happen for disabled fields)
        if (!fieldScenario.layer) {
          continue;
        }
        
        const layer = await Layer.findById(fieldScenario.layer);
        if (!layer) {
          return res.status(404).send({ error: `Layer ${fieldScenario.layer} not found` });
        }
        
        // Check if the layer belongs to this parcel by checking if it's in the parcel's layers array
        // The parcel.layers array contains ObjectIds, not populated documents
        const layerBelongsToParcel = parcel.layers.some((layerId: any) => {
          // Convert both to strings for comparison
          return layerId.toString() === fieldScenario.layer.toString();
        });
        
        if (!layerBelongsToParcel) {
          // Log for debugging
          console.log("Layer validation failed:");
          console.log("Parcel layers:", parcel.layers.map((l: any) => l.toString()));
          console.log("Requested layer:", fieldScenario.layer);
          return res.status(400).send({ error: `Layer ${fieldScenario.layer} does not belong to the specified parcel` });
        }
        
        // Verify project if specified
        if (fieldScenario.project) {
          const project = await Project.findById(fieldScenario.project);
          if (!project) {
            return res.status(404).send({ error: `Project ${fieldScenario.project} not found` });
          }
          if (project.layer.toString() !== fieldScenario.layer) {
            return res.status(400).send({ error: "Project does not belong to the specified layer" });
          }
        }
      }
    }
    
    // Filter out field scenarios without layers
    const validFieldScenarios = (req.body.fieldScenarios || []).filter(
      (fs: any) => fs.layer && fs.enabled !== false
    );
    
    const config = new FarmScenarioConfig({
      ...req.body,
      fieldScenarios: validFieldScenarios,
      user: req.user!._id
    });
    
    await config.save();
    
    res.status(201).send(config);
  } catch (error) {
    console.error("Error creating config:", error);
    res.status(500).send({ error: "Failed to create configuration" });
  }
});

// PUT /farmscenarioconfigs/:id - Update a config
router.put("/farmscenarioconfigs/:id", middleware.isLoggedIn, async (req: AuthRequest, res) => {
  try {
    const config = await FarmScenarioConfig.findById(req.params.id);
    
    if (!config) {
      return res.status(404).send({ error: "Configuration not found" });
    }
    
    // Check ownership
    if (config.user.toString() !== req.user!._id.toString()) {
      return res.status(403).send({ error: "Unauthorized" });
    }
    
    // Don't allow changing user or parcel
    delete req.body.user;
    delete req.body.parcel;
    
    // Verify layer and project ownership if updating field scenarios
    if (req.body.fieldScenarios && req.body.fieldScenarios.length > 0) {
      // Fetch the parcel to check layer ownership
      const parcel = await Parcel.findById(config.parcel).populate("layers");
      if (!parcel) {
        return res.status(404).send({ error: "Parcel not found" });
      }

      // console.log('Layers', JSON.stringify(parcel.layers))

      // console.log(layerId.toString())
      
      for (const fieldScenario of req.body.fieldScenarios) {
        const layer = await Layer.findById(fieldScenario.layer);
        if (!layer) {
          return res.status(404).send({ error: `Layer ${fieldScenario.layer} not found` });
        }

        fieldScenario.toString()
        
        // Check if the layer belongs to this parcel
        const layerBelongsToParcel = parcel.layers.some((layer: any) => 
          layer._id.toString() === fieldScenario.layer.toString()
        );
        
        if (!layerBelongsToParcel) {
          return res.status(400).send({ error: "Layer does not belong to the config's parcel" });
        }
        
        if (fieldScenario.project) {
          const project = await Project.findById(fieldScenario.project);
          if (!project) {
            return res.status(404).send({ error: `Project ${fieldScenario.project} not found` });
          }
          if (project.layer.toString() !== fieldScenario.layer) {
            return res.status(400).send({ error: "Project does not belong to the specified layer" });
          }
        }
      }
    }
    
    const updatePayload: Partial<typeof config> = {};

    if (typeof req.body.name === "string") {
      updatePayload.name = req.body.name.trim();
    }

    if (typeof req.body.description === "string") {
      updatePayload.description = req.body.description.trim();
    }

    if (req.body.displaySettings && typeof req.body.displaySettings === "object") {
      updatePayload.displaySettings = {
        ...config.displaySettings?.toObject?.() ?? config.displaySettings,
        ...req.body.displaySettings,
      } as typeof config.displaySettings;
    }

    if (typeof req.body.isPublic === "boolean") {
      updatePayload.isPublic = req.body.isPublic;
    }

    if (typeof req.body.showOfferButton === "boolean") {
      updatePayload.showOfferButton = req.body.showOfferButton;
    }

    if (Array.isArray(req.body.fieldScenarios)) {
      const normalizedScenarios = req.body.fieldScenarios.map((fieldScenario: any, index: number) => {
        const layerIdString = fieldScenario.layer ? String(fieldScenario.layer) : undefined;

        const layerObjectId = layerIdString
          ? Types.ObjectId.isValid(layerIdString)
            ? new Types.ObjectId(layerIdString)
            : undefined
          : undefined;

        if (!layerObjectId) {
          console.warn(
            `[FarmScenarioConfigs] Skipping fieldScenario index ${index} due to invalid layer id`,
            fieldScenario.layer
          );
          return undefined;
        }

        const scenarioPayload: any = {
          layer: layerObjectId,
          enabled: typeof fieldScenario.enabled === "boolean" ? fieldScenario.enabled : true,
          displayOrder: typeof fieldScenario.displayOrder === "number" ? fieldScenario.displayOrder : undefined,
        };

        if (fieldScenario.project === null || typeof fieldScenario.project === "undefined") {
          scenarioPayload.project = undefined;
        } else if (fieldScenario.project) {
          const projectIdString = String(fieldScenario.project);
          scenarioPayload.project = Types.ObjectId.isValid(projectIdString)
            ? new Types.ObjectId(projectIdString)
            : undefined;
        }

        return scenarioPayload;
      });

      updatePayload.fieldScenarios = normalizedScenarios.filter(Boolean) as any;
    }

    config.set(updatePayload);
    await config.save();

    res.status(200).send(config);
  } catch (error) {
    console.error("Error updating config:", error);
    res.status(500).send({ error: "Failed to update configuration" });
  }
});

// DELETE /farmscenarioconfigs/:id - Delete a config
router.delete("/farmscenarioconfigs/:id", middleware.isLoggedIn, async (req: AuthRequest, res) => {
  try {
    const config = await FarmScenarioConfig.findById(req.params.id);
    
    if (!config) {
      return res.status(404).send({ error: "Configuration not found" });
    }
    
    // Check ownership
    if (config.user.toString() !== req.user!._id.toString()) {
      return res.status(403).send({ error: "Unauthorized" });
    }
    
    await config.deleteOne();
    
    res.send({ message: "Configuration deleted successfully" });
  } catch (error) {
    console.error("Error deleting config:", error);
    res.status(500).send({ error: "Failed to delete configuration" });
  }
});

// GET /farmscenarioconfigs/:id/preview - Get preview data for a config (supports public access)
router.get("/farmscenarioconfigs/:id/preview", async (req: AuthRequest, res) => {
  try {
    console.log("Fetching preview for config:", req.params.id);
    
    const config = await FarmScenarioConfig.findById(req.params.id)
      .populate({
        path: "user",
        select: "_id countryCode"
      })
      .populate({
        path: "parcel",
        select: "name description lat lng"
      })
      .populate({
        path: "fieldScenarios.layer",
        select: "name description geometry lat lng"
      })
      .populate({
        path: "fieldScenarios.project",
        select: "name description systemdesign",
        populate: {
          path: "systemdesign",
          select: "rows margin headland bearing"
        }
      });
    
    if (!config) {
      console.log("Config not found:", req.params.id);
      return res.status(404).json({ error: "Configuration not found" });
    }
    
    // Check if config is public
    if (config.isPublic) {
      // Public configs can be accessed by anyone
      console.log("Serving public config:", req.params.id);
      const configData = config.toObject();
      return res.json(configData);
    }
    
    // For non-public configs, check authentication
    if (!req.user) {
      console.log("Authentication required for private config:", req.params.id);
      return res.status(401).json({ error: "Authentication required" });
    }
    
    // Check ownership for private configs
    if (config.user.toString() !== req.user._id.toString()) {
      console.log("Unauthorized access to private config:", req.params.id);
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    // Ensure we're sending valid JSON
    const configData = config.toObject();
    console.log("Sending preview data for config:", req.params.id);
    res.json(configData);
  } catch (error) {
    console.error("Error fetching preview:", error);
    res.status(500).json({
      error: "Failed to fetch preview data",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
