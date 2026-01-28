/**
 * Unified Layout Service
 *
 * This service provides a single interface for layout generation that
 * automatically uses the best available backend:
 *
 * 1. Tauri (desktop): Native Rust + GEOS (~20-50ms)
 * 2. API (web): Backend server (~200-500ms with network latency)
 */

import { isTauri } from "./platform";

// Types that match the layout response structure
export interface LayoutResult {
	headlandPolygon: GeoJSON.Feature;
	marginPolygon: GeoJSON.Feature;
	treeRowLines: Array<{
		line: GeoJSON.Feature;
		systemDesignRowIndex: number;
	}>;
	groundCoverAreas: Array<{
		polygon: GeoJSON.Feature;
		species: unknown;
		systemDesignRowIndex: number;
	}>;
	treeMarkerArray: Array<{
		point: GeoJSON.Feature;
		circle: GeoJSON.Feature;
		species: unknown;
	}>;
	stripPolygons: Array<{
		polygon: GeoJSON.Feature;
		systemDesignRowIndex: number;
	}>;
	speciesCountArray: Array<{
		species: unknown;
		count: number;
	}>;
	headlandSides: GeoJSON.Feature[];
	sidesCloseToBearing: GeoJSON.Feature[];
	intersectionPoints: GeoJSON.Feature[];
	groundCoverAreasM2: Record<string, number>;
	stripAreasM2: number[];
}

export interface SystemDesign {
	rows: Array<{
		sequence: Array<{
			species: unknown;
			spacingAfter: number;
		}>;
		width: number;
		offset?: {
			before?: number;
			after?: number;
		};
		groundcover?: unknown;
	}>;
	bearing: number;
	margin: number;
	headland: number;
}

interface LayoutResponse {
	success: boolean;
	data?: LayoutResult;
	error?: string;
	timingMs?: number;
}

/**
 * Generate a layout using the best available backend
 *
 * @param systemDesign - The system design configuration
 * @param fieldGeometry - GeoJSON string of the field polygon
 * @param apiBaseUrl - Base URL for API fallback (required for web)
 * @returns Layout result
 */
export async function generateLayout(
	systemDesign: SystemDesign,
	fieldGeometry: string,
	apiBaseUrl?: string,
): Promise<LayoutResult> {
	if (isTauri()) {
		return generateLayoutTauri(systemDesign, fieldGeometry);
	}
	if (!apiBaseUrl) {
		throw new Error("apiBaseUrl is required for web layout generation");
	}
	return generateLayoutApi(systemDesign, fieldGeometry, apiBaseUrl);
}

/**
 * Generate layout using Tauri (native Rust + GEOS)
 */
async function generateLayoutTauri(
	systemDesign: SystemDesign,
	fieldGeometry: string,
): Promise<LayoutResult> {
	// Dynamic import to avoid bundling Tauri API in web builds
	const { invoke } = await import("@tauri-apps/api/core");

	const response = await invoke<LayoutResponse>("generate_layout", {
		systemdesign: systemDesign,
		fieldGeometry: fieldGeometry,
	});

	if (!response.success || !response.data) {
		throw new Error(response.error || "Layout generation failed");
	}

	console.log(`[Tauri] Layout generated in ${response.timingMs?.toFixed(1)}ms`);
	return response.data;
}

/**
 * Generate layout using API (backend server)
 */
async function generateLayoutApi(
	systemDesign: SystemDesign,
	fieldGeometry: string,
	apiBaseUrl: string,
): Promise<LayoutResult> {
	const response = await fetch(`${apiBaseUrl}/layout`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			systemdesign: systemDesign,
			fieldGeometry: fieldGeometry,
		}),
	});

	if (!response.ok) {
		throw new Error(`Layout API error: ${response.statusText}`);
	}

	const result = (await response.json()) as LayoutResponse;

	if (!result.success || !result.data) {
		throw new Error(result.error || "Layout generation failed");
	}

	console.log(`[API] Layout generated in ${result.timingMs?.toFixed(1)}ms`);
	return result.data;
}

/**
 * Check if fast native layout is available
 */
export function hasNativeLayout(): boolean {
	return isTauri();
}
