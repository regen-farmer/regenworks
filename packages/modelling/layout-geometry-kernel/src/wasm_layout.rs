//! Browser layout backend using pure Rust geometry.
//!
//! This mirrors the TypeScript Turf/JSTS layout flow using browser-compatible Rust geometry.

#![cfg(any(feature = "native", feature = "wasm"))]

#[cfg(target_arch = "wasm32")]
use instant::Instant;
use std::collections::{HashMap, HashSet};
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

use crate::geometry::{
    along, bearing, centroid, clamp_bearing_0_180, line_length, local_meters_to_wgs84,
    project_line_to_local, project_polygon_to_local, project_polygon_to_wgs84, rhumb_bearing,
    rhumb_destination, rhumb_distance, to_radians, EARTH_RADIUS,
};
use crate::make_line::{make_initial_line, InitialLineResult};
use crate::types::{
    GeoJsonFeature, LayoutRequest, LayoutResponse, RowDefinition, SpeciesCount, SpeciesRef,
    SystemBasedLayout, SystemDesign, TreeMarker, TreeRowLine,
};
use crate::wasm_geo_ops;
const POINT_TOLERANCE_M: f64 = 1e-6;
const INTERSECTION_DEDUP_TOLERANCE_M: f64 = 1e-10;
const KERNEL_BUFFER_QUADRANT_SEGMENTS: f64 = 8.0;
const TURF_HEADLAND_BUFFER_STEPS: f64 = 20.0;

type Segment = ([f64; 2], [f64; 2]);
type OverlayShape = Vec<Vec<[f64; 2]>>;

#[derive(Debug, Clone)]
struct HeadlandResult {
    headland_sides: Vec<Vec<Vec<[f64; 2]>>>,
    headland_polygon: Vec<Vec<[f64; 2]>>,
    sides_close_to_bearing: Vec<Vec<[f64; 2]>>,
    intersection_points: Vec<[f64; 2]>,
}

#[derive(Debug, Clone)]
struct TreeRowLineResult {
    line: Vec<[f64; 2]>,
    system_design_row_index: usize,
}

#[derive(Debug, Clone)]
struct StripPolygonResult {
    polygons: Vec<Vec<Vec<[f64; 2]>>>,
    polygon_areas_m2: Vec<f64>,
    area_m2: f64,
    row_index: usize,
}

#[derive(Debug, Clone)]
struct GroundCoverResult {
    polygon: Vec<Vec<[f64; 2]>>,
    species_id: String,
    area_m2: f64,
}

pub fn system_based_layout(
    system_design: &SystemDesign,
    field_geometry: &str,
) -> Result<SystemBasedLayout, String> {
    let polygon_coords = parse_geojson_polygon(field_geometry)?;

    if polygon_coords.is_empty() || polygon_coords[0].is_empty() {
        return Err("Empty polygon".to_string());
    }

    let margin = system_design.margin.max(0.0);
    let margin_polygon = if margin > 0.0 {
        apply_margin(&polygon_coords, margin)?
    } else {
        vec![polygon_coords[0].clone()]
    };

    let bearing = if system_design.bearing.is_nan() {
        0.0
    } else {
        system_design.bearing
    };
    let headland = system_design.headland.max(0.0);

    let HeadlandResult {
        headland_sides,
        headland_polygon,
        sides_close_to_bearing,
        intersection_points,
    } = apply_headland(&margin_polygon, headland, bearing, 5.0)?;

    let InitialLineResult {
        line_intersecting_polygon,
        width_of_polygon,
    } = wasm_geo_ops::make_initial_line(bearing, &headland_polygon)
        .map(
            |(line_intersecting_polygon, width_of_polygon)| InitialLineResult {
                line_intersecting_polygon,
                width_of_polygon,
            },
        )
        .unwrap_or_else(|_| make_initial_line(bearing, &headland_polygon[0]));

    let tree_row_results = make_tree_row_lines(
        &headland_polygon,
        &line_intersecting_polygon,
        width_of_polygon,
        &system_design.rows,
    )?;

    let strip_results = make_all_strip_polygons(
        &headland_polygon,
        &line_intersecting_polygon,
        width_of_polygon,
        &system_design.rows,
    )?;

    let (ground_cover_results, ground_cover_areas_m2) =
        make_ground_cover_areas(&strip_results, &system_design.rows);
    let (tree_markers, species_counts) =
        generate_tree_markers(&tree_row_results, &system_design.rows);

    Ok(SystemBasedLayout {
        species_count_array: species_counts,
        headland_sides: headland_sides
            .iter()
            .map(|rings| GeoJsonFeature::polygon(rings.clone(), None))
            .collect(),
        sides_close_to_bearing: sides_close_to_bearing
            .iter()
            .map(|side| GeoJsonFeature::line_string(side.clone(), None))
            .collect(),
        tree_row_lines: tree_row_results
            .iter()
            .map(|row| TreeRowLine {
                line: row.to_geojson(),
                system_design_row_index: row.system_design_row_index,
            })
            .collect(),
        headland_polygon: GeoJsonFeature::polygon(orient_polygon_for_turf(&headland_polygon), None),
        margin_polygon: GeoJsonFeature::polygon(
            orient_margin_polygon_for_turf(&margin_polygon, margin),
            None,
        ),
        ground_cover_areas: ground_cover_results
            .iter()
            .map(|area| area.to_geojson())
            .collect(),
        intersection_points: intersection_points
            .iter()
            .map(|point| GeoJsonFeature::point(*point, None))
            .collect(),
        tree_marker_array: tree_markers,
        ground_cover_areas_m2,
        strip_polygons: strip_results
            .iter()
            .map(|strip| strip.to_geojson())
            .collect(),
        strip_areas_m2: strip_results.iter().map(|strip| strip.area_m2).collect(),
    })
}

