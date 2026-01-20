//! GIS Layout Modelling Library
//!
//! Rust implementation of the RegenWorks layout modelling system.
//! Provides high-performance geometry operations for farm planning.

pub mod geometry;
pub mod ground_cover;
pub mod headland;
pub mod layout;
pub mod make_line;
pub mod strip_polygons;
pub mod tree_rows;
pub mod types;

pub use layout::{process_layout_request, system_based_layout};
pub use types::*;
