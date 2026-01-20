//! Headland processing for layout modelling
//!
//! Equivalent to headland.ts - applies headland buffers to polygon edges
//! that are perpendicular to the row bearing.

use geos::{Geom, Geometry};
use crate::geometry::{
    bearing, clamp_bearing_0_180, line_length, distance, destination,
    coords_to_geos_line, coords_to_geos_polygon, geos_polygon_to_coords,
};
use crate::types::GeoJsonFeature;

/// Project a WGS84 coordinate to local meters using Azimuthal Equidistant projection
fn wgs84_to_local_meters(coord: [f64; 2], center: [f64; 2]) -> [f64; 2] {
    let dist = distance(center, coord);
    let brng = bearing(center, coord).to_radians();
    let x = dist * brng.sin();
    let y = dist * brng.cos();
    [x, y]
}

/// Project local meters back to WGS84
fn local_meters_to_wgs84(coord: [f64; 2], center: [f64; 2]) -> [f64; 2] {
    let x = coord[0];
    let y = coord[1];
    let dist = (x * x + y * y).sqrt();
    let brng = x.atan2(y).to_degrees();
    destination(center, dist, brng)
}

/// Buffer a line in local meter coordinates for accurate geodesic buffering
fn buffer_line_geodesic(line: &[[f64; 2]], buffer_m: f64) -> Result<Geometry, geos::Error> {
    // Calculate center point for projection
    let center = [
        (line[0][0] + line[1][0]) / 2.0,
        (line[0][1] + line[1][1]) / 2.0,
    ];
    
    // Project line to local meters
    let local_line: Vec<[f64; 2]> = line.iter()
        .map(|c| wgs84_to_local_meters(*c, center))
        .collect();
    
    // Create GEOS line in local coordinates
    let local_geom = coords_to_geos_line(&local_line)?;
    
    // Buffer in meters
    let buffered = local_geom.buffer(buffer_m, 32)?;
    
    // Extract coordinates and project back to WGS84
    let buffered_coords = geos_polygon_to_coords(&buffered)?;
    let wgs84_coords: Vec<Vec<[f64; 2]>> = buffered_coords
        .iter()
        .map(|ring| {
            ring.iter()
                .map(|c| local_meters_to_wgs84(*c, center))
                .collect()
        })
        .collect();
    
    // Create new GEOS polygon with WGS84 coordinates
    coords_to_geos_polygon(&wgs84_coords)
}

/// Result of applying headland
pub struct HeadlandResult {
    /// Buffer polygons for each headland side
    pub headland_sides: Vec<Vec<Vec<[f64; 2]>>>,
    /// The polygon after headland is applied
    pub headland_polygon: Vec<Vec<[f64; 2]>>,
    /// Sides that are close to the bearing (parallel to rows)
    pub sides_close_to_bearing: Vec<Vec<[f64; 2]>>,
    /// Intersection points for debugging
    pub intersection_points: Vec<[f64; 2]>,
}

/// Get all sides of a polygon as LineString coordinates
fn get_all_sides(polygon_coords: &[[f64; 2]]) -> Vec<Vec<[f64; 2]>> {
    let mut sides = Vec::new();
    for i in 0..polygon_coords.len() - 1 {
        sides.push(vec![polygon_coords[i], polygon_coords[i + 1]]);
    }
    sides
}