pub fn process_layout_request(request: &LayoutRequest) -> LayoutResponse {
    let start = Instant::now();

    match system_based_layout(&request.systemdesign, &request.field_geometry) {
        Ok(layout) => {
            let timing_ms = start.elapsed().as_secs_f64() * 1000.0;
            LayoutResponse::success(layout, timing_ms)
        }
        Err(error) => LayoutResponse::error(error),
    }
}

fn parse_geojson_polygon(geojson_str: &str) -> Result<Vec<Vec<[f64; 2]>>, String> {
    let value: serde_json::Value =
        serde_json::from_str(geojson_str).map_err(|e| format!("Failed to parse GeoJSON: {e}"))?;

    let geometry = if value.get("type").and_then(|t| t.as_str()) == Some("Feature") {
        value.get("geometry").ok_or("Feature missing geometry")?
    } else {
        &value
    };

    let geom_type = geometry
        .get("type")
        .and_then(|t| t.as_str())
        .ok_or("Missing geometry type")?;

    if geom_type != "Polygon" {
        return Err(format!("Expected Polygon, got {geom_type}"));
    }

    let coordinates = geometry
        .get("coordinates")
        .and_then(|coords| coords.as_array())
        .ok_or("Missing coordinates")?;

    let mut rings = Vec::with_capacity(coordinates.len());
    for ring in coordinates {
        let ring_arr = ring.as_array().ok_or("Invalid ring")?;
        let mut coords = Vec::with_capacity(ring_arr.len());
        for coord in ring_arr {
            let coord_arr = coord.as_array().ok_or("Invalid coordinate")?;
            let lng = coord_arr
                .get(0)
                .and_then(|value| value.as_f64())
                .ok_or("Invalid longitude")?;
            let lat = coord_arr
                .get(1)
                .and_then(|value| value.as_f64())
                .ok_or("Invalid latitude")?;
            coords.push([lng, lat]);
        }
        rings.push(close_ring(coords));
    }

    Ok(rings)
}

fn apply_margin(
    polygon_coords: &[Vec<[f64; 2]>],
    margin_m: f64,
) -> Result<Vec<Vec<[f64; 2]>>, String> {
    let center = projection_center(polygon_coords);
    let local_rings = project_polygon_to_local(polygon_coords, center);
    let buffered_rings = wasm_geo_ops::buffer_polygon(
        &local_rings,
        -margin_m,
        KERNEL_BUFFER_QUADRANT_SEGMENTS as i32,
    )
    .map_err(|error| error.to_string())?;
    if planar_polygon_area(&buffered_rings) <= POINT_TOLERANCE_M {
        return Ok(polygon_coords.to_vec());
    }

    Ok(project_polygon_to_wgs84(&buffered_rings, center))
}

fn apply_headland(
    margin_polygon: &[Vec<[f64; 2]>],
    headland_m: f64,
    field_bearing: f64,
    bearing_threshold: f64,
) -> Result<HeadlandResult, String> {
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
    let buffer_distance = if headland_m > 0.001 {
        headland_m
    } else {
        0.001
    };

    let mut headland_polygon_raw = vec![exterior.clone()];
    let mut headland_sides_coords = Vec::new();

    for side in sides.iter().filter(|side| {
        let side_bearing = clamp_bearing_0_180(bearing(side[0], side[1]));
        (side_bearing - field_bearing_clamped).abs() > bearing_threshold
    }) {
        let buffer_polygon = buffer_line_geodesic(side, buffer_distance)
            .map_err(|error| format!("headland buffer {buffer_distance}m failed: {error}"))?;
        headland_sides_coords.push(buffer_polygon.clone());

        match wasm_geo_ops::difference(&headland_polygon_raw, &buffer_polygon) {
            Ok(difference) if !difference.is_empty() && !difference[0].is_empty() => {
                headland_polygon_raw = difference[0].clone();
            }
            _ => {}
        }
    }

    let (restored_exterior, sides_close_to_bearing, intersection_points) =
        restore_headland_polygon(&headland_polygon_raw[0], field_bearing, bearing_threshold);

    let mut headland_polygon = vec![restored_exterior];
    if headland_polygon_raw.len() > 1 {
        headland_polygon.extend_from_slice(&headland_polygon_raw[1..]);
    }

    Ok(HeadlandResult {
        headland_sides: headland_sides_coords,
        headland_polygon,
        sides_close_to_bearing,
        intersection_points,
    })
}

