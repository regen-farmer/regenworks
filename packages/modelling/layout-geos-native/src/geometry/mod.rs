//! Geometry utility functions
//!
//! Rust implementations of Turf.js geometry helpers like `along`, `circle`,
//! `bearing`, `destination`, etc.

#[cfg(feature = "native")]
use geos::{Geom, Geometry};
use std::f64::consts::PI;

/// Turf.js' spherical Earth radius in meters.
///
/// Layout parity depends on matching Turf's meter-to-degree conversions. Using
/// the WGS84 semi-major radius makes repeated row widths drift against the
/// TypeScript source of truth.
pub const EARTH_RADIUS: f64 = 6_371_008.8;

/// Convert degrees to radians
#[inline]
pub fn to_radians(degrees: f64) -> f64 {
    degrees * PI / 180.0
}

/// Convert radians to degrees
#[inline]
pub fn to_degrees(radians: f64) -> f64 {
    radians * 180.0 / PI
}

/// Calculate the bearing (direction) between two points in degrees.
/// Returns a value between -180 and 180.
///
/// # Arguments
/// * `start` - Starting point [lng, lat]
/// * `end` - Ending point [lng, lat]
pub fn bearing(start: [f64; 2], end: [f64; 2]) -> f64 {
    let lon1 = to_radians(start[0]);
    let lat1 = to_radians(start[1]);
    let lon2 = to_radians(end[0]);
    let lat2 = to_radians(end[1]);

    let delta_lon = lon2 - lon1;

    // Standard bearing formula:
    // θ = atan2(sin(Δλ)⋅cos(φ2), cos(φ1)⋅sin(φ2) − sin(φ1)⋅cos(φ2)⋅cos(Δλ))
    let x = delta_lon.sin() * lat2.cos();
    let y = lat1.cos() * lat2.sin() - lat1.sin() * lat2.cos() * delta_lon.cos();

    let bearing_rad = x.atan2(y);
    to_degrees(bearing_rad)
}

