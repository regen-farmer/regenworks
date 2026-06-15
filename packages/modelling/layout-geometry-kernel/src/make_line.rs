//! Initial line creation for layout modelling
//!
//! Equivalent to make_line.ts - creates the initial reference line
//! that intersects the polygon at the specified bearing.

use crate::geometry::{bbox_polygon, bearing, centroid, line_length, rotate_line_rhumb};
use crate::types::GeoJsonFeature;

/// Result of makeInitialLine
pub struct InitialLineResult {
    /// The line intersecting the polygon at the specified bearing
    pub line_intersecting_polygon: Vec<[f64; 2]>,
    /// The width of the polygon perpendicular to the bearing
    pub width_of_polygon: f64,
}

/// Create the initial reference line that intersects the polygon at the specified bearing.
///
/// This function:
/// 1. Rotates the polygon so the bearing aligns with the axis
/// 2. Creates a bounding box
/// 3. Takes one side of the bounding box as the initial line
/// 4. Rotates everything back
/// 5. Ensures the line direction matches the desired bearing
///
/// # Arguments
/// * `bearing_deg` - The desired bearing in degrees (0-360, 0 = north)
/// * `polygon_coords` - The polygon exterior ring coordinates
pub fn make_initial_line(bearing_deg: f64, polygon_coords: &[[f64; 2]]) -> InitialLineResult {
    // Ensure bearing is valid
    let bearing_deg = if bearing_deg.is_nan() {
        0.0
    } else {
        bearing_deg
    };

    // Get the centroid as the pivot point
    let pivot = centroid(polygon_coords);

    // Rotate polygon by -bearing so we can work axis-aligned
    let rotated_coords = rotate_line_rhumb(polygon_coords, pivot, -bearing_deg);

    // Get bounding box of rotated polygon
    let box_coords = bbox_polygon(&rotated_coords);
    // box_coords is: [min_lng, min_lat], [max_lng, min_lat], [max_lng, max_lat], [min_lng, max_lat], [min_lng, min_lat]
    //                     0                   1                   2                   3                   4

    // The "length line" goes from box[2] to box[3] (top edge)
    // This gives us the width perpendicular to bearing
    let length_line = [box_coords[2], box_coords[3]];
    let width_of_polygon = line_length(&length_line);

    // The line intersecting the polygon goes from box[3] to box[4] (left edge)
    // box[4] is same as box[0]
    let rotated_line = vec![box_coords[3], box_coords[0]];

    // Rotate the line back by +bearing
    let mut line_intersecting_polygon = rotate_line_rhumb(&rotated_line, pivot, bearing_deg);

    // Check if the line bearing matches the desired bearing
    let mut line_bearing = bearing(line_intersecting_polygon[0], line_intersecting_polygon[1]);
    if line_bearing < 0.0 {
        line_bearing += 360.0;
    }

    // If bearings differ by more than 1 degree, flip the line
    if (line_bearing - bearing_deg).abs() > 1.0 {
        line_intersecting_polygon.reverse();
    }

    InitialLineResult {
        line_intersecting_polygon,
        width_of_polygon,
    }
}

/// Convert InitialLineResult to GeoJSON for API response
impl InitialLineResult {
    pub fn to_geojson_feature(&self) -> GeoJsonFeature {
        GeoJsonFeature::line_string(
            self.line_intersecting_polygon
                .iter()
                .map(|c| [c[0], c[1]])
                .collect(),
            None,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_initial_line() {
        // Simple square polygon
        let polygon = vec![
            [0.0, 0.0],
            [0.001, 0.0],
            [0.001, 0.001],
            [0.0, 0.001],
            [0.0, 0.0],
        ];

        let result = make_initial_line(0.0, &polygon);
        assert!(result.width_of_polygon > 0.0);
        assert_eq!(result.line_intersecting_polygon.len(), 2);
    }

    #[test]
    fn test_make_initial_line_with_bearing() {
        let polygon = vec![
            [0.0, 0.0],
            [0.001, 0.0],
            [0.001, 0.001],
            [0.0, 0.001],
            [0.0, 0.0],
        ];

        let result = make_initial_line(45.0, &polygon);
        assert!(result.width_of_polygon > 0.0);
    }
}
