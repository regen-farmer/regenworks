//! GIS Layout Modelling Library
//!
//! Rust implementation of the RegenWorks layout modelling system.
//! Provides high-performance geometry operations for farm planning.
//!
//! This library can be compiled in two modes:
//! - `native` (default): Uses native GEOS library, runs as HTTP server
//! - `wasm`: Uses geos-wasm via JavaScript bridge, runs in browser

pub mod geometry;
pub mod ground_cover;
pub mod headland;
pub mod layout;
pub mod make_line;
pub mod strip_polygons;
pub mod tree_rows;
pub mod types;

// WASM-specific module for geometry operations via JS bridge
#[cfg(feature = "wasm")]
pub mod wasm_geo_ops;

// WASM entry point
#[cfg(feature = "wasm")]
pub mod wasm_entry;

pub use layout::{process_layout_request, system_based_layout};
pub use types::*;
