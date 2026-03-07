//! Tauri IPC commands

use gis_rs::{LayoutRequest, SystemDesign};
use crate::LayoutCache;

/// Compute the layout and store the result in `LayoutCache`.
///
/// Returns nothing through IPC (avoiding the ~600ms WKWebView overhead for
/// large payloads). JS retrieves the result via `fetch("rwlayout://localhost/layout")`
/// which goes through the OS URL loading mechanism and transfers 9.47MB in ~10ms.
#[tauri::command]
pub async fn generate_layout(
    state: tauri::State<'_, LayoutCache>,
    systemdesign: SystemDesign,
    field_geometry: String,
) -> Result<(), String> {
    let request = LayoutRequest { systemdesign, field_geometry };
    let response = gis_rs::process_layout_request(&request);
    let json_bytes = serde_json::to_vec(&response)
        .map_err(|e| format!("Serialization error: {}", e))?;
    *state.0.lock().unwrap() = Some(json_bytes);
    Ok(())
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
