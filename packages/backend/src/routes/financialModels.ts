import FarmScenarioConfig from "@rw/db/schemas/farmScenarioConfig.ts";
import FinancialModel from "@rw/db/schemas/financialModel.ts";
import Species from "@rw/db/schemas/species.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import express from "express";
import type { Auth0IDToken } from "../app.ts";
import {
  calculateFarmFinancials,
  type FarmFinancialsResult,
  generateFinancialsCSV,
} from "../middleware/farmFinancials.ts";
import middleware from "../middleware/index.ts";
import {
  calculateYieldEstimation,
  generateYieldCSV,
} from "../middleware/yieldEstimation.ts";

const router = express.Router();

type AuthRequest = express.Request & {
  user?: UserDocument;
  idToken?: Auth0IDToken;
};

/**
 * Helper to fetch and compute financials for a model
 */
async function computeFinancials(modelId: string): Promise<FarmFinancialsResult | null> {
  const model = await FinancialModel.findById(modelId);
  if (!model) return null;

  // Get the farm scenario config with populated field scenarios
  const config = await FarmScenarioConfig.findById(model.farmScenarioConfig)
    .populate({
      path: "fieldScenarios.layer",
      select: "name geometry lat lng",
    })
    .populate({
      path: "fieldScenarios.project",
      select: "name systemdesign",
      populate: {
        path: "systemdesign",
        populate: [
          {
            path: "rows.sequence.species",
            model: "Species",
          },
          {
            path: "rows.groundcover",
            model: "Species",
          },
        ],
      },
    });

  if (!config) return null;

  // Build field scenarios data
  const fieldScenarios = config.fieldScenarios
    .filter((fs: any) => fs.enabled && fs.layer && fs.project)
    .map((fs: any) => ({
      layer: {
        _id: fs.layer._id.toString(),
        name: fs.layer.name || "Unnamed Field",
        geometry: fs.layer.geometry,
      },
      project: fs.project
        ? {
            _id: fs.project._id.toString(),
            name: fs.project.name,
            systemdesign: fs.project.systemdesign,
          }
        : undefined,
    }));

  // Collect all species IDs from the field scenarios (both trees and ground cover)
  const speciesIds = new Set<string>();
  for (const fs of fieldScenarios) {
    if (fs.project?.systemdesign?.rows) {
      for (const row of fs.project.systemdesign.rows) {
        // Collect tree species from sequence
        if (row.sequence) {
          for (const entry of row.sequence) {
            // Species may have _id or id depending on how it's stored
            const speciesId = entry.species?._id || entry.species?.id;
            if (speciesId) {
              speciesIds.add(speciesId.toString());
            } else if (typeof entry.species === "string") {
              speciesIds.add(entry.species);
            }
          }
        }
        // Collect ground cover species
        if (row.groundcover) {
          const groundcoverId = row.groundcover?._id || row.groundcover?.id;
          if (groundcoverId) {
            speciesIds.add(groundcoverId.toString());
          } else if (typeof row.groundcover === "string") {
            speciesIds.add(row.groundcover);
          }
        }
      }
    }
  }

  // Fetch all species documents
  // eslint-disable-next-line no-console
  console.log(
    `[computeFinancials] Collected ${speciesIds.size} species IDs:`,
    Array.from(speciesIds),
  );

  const speciesDocs = await Species.find({
    _id: { $in: Array.from(speciesIds) },
  }).populate("flows");

  // eslint-disable-next-line no-console
  console.log(
    `[computeFinancials] Found ${speciesDocs.length} species docs. Species with flows:`,
    speciesDocs.map((s) => ({
      id: s._id.toString(),
      name: s.nameCommon,
      flowsCount: s.flows?.length || 0,
      flowsData: s.flows?.map((f: any) => ({
        unit: f.unit,
        type: f.type,
        dataLen: f.data?.length,
      })),
    })),
  );

  const speciesMap = new Map<string, any>();
  for (const species of speciesDocs) {
    speciesMap.set(species._id.toString(), species.toObject());
  }

  // Calculate financials
  return calculateFarmFinancials(model.toObject(), fieldScenarios, speciesMap);
}

