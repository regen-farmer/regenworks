//! Headland processing for layout modelling
//!
//! Equivalent to headland.ts - applies headland buffers to polygon edges
//! that are perpendicular to the row bearing.

use crate::geometry::{
    bearing, centroid, clamp_bearing_0_180, coords_to_geos_line, coords_to_geos_polygon,
    geos_polygon_to_coords, line_length, local_meters_to_wgs84, wgs84_to_local_meters,
};
use crate::types::GeoJsonFeature;
use geos::{Geom, Geometry};

/// Buffer a line in local meter coordinates for accurate geodesic buffering
fn buffer_line_geodesic(line: &[[f64; 2]], buffer_m: f64) -> Result<Geometry, geos::Error> {
    // Calculate center point for projection
    let center = [
        (line[0][0] + line[1][0]) / 2.0,
        (line[0][1] + line[1][1]) / 2.0,
    ];

    // Project line to local meters
    let local_line: Vec<[f64; 2]> = line
        .iter()
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

/// Compute intersection point of two lines in local (projected) coordinates
/// Lines are defined by two points each
/// Returns None if lines are parallel
fn line_intersection_local(
    line1: &[[f64; 2]],
    line2: &[[f64; 2]],
    center: [f64; 2],
) -> Option<[f64; 2]> {
    // Project to local meters (like Mercator in TypeScript)
    let p1 = wgs84_to_local_meters(line1[0], center);
    let p2 = wgs84_to_local_meters(line1[1], center);
    let p3 = wgs84_to_local_meters(line2[0], center);
    let p4 = wgs84_to_local_meters(line2[1], center);

    // Line 1: y = m1*x + b1
    let dx1 = p2[0] - p1[0];
    let dy1 = p2[1] - p1[1];

    // Line 2: y = m2*x + b2
    let dx2 = p4[0] - p3[0];
    let dy2 = p4[1] - p3[1];

    // Handle near-vertical lines
    let epsilon = 1e-10;

    if dx1.abs() < epsilon && dx2.abs() < epsilon {
        // Both lines are vertical - parallel
        return None;
    }

    if dx1.abs() < epsilon {
        // Line 1 is vertical
        let x = p1[0];
        let m2 = dy2 / dx2;
        let b2 = p3[1] - m2 * p3[0];
        let y = m2 * x + b2;
        return Some(local_meters_to_wgs84([x, y], center));
    }

    if dx2.abs() < epsilon {
        // Line 2 is vertical
        let x = p3[0];
        let m1 = dy1 / dx1;
        let b1 = p1[1] - m1 * p1[0];
        let y = m1 * x + b1;
        return Some(local_meters_to_wgs84([x, y], center));
    }

    let m1 = dy1 / dx1;
    let b1 = p1[1] - m1 * p1[0];

    let m2 = dy2 / dx2;
    let b2 = p3[1] - m2 * p3[0];

    // Check if parallel
    if (m1 - m2).abs() < epsilon {
        return None;
    }

    // Find intersection
    let x = (b2 - b1) / (m1 - m2);
    let y = m1 * x + b1;

    // Project back to WGS84
    Some(local_meters_to_wgs84([x, y], center))
}

/// Restore the headland polygon by cleaning up buffer artifacts
/// This finds sides parallel to the bearing and replaces the buffered
/// vertices with clean intersection points
///
/// This closely follows the TypeScript implementation in headland.ts
fn restore_headland_polygon(
    headland_coords: &[[f64; 2]],
    field_bearing: f64,
    bearing_threshold: f64,
) -> (Vec<[f64; 2]>, Vec<[f64; 2]>) {
    let field_bearing_clamped = clamp_bearing_0_180(field_bearing);

    // Work with mutable coordinates that we'll update as we process each parallel side
    let mut current_coords = headland_coords.to_vec();
    let mut intersection_points: Vec<[f64; 2]> = Vec::new();

    // Calculate center for projection (use original coords)
    let center = centroid(headland_coords);

    // Find indices of sides parallel to bearing with length > 2m
    // Note: We need to recalculate sides after each modification, like TypeScript does
    let sides = get_all_sides(&current_coords);
    let n = sides.len();

    if n == 0 {
        return (current_coords, vec![]);
    }

    let mut idx_of_sides_parallel: Vec<usize> = Vec::new();
    for (idx, side) in sides.iter().enumerate() {
        let side_bearing = bearing(side[0], side[1]);
        let side_bearing_clamped = clamp_bearing_0_180(side_bearing);
        let side_len = line_length(side);

        if (side_bearing_clamped - field_bearing_clamped).abs() <= bearing_threshold
            && side_len > 2.0
        {
            idx_of_sides_parallel.push(idx);
        }
    }

    if idx_of_sides_parallel.is_empty() {
        return (current_coords, vec![]);
    }

    // Process each parallel side
    for &idx in &idx_of_sides_parallel {
        // Recalculate sides from current coords (like TypeScript does)
        let current_sides = get_all_sides(&current_coords);
        let num_sides = current_sides.len();

        if idx >= num_sides {
            // Index out of bounds after previous modifications, skip
            continue;
        }

        // Find the adjacent side BEFORE that has length > 2m
        let mut before_idx = idx;
        loop {
            if before_idx == 0 {
                before_idx = num_sides - 1;
            } else {
                before_idx -= 1;
            }

            if before_idx == (idx + 1) % num_sides {
                // Wrapped around completely
                break;
            }

            if line_length(&current_sides[before_idx]) > 2.0 {
                break;
            }
        }

        // Find the adjacent side AFTER that has length > 2m
        let mut after_idx = idx;
        loop {
            after_idx = (after_idx + 1) % num_sides;

            if after_idx == idx.saturating_sub(1) || (idx == 0 && after_idx == num_sides - 1) {
                // Wrapped around completely
                break;
            }

            if line_length(&current_sides[after_idx]) > 2.0 {
                break;
            }
        }

        // Compute intersection of before_side with the parallel side
        let before_side = &current_sides[before_idx];
        let parallel_side = &current_sides[idx];
        let after_side = &current_sides[after_idx];

        let intersection_before = line_intersection_local(before_side, parallel_side, center);
        let intersection_after = line_intersection_local(after_side, parallel_side, center);

        if let Some(pt) = intersection_before {
            intersection_points.push(pt);
        }
        if let Some(pt) = intersection_after {
            intersection_points.push(pt);
        }

        // Replace vertices between before_idx and after_idx with intersection points
        // Following TypeScript's exact logic
        if let (Some(int_before), Some(int_after)) = (intersection_before, intersection_after) {
            let coords_len = current_coords.len();

            if before_idx < after_idx {
                // Normal case: before comes before after in the array
                // _.slice(coords, 0, beforeIdx + 1) -> coords[0..=before_idx]
                // _.slice(coords, beforeIdx + 1, afterIdx + 1) -> coords[before_idx+1..=after_idx] (for fill count)
                // _.slice(coords, afterIdx + 1) -> coords[after_idx+1..]

                let mut new_coords: Vec<[f64; 2]> = Vec::new();

                // Keep vertices from 0 to before_idx (inclusive)
                new_coords.extend_from_slice(&current_coords[0..=before_idx]);

                // Add intersection before
                new_coords.push(int_before);

                // Fill with int_before to maintain array length
                // TypeScript: Array(slice(beforeIdx+1, afterIdx+1).length - 2).fill(intBefore)
                let slice_len = after_idx - before_idx; // afterIdx + 1 - (beforeIdx + 1) = afterIdx - beforeIdx
                if slice_len > 2 {
                    for _ in 0..(slice_len - 2) {
                        new_coords.push(int_before);
                    }
                }

                // Add intersection after
                new_coords.push(int_after);

                // Keep vertices from after_idx+1 onwards
                if after_idx + 1 < coords_len {
                    new_coords.extend_from_slice(&current_coords[after_idx + 1..]);
                }

                current_coords = new_coords;
            } else {
                // Wrap-around case: afterIdx < beforeIdx
                // TypeScript:
                // [
                //   ...Array(slice(0, afterIdx+1).length).fill(intAfter),
                //   ...slice(afterIdx+1, beforeIdx+1),
                //   ...Array(slice(beforeIdx).length - 1).fill(intBefore),
                //   intAfter
                // ]

                let mut new_coords: Vec<[f64; 2]> = Vec::new();

                // Fill beginning with int_after
                // slice(0, afterIdx+1).length = afterIdx + 1
                for _ in 0..=after_idx {
                    new_coords.push(int_after);
                }

                // Keep middle section: slice(afterIdx+1, beforeIdx+1)
                if after_idx + 1 <= before_idx {
                    new_coords.extend_from_slice(&current_coords[after_idx + 1..=before_idx]);
                }

                // Fill end with int_before
                // slice(beforeIdx).length - 1 = (coords_len - beforeIdx) - 1
                let fill_count = coords_len.saturating_sub(before_idx).saturating_sub(1);
                for _ in 0..fill_count {
                    new_coords.push(int_before);
                }

                // Close with int_after
                new_coords.push(int_after);

                current_coords = new_coords;
            }
        }
    }

    // Remove consecutive duplicate points (but keep first and last point the same)
    // TypeScript: _.remove(coords, (coord, i) => { if not first/last and same as prev, return false })
    let mut cleaned: Vec<[f64; 2]> = Vec::new();
    for (i, coord) in current_coords.iter().enumerate() {
        if i == 0 {
            cleaned.push(*coord);
        } else if i == current_coords.len() - 1 {
            // Always keep last point
            cleaned.push(*coord);
        } else {
            // Skip if same as previous
            let prev = &current_coords[i - 1];
            if (coord[0] - prev[0]).abs() > 1e-10 || (coord[1] - prev[1]).abs() > 1e-10 {
                cleaned.push(*coord);
            }
        }
    }

    // Ensure closed ring
    if cleaned.len() > 1 {
        let first = cleaned[0];
        let last = cleaned[cleaned.len() - 1];
        if (first[0] - last[0]).abs() > 1e-10 || (first[1] - last[1]).abs() > 1e-10 {
            cleaned.push(first);
        }
    }

    (cleaned, intersection_points)
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

    let buffer_distance = if headland_m > 0.001 {
        headland_m
    } else {
        0.001
    };

    for side in &sides_different_from_bearing {
        // Use geodesic buffering for accurate meter distances
        let buffer = buffer_line_geodesic(side, buffer_distance)?;

        // Store buffer coordinates for output
        if let Ok(coords) = geos_polygon_to_coords(&buffer) {
            headland_sides_coords.push(coords);
        }

        headland_buffers.push(buffer);
    }

    // Start with the margin polygon (exterior ring only - ignore holes)
    let exterior_only = vec![margin_polygon[0].clone()];
    let mut headland_geom = coords_to_geos_polygon(&exterior_only)?;

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
    let headland_polygon_raw = geos_polygon_to_coords(&headland_geom)?;

    // Restore the headland polygon by cleaning up buffer artifacts
    // This replaces buffered vertices with clean intersection points
    let (restored_exterior, intersection_points) =
        restore_headland_polygon(&headland_polygon_raw[0], field_bearing, bearing_threshold);

    // Rebuild polygon with restored exterior and any holes from the raw result
    let mut headland_polygon = vec![restored_exterior];
    if headland_polygon_raw.len() > 1 {
        headland_polygon.extend_from_slice(&headland_polygon_raw[1..]);
    }

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
        intersection_points,
    })
}

impl HeadlandResult {
    /// Convert headland sides to GeoJSON features
    pub fn headland_sides_to_geojson(&self) -> Vec<GeoJsonFeature> {
        self.headland_sides
            .iter()
            .map(|rings| {
                GeoJsonFeature::polygon(
                    rings
                        .iter()
                        .map(|ring| ring.iter().map(|c| [c[0], c[1]]).collect())
                        .collect(),
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
                GeoJsonFeature::line_string(side.iter().map(|c| [c[0], c[1]]).collect(), None)
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
        let polygon = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]];

        let sides = get_all_sides(&polygon);
        assert_eq!(sides.len(), 4);
    }
}
