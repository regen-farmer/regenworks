/**
 * Farm-level financial calculations middleware
 * Aggregates financial data from all field scenarios in a FarmScenarioConfig
 * Uses user-provided expected yields per species for income calculations
 */

import type { IFinancialModelSchema } from "@rw/db/schemas/financialModel.ts";
import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";
import { runSystemBasedLayout } from "@rw/modelling/layout-backends/system-layout.node.ts";
import area from "@turf/area";

// Types for financial calculations
export type SpeciesUnitType = "tree" | "m2";

export interface SpeciesSummary {
  species: {
    _id: string;
    nameCommon: string;
    genus?: string;
    species?: string;
  };
  unitType: SpeciesUnitType; // "tree" for trees, "m2" for ground cover
  count: number; // number of trees or m2 of ground cover
  establishmentCostPerUnit: number; // per-unit cost (from override or species default)
  managementCostPerUnitPerYear: number; // per-unit annual cost (from override or species default)
  defaultEstablishmentCostPerUnit: number; // species default (for showing placeholder)
  defaultManagementCostPerUnitPerYear: number; // species default (for showing placeholder)
  establishmentCost: number; // total for this species
  annualManagementCost: number; // total for this species
  incomePerUnit: number; // user-provided income per unit per year
  annualIncomeAtMaturity: number; // count * incomePerUnit
  totalIncomeOverPeriod: number;
}

export interface FieldSummary {
  field: {
    _id: string;
    name: string;
  };
  area: number; // in hectares
  treeCount: number;
  establishmentCost: number;
  annualIncomeAtMaturity: number;
}

export interface CashFlowEntry {
  year: number;
  income: number;
  costs: number;
  net: number;
  cumulative: number;
}

export interface FinancialSummary {
  totalEstablishmentCost: number;
  totalAnnualManagementCost: number;
  annualIncomeAtMaturity: number;
  totalIncomeOverPeriod: number;
  totalCostsOverPeriod: number;
  totalProfitOverPeriod: number;
  paybackYears: number | null;
}

export interface FarmFinancialsResult {
  parameters: {
    period: number;
    currency: string;
  };
  speciesSummary: SpeciesSummary[];
  fieldSummary: FieldSummary[];
  cashFlow: CashFlowEntry[];
  summary: FinancialSummary;
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
  count: number; // trees or m2
  fieldContributions: Map<string, number>; // fieldId -> count
}

/**
 * Calculate payback period (years until cumulative cash flow becomes positive)
 */
function calculatePaybackPeriod(cashFlow: CashFlowEntry[]): number | null {
  for (const entry of cashFlow) {
    if (entry.cumulative >= 0) {
      // Linear interpolation for more precise payback
      if (entry.year === 1) {
        return entry.cumulative === 0 ? 1 : null;
      }
      const prevEntry = cashFlow[entry.year - 2];
      if (prevEntry && prevEntry.cumulative < 0) {
        const fraction = -prevEntry.cumulative / (entry.cumulative - prevEntry.cumulative);
        return entry.year - 1 + fraction;
      }
      return entry.year;
    }
  }
  return null; // Never pays back within period
}

/**
 * Determine if a species is ground cover based on its form
 */
function isGroundCover(species: ISpeciesSchema): boolean {
  const groundCoverForms = ["grass", "herb", "groundcover"];
  return groundCoverForms.includes((species.form || "").toLowerCase());
}

/**
 * Calculate establishment cost for a species based on activities
 */
function getEstablishmentCostPerUnit(species: ISpeciesSchema): number {
  if (!species.activities || !Array.isArray(species.activities) || species.activities.length < 1) {
    return 0;
  }

  return (species.activities as any[])
    .filter((a) => a.activityType === "establish")
    .reduce((sum, a) => sum + (a.price || 0), 0);
}

/**
 * Calculate annual management cost for a species based on activities
 */
function getAnnualManagementCostPerUnit(species: ISpeciesSchema): number {
  if (!species.activities || !Array.isArray(species.activities) || species.activities.length < 1) {
    return 0;
  }

  return (species.activities as any[])
    .filter((a) => a.activityType === "manage")
    .reduce((sum, a) => sum + (a.price || 0), 0);
}

/**
 * Main function to calculate farm-level financials
 */