// GET /farm-scenario-configs/:configId/financial-models - List all models for a farm scenario
router.get(
  "/farm-scenario-configs/:configId/financial-models",
  middleware.isLoggedIn,
  async (req: AuthRequest, res) => {
    try {
      const config = await FarmScenarioConfig.findById(req.params.configId);
      if (!config) {
        return res.status(404).send({ error: "Farm scenario config not found" });
      }

      // Check ownership
      if (config.user.toString() !== req.user!._id.toString()) {
        return res.status(403).send({ error: "Unauthorized" });
      }

      const models = await FinancialModel.find({
        farmScenarioConfig: req.params.configId,
        user: req.user!._id,
      }).sort("-updatedAt");

      res.send(models);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching financial models:", error);
      res.status(500).send({ error: "Failed to fetch financial models" });
    }
  },
);

// POST /farm-scenario-configs/:configId/financial-models - Create a new model
router.post(
  "/farm-scenario-configs/:configId/financial-models",
  middleware.isLoggedIn,
  async (req: AuthRequest, res) => {
    try {
      const config = await FarmScenarioConfig.findById(req.params.configId);
      if (!config) {
        return res.status(404).send({ error: "Farm scenario config not found" });
      }

      // Check ownership
      if (config.user.toString() !== req.user!._id.toString()) {
        return res.status(403).send({ error: "Unauthorized" });
      }

      const { name = "Default Model", parameters = {}, speciesPricing = [] } = req.body;

      const model = new FinancialModel({
        farmScenarioConfig: req.params.configId,
        user: req.user!._id,
        name,
        parameters: {
          period: parameters.period ?? 20,
          currency: parameters.currency ?? "EUR",
        },
        speciesPricing,
      });

      await model.save();

      // Compute and return financials
      const modelId = (model._id as any).toString();
      const financials = await computeFinancials(modelId);

      res.status(201).send({
        model: model.toObject(),
        financials,
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error("Error creating financial model:", error);
      if (error.code === 11000) {
        return res.status(400).send({ error: "A model with this name already exists" });
      }
      res.status(500).send({ error: "Failed to create financial model" });
    }
  },
);

// GET /financial-models/:id - Get a model with computed financials
router.get("/financial-models/:id", middleware.isLoggedIn, async (req: AuthRequest, res) => {
  try {
    const model = await FinancialModel.findById(req.params.id);
    if (!model) {
      return res.status(404).send({ error: "Financial model not found" });
    }

    // Check ownership
    if (model.user.toString() !== req.user!._id.toString()) {
      return res.status(403).send({ error: "Unauthorized" });
    }

    const modelId = (model._id as any).toString();
    const financials = await computeFinancials(modelId);

    res.send({
      model: model.toObject(),
      financials,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error fetching financial model:", error);
    res.status(500).send({ error: "Failed to fetch financial model" });
  }
});

// PATCH /financial-models/:id - Update model parameters/pricing
router.patch("/financial-models/:id", middleware.isLoggedIn, async (req: AuthRequest, res) => {
  try {
    const model = await FinancialModel.findById(req.params.id);
    if (!model) {
      return res.status(404).send({ error: "Financial model not found" });
    }

    // Check ownership
    if (model.user.toString() !== req.user!._id.toString()) {
      return res.status(403).send({ error: "Unauthorized" });
    }

    const { name, parameters, speciesPricing } = req.body;

    if (name !== undefined) {
      model.name = name;
    }

    if (parameters) {
      if (parameters.period !== undefined) {
        model.parameters.period = parameters.period;
      }
      if (parameters.currency !== undefined) {
        model.parameters.currency = parameters.currency;
      }
    }

    if (speciesPricing !== undefined) {
      model.speciesPricing = speciesPricing;
    }

    await model.save();

    // Recompute financials
    const modelId = (model._id as any).toString();
    const financials = await computeFinancials(modelId);

    res.send({
      model: model.toObject(),
      financials,
    });
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error("Error updating financial model:", error);
    if (error.code === 11000) {
      return res.status(400).send({ error: "A model with this name already exists" });
    }
    res.status(500).send({ error: "Failed to update financial model" });
  }
});

// DELETE /financial-models/:id - Delete a model
router.delete("/financial-models/:id", middleware.isLoggedIn, async (req: AuthRequest, res) => {
  try {
    const model = await FinancialModel.findById(req.params.id);
    if (!model) {
      return res.status(404).send({ error: "Financial model not found" });
    }

    // Check ownership
    if (model.user.toString() !== req.user!._id.toString()) {
      return res.status(403).send({ error: "Unauthorized" });
    }

    await model.deleteOne();

    res.send({ success: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error deleting financial model:", error);
    res.status(500).send({ error: "Failed to delete financial model" });
  }
});

// GET /financial-models/:id/export/csv - Export as CSV
router.get(
  "/financial-models/:id/export/csv",
  middleware.isLoggedIn,
  async (req: AuthRequest, res) => {
    try {
      const model = await FinancialModel.findById(req.params.id);
      if (!model) {
        return res.status(404).send({ error: "Financial model not found" });
      }

      // Check ownership
      if (model.user.toString() !== req.user!._id.toString()) {
        return res.status(403).send({ error: "Unauthorized" });
      }

      const modelId = (model._id as any).toString();
      const financials = await computeFinancials(modelId);
      if (!financials) {
        return res.status(500).send({ error: "Failed to compute financials" });
      }

      const csv = generateFinancialsCSV(financials);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="financial-model-${model.name.replace(/[^a-z0-9]/gi, "-")}.csv"`,
      );
      res.send(csv);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error exporting financial model:", error);
      res.status(500).send({ error: "Failed to export financial model" });
    }
  },
);

// GET /farm-scenario-configs/:configId/aggregated-species - Get aggregated species for a farm scenario
// This is used by the UI to show species list before creating a financial model
router.get(
  "/farm-scenario-configs/:configId/aggregated-species",
  middleware.isLoggedIn,
  async (req: AuthRequest, res) => {
    try {
      const config = await FarmScenarioConfig.findById(req.params.configId)
        .populate({
          path: "fieldScenarios.layer",
          select: "name geometry",
        })
        .populate({
          path: "fieldScenarios.project",
          select: "name systemdesign",
          populate: {
            path: "systemdesign",
          },
        });

      if (!config) {
        return res.status(404).send({ error: "Farm scenario config not found" });
      }

      // Check ownership
      if (config.user.toString() !== req.user!._id.toString()) {
        return res.status(403).send({ error: "Unauthorized" });
      }

      // Collect species from all field scenarios
      const speciesCounts = new Map<string, { species: any; count: number }>();

      for (const fs of config.fieldScenarios) {
        if (!fs.enabled || !fs.project) continue;

        const project = fs.project as any;
        const systemdesign = project.systemdesign;

        if (!systemdesign?.rows) continue;

        const { runSystemBasedLayout } = await import(
          "@rw/modelling/layout-backends/system-layout.node.ts"
        );

        const layer = fs.layer as any;
        if (!layer?.geometry) continue;

        try {
          const geometryString = layer.geometry.replace(/&#34;/g, '"');
          const layout = await runSystemBasedLayout(systemdesign, geometryString);

          if (layout?.speciesCountArray) {
            for (const entry of layout.speciesCountArray) {
              const speciesObj = entry.species;
              const speciesId = speciesObj?._id?.toString() || speciesObj?.toString();

              if (!speciesId) continue;

              const existing = speciesCounts.get(speciesId);
              if (existing) {
                existing.count += entry.count || 0;
              } else {
                speciesCounts.set(speciesId, {
                  species: speciesObj,
                  count: entry.count || 0,
                });
              }
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`Failed to calculate layout for field:`, e);
        }
      }

      // Fetch full species documents
      const speciesIds = Array.from(speciesCounts.keys());
      const speciesDocs = await Species.find({
        _id: { $in: speciesIds },
      }).populate("flows");

      const result = Array.from(speciesCounts.entries()).map(([id, data]) => {
        const speciesDoc = speciesDocs.find((s) => s._id.toString() === id);
        return {
          species: speciesDoc?.toObject() || data.species,
          count: data.count,
        };
      });

      res.send(result);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching aggregated species:", error);
      res.status(500).send({ error: "Failed to fetch aggregated species" });
    }
  },
);

async function buildYieldData(configId: string) {
  const config = await FarmScenarioConfig.findById(configId)
    .populate({
      path: "fieldScenarios.layer",
      select: "name geometry lat lng",
    })
    .populate({
      path: "fieldScenarios.project",
      select: "name systemdesign",
      populate: {
        path: "systemdesign",
        populate: [
          { path: "rows.sequence.species", model: "Species" },
          { path: "rows.groundcover", model: "Species" },
        ],
      },
    });

  if (!config) return null;

  const fieldScenarios = config.fieldScenarios
    .filter((fs: any) => fs.enabled && fs.layer && fs.project)
    .map((fs: any) => ({
      layer: {
        _id: fs.layer._id.toString(),
        name: fs.layer.name || "Unnamed Field",
        geometry: fs.layer.geometry,
      },
      project: fs.project
        ? {
            _id: fs.project._id.toString(),
            name: fs.project.name,
            systemdesign: fs.project.systemdesign,
          }
        : undefined,
    }));

  const speciesIds = new Set<string>();
  for (const fs of fieldScenarios) {
    if (fs.project?.systemdesign?.rows) {
      for (const row of fs.project.systemdesign.rows) {
        if (row.sequence) {
          for (const entry of row.sequence) {
            const id = entry.species?._id || entry.species?.id;
            if (id) speciesIds.add(id.toString());
            else if (typeof entry.species === "string") speciesIds.add(entry.species);
          }
        }
        if (row.groundcover) {
          const id = row.groundcover?._id || row.groundcover?.id;
          if (id) speciesIds.add(id.toString());
          else if (typeof row.groundcover === "string") speciesIds.add(row.groundcover);
        }
      }
    }
  }

  const speciesDocs = await Species.find({
    _id: { $in: Array.from(speciesIds) },
  }).populate("flows");

  const speciesMap = new Map<string, any>();
  for (const s of speciesDocs) {
    speciesMap.set(s._id.toString(), s.toObject());
  }

  return { config, fieldScenarios, speciesMap };
}

router.get(
  "/farm-scenario-configs/:configId/yield-estimation",
  middleware.isLoggedIn,
  async (req: AuthRequest, res) => {
    try {
      const data = await buildYieldData(req.params.configId);
      if (!data) {
        return res.status(404).send({ error: "Farm scenario config not found" });
      }

      if (data.config.user.toString() !== req.user!._id.toString()) {
        return res.status(403).send({ error: "Unauthorized" });
      }

      const period = parseInt(req.query.period as string) || 30;
      const result = await calculateYieldEstimation(data.fieldScenarios, data.speciesMap, period);

      res.send(result);
    } catch (error) {
      console.error("Error computing yield estimation:", error);
      res.status(500).send({ error: "Failed to compute yield estimation" });
    }
  },
);

router.get(
  "/farm-scenario-configs/:configId/yield-estimation/export/csv",
  middleware.isLoggedIn,
  async (req: AuthRequest, res) => {
    try {
      const data = await buildYieldData(req.params.configId);
      if (!data) {
        return res.status(404).send({ error: "Farm scenario config not found" });
      }

      if (data.config.user.toString() !== req.user!._id.toString()) {
        return res.status(403).send({ error: "Unauthorized" });
      }

      const period = parseInt(req.query.period as string) || 30;
      const result = await calculateYieldEstimation(data.fieldScenarios, data.speciesMap, period);
      const csv = generateYieldCSV(result);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="yield-estimation.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting yield estimation:", error);
      res.status(500).send({ error: "Failed to export yield estimation" });
    }
  },
);

export default router;
