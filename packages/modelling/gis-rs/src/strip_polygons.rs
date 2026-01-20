//! Strip polygon generation
//!
//! Equivalent to make_all_strip_polygons.ts - creates polygons for each row strip
//! with accurate area calculations.

use geos::Geom;
use crate::geometry::{coords_to_geos_line, coords_to_geos_polygon, geos_polygon_to_coords};
use crate::types::{GeoJsonFeature, RowDefinition};

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

/// Convert meters to degrees based on latitude
fn meters_to_degrees(meters: f64, latitude: f64) -> f64 {
    let lat_rad = latitude.to_radians();
    let meters_per_degree = 111_320.0 * lat_rad.cos();
    if meters_per_degree > 0.0 {
        meters / meters_per_degree
    } else {
        meters / 111_320.0
    }
}

/// Convert area from degrees^2 to square meters based on latitude
fn area_deg2_to_m2(area_deg2: f64, latitude: f64) -> f64 {
    let lat_rad = latitude.to_radians();
    // At equator: 1 degree ≈ 111,320 meters
    // Area scales with cos(lat) in one dimension
    let meters_per_degree_lat = 111_320.0;
    let meters_per_degree_lon = 111_320.0 * lat_rad.cos();
    area_deg2 * meters_per_degree_lat * meters_per_degree_lon
}

/// Create strip polygons for all rows
///
/// This function:
/// 1. Creates "donut" buffers for each strip
/// 2. Intersects with the field polygon
/// 3. Calculates area for each strip
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

    // Only use exterior ring (ignore holes - trees/groundcover run over them)
    let exterior_only = vec![offset_polygon[0].clone()];
    let polygon_geom = coords_to_geos_polygon(&exterior_only)?;
    let line_geom = coords_to_geos_line(line_intersecting_area)?;

    // Get the centroid latitude for meters-to-degrees conversion
    let centroid_lat = if !offset_polygon.is_empty() && !offset_polygon[0].is_empty() {
        let sum_lat: f64 = offset_polygon[0].iter().map(|c| c[1]).sum();
        sum_lat / offset_polygon[0].len() as f64
    } else {
        0.0
    };

    let mut strip_polygons: Vec<StripPolygonResult> = Vec::new();
    let mut accumulating_width = 0.0;
    let mut current_row_idx = 0;

    loop {
        // Complete if there isn't room for more strips
        if accumulating_width > width_of_area {
            break;
        }

        let row_width = rows[current_row_idx].width;
        
        // Create the elongated donut buffer
        let elongated_donut = if accumulating_width > 0.0 {
            let buffer_small_deg = meters_to_degrees(accumulating_width, centroid_lat);
            let buffer_big_deg = meters_to_degrees(accumulating_width + row_width, centroid_lat);
            
            let buffer_small = line_geom.buffer(buffer_small_deg, 32)?;
            let buffer_big = line_geom.buffer(buffer_big_deg, 32)?;
            
            // Create donut by subtracting small from big
            buffer_big.difference(&buffer_small)?
        } else {
            let buffer_deg = meters_to_degrees(row_width, centroid_lat);
            line_geom.buffer(buffer_deg, 32)?
        };

        // Intersect with the field polygon
        let intersection = polygon_geom.intersection(&elongated_donut)?;
        
        // Calculate area and extract coordinates
        let geom_type = intersection.geometry_type();
        
        match geom_type {
            geos::GeometryTypes::Polygon => {
                let area = intersection.area()?;
                let area_m2 = area_deg2_to_m2(area, centroid_lat);
                
                if let Ok(coords) = geos_polygon_to_coords(&intersection) {
                    strip_polygons.push(StripPolygonResult {
                        polygon: coords,
                        area_m2,
                        row_index: current_row_idx,
                    });
                }
            }
            geos::GeometryTypes::MultiPolygon => {
                let num_geoms = intersection.get_num_geometries()?;
                let mut total_area = 0.0;
                let mut all_coords = Vec::new();
                
                for i in 0..num_geoms {
                    if let Ok(geom) = intersection.get_geometry_n(i) {
                        if let Ok(area) = geom.area() {
                            total_area += area;
                        }
                        // Clone to get owned geometry for geos_polygon_to_coords
                        let owned_geom = geom.clone();
                        if let Ok(coords) = geos_polygon_to_coords(&owned_geom) {
                            all_coords.extend(coords);
                        }
                    }
                }
                
                let area_m2 = area_deg2_to_m2(total_area, centroid_lat);
                
                if !all_coords.is_empty() {
                    strip_polygons.push(StripPolygonResult {
                        polygon: all_coords,
                        area_m2,
                        row_index: current_row_idx,
                    });
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
            return GeoJsonFeature::polygon(vec![], Some(serde_json::json!({
                "rowIndex": self.row_index,
                "areaM2": self.area_m2
            })));
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
