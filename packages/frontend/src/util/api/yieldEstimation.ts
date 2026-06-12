import { apiFetchOptions } from "~/util/apiFetchOptions";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// API functions
// --------------------------------------------------------------------------

/**
 * Get yield estimation for a farm scenario config.
 * This is a pure computation — no DB model, computed on every request.
 */
export async function getYieldEstimation(
  configId: string,
  period: number = 30,
): Promise<YieldEstimationResult> {
  const response = await fetch(
    `${BACKEND_URL}/farm-scenario-configs/${configId}/yield-estimation?period=${period}`,
    apiFetchOptions(),
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch yield estimation: ${response.statusText}`);
  }

  return response.json();
}
