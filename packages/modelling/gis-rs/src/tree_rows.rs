//! Tree row line generation
//!
//! Equivalent to make_tree_row_lines.ts - creates parallel row lines
//! within the headland polygon.

use crate::geometry::{
    along, bearing, coords_to_geos_line, coords_to_geos_polygon, line_length, local_meters_to_wgs84,
};
use crate::types::{GeoJsonFeature, RowDefinition};
use geos::{Geom, Geometry};

/// A tree row line with its system design index
#[derive(Debug, Clone)]
pub struct TreeRowLineResult {
    /// The line coordinates
    pub line: Vec<[f64; 2]>,
    /// Index into the system design rows array
    pub system_design_row_index: usize,
}

/// Calculate headland offset values
fn calculate_headland_offset(offset: &Option<crate::types::RowOffset>) -> (f64, f64) {
    match offset {
        Some(o) => (o.before.unwrap_or(0.0), o.after.unwrap_or(0.0)),
        None => (0.0, 0.0),
    }
}

/// Project a WGS84 coordinate to local meters using Azimuthal Equidistant projection
fn wgs84_to_local_meters(coord: [f64; 2], center: [f64; 2]) -> [f64; 2] {
    use crate::geometry::{bearing as geo_bearing, distance};
    let dist = distance(center, coord);
    let brng = geo_bearing(center, coord).to_radians();
    let x = dist * brng.sin();
    let y = dist * brng.cos();
    [x, y]
}

/// Create tree row lines within a polygon
///
/// This function:
/// 1. Creates parallel lines by buffering the initial line
/// 2. Finds intersection points with the polygon boundary
/// 3. Creates row lines between intersection points
/// 4. Applies per-row offsets
///
/// # Arguments
/// * `offset_polygon` - The headland polygon coordinates
/// * `line_intersecting_area` - The initial reference line
/// * `width_of_area` - Width of the area in meters
/// * `rows` - System design row definitions
pub fn make_tree_row_lines(
    offset_polygon: &[Vec<[f64; 2]>],
    line_intersecting_area: &[[f64; 2]],
    width_of_area: f64,
    rows: &[RowDefinition],
) -> Result<Vec<TreeRowLineResult>, geos::Error> {
    if rows.is_empty() {
        return Ok(vec![]);
    }

    // Calculate center for local projection (use polygon centroid)
    let center = if !offset_polygon.is_empty() && !offset_polygon[0].is_empty() {
        let exterior = &offset_polygon[0];
        let n = exterior.len() as f64;
        [
            exterior.iter().map(|c| c[0]).sum::<f64>() / n,
            exterior.iter().map(|c| c[1]).sum::<f64>() / n,
        ]
    } else {
        [0.0, 0.0]
    };

    // Project polygon to local meters for accurate intersection calculations
    // Only use exterior ring (ignore holes) - trees/groundcover run over holes
    let local_polygon: Vec<Vec<[f64; 2]>> = vec![offset_polygon[0]
        .iter()
        .map(|c| wgs84_to_local_meters(*c, center))
        .collect()];
    let polygon_geom = coords_to_geos_polygon(&local_polygon)?;
    let polygon_boundary = polygon_geom.boundary()?;

    // Project reference line to local meters
    let local_line: Vec<[f64; 2]> = line_intersecting_area
        .iter()
        .map(|c| wgs84_to_local_meters(*c, center))
        .collect();
    let line_geom = coords_to_geos_line(&local_line)?;

    // Get the bearing of the reference line
    let ref_bearing = bearing(line_intersecting_area[0], line_intersecting_area[1]);

    let mut tree_rows: Vec<TreeRowLineResult> = Vec::new();
    let mut accumulating_width = 0.0;
    let mut current_row_idx = 0;

    loop {
        // Add half row width
        let half_width = if rows[current_row_idx].width == 0.0 {
            0.0
        } else {
            rows[current_row_idx].width / 2.0
        };
        accumulating_width += half_width;

        // Complete if there isn't room for more lines
        if accumulating_width > width_of_area {
            break;
        }

        // Buffer the line by the accumulated width (in meters, since we're in local coords)
        let buffer_geom = line_geom.buffer(accumulating_width, 32)?;

        // Find intersection points between buffer boundary and polygon boundary
        // (all in local meter coordinates)
        let buffer_boundary = buffer_geom.boundary()?;

        // Get the intersection of boundaries - should be Points where they cross
        let boundary_intersection = buffer_boundary.intersection(&polygon_boundary)?;

        // Extract points from the intersection (in local meters)
        let intersection_points_local = extract_all_points(&boundary_intersection)?;

        // Sort intersection points and create row lines
        if intersection_points_local.len() >= 2 {
            let sorted_points = sort_intersection_points(&intersection_points_local);

            // Create lines between pairs of points
            for k in 0..(sorted_points.len() / 2) {
                let start_local = sorted_points[k * 2];
                let end_local = sorted_points[k * 2 + 1];

                // Project back to WGS84
                let start = local_meters_to_wgs84(start_local, center);
                let end = local_meters_to_wgs84(end_local, center);

                let mut row_line = vec![start, end];

                // Check and fix bearing direction (now comparing WGS84 bearings)
                let row_bearing = bearing(row_line[0], row_line[1]);
                let bearing_diff = (row_bearing - ref_bearing).abs();
                if bearing_diff > 1.0 && bearing_diff < 359.0 {
                    // Flip if bearing is more than 1 degree off but not close to 360
                    // Check if flipping would be closer
                    let flipped_bearing = bearing(row_line[1], row_line[0]);
                    let flipped_diff = (flipped_bearing - ref_bearing).abs();
                    if flipped_diff < bearing_diff || (360.0 - flipped_diff) < bearing_diff {
                        row_line.reverse();
                    }
                }

                // Apply offsets (these work in meters via geodesic along())
                let (before, after) = calculate_headland_offset(&rows[current_row_idx].offset);
                let row_length = line_length(&row_line);

                if before + after >= row_length {
                    // Offsets are longer than the row, skip
                    continue;
                }

                // Trim the line by offsets
                if before > 0.0 || after > 0.0 {
                    let start_point = along(&row_line, before);
                    let end_point = along(&row_line, row_length - after);
                    row_line = vec![start_point, end_point];
                }

                tree_rows.push(TreeRowLineResult {
                    line: row_line,
                    system_design_row_index: current_row_idx,
                });
            }
        }

        // Add second half of row width
        accumulating_width += half_width;

        // Cycle to next row
        current_row_idx = (current_row_idx + 1) % rows.len();
    }

    Ok(tree_rows)
}