export async function calculateFarmFinancials(
  financialModel: IFinancialModelSchema,
  fieldScenarios: FieldScenarioData[],
  speciesMap: Map<string, ISpeciesSchema>,
): Promise<FarmFinancialsResult> {
  const { period, currency } = financialModel.parameters;

  // Build species pricing lookups (income and cost overrides)
  const incomeMap = new Map<string, number>();
  const establishmentCostOverrides = new Map<string, number | undefined>();
  const managementCostOverrides = new Map<string, number | undefined>();

  for (const pricing of financialModel.speciesPricing) {
    const speciesId =
      typeof pricing.species === "string" ? pricing.species : pricing.species.toString();
    // Support both old (PerTree) and new (PerUnit) field names for backward compatibility
    incomeMap.set(speciesId, pricing.incomePerUnit ?? (pricing as any).incomePerTree ?? 0);
    establishmentCostOverrides.set(
      speciesId,
      pricing.establishmentCostPerUnit ?? (pricing as any).establishmentCostPerTree,
    );
    managementCostOverrides.set(
      speciesId,
      pricing.managementCostPerUnitPerYear ?? (pricing as any).managementCostPerTreePerYear,
    );
  }

  // Aggregate species across all fields
  const aggregatedSpecies = new Map<string, AggregatedSpecies>();
  const fieldSummaries: FieldSummary[] = [];

  for (const fieldScenario of fieldScenarios) {
    if (!fieldScenario.project?.systemdesign || !fieldScenario.layer?.geometry) {
      continue;
    }

    const fieldId = fieldScenario.layer._id.toString();
    const fieldName = fieldScenario.layer.name || "Unnamed Field";

    // Calculate layout for this field
    let layout: any;
    try {
      const geometryString = fieldScenario.layer.geometry.replace(/&#34;/g, '"');
      layout = await runSystemBasedLayout(fieldScenario.project.systemdesign, geometryString);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Failed to calculate layout for field ${fieldId}:`, e);
      continue;
    }

    if (!layout || !layout.speciesCountArray) {
      continue;
    }

    // Calculate field area
    let fieldArea = 0;
    try {
      const geometry = JSON.parse(fieldScenario.layer.geometry.replace(/&#34;/g, '"'));
      fieldArea = area(geometry) / 10000; // Convert to hectares
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Failed to calculate area for field ${fieldId}:`, e);
    }

    let fieldTreeCount = 0;
    let fieldEstablishmentCost = 0;
    let fieldAnnualIncome = 0;

    // Process tree species counts from layout
    for (const speciesCount of layout.speciesCountArray) {
      const speciesEntry = speciesCount.species;
      // Species may have _id or id depending on whether it's a mongoose doc or plain object
      const speciesId =
        typeof speciesEntry === "object" && (speciesEntry?._id || speciesEntry?.id)
          ? (speciesEntry._id || speciesEntry.id).toString()
          : speciesEntry?.toString();

      if (!speciesId) continue;

      const count = speciesCount.count || 0;
      fieldTreeCount += count;

      // Get or create aggregated species entry
      let aggSpecies = aggregatedSpecies.get(speciesId);
      if (!aggSpecies) {
        const speciesDoc = speciesMap.get(speciesId);
        const finalSpeciesDoc =
          speciesDoc || (typeof speciesEntry === "object" ? speciesEntry : null);
        if (!finalSpeciesDoc) continue;

        aggSpecies = {
          speciesId,
          speciesDoc: finalSpeciesDoc as ISpeciesSchema,
          unitType: "tree" as SpeciesUnitType,
          count: 0,
          fieldContributions: new Map(),
        };
        aggregatedSpecies.set(speciesId, aggSpecies);
      }

      aggSpecies.count += count;
      aggSpecies.fieldContributions.set(
        fieldId,
        (aggSpecies.fieldContributions.get(fieldId) || 0) + count,
      );

      // Calculate field-level costs (use override if provided, otherwise species default)
      const establishmentOverride = establishmentCostOverrides.get(speciesId);
      const establishmentCostPerUnit =
        establishmentOverride !== undefined
          ? establishmentOverride
          : getEstablishmentCostPerUnit(aggSpecies.speciesDoc);
      fieldEstablishmentCost += count * establishmentCostPerUnit;

      // Calculate annual income at maturity using user-provided income per unit
      const incomePerUnit = incomeMap.get(speciesId) || 0;
      fieldAnnualIncome += count * incomePerUnit;
    }

    // Process ground cover species from layout (area in m2)
    if (layout.groundCoverAreasM2) {
      for (const [groundCoverSpeciesId, areaM2] of Object.entries(
        layout.groundCoverAreasM2 as Record<string, number>,
      )) {
        if (!groundCoverSpeciesId || !areaM2) continue;

        const speciesId = groundCoverSpeciesId.toString();

        // Get or create aggregated species entry for ground cover
        let aggSpecies = aggregatedSpecies.get(speciesId);
        if (!aggSpecies) {
          const speciesDoc = speciesMap.get(speciesId);
          if (!speciesDoc) continue;

          aggSpecies = {
            speciesId,
            speciesDoc: speciesDoc as ISpeciesSchema,
            unitType: "m2" as SpeciesUnitType,
            count: 0,
            fieldContributions: new Map(),
          };
          aggregatedSpecies.set(speciesId, aggSpecies);
        }

        aggSpecies.count += areaM2 as number;
        aggSpecies.fieldContributions.set(
          fieldId,
          (aggSpecies.fieldContributions.get(fieldId) || 0) + (areaM2 as number),
        );

        // Calculate field-level costs for ground cover
        const establishmentOverride = establishmentCostOverrides.get(speciesId);
        const establishmentCostPerUnit =
          establishmentOverride !== undefined
            ? establishmentOverride
            : getEstablishmentCostPerUnit(aggSpecies.speciesDoc);
        fieldEstablishmentCost += (areaM2 as number) * establishmentCostPerUnit;

        // Calculate annual income for ground cover
        const incomePerUnit = incomeMap.get(speciesId) || 0;
        fieldAnnualIncome += (areaM2 as number) * incomePerUnit;
      }
    }

    fieldSummaries.push({
      field: {
        _id: fieldId,
        name: fieldName,
      },
      area: fieldArea,
      treeCount: fieldTreeCount,
      establishmentCost: fieldEstablishmentCost,
      annualIncomeAtMaturity: fieldAnnualIncome,
    });
  }

  // Build species summary
  const speciesSummaries: SpeciesSummary[] = [];
  let totalEstablishmentCost = 0;
  let totalAnnualManagementCost = 0;

  for (const [speciesId, aggSpecies] of aggregatedSpecies) {
    const incomePerUnit = incomeMap.get(speciesId) || 0;

    // Use overrides if provided, otherwise use species defaults
    const establishmentOverride = establishmentCostOverrides.get(speciesId);
    const managementOverride = managementCostOverrides.get(speciesId);

    const establishmentCostPerUnit =
      establishmentOverride !== undefined
        ? establishmentOverride
        : getEstablishmentCostPerUnit(aggSpecies.speciesDoc);
    const managementCostPerUnit =
      managementOverride !== undefined
        ? managementOverride
        : getAnnualManagementCostPerUnit(aggSpecies.speciesDoc);

    const speciesEstablishmentCost = aggSpecies.count * establishmentCostPerUnit;
    const speciesAnnualManagementCost = aggSpecies.count * managementCostPerUnit;

    totalEstablishmentCost += speciesEstablishmentCost;
    totalAnnualManagementCost += speciesAnnualManagementCost;

    // Calculate income using user-provided income per unit
    const annualIncomeAtMaturity = aggSpecies.count * incomePerUnit;
    const totalIncome = annualIncomeAtMaturity * period;

    // Get species defaults for display
    const defaultEstablishmentCostPerUnit = getEstablishmentCostPerUnit(aggSpecies.speciesDoc);
    const defaultManagementCostPerUnitPerYear = getAnnualManagementCostPerUnit(
      aggSpecies.speciesDoc,
    );

    speciesSummaries.push({
      species: {
        _id: speciesId,
        nameCommon: aggSpecies.speciesDoc.nameCommon || "Unknown",
        genus: aggSpecies.speciesDoc.genus,
        species: aggSpecies.speciesDoc.species,
      },
      unitType: aggSpecies.unitType,
      count: aggSpecies.count,
      establishmentCostPerUnit,
      managementCostPerUnitPerYear: managementCostPerUnit,
      defaultEstablishmentCostPerUnit,
      defaultManagementCostPerUnitPerYear,
      establishmentCost: speciesEstablishmentCost,
      annualManagementCost: speciesAnnualManagementCost,
      incomePerUnit,
      annualIncomeAtMaturity,
      totalIncomeOverPeriod: totalIncome,
    });
  }

  // Calculate cash flow year by year
  const cashFlow: CashFlowEntry[] = [];
  let cumulative = 0;

  // Total annual income at maturity
  const totalAnnualIncome = speciesSummaries.reduce((sum, s) => sum + s.annualIncomeAtMaturity, 0);

  for (let year = 1; year <= period; year++) {
    const yearIncome = totalAnnualIncome; // Same income every year (user-provided expected yield)
    let yearCosts = totalAnnualManagementCost;

    // Year 1: add establishment costs
    if (year === 1) {
      yearCosts += totalEstablishmentCost;
    }

    const net = yearIncome - yearCosts;
    cumulative += net;

    cashFlow.push({
      year,
      income: yearIncome,
      costs: yearCosts,
      net,
      cumulative,
    });
  }

  // Calculate financial indicators
  const paybackYears = calculatePaybackPeriod(cashFlow);

  // Annual income at maturity (same every year in this simplified model)
  const annualIncomeAtMaturity = totalAnnualIncome;

  // Calculate totals over the period
  const totalIncomeOverPeriod = cashFlow.reduce((sum, cf) => sum + cf.income, 0);
  const totalCostsOverPeriod = cashFlow.reduce((sum, cf) => sum + cf.costs, 0);
  const totalProfitOverPeriod = totalIncomeOverPeriod - totalCostsOverPeriod;

  return {
    parameters: {
      period,
      currency,
    },
    speciesSummary: speciesSummaries,
    fieldSummary: fieldSummaries,
    cashFlow,
    summary: {
      totalEstablishmentCost,
      totalAnnualManagementCost,
      annualIncomeAtMaturity,
      totalIncomeOverPeriod,
      totalCostsOverPeriod,
      totalProfitOverPeriod,
      paybackYears,
    },
  };
}

