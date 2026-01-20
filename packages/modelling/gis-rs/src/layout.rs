//! Main layout orchestrator
//!
//! Equivalent to system_based_layout.ts - the main function that coordinates
//! all layout generation steps.

use std::collections::HashMap;
use geos::Geom;

use crate::geometry::{
    along, circle, coords_to_geos_polygon, geos_polygon_to_coords, line_length,
};
use crate::headland::{apply_headland, HeadlandResult};
use crate::make_line::{make_initial_line, InitialLineResult};
use crate::tree_rows::{make_tree_row_lines, TreeRowLineResult};
use crate::strip_polygons::make_all_strip_polygons;
use crate::ground_cover::make_ground_cover_areas;
use crate::types::{
    GeoJsonFeature, LayoutRequest, LayoutResponse, RowDefinition,
    SpeciesCount, SpeciesRef, SystemBasedLayout, SystemDesign, TreeMarker, TreeRowLine,
};

/// Parse a GeoJSON string into polygon coordinates
fn parse_geojson_polygon(geojson_str: &str) -> Result<Vec<Vec<[f64; 2]>>, String> {
    let value: serde_json::Value = serde_json::from_str(geojson_str)
        .map_err(|e| format!("Failed to parse GeoJSON: {}", e))?;
    
    // Handle Feature or direct Geometry
    let geometry = if value.get("type").and_then(|t| t.as_str()) == Some("Feature") {
        value.get("geometry").ok_or("Feature missing geometry")?
    } else {
        &value
    };
    
    let geom_type = geometry.get("type")
        .and_then(|t| t.as_str())
        .ok_or("Missing geometry type")?;
    
    if geom_type != "Polygon" {
        return Err(format!("Expected Polygon, got {}", geom_type));
    }
    
    let coordinates = geometry.get("coordinates")
        .and_then(|c| c.as_array())
        .ok_or("Missing coordinates")?;
    
    let mut rings = Vec::new();
    for ring in coordinates {
        let ring_arr = ring.as_array().ok_or("Invalid ring")?;
        let mut coords = Vec::new();
        for coord in ring_arr {
            let coord_arr = coord.as_array().ok_or("Invalid coordinate")?;
            let lng = coord_arr.get(0)
                .and_then(|v| v.as_f64())
                .ok_or("Invalid longitude")?;
            let lat = coord_arr.get(1)
                .and_then(|v| v.as_f64())
                .ok_or("Invalid latitude")?;
            coords.push([lng, lat]);
        }
        rings.push(coords);
    }
    
    Ok(rings)
}

