//! WASM entry point for the GIS layout library
//!
//! This module provides the WebAssembly interface for the layout modelling system.

#![cfg(feature = "wasm")]

use crate::layout::system_based_layout;
use crate::types::{LayoutRequest, LayoutResponse, SystemDesign};
use wasm_bindgen::prelude::*;

/// Initialize panic hook for better error messages in browser console
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Process a layout request from JavaScript
///
/// Takes a JSON string containing the layout request and returns a JSON string
/// containing the layout response.
#[wasm_bindgen]
pub fn process_layout(request_json: &str) -> String {
    let start = instant::Instant::now();

    // Parse the request
    let request: LayoutRequest = match serde_json::from_str(request_json) {
        Ok(req) => req,
        Err(e) => {
            return serde_json::to_string(&LayoutResponse::error(format!("Parse error: {}", e)))
                .unwrap_or_else(|_| {
                    r#"{"success":false,"error":"Serialization error"}"#.to_string()
                });
        }
    };

    // Process the layout
    match system_based_layout(&request.systemdesign, &request.field_geometry) {
        Ok(layout) => {
            let timing_ms = start.elapsed().as_secs_f64() * 1000.0;
            serde_json::to_string(&LayoutResponse::success(layout, timing_ms)).unwrap_or_else(
                |_| r#"{"success":false,"error":"Serialization error"}"#.to_string(),
            )
        }
        Err(e) => serde_json::to_string(&LayoutResponse::error(e))
            .unwrap_or_else(|_| r#"{"success":false,"error":"Serialization error"}"#.to_string()),
    }
}

/// Get the library version
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