/// Calculate the distance between two points in meters using the Haversine formula.
///
/// # Arguments
/// * `start` - Starting point [lng, lat]
/// * `end` - Ending point [lng, lat]
pub fn distance(start: [f64; 2], end: [f64; 2]) -> f64 {
    let lat1 = to_radians(start[1]);
    let lat2 = to_radians(end[1]);
    let delta_lat = to_radians(end[1] - start[1]);
    let delta_lon = to_radians(end[0] - start[0]);

    let a =
        (delta_lat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (delta_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    EARTH_RADIUS * c
}

/// Calculate the destination point given a starting point, distance, and bearing.
/// Equivalent to Turf.js `destination`.
///
/// # Arguments
/// * `origin` - Starting point [lng, lat]
/// * `distance_m` - Distance in meters
/// * `bearing_deg` - Bearing in degrees (0 = north, 90 = east)
pub fn destination(origin: [f64; 2], distance_m: f64, bearing_deg: f64) -> [f64; 2] {
    let lon1 = to_radians(origin[0]);
    let lat1 = to_radians(origin[1]);
    let bearing_rad = to_radians(bearing_deg);
    let angular_dist = distance_m / EARTH_RADIUS;

    let lat2 = (lat1.sin() * angular_dist.cos()
        + lat1.cos() * angular_dist.sin() * bearing_rad.cos())
    .asin();

    let lon2 = lon1
        + (bearing_rad.sin() * angular_dist.sin() * lat1.cos())
            .atan2(angular_dist.cos() - lat1.sin() * lat2.sin());

    [to_degrees(lon2), to_degrees(lat2)]
}

/// Get a point along a LineString at a given distance from the start.
/// Equivalent to Turf.js `along`.
///
/// # Arguments
/// * `coords` - LineString coordinates as [[lng, lat], ...]
/// * `distance_m` - Distance from start in meters
///
/// # Returns
/// The point [lng, lat] at the specified distance, or the last point if distance exceeds line length.
pub fn along(coords: &[[f64; 2]], distance_m: f64) -> [f64; 2] {
    if coords.is_empty() {
        return [0.0, 0.0];
    }
    if coords.len() == 1 || distance_m <= 0.0 {
        return coords[0];
    }

    let mut traveled = 0.0;

    for i in 0..coords.len() - 1 {
        let start = coords[i];
        let end = coords[i + 1];
        let segment_length = distance(start, end);

        if traveled + segment_length >= distance_m {
            // The point is on this segment
            let remaining = distance_m - traveled;
            let bearing_deg = bearing(start, end);
            return destination(start, remaining, bearing_deg);
        }

        traveled += segment_length;
    }

    // Distance exceeds line length, return last point
    coords[coords.len() - 1]
}

/// Calculate the total length of a LineString in meters.
///
/// # Arguments
/// * `coords` - LineString coordinates as [[lng, lat], ...]
pub fn line_length(coords: &[[f64; 2]]) -> f64 {
    if coords.len() < 2 {
        return 0.0;
    }

    let mut total = 0.0;
    for i in 0..coords.len() - 1 {
        total += distance(coords[i], coords[i + 1]);
    }
    total
}

/// Create a circle polygon approximation around a point.
/// Equivalent to Turf.js `circle`.
///
/// # Arguments
/// * `center` - Center point [lng, lat]
/// * `radius_m` - Radius in meters
/// * `steps` - Number of edges (default 64 for smooth circle)
///
/// # Returns
/// A vector of coordinates forming a closed polygon ring.
pub fn circle(center: [f64; 2], radius_m: f64, steps: usize) -> Vec<[f64; 2]> {
    let steps = if steps == 0 { 64 } else { steps };
    let mut coords = Vec::with_capacity(steps + 1);

    for i in 0..steps {
        let bearing_deg = (i as f64 / steps as f64) * 360.0 - 180.0;
        coords.push(destination(center, radius_m, bearing_deg));
    }

    // Close the ring
    coords.push(coords[0]);
    coords
}

/// Calculate the centroid of a polygon.
///
/// # Arguments
/// * `coords` - Polygon exterior ring coordinates as [[lng, lat], ...]
pub fn centroid(coords: &[[f64; 2]]) -> [f64; 2] {
    if coords.is_empty() {
        return [0.0, 0.0];
    }

    let coords = if coords.len() > 1 {
        let first = coords[0];
        let last = coords[coords.len() - 1];
        if (first[0] - last[0]).abs() <= 1e-10 && (first[1] - last[1]).abs() <= 1e-10 {
            &coords[..coords.len() - 1]
        } else {
            coords
        }
    } else {
        coords
    };

    let n = coords.len() as f64;
    let sum_lng: f64 = coords.iter().map(|c| c[0]).sum();
    let sum_lat: f64 = coords.iter().map(|c| c[1]).sum();

    [sum_lng / n, sum_lat / n]
}

/// Clamp a bearing to the range [0, 180) degrees.
/// Used for comparing bearings regardless of direction.
pub fn clamp_bearing_0_180(mut bearing: f64) -> f64 {
    while bearing < 0.0 {
        bearing += 180.0;
    }
    while bearing >= 180.0 {
        bearing -= 180.0;
    }
    bearing
}

/// Normalize a bearing to the range [0, 360) degrees.
pub fn normalize_bearing(mut bearing: f64) -> f64 {
    while bearing < 0.0 {
        bearing += 360.0;
    }
    while bearing >= 360.0 {
        bearing -= 360.0;
    }
    bearing
}

/// Rotate a point around a pivot point by a given angle.
/// Uses geodesic rotation to match Turf.js transformRotate behavior.
///
/// # Arguments
/// * `point` - The point to rotate [lng, lat]
/// * `pivot` - The pivot point [lng, lat]
/// * `angle_deg` - Rotation angle in degrees (positive = counterclockwise)
pub fn rotate_point(point: [f64; 2], pivot: [f64; 2], angle_deg: f64) -> [f64; 2] {
    // If point equals pivot, return as-is
    if (point[0] - pivot[0]).abs() < 1e-12 && (point[1] - pivot[1]).abs() < 1e-12 {
        return point;
    }

    // Geodesic rotation:
    // 1. Calculate distance from pivot to point
    let dist = distance(pivot, point);

    // 2. Calculate current bearing from pivot to point
    let current_bearing = bearing(pivot, point);

    // 3. New bearing = current + rotation angle
    let new_bearing = current_bearing + angle_deg;

    // 4. Calculate destination point at same distance but new bearing
    destination(pivot, dist, new_bearing)
}

/// Rotate all coordinates in a polygon around a pivot point.
///
/// # Arguments
/// * `coords` - Polygon rings coordinates
/// * `pivot` - The pivot point [lng, lat]
/// * `angle_deg` - Rotation angle in degrees
pub fn rotate_polygon(
    coords: &[Vec<[f64; 2]>],
    pivot: [f64; 2],
    angle_deg: f64,
) -> Vec<Vec<[f64; 2]>> {
    coords
        .iter()
        .map(|ring| {
            ring.iter()
                .map(|point| rotate_point(*point, pivot, angle_deg))
                .collect()
        })
        .collect()
}

/// Rotate a LineString around a pivot point.
///
/// # Arguments
/// * `coords` - LineString coordinates
/// * `pivot` - The pivot point [lng, lat]
/// * `angle_deg` - Rotation angle in degrees
pub fn rotate_line(coords: &[[f64; 2]], pivot: [f64; 2], angle_deg: f64) -> Vec<[f64; 2]> {
    coords
        .iter()
        .map(|point| rotate_point(*point, pivot, angle_deg))
        .collect()
}

/// Calculate a bounding box for a set of coordinates.
///
/// # Returns
/// [min_lng, min_lat, max_lng, max_lat]
pub fn bbox(coords: &[[f64; 2]]) -> [f64; 4] {
    if coords.is_empty() {
        return [0.0, 0.0, 0.0, 0.0];
    }

    let mut min_lng = f64::MAX;
    let mut min_lat = f64::MAX;
    let mut max_lng = f64::MIN;
    let mut max_lat = f64::MIN;

    for coord in coords {
        min_lng = min_lng.min(coord[0]);
        min_lat = min_lat.min(coord[1]);
        max_lng = max_lng.max(coord[0]);
        max_lat = max_lat.max(coord[1]);
    }

    [min_lng, min_lat, max_lng, max_lat]
}

/// Create a bounding box polygon from coordinates.
///
/// # Returns
/// A closed polygon ring representing the bounding box.
pub fn bbox_polygon(coords: &[[f64; 2]]) -> Vec<[f64; 2]> {
    let [min_lng, min_lat, max_lng, max_lat] = bbox(coords);
    vec![
        [min_lng, min_lat],
        [max_lng, min_lat],
        [max_lng, max_lat],
        [min_lng, max_lat],
        [min_lng, min_lat], // Close the ring
    ]
}

/// Convert coordinates to a GEOS Geometry LineString.
#[cfg(feature = "native")]
pub fn coords_to_geos_line(coords: &[[f64; 2]]) -> Result<Geometry, geos::Error> {
    let wkt = format!(
        "LINESTRING({})",
        coords
            .iter()
            .map(|c| format!("{} {}", c[0], c[1]))
            .collect::<Vec<_>>()
            .join(", ")
    );
    Geometry::new_from_wkt(&wkt)
}

/// Convert coordinates to a GEOS Geometry Polygon.
#[cfg(feature = "native")]
pub fn coords_to_geos_polygon(rings: &[Vec<[f64; 2]>]) -> Result<Geometry, geos::Error> {
    if rings.is_empty() {
        return Err(geos::Error::GenericError("Empty polygon".to_string()));
    }

    let exterior = &rings[0];
    let exterior_wkt = exterior
        .iter()
        .map(|c| format!("{} {}", c[0], c[1]))
        .collect::<Vec<_>>()
        .join(", ");

    let wkt = if rings.len() == 1 {
        format!("POLYGON(({}))", exterior_wkt)
    } else {
        let holes: Vec<String> = rings[1..]
            .iter()
            .map(|ring| {
                format!(
                    "({})",
                    ring.iter()
                        .map(|c| format!("{} {}", c[0], c[1]))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            })
            .collect();
        format!("POLYGON(({}), {})", exterior_wkt, holes.join(", "))
    };

    Geometry::new_from_wkt(&wkt)
}

/// Convert a GEOS Geometry to coordinate arrays.
#[cfg(feature = "native")]
pub fn geos_polygon_to_coords<G: Geom>(geom: &G) -> Result<Vec<Vec<[f64; 2]>>, geos::Error> {
    let geom_type = geom.geometry_type();

    match geom_type {
        geos::GeometryTypes::Polygon => {
            let exterior = geom.get_exterior_ring()?;
            let coord_seq = exterior.get_coord_seq()?;
            let num_coords = coord_seq.size()?;

            let mut ring = Vec::with_capacity(num_coords as usize);
            for i in 0..num_coords {
                let x = coord_seq.get_x(i)?;
                let y = coord_seq.get_y(i)?;
                ring.push([x, y]);
            }

            let mut rings = vec![ring];

            // Get holes
            let num_holes = geom.get_num_interior_rings()?;
            for i in 0..num_holes {
                let hole = geom.get_interior_ring_n(i as u32)?;
                let coord_seq = hole.get_coord_seq()?;
                let num_coords = coord_seq.size()?;

                let mut hole_ring = Vec::with_capacity(num_coords as usize);
                for j in 0..num_coords {
                    let x = coord_seq.get_x(j)?;
                    let y = coord_seq.get_y(j)?;
                    hole_ring.push([x, y]);
                }
                rings.push(hole_ring);
            }

            Ok(rings)
        }
        _ => Err(geos::Error::GenericError(format!(
            "Expected Polygon, got {:?}",
            geom_type
        ))),
    }
}

/// Convert a GEOS LineString to coordinate array.
#[cfg(feature = "native")]
pub fn geos_line_to_coords(geom: &Geometry) -> Result<Vec<[f64; 2]>, geos::Error> {
    let coord_seq = geom.get_coord_seq()?;
    let num_coords = coord_seq.size()?;

    let mut coords = Vec::with_capacity(num_coords as usize);
    for i in 0..num_coords {
        let x = coord_seq.get_x(i)?;
        let y = coord_seq.get_y(i)?;
        coords.push([x, y]);
    }

    Ok(coords)
}

/// Project a WGS84 coordinate to local meters using Azimuthal Equidistant projection
/// centered on a reference point. This preserves distances from the center point.
///
/// # Arguments
/// * `coord` - The WGS84 coordinate [lng, lat]
/// * `center` - The center point of the projection [lng, lat]
///
/// # Returns
/// Local coordinates [x, y] in meters (x = east, y = north)
pub fn wgs84_to_local_meters(coord: [f64; 2], center: [f64; 2]) -> [f64; 2] {
    let dist = distance(center, coord);
    let brng = bearing(center, coord).to_radians();

    // Convert polar (distance, bearing) to cartesian (x, y) in meters
    // x = east, y = north
    let x = dist * brng.sin();
    let y = dist * brng.cos();

    [x, y]
}

/// Project local meters back to WGS84 using Azimuthal Equidistant projection
///
/// # Arguments
/// * `coord` - Local coordinates [x, y] in meters (x = east, y = north)
/// * `center` - The center point of the projection [lng, lat]
///
/// # Returns
/// WGS84 coordinate [lng, lat]
pub fn local_meters_to_wgs84(coord: [f64; 2], center: [f64; 2]) -> [f64; 2] {
    let x = coord[0];
    let y = coord[1];

    // Convert cartesian to polar
    let dist = (x * x + y * y).sqrt();
    let brng = x.atan2(y).to_degrees(); // atan2(x, y) for bearing from north

    destination(center, dist, brng)
}

/// Project a polygon from WGS84 to local meters
///
/// # Arguments
/// * `rings` - Polygon rings in WGS84 [lng, lat]
/// * `center` - The center point of the projection [lng, lat]
pub fn project_polygon_to_local(rings: &[Vec<[f64; 2]>], center: [f64; 2]) -> Vec<Vec<[f64; 2]>> {
    rings
        .iter()
        .map(|ring| {
            ring.iter()
                .map(|c| wgs84_to_local_meters(*c, center))
                .collect()
        })
        .collect()
}

/// Project a polygon from local meters back to WGS84
///
/// # Arguments
/// * `rings` - Polygon rings in local meters [x, y]
/// * `center` - The center point of the projection [lng, lat]
pub fn project_polygon_to_wgs84(rings: &[Vec<[f64; 2]>], center: [f64; 2]) -> Vec<Vec<[f64; 2]>> {
    rings
        .iter()
        .map(|ring| {
            ring.iter()
                .map(|c| local_meters_to_wgs84(*c, center))
                .collect()
        })
        .collect()
}

/// Project a line from WGS84 to local meters
///
/// # Arguments
/// * `coords` - Line coordinates in WGS84 [lng, lat]
/// * `center` - The center point of the projection [lng, lat]
pub fn project_line_to_local(coords: &[[f64; 2]], center: [f64; 2]) -> Vec<[f64; 2]> {
    coords
        .iter()
        .map(|c| wgs84_to_local_meters(*c, center))
        .collect()
}

/// Project a line from local meters back to WGS84
///
/// # Arguments
/// * `coords` - Line coordinates in local meters [x, y]
/// * `center` - The center point of the projection [lng, lat]
pub fn project_line_to_wgs84(coords: &[[f64; 2]], center: [f64; 2]) -> Vec<[f64; 2]> {
    coords
        .iter()
        .map(|c| local_meters_to_wgs84(*c, center))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn test_bearing() {
        // New York to LA (roughly west)
        let ny = [-74.006, 40.7128];
        let la = [-118.2437, 34.0522];
        let b = bearing(ny, la);
        assert!(b < 0.0); // Westward is negative bearing
        assert!(b > -90.0);
    }

    #[test]
    fn test_distance() {
        // Approximately 100m apart
        let p1 = [0.0, 0.0];
        let p2 = [0.0009, 0.0]; // ~100m at equator
        let d = distance(p1, p2);
        assert!(d > 90.0 && d < 110.0);
    }

    #[test]
    fn test_along() {
        let line = [[0.0, 0.0], [0.001, 0.0], [0.002, 0.0]];
        let p = along(&line, 50.0);
        assert!(p[0] > 0.0 && p[0] < 0.001);
    }

    #[test]
    fn test_circle() {
        let center = [0.0, 0.0];
        let c = circle(center, 100.0, 64);
        assert_eq!(c.len(), 65); // 64 points + closing point
        assert_eq!(c[0], c[64]); // Closed ring
    }

    #[test]
    fn test_clamp_bearing() {
        assert_relative_eq!(clamp_bearing_0_180(0.0), 0.0);
        assert_relative_eq!(clamp_bearing_0_180(180.0), 0.0);
        assert_relative_eq!(clamp_bearing_0_180(-90.0), 90.0);
        assert_relative_eq!(clamp_bearing_0_180(270.0), 90.0);
    }
}

#[cfg(test)]
mod rotation_tests {
    use super::*;

    #[test]
    fn test_rotate_point_zero() {
        // Rotating by 0 should return the same point
        let point = [12.068532, 57.774809];
        let pivot = [12.069111625, 57.77518975];

        let rotated = rotate_point(point, pivot, 0.0);

        assert!((rotated[0] - point[0]).abs() < 1e-6, "X should match");
        assert!((rotated[1] - point[1]).abs() < 1e-6, "Y should match");
    }

    #[test]
    fn test_destination_roundtrip() {
        let origin = [12.069111625, 57.77518975];
        let target = [12.068532, 57.774809];

        // Get distance and bearing from origin to target
        let dist = distance(origin, target);
        let brng = bearing(origin, target);

        // Use destination to get back to target
        let result = destination(origin, dist, brng);

        assert!((result[0] - target[0]).abs() < 1e-6, "Longitude mismatch");
        assert!((result[1] - target[1]).abs() < 1e-6, "Latitude mismatch");
    }
}
