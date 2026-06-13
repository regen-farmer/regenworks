import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import "@rw/db/schemas/flow.ts";
import Species from "@rw/db/schemas/species.ts";
import SystemDesign from "@rw/db/schemas/systemdesign.ts";

interface UsageEntry {
  designs: Set<string>;
  sequenceSlots: number;
  groundcoverRows: number;
}

async function main() {
  const dbUrl = process.env.DATABASEURL;
  if (!dbUrl) {
    console.error("DATABASEURL not set in environment");
    process.exit(1);
  }

  await mongoose.connect(dbUrl);
  console.log("Connected to MongoDB");

  const designs = await SystemDesign.find({}).lean();
  const usage = new Map<string, UsageEntry>();

  const touch = (speciesId: string): UsageEntry => {
    let entry = usage.get(speciesId);
    if (!entry) {
      entry = { designs: new Set(), sequenceSlots: 0, groundcoverRows: 0 };
      usage.set(speciesId, entry);
    }
    return entry;
  };

  for (const design of designs as any[]) {
    const designId = design._id.toString();
    for (const row of design.rows ?? []) {
      for (const seqEntry of row.sequence ?? []) {
        const speciesId = seqEntry.species?.toString();
        if (!speciesId) continue;
        const entry = touch(speciesId);
        entry.designs.add(designId);
        entry.sequenceSlots += 1;
      }
      if (row.groundcover) {
        const entry = touch(row.groundcover.toString());
        entry.designs.add(designId);
        entry.groundcoverRows += 1;
      }
    }
  }

  const speciesDocs = await Species.find({ _id: { $in: Array.from(usage.keys()) } })
    .populate("flows")
    .lean();
  const speciesById = new Map(speciesDocs.map((s: any) => [s._id.toString(), s]));

  const hasYieldData = (species: any): boolean =>
    (species?.flows ?? []).some(
      (f: any) => (f?.unit === "food" || f?.type === "yield") && f?.data?.length > 0,
    );

  const report = Array.from(usage.entries())
    .map(([speciesId, entry]) => {
      const doc = speciesById.get(speciesId);
      const latin = doc ? `${doc.genus ?? ""} ${doc.species ?? ""}`.trim() : "";
      return {
        species: doc ? doc.nameCommon || "(unnamed)" : `missing doc ${speciesId}`,
        latin,
        designs: entry.designs.size,
        treeSlots: entry.sequenceSlots,
        groundcoverRows: entry.groundcoverRows,
        yieldData: doc && hasYieldData(doc) ? "yes" : "NO",
      };
    })
    .sort((a, b) => b.designs - a.designs || b.treeSlots - a.treeSlots);

  console.log(
    `\n${designs.length} system designs, ${report.length} distinct species referenced\n`,
  );
  console.table(report);

  const missing = report.filter((r) => r.yieldData === "NO");
  console.log(
    `\n${missing.length} of ${report.length} species lack yield data.`,
  );
  if (missing.length > 0) {
    console.log("Priority order for new yield curves (most used first):");
    for (const r of missing) {
      console.log(
        `  - ${r.species}${r.latin ? ` (${r.latin})` : ""}: ${r.designs} designs, ${r.treeSlots} tree slots, ${r.groundcoverRows} groundcover rows`,
      );
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
