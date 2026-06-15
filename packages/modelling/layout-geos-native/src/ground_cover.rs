//! Ground cover area generation
//!
//! Equivalent to make_ground_cover_areas.ts - creates polygons for ground cover
//! areas between rows and calculates area by species.

use crate::strip_polygons::StripPolygonResult;
use crate::types::{GeoJsonFeature, RowDefinition};
use std::collections::HashMap;

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
    strip_polygons: &[StripPolygonResult],
    rows: &[RowDefinition],
) -> (Vec<GroundCoverResult>, HashMap<String, f64>) {
    let mut ground_cover_areas: Vec<GroundCoverResult> = Vec::new();
    let mut ground_cover_areas_m2: HashMap<String, f64> = HashMap::new();

    for strip in strip_polygons {
        let row_idx = strip.row_index;
        if row_idx >= rows.len() {
            continue;
        }

        // Only process if this row has groundcover
        if let Some(groundcover) = &rows[row_idx].groundcover {
            let species_id = groundcover.id().to_string();

            // Ignore empty polygons, area, or missing/empty species IDs
            if strip.area_m2 <= 0.0 || strip.polygon.is_empty() || species_id.is_empty() {
                continue;
            }

            // Initialize species in map if not present
            *ground_cover_areas_m2
                .entry(species_id.clone())
                .or_insert(0.0) += strip.area_m2;

            ground_cover_areas.push(GroundCoverResult {
                polygon: strip.polygon.clone(),
                species_id,
                area_m2: strip.area_m2,
            });
        }
    }

    (ground_cover_areas, ground_cover_areas_m2)
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
        let (areas, m2) = make_ground_cover_areas(&[], &[]);
        assert!(areas.is_empty());
        assert!(m2.is_empty());
    }
}