fn make_tree_row_lines(
    offset_polygon: &[Vec<[f64; 2]>],
    line_intersecting_area: &[[f64; 2]],
    width_of_area: f64,
    rows: &[RowDefinition],
) -> Result<Vec<TreeRowLineResult>, String> {
    if rows.is_empty() || rows.iter().all(|row| row.width <= 0.0) {
        return Ok(vec![]);
    }

    let center = projection_center(offset_polygon);
    let local_polygon = project_polygon_to_local(&[offset_polygon[0].clone()], center);
    let polygon_segments = polygon_boundary_segments(&local_polygon);

    let local_line = project_line_to_local(line_intersecting_area, center);
    let ref_bearing = bearing(line_intersecting_area[0], line_intersecting_area[1]);

    let mut tree_rows = Vec::new();
    let mut accumulating_width = 0.0;
    let mut current_row_idx = 0;

    loop {
        let half_width = rows[current_row_idx].width.max(0.0) / 2.0;
        accumulating_width += half_width;

        if accumulating_width > width_of_area {
            break;
        }

        let intersection_points = match wasm_geo_ops::line_buffer_polygon_intersections(
            line_intersecting_area,
            accumulating_width,
            offset_polygon,
        ) {
            Ok(points) => points,
            Err(_) => {
                let buffer =
                    buffer_local_line_rings(&local_line, accumulating_width).map_err(|error| {
                        format!("tree row fallback buffer {accumulating_width}m failed: {error}")
                    })?;
                let buffer_segments = polygon_boundary_segments(&buffer);
                intersection_points_between_segments(&buffer_segments, &polygon_segments)
                    .into_iter()
                    .map(|point| local_meters_to_wgs84(point, center))
                    .collect()
            }
        };

        if intersection_points.len() >= 2 {
            let sorted_points = sort_intersection_points(&intersection_points);

            for pair in sorted_points.chunks_exact(2) {
                let mut row_line = vec![pair[0], pair[1]];

                let row_bearing = bearing(row_line[0], row_line[1]);
                let bearing_diff = (row_bearing - ref_bearing).abs();
                if bearing_diff > 1.0 && bearing_diff < 359.0 {
                    let flipped_bearing = bearing(row_line[1], row_line[0]);
                    let flipped_diff = (flipped_bearing - ref_bearing).abs();
                    if flipped_diff < bearing_diff || (360.0 - flipped_diff) < bearing_diff {
                        row_line.reverse();
                    }
                }

                let (before, after) = calculate_headland_offset(&rows[current_row_idx].offset);
                let row_length = line_length(&row_line);

                if before + after >= row_length {
                    continue;
                }

                if before > 0.0 || after > 0.0 {
                    row_line = vec![
                        along(&row_line, before),
                        along(&row_line, row_length - after),
                    ];
                }

                tree_rows.push(TreeRowLineResult {
                    line: row_line,
                    system_design_row_index: current_row_idx,
                });
            }
        }

        accumulating_width += half_width;
        current_row_idx = (current_row_idx + 1) % rows.len();
    }

    Ok(tree_rows)
}

fn make_all_strip_polygons(
    offset_polygon: &[Vec<[f64; 2]>],
    line_intersecting_area: &[[f64; 2]],
    width_of_area: f64,
    rows: &[RowDefinition],
) -> Result<Vec<StripPolygonResult>, String> {
    if rows.is_empty() || rows.iter().all(|row| row.width <= 0.0) {
        return Ok(vec![]);
    }

    let polygon_rings = vec![offset_polygon[0].clone()];

    let mut strip_polygons = Vec::new();
    let mut accumulating_width = 0.0;
    let mut current_row_idx = 0;

    loop {
        if accumulating_width > width_of_area {
            break;
        }

        let row_width = rows[current_row_idx].width.max(0.0);
        let intersection = if row_width <= 0.0 {
            Vec::new()
        } else {
            strip_band_intersection(
                &polygon_rings,
                line_intersecting_area,
                accumulating_width,
                accumulating_width + row_width,
            )?
        };

        if intersection.is_empty() {
            strip_polygons.push(StripPolygonResult {
                polygons: vec![],
                polygon_areas_m2: vec![],
                area_m2: 0.0,
                row_index: current_row_idx,
            });
        } else {
            let mut polygons = Vec::new();
            let mut polygon_areas_m2 = Vec::new();

            for polygon in &intersection {
                let area_m2 = turf_polygon_area(polygon);
                if area_m2 <= POINT_TOLERANCE_M {
                    continue;
                }

                polygons.push(polygon.clone());
                polygon_areas_m2.push(area_m2);
            }

            if polygons.is_empty() {
                strip_polygons.push(StripPolygonResult {
                    polygons: vec![],
                    polygon_areas_m2: vec![],
                    area_m2: 0.0,
                    row_index: current_row_idx,
                });
            } else {
                strip_polygons.push(StripPolygonResult {
                    area_m2: polygon_areas_m2.iter().sum(),
                    polygons,
                    polygon_areas_m2,
                    row_index: current_row_idx,
                });
            }
        }

        accumulating_width += row_width;
        current_row_idx = (current_row_idx + 1) % rows.len();
    }

    Ok(strip_polygons)
}

