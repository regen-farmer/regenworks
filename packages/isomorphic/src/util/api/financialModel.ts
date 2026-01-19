import type { FinancialModelDocument } from "@rw/db/schemas/financialModel";
import { apiFetchOptions } from "~/util/apiFetchOptions";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

// Types for API responses
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
	annualIncomeAtMaturity: number;
	totalIncomeOverPeriod: number;
}

export interface FieldSummary {
	field: {
		_id: string;
		name: string;
	};
	area: number;
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

export interface FinancialModelWithFinancials {
	model: FinancialModelDocument;
	financials: FarmFinancialsResult | null;
}

export interface AggregatedSpecies {
	species: {
		_id: string;
		nameCommon: string;
		genus?: string;
		species?: string;
		price?: number;
		flows?: Array<{
			unit: string;
			data: number[];
		}>;
	};
	count: number;
}

/**
 * Get all financial models for a farm scenario config
 */
export async function getFinancialModels(
	configId: string,
): Promise<FinancialModelDocument[]> {
	const response = await fetch(
		`${BACKEND_URL}/farm-scenario-configs/${configId}/financial-models`,
		apiFetchOptions(),
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch financial models: ${response.statusText}`);
	}

	return response.json();
}

/**
 * Create a new financial model for a farm scenario config
 */
export async function createFinancialModel(
	configId: string,
	data: {
		name?: string;
		parameters?: {
			period?: number;
			currency?: string;
		};
		speciesPricing?: Array<{
			species: string;
			establishmentCostPerUnit?: number;
			managementCostPerUnitPerYear?: number;
			incomePerUnit?: number;
		}>;
	},
): Promise<FinancialModelWithFinancials> {
	const response = await fetch(
		`${BACKEND_URL}/farm-scenario-configs/${configId}/financial-models`,
		{
			...apiFetchOptions(),
			method: "POST",
			headers: {
				...apiFetchOptions().headers,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data),
		},
	);

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		throw new Error(
			errorData.error ||
				`Failed to create financial model: ${response.statusText}`,
		);
	}

	return response.json();
}

/**
 * Get a financial model with computed financials
 */
export async function getFinancialModel(
	modelId: string,
): Promise<FinancialModelWithFinancials> {
	const response = await fetch(
		`${BACKEND_URL}/financial-models/${modelId}`,
		apiFetchOptions(),
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch financial model: ${response.statusText}`);
	}

	return response.json();
}

/**
 * Update a financial model
 */
export async function updateFinancialModel(
	modelId: string,
	updates: {
		name?: string;
		parameters?: {
			period?: number;
			currency?: string;
		};
		speciesPricing?: Array<{
			species: string;
			establishmentCostPerUnit?: number;
			managementCostPerUnitPerYear?: number;
			incomePerUnit?: number;
		}>;
	},
): Promise<FinancialModelWithFinancials> {
	const response = await fetch(`${BACKEND_URL}/financial-models/${modelId}`, {
		...apiFetchOptions(),
		method: "PATCH",
		headers: {
			...apiFetchOptions().headers,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(updates),
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		throw new Error(
			errorData.error ||
				`Failed to update financial model: ${response.statusText}`,
		);
	}

	return response.json();
}

/**
 * Delete a financial model
 */
export async function deleteFinancialModel(
	modelId: string,
): Promise<{ success: boolean }> {
	const response = await fetch(`${BACKEND_URL}/financial-models/${modelId}`, {
		...apiFetchOptions(),
		method: "DELETE",
	});

	if (!response.ok) {
		throw new Error(`Failed to delete financial model: ${response.statusText}`);
	}

	return response.json();
}

/**
 * Export a financial model as CSV (returns a blob URL)
 */
export async function exportFinancialModelCSV(modelId: string): Promise<Blob> {
	const response = await fetch(
		`${BACKEND_URL}/financial-models/${modelId}/export/csv`,
		apiFetchOptions(),
	);

	if (!response.ok) {
		throw new Error(`Failed to export financial model: ${response.statusText}`);
	}

	return response.blob();
}

/**
 * Get aggregated species for a farm scenario config
 * Used to show species list when creating/editing a financial model
 */
export async function getAggregatedSpecies(
	configId: string,
): Promise<AggregatedSpecies[]> {
	const response = await fetch(
		`${BACKEND_URL}/farm-scenario-configs/${configId}/aggregated-species`,
		apiFetchOptions(),
	);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch aggregated species: ${response.statusText}`,
		);
	}

	return response.json();
}
