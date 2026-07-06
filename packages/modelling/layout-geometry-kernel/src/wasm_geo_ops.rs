//! Geometry operations backed by the published `geometry-kernel` crate.

#![cfg(any(feature = "native", feature = "wasm"))]

use crate::geometry::{project_line_to_local, project_polygon_to_wgs84};
use crate::make_line;
use geometry_kernel::{
    buffer::BufferOptions, predicates::polygon_area as kernel_polygon_area, Coord as KernelCoord,
    GeometryKernel, LineString as KernelLineString, LinearRing as KernelLinearRing,
    MultiPolygon as KernelMultiPolygon, Polygon as KernelPolygon, PrecisionModel, PureRustKernel,
};

const POINT_DEDUP_TOLERANCE_M: f64 = 2e-7;
const OVERLAY_GRID_SIZE: f64 = 1e-11;

type Segment = ([f64; 2], [f64; 2]);

#[derive(Debug, Clone)]
pub struct GeoError(pub String);

impl std::fmt::Display for GeoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for GeoError {}

pub fn buffer_polygon(
    rings: &[Vec<[f64; 2]>],
    distance: f64,
    quad_segs: i32,
) -> Result<Vec<Vec<[f64; 2]>>, GeoError> {
    let kernel = PureRustKernel::new(PrecisionModel::floating());
    let polygon = kernel_polygon_from_rings(rings)?;
    let buffered = kernel
        .buffer_polygon(
            &polygon,
            distance,
            BufferOptions {
                quadrant_segments: quad_segs.max(1) as u32,
                ..BufferOptions::default()
            },
        )
        .map_err(|error| GeoError(error.to_string()))?;
    largest_kernel_polygon(&buffered)
        .map(|polygon| kernel_polygon_to_rings(&polygon))
        .ok_or_else(|| GeoError("Buffer operation returned no polygons".into()))
}

pub fn buffer_line(
    coords: &[[f64; 2]],
    distance: f64,
    quad_segs: f64,
) -> Result<Vec<Vec<[f64; 2]>>, GeoError> {
    if coords.len() < 2 {
        return Err(GeoError(
            "Line buffer requires at least two coordinates".into(),
        ));
    }

    let kernel = PureRustKernel::new(PrecisionModel::floating());
    let line = KernelLineString::new(
        coords
            .iter()
            .map(|coord| KernelCoord::new(coord[0], coord[1]))
            .collect(),
    );
    let buffered = kernel
        .line_buffer(
            &line,
            distance,
            BufferOptions {
                quadrant_segments: quad_segs.max(1.0).round() as u32,
                ..BufferOptions::default()
            },
        )
        .map_err(|error| GeoError(error.to_string()))?;
    largest_kernel_polygon(&buffered)
        .map(|polygon| kernel_polygon_to_rings(&polygon))
        .ok_or_else(|| GeoError("Line buffer operation returned no polygons".into()))
}

pub fn difference(
    polygon1: &[Vec<[f64; 2]>],
    polygon2: &[Vec<[f64; 2]>],
) -> Result<Vec<Vec<Vec<[f64; 2]>>>, GeoError> {
    let kernel = overlay_kernel();
    let subject = KernelMultiPolygon::new(vec![kernel_polygon_from_rings(polygon1)?]);
    let clip = KernelMultiPolygon::new(vec![kernel_polygon_from_rings(polygon2)?]);
    let result = kernel
        .difference(&subject, &clip)
        .map_err(|error| GeoError(error.to_string()))?;

    Ok(result
        .polygons
        .iter()
        .map(kernel_polygon_to_rings)
        .collect())
}

pub fn intersection(
    polygon1: &[Vec<[f64; 2]>],
    polygon2: &[Vec<[f64; 2]>],
) -> Result<Vec<Vec<Vec<[f64; 2]>>>, GeoError> {
    let kernel = PureRustKernel::new(PrecisionModel::floating());
    let subject = KernelMultiPolygon::new(vec![kernel_polygon_from_rings(polygon1)?]);
    let clip = KernelMultiPolygon::new(vec![kernel_polygon_from_rings(polygon2)?]);
    let result = kernel
        .intersection(&subject, &clip)
        .map_err(|error| GeoError(error.to_string()))?;

    Ok(result
        .polygons
        .iter()
        .map(kernel_polygon_to_rings)
        .collect())
}

pub fn line_buffer_polygon_intersections(
    line_coords: &[[f64; 2]],
    buffer_distance: f64,
    polygon_rings: &[Vec<[f64; 2]>],
) -> Result<Vec<[f64; 2]>, GeoError> {
    if line_coords.len() < 2 || polygon_rings.is_empty() || polygon_rings[0].len() < 4 {
        return Ok(vec![]);
    }

    let center = coords_center(line_coords);
    let local_line = project_line_to_local(line_coords, center);
    let buffer_rings_local = buffer_line(&local_line, buffer_distance, 8.0)?;
    let buffer_rings = project_polygon_to_wgs84(&buffer_rings_local, center);

    let buffer_segments = ring_boundary_segments(&buffer_rings);
    let polygon_segments = ring_boundary_segments(polygon_rings);
    let points = intersection_points_between_segments(&buffer_segments, &polygon_segments);

    Ok(points)
}

pub fn polygon_area(rings: &[Vec<[f64; 2]>]) -> Result<f64, GeoError> {
    Ok(planar_polygon_area(rings))
}

