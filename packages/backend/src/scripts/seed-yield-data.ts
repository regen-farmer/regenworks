import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Flow from "@rw/db/schemas/flow.ts";
import Species from "@rw/db/schemas/species.ts";

interface YieldEntry {
  nameCommon: string;
  latinGenus: string;
  latinSpecies: string;
  data: number[];
}

const yieldData: YieldEntry[] = [
  {
    nameCommon: "valnød",
    latinGenus: "juglans",
    latinSpecies: "regia",
    data: [0, 0, 0, 0, 0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 20, 22, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25],
  },
  {
    nameCommon: "hassel",
    latinGenus: "corylus",
    latinSpecies: "avellana",
    data: [0, 0, 0, 0.4, 0.8, 1.2, 1.6, 2, 2.5, 2.9, 3.3, 3.7, 4.1, 4.5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  },
  {
    nameCommon: "ægte kastanje",
    latinGenus: "castanea",
    latinSpecies: "sativa",
    data: [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 16, 18, 18, 20, 20, 20, 20, 20, 20, 20, 20, 20],
  },
];

async function main() {
  const dbUrl = process.env.DATABASEURL;
  if (!dbUrl) {
    console.error("DATABASEURL not set in environment");
    process.exit(1);
  }

  await mongoose.connect(dbUrl);
  console.log("Connected to MongoDB");

  for (const entry of yieldData) {
    const species = await Species.findOne({
      genus: { $regex: new RegExp(`^${entry.latinGenus}$`, "i") },
      species: { $regex: new RegExp(`^${entry.latinSpecies}$`, "i") },
    });

    if (!species) {
      console.warn(
        `Species not found: ${entry.latinGenus} ${entry.latinSpecies} (${entry.nameCommon}) — skipping`,
      );
      continue;
    }

    console.log(
      `Found species: ${species.nameCommon} (${species.genus} ${species.species}) [${species._id}]`,
    );

    const existingFlows = species.flows && species.flows.length > 0
      ? await Flow.find({ _id: { $in: species.flows } })
      : [];

    const existingYieldFlow = existingFlows.find(
      (f: any) => f.unit === "food" && f.type === "yield",
    );

    if (existingYieldFlow) {
      console.log(`  Updating existing yield flow [${existingYieldFlow._id}]`);
      existingYieldFlow.data = entry.data;
      existingYieldFlow.source = "manual estimate";
      await existingYieldFlow.save();
      console.log(`  Updated: ${entry.data.length} years of yield data`);
    } else {
      const flow = new Flow({
        name: `${entry.nameCommon} yield`,
        type: "yield",
        unit: "food",
        timeframe: "annual",
        data: entry.data,
        source: "manual estimate",
      });
      await flow.save();
      console.log(`  Created flow [${flow._id}]: ${entry.data.length} years of yield data`);

      if (!species.flows) {
        species.flows = [];
      }
      species.flows.push(flow._id);
      await species.save();
      console.log(`  Linked flow to species`);
    }
  }

  console.log("\nDone! Yield data seeded successfully.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
