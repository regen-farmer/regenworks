//! Tauri IPC commands for layout generation
//!
//! These commands are called from the frontend via Tauri's invoke system.

use gis_rs::{LayoutRequest, SystemDesign};

/// Generate a layout using the native Rust + GEOS engine
///
/// This is the main command called from the frontend for fast layout generation.
/// It uses the gis-rs library with native GEOS for ~20-50ms performance.
#[tauri::command]
pub async fn generate_layout(
    systemdesign: SystemDesign,
    field_geometry: String,
) -> Result<serde_json::Value, String> {
    let request = LayoutRequest {
        systemdesign,
        field_geometry,
    };

    let response = gis_rs::process_layout_request(&request);

    // Convert to JSON value for flexible frontend consumption
    serde_json::to_value(&response).map_err(|e| format!("Serialization error: {}", e))
}

/// Get the version of the layout engine
#[tauri::command]
pub fn get_engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Health check command
#[tauri::command]
pub fn health_check() -> bool {
    true
}