/// Extract all points from any geometry type (Point, MultiPoint, etc.)
fn extract_all_points(geom: &Geometry) -> Result<Vec<[f64; 2]>, geos::Error> {
    let mut points = Vec::new();

    let geom_type = geom.geometry_type();

    match geom_type {
        geos::GeometryTypes::Point => {
            let coord_seq = geom.get_coord_seq()?;
            if coord_seq.size()? > 0 {
                points.push([coord_seq.get_x(0)?, coord_seq.get_y(0)?]);
            }
        }
        geos::GeometryTypes::MultiPoint => {
            let num_geoms = geom.get_num_geometries()?;
            for i in 0..num_geoms {
                if let Ok(pt) = geom.get_geometry_n(i) {
                    let coord_seq = pt.get_coord_seq()?;
                    if coord_seq.size()? > 0 {
                        points.push([coord_seq.get_x(0)?, coord_seq.get_y(0)?]);
                    }
                }
            }
        }
        geos::GeometryTypes::LineString => {
            // For a linestring, extract all vertices
            let coord_seq = geom.get_coord_seq()?;
            let num_coords = coord_seq.size()?;
            for i in 0..num_coords {
                points.push([coord_seq.get_x(i)?, coord_seq.get_y(i)?]);
            }
        }
        geos::GeometryTypes::MultiLineString | geos::GeometryTypes::GeometryCollection => {
            let num_geoms = geom.get_num_geometries()?;
            for i in 0..num_geoms {
                if let Ok(sub_geom) = geom.get_geometry_n(i) {
                    let owned = sub_geom.clone();
                    let sub_points = extract_all_points(&owned)?;
                    points.extend(sub_points);
                }
            }
        }
        _ => {}
    }

    // Deduplicate close points
    let points = deduplicate_points(&points, 1e-10);
    Ok(points)
}

/// Remove duplicate points within a tolerance
fn deduplicate_points(points: &[[f64; 2]], tol: f64) -> Vec<[f64; 2]> {
    let mut result = Vec::new();
    for p in points {
        let is_dup = result
            .iter()
            .any(|q: &[f64; 2]| (p[0] - q[0]).abs() < tol && (p[1] - q[1]).abs() < tol);
        if !is_dup {
            result.push(*p);
        }
    }
    result
}

/// Sort intersection points for pairing
fn sort_intersection_points(points: &[[f64; 2]]) -> Vec<[f64; 2]> {
    let mut sorted = points.to_vec();

    // Check if all x coordinates are unique (within tolerance)
    let x_unique = {
        let mut x_vals: Vec<f64> = sorted.iter().map(|p| (p[0] * 1e9).round()).collect();
        x_vals.sort_by(|a, b| a.partial_cmp(b).unwrap());
        x_vals.dedup();
        x_vals.len() == sorted.len()
    };

    if x_unique {
        sorted.sort_by(|a, b| a[0].partial_cmp(&b[0]).unwrap());
    } else {
        // Sort by y if x has duplicates
        sorted.sort_by(|a, b| a[1].partial_cmp(&b[1]).unwrap());
    }

    sorted
}

impl TreeRowLineResult {
    /// Convert to GeoJSON feature
    pub fn to_geojson(&self) -> GeoJsonFeature {
        GeoJsonFeature::line_string(
            self.line.iter().map(|c| [c[0], c[1]]).collect(),
            Some(serde_json::json!({
                "systemDesignRowIndex": self.system_design_row_index
            })),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_tree_row_lines_empty() {
        let polygon = vec![vec![
            [0.0, 0.0],
            [0.001, 0.0],
            [0.001, 0.001],
            [0.0, 0.001],
            [0.0, 0.0],
        ]];
        let line = [[0.0, 0.0005], [0.001, 0.0005]];

        let result = make_tree_row_lines(&polygon, &line, 100.0, &[]).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_sort_intersection_points() {
        let points = [[0.002, 0.0], [0.001, 0.0], [0.003, 0.0]];
        let sorted = sort_intersection_points(&points);
        assert_eq!(sorted[0][0], 0.001);
        assert_eq!(sorted[1][0], 0.002);
        assert_eq!(sorted[2][0], 0.003);
    }
}