fn strip_band_intersection(
    field_rings: &[Vec<[f64; 2]>],
    line: &[[f64; 2]],
    start_m: f64,
    end_m: f64,
) -> Result<Vec<OverlayShape>, String> {
    if line.len() < 2 || end_m <= start_m {
        return Ok(vec![]);
    }

    let center = [
        (line[0][0] + line[1][0]) / 2.0,
        (line[0][1] + line[1][1]) / 2.0,
    ];
    let local_line = project_line_to_local(line, center);
    let local_field = project_polygon_to_local(field_rings, center);

    let start = local_line[0];
    let end = local_line[1];
    let line_vec = [end[0] - start[0], end[1] - start[1]];
    let line_len = (line_vec[0] * line_vec[0] + line_vec[1] * line_vec[1]).sqrt();
    if line_len <= POINT_TOLERANCE_M {
        return Ok(vec![]);
    }

    let direction = [line_vec[0] / line_len, line_vec[1] / line_len];
    let mut normal = [-direction[1], direction[0]];
    let midpoint = [(start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0];
    let field_center = local_polygon_center(&local_field);
    let center_side =
        (field_center[0] - midpoint[0]) * normal[0] + (field_center[1] - midpoint[1]) * normal[1];
    if center_side < 0.0 {
        normal = [-normal[0], -normal[1]];
    }

    let extend_m = local_polygon_extent(&local_field) + end_m + 100.0;
    let band = vec![close_ring(vec![
        [
            start[0] - direction[0] * extend_m + normal[0] * start_m,
            start[1] - direction[1] * extend_m + normal[1] * start_m,
        ],
        [
            end[0] + direction[0] * extend_m + normal[0] * start_m,
            end[1] + direction[1] * extend_m + normal[1] * start_m,
        ],
        [
            end[0] + direction[0] * extend_m + normal[0] * end_m,
            end[1] + direction[1] * extend_m + normal[1] * end_m,
        ],
        [
            start[0] - direction[0] * extend_m + normal[0] * end_m,
            start[1] - direction[1] * extend_m + normal[1] * end_m,
        ],
    ])];
    let band_wgs84 = project_polygon_to_wgs84(&band, center);

    wasm_geo_ops::intersection(field_rings, &band_wgs84)
        .map_err(|error| error.to_string())
        .map(|polygons| {
            polygons
                .into_iter()
                .filter_map(|shape| overlay_shape_to_polygon(&shape))
                .collect()
        })
}

fn overlay_shape_to_polygon(shape: &[Vec<[f64; 2]>]) -> Option<OverlayShape> {
    let rings = shape
        .iter()
        .filter(|ring| ring.len() >= 3)
        .map(|ring| close_ring(ring.clone()))
        .collect::<Vec<_>>();

    if turf_polygon_area(&rings) <= POINT_TOLERANCE_M {
        None
    } else {
        Some(rings)
    }
}

fn local_polygon_center(rings: &[Vec<[f64; 2]>]) -> [f64; 2] {
    let Some(exterior) = rings.first() else {
        return [0.0, 0.0];
    };
    if exterior.is_empty() {
        return [0.0, 0.0];
    }

    let (sum_x, sum_y) = exterior.iter().fold((0.0, 0.0), |(sum_x, sum_y), coord| {
        (sum_x + coord[0], sum_y + coord[1])
    });
    let count = exterior.len() as f64;
    [sum_x / count, sum_y / count]
}

fn local_polygon_extent(rings: &[Vec<[f64; 2]>]) -> f64 {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for ring in rings {
        for coord in ring {
            min_x = min_x.min(coord[0]);
            min_y = min_y.min(coord[1]);
            max_x = max_x.max(coord[0]);
            max_y = max_y.max(coord[1]);
        }
    }

    if !min_x.is_finite() {
        return 0.0;
    }

    let width = max_x - min_x;
    let height = max_y - min_y;
    (width * width + height * height).sqrt()
}

fn buffer_local_line_rings(
    line: &[[f64; 2]],
    distance_m: f64,
) -> Result<Vec<Vec<[f64; 2]>>, String> {
    wasm_geo_ops::buffer_line(line, distance_m, KERNEL_BUFFER_QUADRANT_SEGMENTS)
        .map_err(|error| error.to_string())
}

fn buffer_line_geodesic(line: &[[f64; 2]], buffer_m: f64) -> Result<Vec<Vec<[f64; 2]>>, String> {
    buffer_line_wgs84_with_segments(line, buffer_m, TURF_HEADLAND_BUFFER_STEPS)
}

fn buffer_line_wgs84_with_segments(
    line: &[[f64; 2]],
    buffer_m: f64,
    quadrant_segments: f64,
) -> Result<Vec<Vec<[f64; 2]>>, String> {
    let center = [
        (line[0][0] + line[1][0]) / 2.0,
        (line[0][1] + line[1][1]) / 2.0,
    ];
    let local_line = project_line_to_local(line, center);
    let local_rings = wasm_geo_ops::buffer_line(&local_line, buffer_m, quadrant_segments)
        .map_err(|error| error.to_string())?;
    let wgs84_rings = project_polygon_to_wgs84(&local_rings, center);
    Ok(wgs84_rings)
}

fn turf_polygon_area(polygon: &[Vec<[f64; 2]>]) -> f64 {
    if polygon.is_empty() {
        return 0.0;
    }

    let shell = turf_ring_area(&polygon[0]).abs();
    let holes = polygon[1..]
        .iter()
        .map(|ring| turf_ring_area(ring).abs())
        .sum::<f64>();

    shell - holes
}

fn turf_ring_area(coords: &[[f64; 2]]) -> f64 {
    let coords_length = coords.len().saturating_sub(1);
    if coords_length <= 2 {
        return 0.0;
    }

    let mut total = 0.0;
    for i in 0..coords_length {
        let lower = coords[i];
        let middle = coords[if i + 1 == coords_length { 0 } else { i + 1 }];
        let upper = coords[if i + 2 >= coords_length {
            (i + 2) % coords_length
        } else {
            i + 2
        }];

        total += (to_radians(upper[0]) - to_radians(lower[0])) * to_radians(middle[1]).sin();
    }

    total * EARTH_RADIUS * EARTH_RADIUS / 2.0
}

fn make_ground_cover_areas(
    strip_polygons: &[StripPolygonResult],
    rows: &[RowDefinition],
) -> (Vec<GroundCoverResult>, HashMap<String, f64>) {
    let mut ground_cover_areas = Vec::new();
    let mut ground_cover_areas_m2 = HashMap::new();

    for strip in strip_polygons {
        if strip.row_index >= rows.len() {
            continue;
        }

        let Some(groundcover) = &rows[strip.row_index].groundcover else {
            continue;
        };

        let species_id = groundcover.id().to_string();
        if strip.area_m2 <= 0.0 || strip.polygons.is_empty() || species_id.is_empty() {
            continue;
        }

        for (idx, polygon) in strip.polygons.iter().enumerate() {
            let area_m2 = strip
                .polygon_areas_m2
                .get(idx)
                .copied()
                .unwrap_or(strip.area_m2);

            if area_m2 <= 0.0 {
                continue;
            }

            *ground_cover_areas_m2
                .entry(species_id.clone())
                .or_insert(0.0) += area_m2;
            ground_cover_areas.push(GroundCoverResult {
                polygon: polygon.clone(),
                species_id: species_id.clone(),
                area_m2,
            });
        }
    }

    (ground_cover_areas, ground_cover_areas_m2)
}

fn generate_tree_markers(
    tree_row_lines: &[TreeRowLineResult],
    rows: &[RowDefinition],
) -> (Vec<TreeMarker>, Vec<SpeciesCount>) {
    let mut tree_markers = Vec::new();
    let mut species_count_map: HashMap<String, (SpeciesRef, u32)> = HashMap::new();

    for tree_row in tree_row_lines {
        let row_def = &rows[tree_row.system_design_row_index];
        let total_spacing: f64 = row_def
            .sequence
            .iter()
            .map(|entry| entry.spacing_after)
            .sum();

        if total_spacing <= 0.0 {
            continue;
        }

        let sequence = &row_def.sequence;
        let row_length = line_length(&tree_row.line);
        let mut tree_sequence_idx = 0;
        let mut distance = 0.0;

        while distance < row_length {
            let point = along(&tree_row.line, distance);
            let species_opt = &sequence[tree_sequence_idx].species;

            if let Some(species) = species_opt {
                let species_id = species.id().to_string();
                tree_markers.push(TreeMarker {
                    species: species.clone(),
                    point: GeoJsonFeature::point(point, None),
                    circle: None,
                });

                species_count_map
                    .entry(species_id)
                    .and_modify(|(_, count)| *count += 1)
                    .or_insert((species.clone(), 1));
            }

            distance += sequence[tree_sequence_idx].spacing_after;
            tree_sequence_idx = (tree_sequence_idx + 1) % sequence.len();
        }
    }

    let species_counts = species_count_map
        .into_values()
        .map(|(species, count)| SpeciesCount { species, count })
        .collect();

    (tree_markers, species_counts)
}

fn get_all_sides(polygon_coords: &[[f64; 2]]) -> Vec<Vec<[f64; 2]>> {
    if polygon_coords.len() < 2 {
        return vec![];
    }

    polygon_coords
        .iter()
        .enumerate()
        .map(|(idx, coord)| {
            let next_idx = (idx + 1) % polygon_coords.len();
            vec![*coord, polygon_coords[next_idx]]
        })
        .collect()
}

fn restore_headland_polygon(
    headland_coords: &[[f64; 2]],
    field_bearing: f64,
    bearing_threshold: f64,
) -> (Vec<[f64; 2]>, Vec<Vec<[f64; 2]>>, Vec<[f64; 2]>) {
    let field_bearing_clamped = clamp_bearing_0_180(field_bearing);
    let mut current_coords = headland_coords.to_vec();
    let mut sides_close_to_bearing = Vec::new();
    let mut intersection_points = Vec::new();
    let center = centroid(headland_coords);

    let sides = get_all_sides(&current_coords);
    let mut idx_of_sides_parallel = Vec::new();
    for (idx, side) in sides.iter().enumerate() {
        let side_bearing = clamp_bearing_0_180(bearing(side[0], side[1]));
        let side_len = line_length(side);

        if (side_bearing - field_bearing_clamped).abs() <= bearing_threshold && side_len > 2.0 {
            idx_of_sides_parallel.push(idx);
        }
    }

    for &idx in &idx_of_sides_parallel {
        let current_sides = get_all_sides(&current_coords);
        let num_sides = current_sides.len();

        if idx >= num_sides || num_sides == 0 {
            continue;
        }

        let mut before_idx = idx;
        loop {
            before_idx = if before_idx == 0 {
                num_sides - 1
            } else {
                before_idx - 1
            };

            if before_idx == (idx + 1) % num_sides || line_length(&current_sides[before_idx]) > 2.0
            {
                break;
            }
        }

        let mut after_idx = idx;
        loop {
            after_idx = (after_idx + 1) % num_sides;

            if after_idx == idx.saturating_sub(1)
                || (idx == 0 && after_idx == num_sides - 1)
                || line_length(&current_sides[after_idx]) > 2.0
            {
                break;
            }
        }

        let intersection_before =
            line_intersection_local(&current_sides[before_idx], &current_sides[idx], center);
        let intersection_after =
            line_intersection_local(&current_sides[after_idx], &current_sides[idx], center);

        sides_close_to_bearing.push(scale_line_from_center(&current_sides[before_idx], 50.0));
        sides_close_to_bearing.push(scale_line_from_center(&current_sides[after_idx], 50.0));
        sides_close_to_bearing.push(scale_line_from_center(&current_sides[idx], 50.0));

        if let Some(point) = intersection_before {
            intersection_points.push(point);
        }
        if let Some(point) = intersection_after {
            intersection_points.push(point);
        }

        if let (Some(int_before), Some(int_after)) = (intersection_before, intersection_after) {
            let coords_len = current_coords.len();

            if before_idx < after_idx {
                let mut new_coords = Vec::new();
                new_coords.extend_from_slice(&current_coords[0..=before_idx]);
                new_coords.push(int_before);

                let slice_len = after_idx - before_idx;
                if slice_len > 2 {
                    for _ in 0..(slice_len - 2) {
                        new_coords.push(int_before);
                    }
                }

                new_coords.push(int_after);
                if after_idx + 1 < coords_len {
                    new_coords.extend_from_slice(&current_coords[after_idx + 1..]);
                }
                current_coords = new_coords;
            } else if after_idx < before_idx {
                let mut new_coords = Vec::new();

                for _ in 0..=after_idx {
                    new_coords.push(int_after);
                }

                if after_idx < before_idx {
                    new_coords.extend_from_slice(&current_coords[after_idx + 1..=before_idx]);
                }

                let fill_count = coords_len.saturating_sub(before_idx).saturating_sub(1);
                for _ in 0..fill_count {
                    new_coords.push(int_before);
                }

                new_coords.push(int_after);
                current_coords = new_coords;
            }
        }
    }

    let mut cleaned = Vec::with_capacity(current_coords.len());
    for (idx, coord) in current_coords.iter().enumerate() {
        if idx == 0 || idx == current_coords.len() - 1 {
            cleaned.push(*coord);
            continue;
        }

        let prev = current_coords[idx - 1];
        if (coord[0] - prev[0]).abs() > 1e-10 || (coord[1] - prev[1]).abs() > 1e-10 {
            cleaned.push(*coord);
        }
    }

    close_ring_in_place(&mut cleaned);
    (cleaned, sides_close_to_bearing, intersection_points)
}

fn line_bbox_center(line: &[[f64; 2]]) -> [f64; 2] {
    let mut min_lng = f64::MAX;
    let mut min_lat = f64::MAX;
    let mut max_lng = f64::NEG_INFINITY;
    let mut max_lat = f64::NEG_INFINITY;

    for coord in line {
        min_lng = min_lng.min(coord[0]);
        min_lat = min_lat.min(coord[1]);
        max_lng = max_lng.max(coord[0]);
        max_lat = max_lat.max(coord[1]);
    }

    [(min_lng + max_lng) / 2.0, (min_lat + max_lat) / 2.0]
}

fn scale_line_from_center(line: &[[f64; 2]], factor: f64) -> Vec<[f64; 2]> {
    let origin = line_bbox_center(line);
    line.iter()
        .map(|coord| {
            let distance = rhumb_distance(origin, *coord);
            let bearing = rhumb_bearing(origin, *coord);
            rhumb_destination(origin, distance * factor, bearing)
        })
        .collect()
}

fn line_intersection_local(
    line1: &[[f64; 2]],
    line2: &[[f64; 2]],
    _center: [f64; 2],
) -> Option<[f64; 2]> {
    let p1 = wgs84_to_web_mercator(line1[0]);
    let p2 = wgs84_to_web_mercator(line1[1]);
    let p3 = wgs84_to_web_mercator(line2[0]);
    let p4 = wgs84_to_web_mercator(line2[1]);

    if (p4[0] - p3[0]).abs() <= f64::EPSILON {
        return None;
    }

    let denominator = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
    if denominator.abs() <= f64::EPSILON {
        return None;
    }

    let first_det = p1[0] * p2[1] - p1[1] * p2[0];
    let second_det = p3[0] * p4[1] - p3[1] * p4[0];
    let x = (first_det * (p3[0] - p4[0]) - (p1[0] - p2[0]) * second_det) / denominator;
    let y = (first_det * (p3[1] - p4[1]) - (p1[1] - p2[1]) * second_det) / denominator;

    if !x.is_finite() || !y.is_finite() {
        return None;
    }

    Some(web_mercator_to_wgs84([x, y]))
}

fn wgs84_to_web_mercator(coord: [f64; 2]) -> [f64; 2] {
    const EARTH_RADIUS_M: f64 = 6_378_137.0;
    let lon_rad = coord[0].to_radians();
    let lat_rad = coord[1].to_radians();

    [
        EARTH_RADIUS_M * lon_rad,
        EARTH_RADIUS_M * ((std::f64::consts::FRAC_PI_4 + lat_rad / 2.0).tan()).ln(),
    ]
}

fn web_mercator_to_wgs84(coord: [f64; 2]) -> [f64; 2] {
    const EARTH_RADIUS_M: f64 = 6_378_137.0;
    let lon = (coord[0] / EARTH_RADIUS_M).to_degrees();
    let lat =
        (2.0 * (coord[1] / EARTH_RADIUS_M).exp().atan() - std::f64::consts::FRAC_PI_2).to_degrees();

    [lon, lat]
}

fn calculate_headland_offset(offset: &Option<crate::types::RowOffset>) -> (f64, f64) {
    match offset {
        Some(offset) => (offset.before.unwrap_or(0.0), offset.after.unwrap_or(0.0)),
        None => (0.0, 0.0),
    }
}

fn projection_center(rings: &[Vec<[f64; 2]>]) -> [f64; 2] {
    if rings.is_empty() || rings[0].is_empty() {
        return [0.0, 0.0];
    }

    let mut min_lng = f64::INFINITY;
    let mut min_lat = f64::INFINITY;
    let mut max_lng = f64::NEG_INFINITY;
    let mut max_lat = f64::NEG_INFINITY;

    for coord in &rings[0] {
        min_lng = min_lng.min(coord[0]);
        min_lat = min_lat.min(coord[1]);
        max_lng = max_lng.max(coord[0]);
        max_lat = max_lat.max(coord[1]);
    }

    [(min_lng + max_lng) / 2.0, (min_lat + max_lat) / 2.0]
}

fn polygon_boundary_segments(polygon: &[Vec<[f64; 2]>]) -> Vec<Segment> {
    polygon
        .iter()
        .flat_map(|ring| line_string_segments(&close_ring(ring.clone())))
        .collect()
}

fn line_string_segments(line_string: &[[f64; 2]]) -> Vec<Segment> {
    line_string
        .windows(2)
        .map(|window| (window[0], window[1]))
        .collect()
}

fn intersection_points_between_segments(first: &[Segment], second: &[Segment]) -> Vec<[f64; 2]> {
    let mut points = Vec::new();

    for a in first {
        for b in second {
            points.extend(segment_intersection_points(*a, *b));
        }
    }

    deduplicate_points(&points, INTERSECTION_DEDUP_TOLERANCE_M)
}

fn segment_intersection_points(first: Segment, second: Segment) -> Vec<[f64; 2]> {
    let (a, b) = first;
    let (c, d) = second;
    let denominator = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);

    if denominator.abs() <= INTERSECTION_DEDUP_TOLERANCE_M {
        if cross(a, b, c).abs() > INTERSECTION_DEDUP_TOLERANCE_M {
            return vec![];
        }

        let mut points = Vec::new();
        for point in [a, b] {
            if point_on_segment(point, second) {
                points.push(point);
            }
        }
        for point in [c, d] {
            if point_on_segment(point, first) {
                points.push(point);
            }
        }
        return deduplicate_points(&points, INTERSECTION_DEDUP_TOLERANCE_M);
    }

    let a_cross = a[0] * b[1] - a[1] * b[0];
    let b_cross = c[0] * d[1] - c[1] * d[0];
    let point = [
        (a_cross * (c[0] - d[0]) - (a[0] - b[0]) * b_cross) / denominator,
        (a_cross * (c[1] - d[1]) - (a[1] - b[1]) * b_cross) / denominator,
    ];

    if point_on_segment(point, first) && point_on_segment(point, second) {
        vec![point]
    } else {
        vec![]
    }
}

