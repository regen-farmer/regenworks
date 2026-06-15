//! Geometry utility functions
//!
//! Rust implementations of Turf.js geometry helpers like `along`, `circle`,
//! `bearing`, `destination`, etc.

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

pub fn rhumb_distance(start: [f64; 2], end: [f64; 2]) -> f64 {
    let phi1 = to_radians(start[1]);
    let phi2 = to_radians(end[1]);
    let delta_phi = phi2 - phi1;
    let mut delta_lambda = (to_radians(end[0]) - to_radians(start[0])).abs();

    if delta_lambda > PI {
        delta_lambda -= 2.0 * PI;
    }

    let delta_psi = ((phi2 / 2.0 + PI / 4.0).tan() / (phi1 / 2.0 + PI / 4.0).tan()).ln();
    let q = if delta_psi.abs() > 1.0e-11 {
        delta_phi / delta_psi
    } else {
        phi1.cos()
    };
    let delta = (delta_phi * delta_phi + q * q * delta_lambda * delta_lambda).sqrt();

    delta * EARTH_RADIUS
}

pub fn rhumb_bearing(start: [f64; 2], end: [f64; 2]) -> f64 {
    let phi1 = to_radians(start[1]);
    let phi2 = to_radians(end[1]);
    let mut delta_lambda = to_radians(end[0] - start[0]);

    if delta_lambda > PI {
        delta_lambda -= 2.0 * PI;
    }
    if delta_lambda < -PI {
        delta_lambda += 2.0 * PI;
    }

    let delta_psi = ((phi2 / 2.0 + PI / 4.0).tan() / (phi1 / 2.0 + PI / 4.0).tan()).ln();
    to_degrees(delta_lambda.atan2(delta_psi))
}