/// Generate the complete system-based layout
///
/// This is the main entry point that orchestrates all layout generation.
pub fn system_based_layout(
    system_design: &SystemDesign,
    field_geometry: &str,
) -> Result<SystemBasedLayout, String> {
    // Parse the field geometry
    let polygon_coords = parse_geojson_polygon(field_geometry)?;
    
    if polygon_coords.is_empty() || polygon_coords[0].is_empty() {
        return Err("Empty polygon".to_string());
    }
    
    // Apply margin (negative buffer)
    let margin = system_design.margin.max(0.0);
    let margin_polygon = if margin > 0.0 {
        apply_margin(&polygon_coords, margin)?
    } else {
        polygon_coords.clone()
    };
    
    // Apply headland
    let bearing = if system_design.bearing.is_nan() { 0.0 } else { system_design.bearing };
    let headland = system_design.headland.max(0.0);
    
    let HeadlandResult {
        headland_sides,
        headland_polygon,
        sides_close_to_bearing,
        intersection_points,
    } = apply_headland(&margin_polygon, headland, bearing, 5.0)
        .map_err(|e| format!("Headland error: {:?}", e))?;
    
    // Create initial line
    let InitialLineResult {
        line_intersecting_polygon,
        width_of_polygon,
    } = make_initial_line(bearing, &headland_polygon[0]);
    
    // Generate tree row lines
    let tree_row_results = make_tree_row_lines(
        &headland_polygon,
        &line_intersecting_polygon,
        width_of_polygon,
        &system_design.rows,
    ).map_err(|e| format!("Tree rows error: {:?}", e))?;
    
    // Generate strip polygons
    let strip_results = make_all_strip_polygons(
        &headland_polygon,
        &line_intersecting_polygon,
        width_of_polygon,
        &system_design.rows,
    ).map_err(|e| format!("Strip polygons error: {:?}", e))?;
    
    // Generate ground cover areas
    let (ground_cover_results, ground_cover_areas_m2) = make_ground_cover_areas(
        &headland_polygon,
        &line_intersecting_polygon,
        width_of_polygon,
        &system_design.rows,
    ).map_err(|e| format!("Ground cover error: {:?}", e))?;
    
    // Generate individual tree markers
    let (tree_markers, species_counts) = generate_tree_markers(
        &tree_row_results,
        &system_design.rows,
    );
    
    // Convert results to output format
    Ok(SystemBasedLayout {
        species_count_array: species_counts,
        headland_sides: headland_sides
            .iter()
            .map(|rings| GeoJsonFeature::polygon(
                rings.iter().map(|r| r.iter().map(|c| [c[0], c[1]]).collect()).collect(),
                None,
            ))
            .collect(),
        sides_close_to_bearing: sides_close_to_bearing
            .iter()
            .map(|side| GeoJsonFeature::line_string(
                side.iter().map(|c| [c[0], c[1]]).collect(),
                None,
            ))
            .collect(),
        tree_row_lines: tree_row_results
            .iter()
            .map(|r| TreeRowLine {
                line: r.to_geojson(),
                system_design_row_index: r.system_design_row_index,
            })
            .collect(),
        headland_polygon: GeoJsonFeature::polygon(
            headland_polygon.iter().map(|r| r.iter().map(|c| [c[0], c[1]]).collect()).collect(),
            None,
        ),
        margin_polygon: GeoJsonFeature::polygon(
            margin_polygon.iter().map(|r| r.iter().map(|c| [c[0], c[1]]).collect()).collect(),
            None,
        ),
        ground_cover_areas: ground_cover_results
            .iter()
            .map(|r| r.to_geojson())
            .collect(),
        intersection_points: intersection_points
            .iter()
            .map(|p| GeoJsonFeature::point([p[0], p[1]], None))
            .collect(),
        tree_marker_array: tree_markers,
        ground_cover_areas_m2,
        strip_polygons: strip_results
            .iter()
            .map(|r| r.to_geojson())
            .collect(),
        strip_areas_m2: strip_results
            .iter()
            .map(|r| r.area_m2)
            .collect(),
    })
}

/// Project a WGS84 coordinate to local meters using Azimuthal Equidistant projection
/// centered on a reference point. This preserves distances from the center point.
fn wgs84_to_local_meters(coord: [f64; 2], center: [f64; 2]) -> [f64; 2] {
    use crate::geometry::{bearing, distance};
    
    let dist = distance(center, coord);
    let brng = bearing(center, coord).to_radians();
    
    // Convert polar (distance, bearing) to cartesian (x, y) in meters
    // x = east, y = north
    let x = dist * brng.sin();
    let y = dist * brng.cos();
    
    [x, y]
}

/// Project local meters back to WGS84 using Azimuthal Equidistant projection
fn local_meters_to_wgs84(coord: [f64; 2], center: [f64; 2]) -> [f64; 2] {
    use crate::geometry::destination;
    
    let x = coord[0];
    let y = coord[1];
    
    // Convert cartesian to polar
    let dist = (x * x + y * y).sqrt();
    let brng = x.atan2(y).to_degrees(); // atan2(x, y) for bearing from north
    
    destination(center, dist, brng)
}