/**
 * Generate CSV export data
 */
export function generateFinancialsCSV(result: FarmFinancialsResult): string {
  const lines: string[] = [];
  const { currency } = result.parameters;

  // Header
  lines.push("Farm Financial Model Export");
  lines.push("");

  // Parameters
  lines.push("Parameters");
  lines.push(`Period,${result.parameters.period} years`);
  lines.push(`Currency,${currency}`);
  lines.push("");

  // Summary
  lines.push("Summary");
  lines.push(
    `Total Establishment Cost,${currency} ${result.summary.totalEstablishmentCost.toFixed(2)}`,
  );
  lines.push(
    `Annual Management Cost,${currency} ${result.summary.totalAnnualManagementCost.toFixed(2)}`,
  );
  lines.push(
    `Annual Income at Maturity,${currency} ${result.summary.annualIncomeAtMaturity.toFixed(2)}`,
  );
  lines.push(
    `Total Income (${result.parameters.period} years),${currency} ${result.summary.totalIncomeOverPeriod.toFixed(2)}`,
  );
  lines.push(
    `Total Costs (${result.parameters.period} years),${currency} ${result.summary.totalCostsOverPeriod.toFixed(2)}`,
  );
  lines.push(
    `Total Profit (${result.parameters.period} years),${currency} ${result.summary.totalProfitOverPeriod.toFixed(2)}`,
  );
  lines.push(
    `Payback Period,${result.summary.paybackYears !== null ? result.summary.paybackYears.toFixed(1) + " years" : "N/A"}`,
  );
  lines.push("");

  // Species Summary
  lines.push("Species Summary");
  lines.push("Species,Unit Type,Count,Income per Unit,Annual Income,Total Income");
  for (const species of result.speciesSummary) {
    const unitLabel = species.unitType === "m2" ? "m2" : "trees";
    const countDisplay =
      species.unitType === "m2" ? species.count.toFixed(0) : species.count.toString();
    lines.push(
      [
        species.species.nameCommon,
        unitLabel,
        countDisplay,
        `${currency} ${species.incomePerUnit.toFixed(2)}`,
        `${currency} ${species.annualIncomeAtMaturity.toFixed(2)}`,
        `${currency} ${species.totalIncomeOverPeriod.toFixed(2)}`,
      ].join(","),
    );
  }
  lines.push("");

  // Field Summary
  lines.push("Field Summary");
  lines.push("Field,Area (ha),Trees,Establishment Cost,Annual Income at Maturity");
  for (const field of result.fieldSummary) {
    lines.push(
      [
        field.field.name,
        field.area.toFixed(2),
        field.treeCount,
        `${currency} ${field.establishmentCost.toFixed(2)}`,
        `${currency} ${field.annualIncomeAtMaturity.toFixed(2)}`,
      ].join(","),
    );
  }
  lines.push("");

  // Cash Flow
  lines.push("Cash Flow");
  lines.push("Year,Income,Costs,Net,Cumulative");
  for (const entry of result.cashFlow) {
    lines.push(
      [
        entry.year,
        `${currency} ${entry.income.toFixed(2)}`,
        `${currency} ${entry.costs.toFixed(2)}`,
        `${currency} ${entry.net.toFixed(2)}`,
        `${currency} ${entry.cumulative.toFixed(2)}`,
      ].join(","),
    );
  }

  return lines.join("\n");
}

export default {
  calculateFarmFinancials,
  generateFinancialsCSV,
};