fn point_on_segment(point: [f64; 2], segment: Segment) -> bool {
    let (start, end) = segment;
    cross(start, end, point).abs() <= INTERSECTION_DEDUP_TOLERANCE_M
        && point[0] >= start[0].min(end[0]) - INTERSECTION_DEDUP_TOLERANCE_M
        && point[0] <= start[0].max(end[0]) + INTERSECTION_DEDUP_TOLERANCE_M
        && point[1] >= start[1].min(end[1]) - INTERSECTION_DEDUP_TOLERANCE_M
        && point[1] <= start[1].max(end[1]) + INTERSECTION_DEDUP_TOLERANCE_M
}

fn cross(start: [f64; 2], end: [f64; 2], point: [f64; 2]) -> f64 {
    (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0])
}

fn deduplicate_points(points: &[[f64; 2]], tolerance: f64) -> Vec<[f64; 2]> {
    let mut result = Vec::new();

    for point in points {
        let is_duplicate = result.iter().any(|candidate: &[f64; 2]| {
            (point[0] - candidate[0]).abs() < tolerance
                && (point[1] - candidate[1]).abs() < tolerance
        });
        if !is_duplicate {
            result.push(*point);
        }
    }

    result
}

fn sort_intersection_points(points: &[[f64; 2]]) -> Vec<[f64; 2]> {
    let mut sorted = points.to_vec();

    let unique_x = unique_exact_count(sorted.iter().map(|point| point[0]));
    let unique_y = unique_exact_count(sorted.iter().map(|point| point[1]));
    if unique_x == sorted.len() {
        sorted.sort_by(|a, b| a[0].partial_cmp(&b[0]).unwrap_or(std::cmp::Ordering::Equal));
    } else if unique_y == sorted.len() {
        sorted.sort_by(|a, b| a[1].partial_cmp(&b[1]).unwrap_or(std::cmp::Ordering::Equal));
    } else {
        sorted.clear();
    }

    sorted
}

