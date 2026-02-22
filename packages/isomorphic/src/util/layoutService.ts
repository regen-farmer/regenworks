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
import { systemBasedLayoutAsync } from "@rw/modelling/gis-ts/system_based_layout.ts";

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
	systemDesign: any,
	fieldGeometry: any,
): Promise<any> {
	if (isTauri()) {
		return generateLayoutTauri(systemDesign, fieldGeometry);
	}
	return generateLayoutBrowser(systemDesign, fieldGeometry);
}

/**
 * Generate layout using Tauri (native Rust + GEOS)
 */
async function generateLayoutTauri(
	systemDesign: any,
	fieldGeometry: any,
): Promise<any> {
	// Dynamic import to avoid bundling Tauri API in web builds
	const { invoke } = await import("@tauri-apps/api/core");

	// Ensure fieldGeometry is a string, as Rust expects a String
	const geometryString = typeof fieldGeometry === "string" 
		? fieldGeometry 
		: JSON.stringify(fieldGeometry);

	const response = await invoke<LayoutResponse>("generate_layout", {
		systemdesign: systemDesign,
		fieldGeometry: geometryString,
	});

	if (!response.success || !response.data) {
		throw new Error(response.error || "Layout generation failed");
	}

	console.log(`[Tauri] Layout generated in ${response.timingMs?.toFixed(1)}ms`);
	return response.data;
}

/**
 * Generate layout using Browser (TypeScript model directly)
 */
async function generateLayoutBrowser(
	systemDesign: any,
	fieldGeometry: any,
): Promise<any> {
	const startTime = performance.now();
    
    // Parse if it's a string, as systemBasedLayoutAsync expects an object
    const geometryObj = typeof fieldGeometry === "string" 
        ? JSON.parse(fieldGeometry) 
        : fieldGeometry;
        
	const layout = await systemBasedLayoutAsync(systemDesign, geometryObj);

	console.log(`[Browser TS] Layout generated in ${(performance.now() - startTime).toFixed(1)}ms`);
	return layout;
}

/**
 * Check if fast native layout is available
 */
export function hasNativeLayout(): boolean {
	return isTauri();
}