pub fn make_initial_line(
    bearing: f64,
    polygon_rings: &[Vec<[f64; 2]>],
) -> Result<(Vec<[f64; 2]>, f64), GeoError> {
    let exterior = polygon_rings
        .first()
        .ok_or_else(|| GeoError("Initial line requires a polygon exterior".into()))?;
    let result = make_line::make_initial_line(bearing, exterior);
    Ok((result.line_intersecting_polygon, result.width_of_polygon))
}

pub fn get_largest_polygon(polygons: &[Vec<Vec<[f64; 2]>>]) -> Option<Vec<Vec<[f64; 2]>>> {
    polygons
        .iter()
        .max_by(|left, right| {
            let left_area = polygon_area(left).unwrap_or(0.0);
            let right_area = polygon_area(right).unwrap_or(0.0);
            left_area
                .partial_cmp(&right_area)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned()
}

fn overlay_kernel() -> PureRustKernel {
    PureRustKernel::new(PrecisionModel::fixed(OVERLAY_GRID_SIZE))
}

fn coords_center(coords: &[[f64; 2]]) -> [f64; 2] {
    let mut min_lng = f64::INFINITY;
    let mut min_lat = f64::INFINITY;
    let mut max_lng = f64::NEG_INFINITY;
    let mut max_lat = f64::NEG_INFINITY;

    for coord in coords {
        min_lng = min_lng.min(coord[0]);
        min_lat = min_lat.min(coord[1]);
        max_lng = max_lng.max(coord[0]);
        max_lat = max_lat.max(coord[1]);
    }

    [(min_lng + max_lng) / 2.0, (min_lat + max_lat) / 2.0]
}

fn kernel_polygon_from_rings(rings: &[Vec<[f64; 2]>]) -> Result<KernelPolygon, GeoError> {
    if rings.is_empty() || rings[0].len() < 4 {
        return Err(GeoError("Invalid polygon".into()));
    }

    let exterior = KernelLinearRing::new(
        close_ring(rings[0].clone())
            .into_iter()
            .map(|coord| KernelCoord::new(coord[0], coord[1]))
            .collect(),
    );
    let holes = rings[1..]
        .iter()
        .filter(|ring| ring.len() >= 4)
        .map(|ring| {
            KernelLinearRing::new(
                close_ring(ring.clone())
                    .into_iter()
                    .map(|coord| KernelCoord::new(coord[0], coord[1]))
                    .collect(),
            )
        })
        .collect();

    Ok(KernelPolygon::new(exterior, holes))
}

fn kernel_polygon_to_rings(polygon: &KernelPolygon) -> Vec<Vec<[f64; 2]>> {
    let mut rings = vec![kernel_ring_to_coords(&polygon.exterior)];
    rings.extend(polygon.holes.iter().map(kernel_ring_to_coords));
    rings
}

fn kernel_ring_to_coords(ring: &KernelLinearRing) -> Vec<[f64; 2]> {
    close_ring(ring.coords.iter().map(|coord| [coord.x, coord.y]).collect())
}

fn largest_kernel_polygon(multi_polygon: &KernelMultiPolygon) -> Option<KernelPolygon> {
    multi_polygon
        .polygons
        .iter()
        .max_by(|a, b| {
            kernel_polygon_area(a)
                .partial_cmp(&kernel_polygon_area(b))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned()
}

fn ring_boundary_segments(rings: &[Vec<[f64; 2]>]) -> Vec<Segment> {
    rings
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
            if let Some(point) = turf_segment_intersection(*a, *b) {
                points.push(point);
            }
        }
    }

    deduplicate_points(&points)
}

fn turf_segment_intersection(line1: Segment, line2: Segment) -> Option<[f64; 2]> {
    let line1_start_x = line1.0[0];
    let line1_start_y = line1.0[1];
    let line1_end_x = line1.1[0];
    let line1_end_y = line1.1[1];
    let line2_start_x = line2.0[0];
    let line2_start_y = line2.0[1];
    let line2_end_x = line2.1[0];
    let line2_end_y = line2.1[1];

    let denominator = (line2_end_y - line2_start_y) * (line1_end_x - line1_start_x)
        - (line2_end_x - line2_start_x) * (line1_end_y - line1_start_y);
    if denominator == 0.0 {
        return None;
    }

    let a = line1_start_y - line2_start_y;
    let b = line1_start_x - line2_start_x;
    let numerator1 = (line2_end_x - line2_start_x) * a - (line2_end_y - line2_start_y) * b;
    let numerator2 = (line1_end_x - line1_start_x) * a - (line1_end_y - line1_start_y) * b;
    let a = numerator1 / denominator;
    let b = numerator2 / denominator;

    if (0.0..=1.0).contains(&a) && (0.0..=1.0).contains(&b) {
        Some([
            line1_start_x + a * (line1_end_x - line1_start_x),
            line1_start_y + a * (line1_end_y - line1_start_y),
        ])
    } else {
        None
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

fn deduplicate_points(points: &[[f64; 2]]) -> Vec<[f64; 2]> {
    let mut result = Vec::new();

    for point in points {
        let is_duplicate = result.iter().any(|candidate: &[f64; 2]| {
            (point[0] - candidate[0]).abs() < POINT_DEDUP_TOLERANCE_M
                && (point[1] - candidate[1]).abs() < POINT_DEDUP_TOLERANCE_M
        });
        if !is_duplicate {
            result.push(*point);
        }
    }

    result
}

fn close_ring(mut coords: Vec<[f64; 2]>) -> Vec<[f64; 2]> {
    if coords.len() < 2 {
        return coords;
    }

    let first = coords[0];
    let last = coords[coords.len() - 1];
    if (first[0] - last[0]).abs() > 1e-10 || (first[1] - last[1]).abs() > 1e-10 {
        coords.push(first);
    }

    coords
}