fn unique_exact_count(values: impl Iterator<Item = f64>) -> usize {
    values.map(f64::to_bits).collect::<HashSet<_>>().len()
}

fn close_ring(mut coords: Vec<[f64; 2]>) -> Vec<[f64; 2]> {
    close_ring_in_place(&mut coords);
    coords
}

fn close_ring_in_place(coords: &mut Vec<[f64; 2]>) {
    if coords.len() < 2 {
        return;
    }

    let first = coords[0];
    let last = coords[coords.len() - 1];
    if (first[0] - last[0]).abs() > 1e-10 || (first[1] - last[1]).abs() > 1e-10 {
        coords.push(first);
    }
}

fn orient_polygon_for_turf(rings: &[Vec<[f64; 2]>]) -> Vec<Vec<[f64; 2]>> {
    if rings.is_empty() {
        return vec![];
    }

    let mut oriented = rings.to_vec();
    if signed_ring_area(&oriented[0]) < 0.0 {
        oriented[0] = reverse_closed_ring_preserving_start(&oriented[0]);
    }

    for ring in oriented.iter_mut().skip(1) {
        if signed_ring_area(ring) > 0.0 {
            *ring = reverse_closed_ring_preserving_start(ring);
        }
    }

    oriented
}

fn orient_margin_polygon_for_turf(rings: &[Vec<[f64; 2]>], margin_m: f64) -> Vec<Vec<[f64; 2]>> {
    if margin_m > 0.0 {
        orient_polygon_for_turf(rings)
    } else {
        rings.to_vec()
    }
}