pub fn rhumb_destination(origin: [f64; 2], distance_m: f64, bearing_deg: f64) -> [f64; 2] {
    let delta = distance_m / EARTH_RADIUS;
    let lambda1 = to_radians(origin[0]);
    let phi1 = to_radians(origin[1]);
    let theta = to_radians(bearing_deg);

    let delta_phi = delta * theta.cos();
    let mut phi2 = phi1 + delta_phi;

    if phi2.abs() > PI / 2.0 {
        phi2 = if phi2 > 0.0 { PI - phi2 } else { -PI - phi2 };
    }

    let delta_psi = ((phi2 / 2.0 + PI / 4.0).tan() / (phi1 / 2.0 + PI / 4.0).tan()).ln();
    let q = if delta_psi.abs() > 1.0e-11 {
        delta_phi / delta_psi
    } else {
        phi1.cos()
    };
    let delta_lambda = delta * theta.sin() / q;
    let lambda2 = lambda1 + delta_lambda;

    [wrap_longitude(to_degrees(lambda2)), to_degrees(phi2)]
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

pub fn rotate_point_rhumb(point: [f64; 2], pivot: [f64; 2], angle_deg: f64) -> [f64; 2] {
    if (point[0] - pivot[0]).abs() < 1e-12 && (point[1] - pivot[1]).abs() < 1e-12 {
        return point;
    }

    let dist = rhumb_distance(pivot, point);
    let new_bearing = rhumb_bearing(pivot, point) + angle_deg;
    rhumb_destination(pivot, dist, new_bearing)
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

pub fn rotate_line_rhumb(coords: &[[f64; 2]], pivot: [f64; 2], angle_deg: f64) -> Vec<[f64; 2]> {
    coords
        .iter()
        .map(|point| rotate_point_rhumb(*point, pivot, angle_deg))
        .collect()
}

fn wrap_longitude(longitude: f64) -> f64 {
    (longitude + 540.0).rem_euclid(360.0) - 180.0
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

fn acos_clamped(value: f64) -> f64 {
    if value > 1.0 {
        0.0
    } else if value < -1.0 {
        PI
    } else {
        value.acos()
    }
}

fn asin_clamped(value: f64) -> f64 {
    if value > 1.0 {
        PI / 2.0
    } else if value < -1.0 {
        -PI / 2.0
    } else {
        value.asin()
    }
}

fn d3_wrap_radians(lambda: f64) -> f64 {
    let tau = 2.0 * PI;
    if lambda > PI {
        lambda - tau
    } else if lambda < -PI {
        lambda + tau
    } else {
        lambda
    }
}

fn d3_rotation_lambda_forward(lambda: f64, phi: f64, delta_lambda: f64) -> [f64; 2] {
    [d3_wrap_radians(lambda + delta_lambda), phi]
}

fn d3_rotation_lambda_invert(lambda: f64, phi: f64, delta_lambda: f64) -> [f64; 2] {
    [d3_wrap_radians(lambda - delta_lambda), phi]
}

fn d3_rotation_phi_forward(lambda: f64, phi: f64, delta_phi: f64) -> [f64; 2] {
    let cos_delta_phi = delta_phi.cos();
    let sin_delta_phi = delta_phi.sin();
    let cos_phi = phi.cos();
    let x = lambda.cos() * cos_phi;
    let y = lambda.sin() * cos_phi;
    let z = phi.sin();
    let k = z * cos_delta_phi + x * sin_delta_phi;

    [
        y.atan2(x * cos_delta_phi - z * sin_delta_phi),
        asin_clamped(k),
    ]
}

fn d3_rotation_phi_invert(lambda: f64, phi: f64, delta_phi: f64) -> [f64; 2] {
    let cos_delta_phi = delta_phi.cos();
    let sin_delta_phi = delta_phi.sin();
    let cos_phi = phi.cos();
    let x = lambda.cos() * cos_phi;
    let y = lambda.sin() * cos_phi;
    let z = phi.sin();

    [
        y.atan2(x * cos_delta_phi + z * sin_delta_phi),
        asin_clamped(z * cos_delta_phi - x * sin_delta_phi),
    ]
}

fn d3_rotate_forward(lambda: f64, phi: f64, delta_lambda: f64, delta_phi: f64) -> [f64; 2] {
    let rotated = if delta_lambda != 0.0 {
        d3_rotation_lambda_forward(lambda, phi, delta_lambda)
    } else {
        [d3_wrap_radians(lambda), phi]
    };

    if delta_phi != 0.0 {
        d3_rotation_phi_forward(rotated[0], rotated[1], delta_phi)
    } else {
        rotated
    }
}

fn d3_rotate_invert(lambda: f64, phi: f64, delta_lambda: f64, delta_phi: f64) -> [f64; 2] {
    let rotated = if delta_phi != 0.0 {
        d3_rotation_phi_invert(lambda, phi, delta_phi)
    } else {
        [lambda, phi]
    };

    if delta_lambda != 0.0 {
        d3_rotation_lambda_invert(rotated[0], rotated[1], delta_lambda)
    } else {
        [d3_wrap_radians(rotated[0]), rotated[1]]
    }
}

fn d3_azimuthal_equidistant_raw(lambda: f64, phi: f64) -> [f64; 2] {
    let cos_lambda = lambda.cos();
    let cos_phi = phi.cos();
    let c = acos_clamped(cos_lambda * cos_phi);
    let k = if c != 0.0 { c / c.sin() } else { 0.0 };

    [k * cos_phi * lambda.sin(), k * phi.sin()]
}

fn d3_azimuthal_equidistant_raw_invert(x: f64, y: f64) -> [f64; 2] {
    let z = (x * x + y * y).sqrt();
    let sc = z.sin();
    let cc = z.cos();

    [
        (x * sc).atan2(z * cc),
        asin_clamped(if z != 0.0 { y * sc / z } else { 0.0 }),
    ]
}

/// Project a coordinate the same way Turf 7.x prepares geometries for buffer().
///
/// Turf's buffer implementation uses @turf/center to choose a bbox center, then
/// d3-geo's azimuthal equidistant projection with Turf's spherical earth radius.
/// Matching that projection is important for row clipping parity with Turf/JSTS.
pub fn turf_buffer_project(coord: [f64; 2], center: [f64; 2]) -> [f64; 2] {
    let delta_lambda = to_radians((-center[0]) % 360.0);
    let delta_phi = to_radians((-center[1]) % 360.0);
    let rotated = d3_rotate_forward(
        to_radians(coord[0]),
        to_radians(coord[1]),
        delta_lambda,
        delta_phi,
    );
    let raw = d3_azimuthal_equidistant_raw(rotated[0], rotated[1]);

    [raw[0] * EARTH_RADIUS + 480.0, 250.0 - raw[1] * EARTH_RADIUS]
}

/// Inverse of turf_buffer_project().
pub fn turf_buffer_unproject(coord: [f64; 2], center: [f64; 2]) -> [f64; 2] {
    let delta_lambda = to_radians((-center[0]) % 360.0);
    let delta_phi = to_radians((-center[1]) % 360.0);
    let raw = d3_azimuthal_equidistant_raw_invert(
        (coord[0] - 480.0) / EARTH_RADIUS,
        (250.0 - coord[1]) / EARTH_RADIUS,
    );
    let rotated = d3_rotate_invert(raw[0], raw[1], delta_lambda, delta_phi);

    [to_degrees(rotated[0]), to_degrees(rotated[1])]
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
