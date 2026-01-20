//! Ground cover area generation
//!
//! Equivalent to make_ground_cover_areas.ts - creates polygons for ground cover
//! areas between rows and calculates area by species.

use std::collections::HashMap;
use geos::Geom;
use crate::geometry::{coords_to_geos_line, coords_to_geos_polygon, geos_polygon_to_coords};
use crate::types::{GeoJsonFeature, RowDefinition};

/// Convert meters to degrees based on latitude
/// This is more accurate than a fixed conversion factor
fn meters_to_degrees(meters: f64, latitude: f64) -> f64 {
    let lat_rad = latitude.to_radians();
    let meters_per_degree = 111_320.0 * lat_rad.cos();
    if meters_per_degree > 0.0 {
        meters / meters_per_degree
    } else {
        meters / 111_320.0
    }
}

/// Convert area in square degrees to square meters based on latitude
fn area_deg2_to_m2(area_deg2: f64, latitude: f64) -> f64 {
    let lat_rad = latitude.to_radians();
    // meters per degree of longitude varies with latitude
    let meters_per_deg_lon = 111_320.0 * lat_rad.cos();
    // meters per degree of latitude is roughly constant
    let meters_per_deg_lat = 111_320.0;
    area_deg2 * meters_per_deg_lon * meters_per_deg_lat
}

/// Result of ground cover area generation
#[derive(Debug, Clone)]
pub struct GroundCoverResult {
    /// The ground cover polygon coordinates
    pub polygon: Vec<Vec<[f64; 2]>>,
    /// Species ID for this ground cover
    pub species_id: String,
    /// Area in square meters
    pub area_m2: f64,
}

/// Create ground cover area polygons
///
/// This function creates polygons only for rows that have groundcover defined,
/// and accumulates the area by species.
///
/// # Arguments
/// * `offset_polygon` - The headland polygon coordinates
/// * `line_intersecting_area` - The initial reference line
/// * `width_of_area` - Width of the area in meters
/// * `rows` - System design row definitions
///
/// # Returns
/// A tuple of (ground_cover_areas, ground_cover_areas_m2)
pub fn make_ground_cover_areas(
    offset_polygon: &[Vec<[f64; 2]>],
    line_intersecting_area: &[[f64; 2]],
    width_of_area: f64,
    rows: &[RowDefinition],
) -> Result<(Vec<GroundCoverResult>, HashMap<String, f64>), geos::Error> {
    if rows.is_empty() {
        return Ok((vec![], HashMap::new()));
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

    let mut ground_cover_areas: Vec<GroundCoverResult> = Vec::new();
    let mut ground_cover_areas_m2: HashMap<String, f64> = HashMap::new();
    let mut accumulating_width = 0.0;
    let mut current_row_idx = 0;

    loop {
        // Complete if there isn't room for more strips
        if accumulating_width > width_of_area {
            break;
        }

        let row_width = rows[current_row_idx].width;
        
        // Only process if this row has groundcover
        let groundcover_id = match &rows[current_row_idx].groundcover {
            Some(species_ref) => species_ref.id().to_string(),
            None => {
                accumulating_width += row_width;
                current_row_idx = (current_row_idx + 1) % rows.len();
                continue;
            }
        };

        // Create the elongated donut buffer
        let elongated_donut = if accumulating_width > 0.0 {
            let buffer_small_deg = meters_to_degrees(accumulating_width, centroid_lat);
            let buffer_big_deg = meters_to_degrees(accumulating_width + row_width, centroid_lat);
            
            let buffer_small = line_geom.buffer(buffer_small_deg, 32)?;
            let buffer_big = line_geom.buffer(buffer_big_deg, 32)?;
            
            buffer_big.difference(&buffer_small)?
        } else {
            let buffer_deg = meters_to_degrees(row_width, centroid_lat);
            line_geom.buffer(buffer_deg, 32)?
        };

        // Intersect with the field polygon
        let intersection = polygon_geom.intersection(&elongated_donut)?;
        
        // Initialize species in map if not present
        ground_cover_areas_m2.entry(groundcover_id.clone()).or_insert(0.0);
        
        // Process the intersection result
        let geom_type = intersection.geometry_type();
        
        match geom_type {
            geos::GeometryTypes::Polygon => {
                let area = intersection.area()?;
                let area_m2 = area_deg2_to_m2(area, centroid_lat);
                
                *ground_cover_areas_m2.get_mut(&groundcover_id).unwrap() += area_m2;
                
                if let Ok(coords) = geos_polygon_to_coords(&intersection) {
                    ground_cover_areas.push(GroundCoverResult {
                        polygon: coords,
                        species_id: groundcover_id.clone(),
                        area_m2,
                    });
                }
            }
            geos::GeometryTypes::MultiPolygon => {
                let num_geoms = intersection.get_num_geometries()?;
                
                for i in 0..num_geoms {
                    if let Ok(geom) = intersection.get_geometry_n(i) {
                        let area = geom.area().unwrap_or(0.0);
                        let area_m2 = area_deg2_to_m2(area, centroid_lat);
                        
                        *ground_cover_areas_m2.get_mut(&groundcover_id).unwrap() += area_m2;
                        
                        // Clone to get owned geometry for geos_polygon_to_coords
                        let owned_geom = geom.clone();
                        if let Ok(coords) = geos_polygon_to_coords(&owned_geom) {
                            ground_cover_areas.push(GroundCoverResult {
                                polygon: coords,
                                species_id: groundcover_id.clone(),
                                area_m2,
                            });
                        }
                    }
                }
            }
            _ => {}
        }

        // Add row width
        accumulating_width += row_width;

        // Cycle to next row
        current_row_idx = (current_row_idx + 1) % rows.len();
    }

    Ok((ground_cover_areas, ground_cover_areas_m2))
}

impl GroundCoverResult {
    /// Convert to GeoJSON feature
    pub fn to_geojson(&self) -> GeoJsonFeature {
        GeoJsonFeature::polygon(
            self.polygon
                .iter()
                .map(|ring| ring.iter().map(|c| [c[0], c[1]]).collect())
                .collect(),
            Some(serde_json::json!({
                "speciesId": self.species_id,
                "areaM2": self.area_m2
            })),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_ground_cover_empty_rows() {
        let polygon = vec![vec![
            [0.0, 0.0],
            [0.001, 0.0],
            [0.001, 0.001],
            [0.0, 0.001],
            [0.0, 0.0],
        ]];
        let line = [[0.0, 0.0005], [0.001, 0.0005]];
        
        let (areas, m2) = make_ground_cover_areas(&polygon, &line, 100.0, &[]).unwrap();
        assert!(areas.is_empty());
        assert!(m2.is_empty());
    }
}
