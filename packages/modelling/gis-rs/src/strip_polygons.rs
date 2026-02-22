//! Strip polygon generation
//!
//! Equivalent to make_all_strip_polygons.ts - creates polygons for each row strip
//! with accurate area calculations.

use crate::geometry::{
    coords_to_geos_line, coords_to_geos_polygon, geos_polygon_to_coords, project_line_to_local,
    project_polygon_to_local, project_polygon_to_wgs84,
};
use crate::types::{GeoJsonFeature, RowDefinition};
use geos::Geom;

/// Result of strip polygon generation
#[derive(Debug, Clone)]
pub struct StripPolygonResult {
    /// The strip polygon coordinates
    pub polygon: Vec<Vec<[f64; 2]>>,
    /// Area in square meters
    pub area_m2: f64,
    /// Index into the system design rows array
    pub row_index: usize,
}

/// Create strip polygons for all rows
///
/// This function:
/// 1. Projects polygon and line to local meters (Azimuthal Equidistant)
/// 2. Creates "donut" buffers for each strip in meter-space
/// 3. Intersects with the field polygon
/// 4. Projects results back to WGS84
/// 5. Calculates area for each strip
///
/// # Arguments
/// * `offset_polygon` - The headland polygon coordinates
/// * `line_intersecting_area` - The initial reference line
/// * `width_of_area` - Width of the area in meters
/// * `rows` - System design row definitions
pub fn make_all_strip_polygons(
    offset_polygon: &[Vec<[f64; 2]>],
    line_intersecting_area: &[[f64; 2]],
    width_of_area: f64,
    rows: &[RowDefinition],
) -> Result<Vec<StripPolygonResult>, geos::Error> {
    if rows.is_empty() {
        return Ok(vec![]);
    }

    // Calculate centroid as projection center
    let center = if !offset_polygon.is_empty() && !offset_polygon[0].is_empty() {
        let n = offset_polygon[0].len() as f64;
        let sum_lon: f64 = offset_polygon[0].iter().map(|c| c[0]).sum();
        let sum_lat: f64 = offset_polygon[0].iter().map(|c| c[1]).sum();
        [sum_lon / n, sum_lat / n]
    } else {
        [0.0, 0.0]
    };

    // Only use exterior ring (ignore holes - trees/groundcover run over them)
    let exterior_only = vec![offset_polygon[0].clone()];

    // Project polygon and line to local meters
    let local_polygon = project_polygon_to_local(&exterior_only, center);
    let local_line = project_line_to_local(line_intersecting_area, center);

    // Create GEOS geometries in local coordinate system (meters)
    let polygon_geom = coords_to_geos_polygon(&local_polygon)?;
    let line_geom = coords_to_geos_line(&local_line)?;

    let mut strip_polygons: Vec<StripPolygonResult> = Vec::new();
    let mut accumulating_width = 0.0;
    let mut current_row_idx = 0;

    loop {
        // Complete if there isn't room for more strips
        if accumulating_width > width_of_area {
            break;
        }

        let row_width = rows[current_row_idx].width;

        // Create the elongated donut buffer in meters (no conversion needed!)
        let elongated_donut = if accumulating_width > 0.0 {
            let buffer_small = line_geom.buffer(accumulating_width, 32)?;
            let buffer_big = line_geom.buffer(accumulating_width + row_width, 32)?;

            // Create donut by subtracting small from big
            buffer_big.difference(&buffer_small)?
        } else {
            line_geom.buffer(row_width, 32)?
        };

        // Intersect with the field polygon
        let intersection = polygon_geom.intersection(&elongated_donut)?;

        // Calculate area (already in square meters!) and extract coordinates
        let geom_type = intersection.geometry_type();

        match geom_type {
            geos::GeometryTypes::Polygon => {
                let area_m2 = intersection.area()?;

                if let Ok(local_coords) = geos_polygon_to_coords(&intersection) {
                    // Project back to WGS84
                    let wgs84_coords = project_polygon_to_wgs84(&local_coords, center);
                    strip_polygons.push(StripPolygonResult {
                        polygon: wgs84_coords,
                        area_m2,
                        row_index: current_row_idx,
                    });
                }
            }
            geos::GeometryTypes::MultiPolygon => {
                let num_geoms = intersection.get_num_geometries()?;

                for i in 0..num_geoms {
                    if let Ok(geom) = intersection.get_geometry_n(i) {
                        let area = geom.area().unwrap_or(0.0);
                        // Clone to get owned geometry for geos_polygon_to_coords
                        let owned_geom = geom.clone();
                        if let Ok(local_coords) = geos_polygon_to_coords(&owned_geom) {
                            // Project back to WGS84
                            let wgs84_coords = project_polygon_to_wgs84(&local_coords, center);
                            strip_polygons.push(StripPolygonResult {
                                polygon: wgs84_coords,
                                area_m2: area,
                                row_index: current_row_idx,
                            });
                        }
                    }
                }
            }
            _ => {
                // No valid intersection, push empty result
                strip_polygons.push(StripPolygonResult {
                    polygon: vec![],
                    area_m2: 0.0,
                    row_index: current_row_idx,
                });
            }
        }

        // Add row width
        accumulating_width += row_width;

        // Cycle to next row
        current_row_idx = (current_row_idx + 1) % rows.len();
    }

    Ok(strip_polygons)
}

impl StripPolygonResult {
    /// Convert to GeoJSON feature
    pub fn to_geojson(&self) -> GeoJsonFeature {
        if self.polygon.is_empty() {
            return GeoJsonFeature::polygon(
                vec![],
                Some(serde_json::json!({
                    "rowIndex": self.row_index,
                    "areaM2": self.area_m2
                })),
            );
        }

        GeoJsonFeature::polygon(
            self.polygon
                .iter()
                .map(|ring| ring.iter().map(|c| [c[0], c[1]]).collect())
                .collect(),
            Some(serde_json::json!({
                "rowIndex": self.row_index,
                "areaM2": self.area_m2
            })),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_strip_polygons_empty_rows() {
        let polygon = vec![vec![
            [0.0, 0.0],
            [0.001, 0.0],
            [0.001, 0.001],
            [0.0, 0.001],
            [0.0, 0.0],
        ]];
        let line = [[0.0, 0.0005], [0.001, 0.0005]];

        let result = make_all_strip_polygons(&polygon, &line, 100.0, &[]).unwrap();
        assert!(result.is_empty());
    }
}