fn planar_polygon_area(rings: &[Vec<[f64; 2]>]) -> f64 {
    let Some(exterior) = rings.first() else {
        return 0.0;
    };

    let holes = rings
        .iter()
        .skip(1)
        .map(|ring| signed_ring_area(ring).abs())
        .sum::<f64>();
    (signed_ring_area(exterior).abs() - holes).max(0.0)
}

fn signed_ring_area(ring: &[[f64; 2]]) -> f64 {
    if ring.len() < 3 {
        return 0.0;
    }

    (0..ring.len())
        .map(|idx| {
            let next = (idx + 1) % ring.len();
            ring[idx][0] * ring[next][1] - ring[next][0] * ring[idx][1]
        })
        .sum::<f64>()
        / 2.0
}

fn reverse_closed_ring_preserving_start(ring: &[[f64; 2]]) -> Vec<[f64; 2]> {
    if ring.len() < 2 {
        return ring.to_vec();
    }

    let first = ring[0];
    let end = if (first[0] - ring[ring.len() - 1][0]).abs() <= 1e-10
        && (first[1] - ring[ring.len() - 1][1]).abs() <= 1e-10
    {
        ring.len() - 1
    } else {
        ring.len()
    };

    let mut reversed = Vec::with_capacity(ring.len());
    reversed.push(first);
    reversed.extend(ring[1..end].iter().rev().copied());
    reversed.push(first);
    reversed
}

impl TreeRowLineResult {
    fn to_geojson(&self) -> GeoJsonFeature {
        GeoJsonFeature::line_string(
            self.line.iter().map(|coord| [coord[0], coord[1]]).collect(),
            Some(serde_json::json!({
                "systemDesignRowIndex": self.system_design_row_index
            })),
        )
    }
}

