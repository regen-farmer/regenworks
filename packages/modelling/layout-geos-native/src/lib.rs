//! GIS Layout Modelling Library
//!
//! Rust implementation of the RegenWorks layout modelling system.
//! Provides high-performance geometry operations for farm planning.
//!
//! This library can be compiled in two modes:
//! - `native` (default): Uses native GEOS library, runs as HTTP server
//! - `wasm`: Uses pure Rust geometry operations, runs in browser

pub mod geometry;
#[cfg(feature = "native")]
pub mod ground_cover;
#[cfg(feature = "native")]
pub mod headland;
#[cfg(feature = "native")]
pub mod layout;
pub mod make_line;
#[cfg(feature = "native")]
pub mod strip_polygons;
#[cfg(feature = "native")]
pub mod tree_rows;
pub mod types;

#[cfg(feature = "wasm")]
pub mod wasm_geo_ops;
#[cfg(feature = "wasm")]
pub mod wasm_layout;

#[cfg(feature = "wasm")]
pub mod wasm_entry;

#[cfg(feature = "native")]
pub use layout::{process_layout_request, system_based_layout};
pub use types::*;
#[cfg(feature = "wasm")]
pub use wasm_layout::{process_layout_request, system_based_layout};
