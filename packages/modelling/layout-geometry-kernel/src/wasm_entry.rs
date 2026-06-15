//! WASM entry point for the geometry-kernel layout adapter.

#![cfg(feature = "wasm")]

use crate::types::{LayoutRequest, LayoutResponse};
use crate::wasm_layout::system_based_layout;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn process_layout(request_json: &str) -> String {
    let start = instant::Instant::now();

    let request: LayoutRequest = match serde_json::from_str(request_json) {
        Ok(request) => request,
        Err(error) => {
            return serde_json::to_string(&LayoutResponse::error(format!("Parse error: {error}")))
                .unwrap_or_else(|_| {
                    r#"{"success":false,"error":"Serialization error"}"#.to_string()
                });
        }
    };

    match system_based_layout(&request.systemdesign, &request.field_geometry) {
        Ok(layout) => {
            let timing_ms = start.elapsed().as_secs_f64() * 1000.0;
            serde_json::to_string(&LayoutResponse::success(layout, timing_ms)).unwrap_or_else(
                |_| r#"{"success":false,"error":"Serialization error"}"#.to_string(),
            )
        }
        Err(error) => serde_json::to_string(&LayoutResponse::error(error))
            .unwrap_or_else(|_| r#"{"success":false,"error":"Serialization error"}"#.to_string()),
    }
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
