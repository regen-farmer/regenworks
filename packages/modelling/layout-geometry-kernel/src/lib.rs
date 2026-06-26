//! Private RegenWorks layout adapter backed by the published geometry-kernel crate.

pub mod geometry;
pub mod make_line;
pub mod types;

#[cfg(feature = "wasm")]
pub mod wasm_entry;
#[cfg(any(feature = "native", feature = "wasm"))]
pub mod wasm_geo_ops;
#[cfg(any(feature = "native", feature = "wasm"))]
pub mod wasm_layout;

pub use types::*;

#[cfg(any(feature = "native", feature = "wasm"))]
pub use wasm_layout::{process_layout_request, system_based_layout};
