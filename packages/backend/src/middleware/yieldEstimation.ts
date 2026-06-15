import type { IFlowSchema } from "@rw/db/schemas/flow.ts";
import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";
import { runSystemBasedLayout } from "@rw/modelling/layout-backends/system-layout.node.ts";
import area from "@turf/area";

export type SpeciesUnitType = "tree" | "m2";

export interface YieldSpeciesSummary {
  species: {
    _id: string;
    nameCommon: string;
    genus?: string;
    species?: string;
  };
  unitType: SpeciesUnitType;
  count: number;
  hasYieldData: boolean;
  yieldCurve: number[];
  yieldUnit: string;
  yieldAtMaturity: number;
  yearsToFirstYield: number;
  yearsToMaturity: number;
  annualProductionAtMaturity: number;
  totalProductionOverPeriod: number;
}

export interface YieldFieldSpeciesEntry {
  speciesId: string;
  nameCommon: string;
  count: number;
  unitType: SpeciesUnitType;
  hasYieldData: boolean;
  yieldAtMaturity: number;
  annualProductionAtMaturity: number;
}

export interface YieldFieldSummary {
  field: {
    _id: string;
    name: string;
  };
  area: number;
  treeCount: number;
  species: YieldFieldSpeciesEntry[];
}

export interface YieldYearEntry {
  year: number;
  totalProductionKg: number;
  bySpecies: Record<string, number>;
}

export interface YieldEstimationResult {
  period: number;
  speciesSummary: YieldSpeciesSummary[];
  fieldSummary: YieldFieldSummary[];
  yearByYear: YieldYearEntry[];
  totals: {
    totalTrees: number;
    totalSpecies: number;
    speciesWithoutYieldData: number;
    annualProductionAtMaturityKg: number;
    totalProductionOverPeriodKg: number;
    firstYieldYear: number | null;
  };
}

interface FieldScenarioData {
  layer: {
    _id: string;
    name: string;
    geometry: string;
  };
  project?: {
    _id: string;
    name: string;
    systemdesign?: any;
  };
}

interface AggregatedSpecies {
  speciesId: string;
  speciesDoc: ISpeciesSchema;
  unitType: SpeciesUnitType;
  count: number;
  fieldContributions: Map<string, number>;
}

function getYieldCurve(species: ISpeciesSchema): number[] {
  const flows = (species.flows ?? []) as unknown as IFlowSchema[];
  if (flows.length === 0) return [];

  const flow = flows.find((f) => f.unit === "food" || f.type === "yield");

  if (!flow || !flow.data || flow.data.length === 0) return [];
  return flow.data;
}

function getYieldForYear(yieldCurve: number[], year: number): number {
  if (yieldCurve.length === 0) return 0;
  const index = year - 1;
  if (index < yieldCurve.length) return yieldCurve[index];
  return yieldCurve[yieldCurve.length - 1];
}