/// Apply margin (negative buffer) to a polygon using proper geodesic buffering
/// 
/// This projects the polygon to a local meter-based coordinate system,
/// applies the buffer, then projects back to WGS84. This ensures the buffer
/// distance is consistent in all directions.
fn apply_margin(
    polygon_coords: &[Vec<[f64; 2]>],
    margin_m: f64,
) -> Result<Vec<Vec<[f64; 2]>>, String> {
    if polygon_coords.is_empty() || polygon_coords[0].is_empty() {
        return Ok(polygon_coords.to_vec());
    }
    
    // Calculate centroid as projection center
    let exterior = &polygon_coords[0];
    let n = exterior.len() as f64;
    let center_lon: f64 = exterior.iter().map(|c| c[0]).sum::<f64>() / n;
    let center_lat: f64 = exterior.iter().map(|c| c[1]).sum::<f64>() / n;
    let center = [center_lon, center_lat];
    
    // Project exterior ring to local meters (ignore holes - trees/groundcover run over them)
    let local_coords: Vec<Vec<[f64; 2]>> = vec![
        polygon_coords[0].iter()
            .map(|c| wgs84_to_local_meters(*c, center))
            .collect()
    ];
    
    // Create GEOS polygon in local coordinates (meters)
    let local_geom = coords_to_geos_polygon(&local_coords)
        .map_err(|e| format!("GEOS error: {:?}", e))?;
    
    // Apply buffer in meters (negative for inward buffer)
    let buffered = local_geom.buffer(-margin_m, 32)
        .map_err(|e| format!("Buffer error: {:?}", e))?;
    
    // Check if buffer resulted in valid geometry
    if buffered.is_empty().unwrap_or(true) {
        return Ok(polygon_coords.to_vec());
    }
    
    // Extract buffered coordinates (still in local meters)
    let buffered_local = geos_polygon_to_coords(&buffered)
        .map_err(|e| format!("Coord extraction error: {:?}", e))?;
    
    // Project back to WGS84
    let result: Vec<Vec<[f64; 2]>> = buffered_local
        .iter()
        .map(|ring| {
            ring.iter()
                .map(|c| local_meters_to_wgs84(*c, center))
                .collect()
        })
        .collect();
    
    Ok(result)
}

/// Generate tree markers along row lines
fn generate_tree_markers(
    tree_row_lines: &[TreeRowLineResult],
    rows: &[RowDefinition],
) -> (Vec<TreeMarker>, Vec<SpeciesCount>) {
    let mut tree_markers: Vec<TreeMarker> = Vec::new();
    let mut species_count_map: HashMap<String, (SpeciesRef, u32)> = HashMap::new();
    
    for tree_row in tree_row_lines {
        let row_def = &rows[tree_row.system_design_row_index];
        
        // Check if sequence has any spacing
        let total_spacing: f64 = row_def.sequence
            .iter()
            .map(|s| s.spacing_after)
            .sum();
        
        if total_spacing <= 0.0 {
            continue;
        }
        
        let line_len = line_length(&tree_row.line);
        let sequence = &row_def.sequence;
        let mut tree_sequence_idx = 0;
        let mut distance = 0.0;
        
        while distance < line_len {
            let point = along(&tree_row.line, distance);
            let circle_coords = circle(point, 1.4, 32);
            
            let species = &sequence[tree_sequence_idx].species;
            let species_id = species.id().to_string();
            
            tree_markers.push(TreeMarker {
                species: species.clone(),
                point: GeoJsonFeature::point(point, None),
                circle: GeoJsonFeature::polygon(vec![circle_coords.iter().map(|c| [c[0], c[1]]).collect()], None),
            });
            
            // Update species count
            species_count_map
                .entry(species_id)
                .and_modify(|(_, count)| *count += 1)
                .or_insert((species.clone(), 1));
            
            distance += sequence[tree_sequence_idx].spacing_after;
            tree_sequence_idx = (tree_sequence_idx + 1) % sequence.len();
        }
    }
    
    let species_counts: Vec<SpeciesCount> = species_count_map
        .into_values()
        .map(|(species, count)| SpeciesCount { species, count })
        .collect();
    
    (tree_markers, species_counts)
}

/// Process a layout request and return a response
pub fn process_layout_request(request: &LayoutRequest) -> LayoutResponse {
    let start = std::time::Instant::now();
    
    match system_based_layout(&request.systemdesign, &request.field_geometry) {
        Ok(layout) => {
            let timing_ms = start.elapsed().as_secs_f64() * 1000.0;
            LayoutResponse::success(layout, timing_ms)
        }
        Err(e) => LayoutResponse::error(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_geojson_polygon() {
        let geojson = r#"{
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
            }
        }"#;
        
        let coords = parse_geojson_polygon(geojson).unwrap();
        assert_eq!(coords.len(), 1);
        assert_eq!(coords[0].len(), 5);
    }

    #[test]
    fn test_system_based_layout_empty_rows() {
        let geojson = r#"{
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]]
            }
        }"#;
        
        let design = SystemDesign {
            rows: vec![],
            bearing: 0.0,
            margin: 0.0,
            headland: 0.0,
        };
        
        let result = system_based_layout(&design, geojson).unwrap();
        assert!(result.tree_marker_array.is_empty());
    }
}
