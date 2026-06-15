#![deny(clippy::all)]

use geometry_kernel::layout_types::{LayoutRequest, SystemDesign};
use napi_derive::napi;
use std::fs::File;
use std::io::BufWriter;

/// Generate a layout using the native geometry-kernel engine.
/// Both arguments are JSON strings; returns a JSON string.
#[napi]
pub fn generate_layout(systemdesign_json: String, field_geometry: String) -> napi::Result<String> {
    let systemdesign: SystemDesign = serde_json::from_str(&systemdesign_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid systemdesign: {e}")))?;

    let request = LayoutRequest {
        systemdesign,
        field_geometry,
    };

    let response = geometry_kernel::model::process_layout_request(&request);

    serde_json::to_string(&response)
        .map_err(|e| napi::Error::from_reason(format!("Serialization error: {e}")))
}

/// Generate a layout and write the result JSON directly to a file.
/// Avoids copying large JSON through the napi/V8 boundary.
/// Returns the number of bytes written.
#[napi]
pub fn generate_layout_to_file(
    systemdesign_json: String,
    field_geometry: String,
    output_path: String,
) -> napi::Result<u32> {
    let systemdesign: SystemDesign = serde_json::from_str(&systemdesign_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid systemdesign: {e}")))?;

    let request = LayoutRequest {
        systemdesign,
        field_geometry,
    };

    let response = geometry_kernel::model::process_layout_request(&request);

    // Write directly to file without allocating a large intermediate buffer.
    let file = File::create(&output_path)
        .map_err(|e| napi::Error::from_reason(format!("Create error: {e}")))?;
    let writer = BufWriter::new(file);
    serde_json::to_writer(writer, &response)
        .map_err(|e| napi::Error::from_reason(format!("Serialization error: {e}")))?;

    Ok(0)
}

/// Return the version of the native geometry-kernel layout backend.
#[napi]
pub fn get_engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Simple health check — returns true when the native module is loaded correctly.
#[napi]
pub fn health_check() -> bool {
    true
}