/// Apply headland buffers to a polygon
///
/// This function:
/// 1. Identifies polygon sides that are NOT parallel to the bearing (perpendicular = headland sides)
/// 2. Creates buffer zones on those sides
/// 3. Subtracts the buffers from the polygon
/// 4. Cleans up the resulting polygon
///
/// # Arguments
/// * `margin_polygon` - The polygon coordinates (after margin is applied)
/// * `headland_m` - Headland width in meters
/// * `field_bearing` - The row bearing in degrees
/// * `bearing_threshold` - Threshold for determining if a side is parallel (default 5 degrees)
pub fn apply_headland(
    margin_polygon: &[Vec<[f64; 2]>],
    headland_m: f64,
    field_bearing: f64,
    bearing_threshold: f64,
) -> Result<HeadlandResult, geos::Error> {
    if margin_polygon.is_empty() || margin_polygon[0].is_empty() {
        return Ok(HeadlandResult {
            headland_sides: vec![],
            headland_polygon: margin_polygon.to_vec(),
            sides_close_to_bearing: vec![],
            intersection_points: vec![],
        });
    }

    let exterior = &margin_polygon[0];
    let sides = get_all_sides(exterior);
    let field_bearing_clamped = clamp_bearing_0_180(field_bearing);

    // Get the centroid latitude for meters-to-degrees conversion
    let centroid_lat = {
        let sum_lat: f64 = exterior.iter().map(|c| c[1]).sum();
        sum_lat / exterior.len() as f64
    };

    // Find sides that are different from the bearing (perpendicular = headland sides)
    let sides_different_from_bearing: Vec<&Vec<[f64; 2]>> = sides
        .iter()
        .filter(|side| {
            let side_bearing = bearing(side[0], side[1]);
            let side_bearing_clamped = clamp_bearing_0_180(side_bearing);
            (side_bearing_clamped - field_bearing_clamped).abs() > bearing_threshold
        })
        .collect();

    // Create headland buffers for each perpendicular side using geodesic buffering
    let mut headland_buffers: Vec<Geometry> = Vec::new();
    let mut headland_sides_coords: Vec<Vec<Vec<[f64; 2]>>> = Vec::new();
    
    let buffer_distance = if headland_m > 0.001 { headland_m } else { 0.001 };

    for side in &sides_different_from_bearing {
        // Use geodesic buffering for accurate meter distances
        let buffer = buffer_line_geodesic(side, buffer_distance)?;
        
        // Store buffer coordinates for output
        if let Ok(coords) = geos_polygon_to_coords(&buffer) {
            headland_sides_coords.push(coords);
        }
        
        headland_buffers.push(buffer);
    }

    // Start with the margin polygon
    let mut headland_geom = coords_to_geos_polygon(margin_polygon)?;

    // Subtract each headland buffer from the polygon
    for buffer in &headland_buffers {
        if let Ok(diff) = headland_geom.difference(buffer) {
            // If the result is a MultiPolygon, take the largest polygon
            let geom_type = diff.geometry_type();
            match geom_type {
                geos::GeometryTypes::Polygon => {
                    headland_geom = diff;
                }
                geos::GeometryTypes::MultiPolygon => {
                    // Find the largest polygon by area
                    let num_geoms = diff.get_num_geometries()?;
                    let mut largest_area = 0.0;
                    let mut largest_idx = 0;
                    
                    for i in 0..num_geoms {
                        if let Ok(geom) = diff.get_geometry_n(i) {
                            if let Ok(area) = geom.area() {
                                if area > largest_area {
                                    largest_area = area;
                                    largest_idx = i;
                                }
                            }
                        }
                    }
                    
                    if let Ok(largest) = diff.get_geometry_n(largest_idx) {
                        headland_geom = largest.clone();
                    }
                }
                geos::GeometryTypes::GeometryCollection => {
                    // Try to extract the first polygon
                    let num_geoms = diff.get_num_geometries()?;
                    for i in 0..num_geoms {
                        if let Ok(geom) = diff.get_geometry_n(i) {
                            let gtype = geom.geometry_type();
                            if gtype == geos::GeometryTypes::Polygon {
                                headland_geom = geom.clone();
                                break;
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    // Extract final polygon coordinates
    let headland_polygon = geos_polygon_to_coords(&headland_geom)?;

    // Find sides close to bearing (parallel to rows) - for visualization
    let headland_exterior = &headland_polygon[0];
    let headland_sides_list = get_all_sides(headland_exterior);
    
    let sides_close_to_bearing: Vec<Vec<[f64; 2]>> = headland_sides_list
        .iter()
        .filter(|side| {
            let side_bearing = bearing(side[0], side[1]);
            let side_bearing_clamped = clamp_bearing_0_180(side_bearing);
            let side_length = line_length(side);
            (side_bearing_clamped - field_bearing_clamped).abs() <= bearing_threshold
                && side_length > 2.0
        })
        .cloned()
        .collect();

    Ok(HeadlandResult {
        headland_sides: headland_sides_coords,
        headland_polygon,
        sides_close_to_bearing,
        intersection_points: vec![], // Simplified - not computing intersections in Rust version
    })
}

impl HeadlandResult {
    /// Convert headland sides to GeoJSON features
    pub fn headland_sides_to_geojson(&self) -> Vec<GeoJsonFeature> {
        self.headland_sides
            .iter()
            .map(|rings| {
                GeoJsonFeature::polygon(
                    rings.iter().map(|ring| ring.iter().map(|c| [c[0], c[1]]).collect()).collect(),
                    None,
                )
            })
            .collect()
    }

    /// Convert headland polygon to GeoJSON feature
    pub fn headland_polygon_to_geojson(&self) -> GeoJsonFeature {
        GeoJsonFeature::polygon(
            self.headland_polygon
                .iter()
                .map(|ring| ring.iter().map(|c| [c[0], c[1]]).collect())
                .collect(),
            None,
        )
    }

    /// Convert sides close to bearing to GeoJSON features
    pub fn sides_close_to_bearing_to_geojson(&self) -> Vec<GeoJsonFeature> {
        self.sides_close_to_bearing
            .iter()
            .map(|side| {
                GeoJsonFeature::line_string(
                    side.iter().map(|c| [c[0], c[1]]).collect(),
                    None,
                )
            })
            .collect()
    }
    
    /// Convert intersection points to GeoJSON features
    pub fn intersection_points_to_geojson(&self) -> Vec<GeoJsonFeature> {
        self.intersection_points
            .iter()
            .map(|p| GeoJsonFeature::point([p[0], p[1]], None))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apply_headland_no_headland() {
        let polygon = vec![vec![
            [0.0, 0.0],
            [0.001, 0.0],
            [0.001, 0.001],
            [0.0, 0.001],
            [0.0, 0.0],
        ]];

        let result = apply_headland(&polygon, 0.0, 0.0, 5.0).unwrap();
        assert!(!result.headland_polygon.is_empty());
    }

    #[test]
    fn test_get_all_sides() {
        let polygon = vec![
            [0.0, 0.0],
            [1.0, 0.0],
            [1.0, 1.0],
            [0.0, 1.0],
            [0.0, 0.0],
        ];
        
        let sides = get_all_sides(&polygon);
        assert_eq!(sides.len(), 4);
    }
}
