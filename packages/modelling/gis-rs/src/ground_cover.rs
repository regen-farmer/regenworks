//! Ground cover area generation
//!
//! Equivalent to make_ground_cover_areas.ts - creates polygons for ground cover
//! areas between rows and calculates area by species.

use std::collections::HashMap;
use geos::Geom;
use crate::geometry::{
    coords_to_geos_line, coords_to_geos_polygon, geos_polygon_to_coords,
    project_polygon_to_local, project_polygon_to_wgs84, project_line_to_local,
};
use crate::types::{GeoJsonFeature, RowDefinition};

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
/// Uses Azimuthal Equidistant projection for accurate geodesic buffering.
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

        // Create the elongated donut buffer in meters (no conversion needed!)
        let elongated_donut = if accumulating_width > 0.0 {
            let buffer_small = line_geom.buffer(accumulating_width, 32)?;
            let buffer_big = line_geom.buffer(accumulating_width + row_width, 32)?;
            
            buffer_big.difference(&buffer_small)?
        } else {
            line_geom.buffer(row_width, 32)?
        };

        // Intersect with the field polygon
        let intersection = polygon_geom.intersection(&elongated_donut)?;
        
        // Initialize species in map if not present
        ground_cover_areas_m2.entry(groundcover_id.clone()).or_insert(0.0);
        
        // Process the intersection result
        let geom_type = intersection.geometry_type();
        
        match geom_type {
            geos::GeometryTypes::Polygon => {
                let area_m2 = intersection.area()?; // Already in square meters!
                
                *ground_cover_areas_m2.get_mut(&groundcover_id).unwrap() += area_m2;
                
                if let Ok(local_coords) = geos_polygon_to_coords(&intersection) {
                    // Project back to WGS84
                    let wgs84_coords = project_polygon_to_wgs84(&local_coords, center);
                    ground_cover_areas.push(GroundCoverResult {
                        polygon: wgs84_coords,
                        species_id: groundcover_id.clone(),
                        area_m2,
                    });
                }
            }
            geos::GeometryTypes::MultiPolygon => {
                let num_geoms = intersection.get_num_geometries()?;
                
                for i in 0..num_geoms {
                    if let Ok(geom) = intersection.get_geometry_n(i) {
                        let area_m2 = geom.area().unwrap_or(0.0); // Already in square meters!
                        
                        *ground_cover_areas_m2.get_mut(&groundcover_id).unwrap() += area_m2;
                        
                        // Clone to get owned geometry for geos_polygon_to_coords
                        let owned_geom = geom.clone();
                        if let Ok(local_coords) = geos_polygon_to_coords(&owned_geom) {
                            // Project back to WGS84
                            let wgs84_coords = project_polygon_to_wgs84(&local_coords, center);
                            ground_cover_areas.push(GroundCoverResult {
                                polygon: wgs84_coords,
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
