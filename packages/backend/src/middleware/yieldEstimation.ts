/**
 * Yield estimation — pure computation, no DB model needed.
 *
 * Takes a farm scenario config's field scenarios + species data and produces
 * a year-by-year production forecast per species and for the whole farm.
 *
 * All yield data comes from the species' Flow documents (unit === "food" or
 * type === "yield"). The `data` array on a flow is kg-per-unit-per-year
 * (where "unit" is one tree or one m2 of ground cover).
 */

import type { IFlowSchema } from "@rw/db/schemas/flow.ts";
import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";
import { systemBasedLayout } from "@rw/modelling/gis-ts/system_based_layout.ts";
import area from "@turf/area";

// --------------------------------------------------------------------------
// Public types
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
  count: number; // number of trees or m2
  hasYieldData: boolean; // false: species has no yield flow, all production fields read 0

  // Yield curve
  yieldCurve: number[]; // kg per unit per year (from species flows)
  yieldUnit: string; // e.g. "kg"
  yieldAtMaturity: number; // plateau value (max of curve)
  yearsToFirstYield: number; // first year with yield > 0 (1-indexed), 0 if none
  yearsToMaturity: number; // first year at plateau value (1-indexed), 0 if none

  // Aggregated production
  annualProductionAtMaturity: number; // count × yieldAtMaturity (kg)
  totalProductionOverPeriod: number; // sum over all years in period (kg)
}

export interface YieldFieldSpeciesEntry {
  speciesId: string;
  nameCommon: string;
  count: number;
  unitType: SpeciesUnitType;
  hasYieldData: boolean;
  yieldAtMaturity: number; // kg per unit
  annualProductionAtMaturity: number; // count × yieldAtMaturity
}

export interface YieldFieldSummary {
  field: {
    _id: string;
    name: string;
  };
  area: number; // hectares
  treeCount: number;
  species: YieldFieldSpeciesEntry[]; // per-species breakdown
}

export interface YieldYearEntry {
  year: number;
  totalProductionKg: number;
  bySpecies: Record<string, number>; // speciesId → kg
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
    firstYieldYear: number | null; // earliest year any species yields
  };
}

// --------------------------------------------------------------------------
// Internal types
// --------------------------------------------------------------------------

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
