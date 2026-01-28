//! WASM geometry operations via JavaScript geos-wasm bridge
//!
//! This module provides geometry operations by calling into JavaScript
//! functions that use geos-wasm. It's only compiled for the wasm target.

#![cfg(feature = "wasm")]

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Error type for WASM geometry operations
#[derive(Debug, Clone)]
pub struct GeoError(pub String);

impl std::fmt::Display for GeoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for GeoError {}

// Import JavaScript functions from the geos-bridge module
#[wasm_bindgen(module = "/gis-wasm/geos-bridge.js")]
extern "C" {
    /// Buffer a polygon by a distance
    /// Takes JSON string of rings, returns JSON string of result rings or null
    #[wasm_bindgen(js_name = "bufferPolygonJson")]
    fn buffer_polygon_json(rings_json: &str, distance: f64, quad_segs: i32) -> Option<String>;

    /// Buffer a line to create a capsule polygon
    #[wasm_bindgen(js_name = "bufferLineJson")]
    fn buffer_line_json(coords_json: &str, distance: f64, quad_segs: i32) -> Option<String>;

    /// Compute difference of two polygons
    #[wasm_bindgen(js_name = "differenceJson")]
    fn difference_json(poly1_json: &str, poly2_json: &str) -> Option<String>;

    /// Compute intersection of two polygons
    #[wasm_bindgen(js_name = "intersectionJson")]
    fn intersection_json(poly1_json: &str, poly2_json: &str) -> Option<String>;

    /// Find intersection points between buffered line and polygon
    #[wasm_bindgen(js_name = "lineBufferPolygonIntersectionPointsJson")]
    fn line_buffer_polygon_intersection_points_json(
        line_json: &str,
        buffer_distance: f64,
        polygon_json: &str,
    ) -> Option<String>;

    /// Calculate polygon area
    #[wasm_bindgen(js_name = "polygonAreaJson")]
    fn polygon_area_json(rings_json: &str) -> Option<f64>;
}

/// Buffer a polygon by a distance
pub fn buffer_polygon(
    rings: &[Vec<[f64; 2]>],
    distance: f64,
    _tolerance: f64, // ignored, using quad_segs instead
) -> Result<Vec<Vec<[f64; 2]>>, GeoError> {
    let rings_json = serde_json::to_string(rings)
        .map_err(|e| GeoError(format!("Serialization error: {}", e)))?;

    let result_json = buffer_polygon_json(&rings_json, distance, 8)
        .ok_or_else(|| GeoError("Buffer operation failed".into()))?;

    let result: Vec<Vec<[f64; 2]>> = serde_json::from_str(&result_json)
        .map_err(|e| GeoError(format!("Deserialization error: {}", e)))?;

    Ok(result)
}

/// Buffer a line to create a capsule-shaped polygon
pub fn buffer_line(
    coords: &[[f64; 2]],
    distance: f64,
    _tolerance: f64,
) -> Result<Vec<Vec<[f64; 2]>>, GeoError> {
    let coords_json = serde_json::to_string(coords)
        .map_err(|e| GeoError(format!("Serialization error: {}", e)))?;

    let result_json = buffer_line_json(&coords_json, distance, 8)
        .ok_or_else(|| GeoError("Buffer line operation failed".into()))?;

    let result: Vec<Vec<[f64; 2]>> = serde_json::from_str(&result_json)
        .map_err(|e| GeoError(format!("Deserialization error: {}", e)))?;

    Ok(result)
}

/// Compute the difference of two polygons (polygon1 - polygon2)
pub fn difference(
    polygon1: &[Vec<[f64; 2]>],
    polygon2: &[Vec<[f64; 2]>],
) -> Result<Vec<Vec<Vec<[f64; 2]>>>, GeoError> {
    let poly1_json = serde_json::to_string(polygon1)
        .map_err(|e| GeoError(format!("Serialization error: {}", e)))?;
    let poly2_json = serde_json::to_string(polygon2)
        .map_err(|e| GeoError(format!("Serialization error: {}", e)))?;

    let result_json = difference_json(&poly1_json, &poly2_json)
        .ok_or_else(|| GeoError("Difference operation failed".into()))?;

    // Result is a single polygon's rings, wrap in vec for multi-polygon compatibility
    let result: Vec<Vec<[f64; 2]>> = serde_json::from_str(&result_json)
        .map_err(|e| GeoError(format!("Deserialization error: {}", e)))?;

    Ok(vec![result])
}

/// Compute the intersection of two polygons
pub fn intersection(
    polygon1: &[Vec<[f64; 2]>],
    polygon2: &[Vec<[f64; 2]>],
) -> Result<Vec<Vec<Vec<[f64; 2]>>>, GeoError> {
    let poly1_json = serde_json::to_string(polygon1)
        .map_err(|e| GeoError(format!("Serialization error: {}", e)))?;
    let poly2_json = serde_json::to_string(polygon2)
        .map_err(|e| GeoError(format!("Serialization error: {}", e)))?;

    let result_json = intersection_json(&poly1_json, &poly2_json)
        .ok_or_else(|| GeoError("Intersection operation failed".into()))?;

    let result: Vec<Vec<[f64; 2]>> = serde_json::from_str(&result_json)
        .map_err(|e| GeoError(format!("Deserialization error: {}", e)))?;

    Ok(vec![result])
}

/// Find intersection points between a buffered line and polygon boundary
pub fn line_buffer_polygon_intersections(
    line_coords: &[[f64; 2]],
    buffer_distance: f64,
    polygon_rings: &[Vec<[f64; 2]>],
) -> Result<Vec<[f64; 2]>, GeoError> {
    let line_json = serde_json::to_string(line_coords)
        .map_err(|e| GeoError(format!("Serialization error: {}", e)))?;
    let poly_json = serde_json::to_string(polygon_rings)
        .map_err(|e| GeoError(format!("Serialization error: {}", e)))?;

    let result_json =
        line_buffer_polygon_intersection_points_json(&line_json, buffer_distance, &poly_json)
            .ok_or_else(|| GeoError("Line buffer intersection failed".into()))?;

    let result: Vec<[f64; 2]> = serde_json::from_str(&result_json)
        .map_err(|e| GeoError(format!("Deserialization error: {}", e)))?;

    Ok(result)
}

/// Calculate polygon area
pub fn polygon_area(rings: &[Vec<[f64; 2]>]) -> Result<f64, GeoError> {
    let rings_json = serde_json::to_string(rings)
        .map_err(|e| GeoError(format!("Serialization error: {}", e)))?;

    polygon_area_json(&rings_json).ok_or_else(|| GeoError("Area calculation failed".into()))
}

/// Get the largest polygon from a list by area
pub fn get_largest_polygon(polygons: &[Vec<Vec<[f64; 2]>>]) -> Option<Vec<Vec<[f64; 2]>>> {
    if polygons.is_empty() {
        return None;
    }

    let mut largest_area = 0.0;
    let mut largest_idx = 0;

    for (i, rings) in polygons.iter().enumerate() {
        if let Ok(area) = polygon_area(rings) {
            if area > largest_area {
                largest_area = area;
                largest_idx = i;
            }
        }
    }

    Some(polygons[largest_idx].clone())
}
