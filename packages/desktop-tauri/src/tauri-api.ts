/**
 * Tauri API bindings for RegenWorks Desktop
 *
 * This module provides TypeScript wrappers for Tauri commands,
 * enabling the frontend to call the native Rust layout engine.
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * System design configuration for layout generation
 */
export interface SystemDesign {
	rows: RowDefinition[];
	bearing: number;
	margin: number;
	headland: number;
}

export interface RowDefinition {
	sequence: SequenceItem[];
	width: number;
	offset?: {
		before?: number;
		after?: number;
	};
	groundcover?: Species;
}

export interface SequenceItem {
	species: Species;
	spacingAfter: number;
}

export interface Species {
	_id: string;
	nameCommon?: string;
	genus?: string;
	species?: string;
}

/**
 * Layout response from the Rust engine
 */
export interface LayoutResponse {
	success: boolean;
	data?: LayoutData;
	error?: string;
	timingMs?: number;
}

export interface LayoutData {
	headlandPolygon: GeoJSONFeature;
	marginPolygon: GeoJSONFeature;
	treeRowLines: TreeRowLine[];
	groundCoverAreas: GroundCoverArea[];
	treeMarkerArray: TreeMarker[];
	stripPolygons: StripPolygon[];
	speciesCountArray: SpeciesCount[];
	headlandSides: GeoJSONFeature[];
	sidesCloseToBearing: GeoJSONFeature[];
	intersectionPoints: GeoJSONFeature[];
	groundCoverAreasM2: Record<string, number>;
	stripAreasM2: number[];
}

export interface GeoJSONFeature {
	type: "Feature";
	geometry: {
		type: string;
		coordinates: number[] | number[][] | number[][][];
	};
	properties: Record<string, unknown> | null;
}

export interface TreeRowLine {
	line: GeoJSONFeature;
	systemDesignRowIndex: number;
}

export interface GroundCoverArea {
	polygon: GeoJSONFeature;
	species: Species;
	systemDesignRowIndex: number;
}

export interface TreeMarker {
	point: GeoJSONFeature;
	circle: GeoJSONFeature;
	species: Species;
}

export interface StripPolygon {
	polygon: GeoJSONFeature;
	systemDesignRowIndex: number;
}

export interface SpeciesCount {
	species: Species;
	count: number;
}

/**
 * Generate a layout using the native Rust + GEOS engine
 *
 * This is ~5-15x faster than the TypeScript implementation.
 *
 * @param systemDesign - The system design configuration
 * @param fieldGeometry - GeoJSON string of the field polygon
 * @returns Layout response with all generated features
 */
export async function generateLayout(
	systemDesign: SystemDesign,
	fieldGeometry: string,
): Promise<LayoutResponse> {
	try {
		const result = await invoke<LayoutResponse>("generate_layout", {
			systemdesign: systemDesign,
			fieldGeometry: fieldGeometry,
		});
		return result;
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Get the version of the Rust layout engine
 */
export async function getEngineVersion(): Promise<string> {
	return invoke<string>("get_engine_version");
}

/**
 * Check if the Rust backend is healthy
 */
export async function healthCheck(): Promise<boolean> {
	return invoke<boolean>("health_check");
}

/**
 * Check if we're running in Tauri desktop environment
 */
export function isTauri(): boolean {
	return "__TAURI__" in window;
}