impl StripPolygonResult {
    fn to_geojson(&self) -> GeoJsonFeature {
        let properties = Some(serde_json::json!({
            "rowIndex": self.row_index,
            "areaM2": self.area_m2
        }));

        match self.polygons.as_slice() {
            [] => GeoJsonFeature::polygon(vec![], properties),
            [polygon] => GeoJsonFeature::polygon(orient_polygon_for_turf(polygon), properties),
            polygons => GeoJsonFeature::multi_polygon(
                polygons
                    .iter()
                    .map(|polygon| orient_polygon_for_turf(polygon))
                    .collect(),
                properties,
            ),
        }
    }
}

impl GroundCoverResult {
    fn to_geojson(&self) -> GeoJsonFeature {
        GeoJsonFeature::polygon(
            orient_polygon_for_turf(&self.polygon),
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

    const POINT_IN_POLYGON_EPSILON: f64 = 1e-10;

    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct LayoutFixture {
        field_geometry: String,
        system_design: SystemDesign,
    }

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

    #[test]
    fn spiral_groundcover_areas_stay_inside_field() {
        let fixture: LayoutFixture = serde_json::from_str(include_str!(
            "../../tests/fixtures/spiral-groundcover-outside-field/input.json"
        ))
        .unwrap();
        let field_rings = parse_geojson_polygon(&fixture.field_geometry).unwrap();
        let result = system_based_layout(&fixture.system_design, &fixture.field_geometry).unwrap();

        assert!(
            !result.ground_cover_areas.is_empty(),
            "fixture should produce ground cover areas"
        );

        for (area_index, area) in result.ground_cover_areas.iter().enumerate() {
            for (polygon_index, polygon) in feature_polygons(area).iter().enumerate() {
                assert_polygon_samples_inside_field(
                    &field_rings,
                    polygon,
                    area_index,
                    polygon_index,
                );
            }
        }
    }

    fn feature_polygons(feature: &GeoJsonFeature) -> Vec<Vec<Vec<[f64; 2]>>> {
        let geometry_type = feature
            .geometry
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or("");

        match geometry_type {
            "Polygon" => vec![serde_json::from_value(
                feature
                    .geometry
                    .get("coordinates")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null),
            )
            .unwrap()],
            "MultiPolygon" => serde_json::from_value(
                feature
                    .geometry
                    .get("coordinates")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null),
            )
            .unwrap(),
            other => panic!("expected Polygon or MultiPolygon, got {other}"),
        }
    }

    fn assert_polygon_samples_inside_field(
        field_rings: &[Vec<[f64; 2]>],
        polygon: &[Vec<[f64; 2]>],
        area_index: usize,
        polygon_index: usize,
    ) {
        for (ring_index, ring) in polygon.iter().enumerate() {
            for segment in ring.windows(2) {
                for point in sampled_segment_points(segment[0], segment[1]) {
                    assert!(
                        point_in_polygon_or_boundary(point, field_rings),
                        "ground cover area {area_index}, polygon {polygon_index}, ring {ring_index} has point [{}, {}] outside field",
                        point[0],
                        point[1]
                    );
                }
            }
        }
    }

    fn sampled_segment_points(start: [f64; 2], end: [f64; 2]) -> [[f64; 2]; 5] {
        [
            start,
            interpolate_point(start, end, 0.25),
            interpolate_point(start, end, 0.5),
            interpolate_point(start, end, 0.75),
            end,
        ]
    }

    fn interpolate_point(start: [f64; 2], end: [f64; 2], fraction: f64) -> [f64; 2] {
        [
            start[0] + (end[0] - start[0]) * fraction,
            start[1] + (end[1] - start[1]) * fraction,
        ]
    }

    fn point_in_polygon_or_boundary(point: [f64; 2], rings: &[Vec<[f64; 2]>]) -> bool {
        let Some(exterior) = rings.first() else {
            return false;
        };

        if point_on_ring_boundary(point, exterior) {
            return true;
        }

        if !point_in_ring(point, exterior) {
            return false;
        }

        for hole in rings.iter().skip(1) {
            if point_on_ring_boundary(point, hole) || point_in_ring(point, hole) {
                return false;
            }
        }

        true
    }

    fn point_on_ring_boundary(point: [f64; 2], ring: &[[f64; 2]]) -> bool {
        ring.windows(2)
            .any(|segment| point_on_segment(point, segment[0], segment[1]))
    }

    fn point_on_segment(point: [f64; 2], start: [f64; 2], end: [f64; 2]) -> bool {
        let cross = (point[1] - start[1]) * (end[0] - start[0])
            - (point[0] - start[0]) * (end[1] - start[1]);
        if cross.abs() > POINT_IN_POLYGON_EPSILON {
            return false;
        }

        point[0] >= start[0].min(end[0]) - POINT_IN_POLYGON_EPSILON
            && point[0] <= start[0].max(end[0]) + POINT_IN_POLYGON_EPSILON
            && point[1] >= start[1].min(end[1]) - POINT_IN_POLYGON_EPSILON
            && point[1] <= start[1].max(end[1]) + POINT_IN_POLYGON_EPSILON
    }

    fn point_in_ring(point: [f64; 2], ring: &[[f64; 2]]) -> bool {
        let mut inside = false;
        let mut previous = ring[ring.len() - 1];

        for current in ring {
            let crosses_ray = (current[1] > point[1]) != (previous[1] > point[1]);
            if crosses_ray {
                let intersect_x = (previous[0] - current[0]) * (point[1] - current[1])
                    / (previous[1] - current[1])
                    + current[0];
                if point[0] < intersect_x {
                    inside = !inside;
                }
            }
            previous = *current;
        }

        inside
    }
}