export async function calculateYieldEstimation(
  fieldScenarios: FieldScenarioData[],
  speciesMap: Map<string, ISpeciesSchema>,
  period: number = 30,
): Promise<YieldEstimationResult> {
  const aggregatedSpecies = new Map<string, AggregatedSpecies>();
  const fieldSummaries: YieldFieldSummary[] = [];

  for (const fieldScenario of fieldScenarios) {
    if (!fieldScenario.project?.systemdesign || !fieldScenario.layer?.geometry) continue;

    const fieldId = fieldScenario.layer._id.toString();
    const fieldName = fieldScenario.layer.name || "Unnamed Field";

    let layout: any;
    try {
      const geometryString = fieldScenario.layer.geometry.replace(/&#34;/g, '"');
      layout = await runSystemBasedLayout(fieldScenario.project.systemdesign, geometryString);
    } catch (e) {
      console.error(`Failed to calculate layout for field ${fieldId}:`, e);
      continue;
    }

    if (!layout || !layout.speciesCountArray) continue;

    let fieldArea = 0;
    try {
      const geometry = JSON.parse(fieldScenario.layer.geometry.replace(/&#34;/g, '"'));
      fieldArea = area(geometry) / 10000;
    } catch (e) {
      console.error(`Failed to calculate area for field ${fieldId}:`, e);
    }

    let fieldTreeCount = 0;

    for (const speciesCount of layout.speciesCountArray) {
      const speciesEntry = speciesCount.species;
      const speciesId =
        typeof speciesEntry === "object" && (speciesEntry?._id || speciesEntry?.id)
          ? (speciesEntry._id || speciesEntry.id).toString()
          : speciesEntry?.toString();
      if (!speciesId) continue;

      const count = speciesCount.count || 0;
      fieldTreeCount += count;

      let agg = aggregatedSpecies.get(speciesId);
      if (!agg) {
        const speciesDoc = speciesMap.get(speciesId);
        const doc =
          speciesDoc ||
          (typeof speciesEntry === "object" ? speciesEntry : null) ||
          ({ nameCommon: "Unknown species" } as unknown as ISpeciesSchema);

        agg = {
          speciesId,
          speciesDoc: doc as ISpeciesSchema,
          unitType: "tree",
          count: 0,
          fieldContributions: new Map(),
        };
        aggregatedSpecies.set(speciesId, agg);
      }

      agg.count += count;
      agg.fieldContributions.set(fieldId, (agg.fieldContributions.get(fieldId) || 0) + count);
    }

    if (layout.groundCoverAreasM2) {
      for (const [gcSpeciesId, areaM2] of Object.entries(
        layout.groundCoverAreasM2 as Record<string, number>,
      )) {
        if (!gcSpeciesId || !areaM2) continue;
        const speciesId = gcSpeciesId.toString();

        let agg = aggregatedSpecies.get(speciesId);
        if (!agg) {
          const speciesDoc =
            speciesMap.get(speciesId) ||
            ({ nameCommon: "Unknown species" } as unknown as ISpeciesSchema);

          agg = {
            speciesId,
            speciesDoc: speciesDoc as ISpeciesSchema,
            unitType: "m2",
            count: 0,
            fieldContributions: new Map(),
          };
          aggregatedSpecies.set(speciesId, agg);
        }

        agg.count += areaM2 as number;
        agg.fieldContributions.set(
          fieldId,
          (agg.fieldContributions.get(fieldId) || 0) + (areaM2 as number),
        );
      }
    }

    fieldSummaries.push({
      field: { _id: fieldId, name: fieldName },
      area: fieldArea,
      treeCount: fieldTreeCount,
      species: [],
    });
  }

  const speciesSummaries: YieldSpeciesSummary[] = [];

  for (const [speciesId, agg] of aggregatedSpecies) {
    const yieldCurve = getYieldCurve(agg.speciesDoc);
    const hasYieldData = yieldCurve.length > 0;
    const yieldAtMaturity = hasYieldData ? Math.max(...yieldCurve) : 0;

    const firstYieldIndex = yieldCurve.findIndex((v) => v > 0);
    const yearsToFirstYield = firstYieldIndex >= 0 ? firstYieldIndex + 1 : 0;

    const maturityIndex = yieldCurve.indexOf(yieldAtMaturity);
    const yearsToMaturity = maturityIndex >= 0 ? maturityIndex + 1 : 0;

    const annualProductionAtMaturity = agg.count * yieldAtMaturity;

    let totalProduction = 0;
    for (let year = 1; year <= period; year++) {
      totalProduction += agg.count * getYieldForYear(yieldCurve, year);
    }

    speciesSummaries.push({
      species: {
        _id: speciesId,
        nameCommon: agg.speciesDoc.nameCommon || "Unknown",
        genus: agg.speciesDoc.genus,
        species: agg.speciesDoc.species,
      },
      unitType: agg.unitType,
      count: agg.count,
      hasYieldData,
      yieldCurve,
      yieldUnit: "kg",
      yieldAtMaturity,
      yearsToFirstYield,
      yearsToMaturity,
      annualProductionAtMaturity,
      totalProductionOverPeriod: totalProduction,
    });
  }

  for (const fieldSummary of fieldSummaries) {
    for (const [speciesId, agg] of aggregatedSpecies) {
      const fieldCount = agg.fieldContributions.get(fieldSummary.field._id) || 0;
      if (fieldCount === 0) continue;
      const yieldCurve = getYieldCurve(agg.speciesDoc);
      const yieldAtMaturity = yieldCurve.length > 0 ? Math.max(...yieldCurve) : 0;
      fieldSummary.species.push({
        speciesId,
        nameCommon: agg.speciesDoc.nameCommon || "Unknown",
        count: fieldCount,
        unitType: agg.unitType,
        hasYieldData: yieldCurve.length > 0,
        yieldAtMaturity,
        annualProductionAtMaturity: fieldCount * yieldAtMaturity,
      });
    }
  }

  const yearByYear: YieldYearEntry[] = [];
  for (let year = 1; year <= period; year++) {
    const bySpecies: Record<string, number> = {};
    let total = 0;

    for (const summary of speciesSummaries) {
      const yieldKg = getYieldForYear(summary.yieldCurve, year);
      const production = summary.count * yieldKg;
      bySpecies[summary.species._id] = production;
      total += production;
    }

    yearByYear.push({ year, totalProductionKg: total, bySpecies });
  }

  const totalTrees = speciesSummaries
    .filter((s) => s.unitType === "tree")
    .reduce((sum, s) => sum + s.count, 0);
  const annualProductionAtMaturityKg = speciesSummaries.reduce(
    (sum, s) => sum + s.annualProductionAtMaturity,
    0,
  );
  const totalProductionOverPeriodKg = speciesSummaries.reduce(
    (sum, s) => sum + s.totalProductionOverPeriod,
    0,
  );
  const firstYieldYear =
    speciesSummaries
      .filter((s) => s.yearsToFirstYield > 0)
      .reduce((min, s) => Math.min(min, s.yearsToFirstYield), Infinity) || null;

  return {
    period,
    speciesSummary: speciesSummaries,
    fieldSummary: fieldSummaries,
    yearByYear,
    totals: {
      totalTrees,
      totalSpecies: speciesSummaries.length,
      speciesWithoutYieldData: speciesSummaries.filter((s) => !s.hasYieldData).length,
      annualProductionAtMaturityKg,
      totalProductionOverPeriodKg,
      firstYieldYear: firstYieldYear === Infinity ? null : firstYieldYear,
    },
  };
}

export function generateYieldCSV(result: YieldEstimationResult): string {
  const lines: string[] = [];

  lines.push("Yield Estimation Export");
  lines.push(`Period,${result.period} years`);
  lines.push("");

  lines.push("Summary");
  lines.push(`Total Trees,${result.totals.totalTrees}`);
  lines.push(`Species Count,${result.totals.totalSpecies}`);
  lines.push(`Species Without Yield Data,${result.totals.speciesWithoutYieldData}`);
  lines.push(
    `Annual Production at Maturity,${result.totals.annualProductionAtMaturityKg.toFixed(1)} kg`,
  );
  lines.push(
    `Total Production (${result.period} years),${result.totals.totalProductionOverPeriodKg.toFixed(1)} kg`,
  );
  lines.push(
    `First Yield Year,${result.totals.firstYieldYear ?? "N/A"}`,
  );
  lines.push("");

  lines.push("Species Summary");
  lines.push(
    "Species,Latin Name,Unit Type,Count,Yield at Maturity (kg/unit),First Yield (year),Maturity (year),Annual Production (kg),Total Production (kg)",
  );
  for (const s of result.speciesSummary) {
    lines.push(
      [
        s.species.nameCommon,
        `${s.species.genus || ""} ${s.species.species || ""}`.trim(),
        s.unitType === "m2" ? "m2" : "trees",
        s.count,
        s.hasYieldData ? s.yieldAtMaturity.toFixed(1) : "no data",
        s.yearsToFirstYield || "N/A",
        s.yearsToMaturity || "N/A",
        s.hasYieldData ? s.annualProductionAtMaturity.toFixed(1) : "no data",
        s.hasYieldData ? s.totalProductionOverPeriod.toFixed(1) : "no data",
      ].join(","),
    );
  }
  lines.push("");

  lines.push("Yield Curves (kg per unit per year)");
  const maxYears = Math.max(...result.speciesSummary.map((s) => s.yieldCurve.length), 0);
  if (maxYears > 0) {
    const header = ["Species", ...Array.from({ length: maxYears }, (_, i) => `Year ${i + 1}`)];
    lines.push(header.join(","));
    for (const s of result.speciesSummary) {
      if (s.yieldCurve.length === 0) {
        lines.push([s.species.nameCommon, "no data"].join(","));
        continue;
      }
      lines.push([s.species.nameCommon, ...s.yieldCurve.map((v) => v.toFixed(1))].join(","));
    }
    lines.push("");
  }

  lines.push("Year-by-Year Production (kg)");
  const speciesNames = result.speciesSummary.map((s) => s.species.nameCommon);
  lines.push(["Year", "Total", ...speciesNames].join(","));
  for (const entry of result.yearByYear) {
    const speciesValues = result.speciesSummary.map((s) =>
      s.hasYieldData ? (entry.bySpecies[s.species._id] ?? 0).toFixed(1) : "",
    );
    lines.push(
      [entry.year, entry.totalProductionKg.toFixed(1), ...speciesValues].join(","),
    );
  }

  return lines.join("\n");
}

export default {
  calculateYieldEstimation,
  generateYieldCSV,
};
