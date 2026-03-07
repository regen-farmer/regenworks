//! Type definitions for layout modelling
//!
//! These types mirror the TypeScript interfaces in the original implementation.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Input: System design configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemDesign {
    /// Row definitions
    pub rows: Vec<RowDefinition>,
    /// Row orientation in degrees (0-360)
    pub bearing: f64,
    /// Buffer inset from field edge in meters
    #[serde(default)]
    pub margin: f64,
    /// Headland width at ends perpendicular to rows in meters
    #[serde(default)]
    pub headland: f64,
}

/// Row definition within a system design
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowDefinition {
    /// Sequence of species in this row
    pub sequence: Vec<SequenceEntry>,
    /// Headland offset at start/end of row
    #[serde(default)]
    pub offset: Option<RowOffset>,
    /// Ground cover species for alley between this row and the next
    #[serde(default)]
    pub groundcover: Option<SpeciesRef>,
    /// Width of this row strip in meters
    pub width: f64,
}

/// Offset configuration for a row
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowOffset {
    /// Offset from start of row in meters
    #[serde(default)]
    pub before: Option<f64>,
    /// Offset from end of row in meters
    #[serde(default)]
    pub after: Option<f64>,
}

/// Entry in a planting sequence
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SequenceEntry {
    /// Species reference (can be full object or just ID)
    #[serde(default)]
    pub species: Option<SpeciesRef>,
    /// Spacing to next tree in meters
    pub spacing_after: f64,
}

/// Reference to a species (can be ID string or full object)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SpeciesRef {
    /// Just the ID string
    Id(String),
    /// Full species object
    Object(SpeciesObject),
}

impl SpeciesRef {
    /// Get the species ID
    pub fn id(&self) -> &str {
        match self {
            SpeciesRef::Id(id) => id,
            SpeciesRef::Object(obj) => obj.id(),
        }
    }

    /// Get the common name if available
    pub fn name(&self) -> Option<&str> {
        match self {
            SpeciesRef::Id(_) => None,
            SpeciesRef::Object(obj) => Some(&obj.name_common),
        }
    }
}

/// Full species object
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeciesObject {
    /// MongoDB ObjectId (can be _id or id)
    #[serde(alias = "_id", default)]
    pub id: Option<String>,
    /// Common name
    #[serde(default)]
    pub name_common: String,
    /// Genus
    #[serde(default)]
    pub genus: Option<String>,
    /// Species
    #[serde(default)]
    pub species: Option<String>,
}

impl SpeciesObject {
    /// Get the ID, preferring _id over id
    pub fn id(&self) -> &str {
        self.id.as_deref().unwrap_or("")
    }
}

// =============================================================================
// Output types
// =============================================================================

/// Output: Complete layout result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemBasedLayout {
    /// Species count summary
    pub species_count_array: Vec<SpeciesCount>,
    /// Headland buffer polygons
    pub headland_sides: Vec<GeoJsonFeature>,
    /// Sides of headland polygon close to bearing
    pub sides_close_to_bearing: Vec<GeoJsonFeature>,
    /// Tree row lines
    pub tree_row_lines: Vec<TreeRowLine>,
    /// Headland polygon (planting area after headland applied)
    pub headland_polygon: GeoJsonFeature,
    /// Margin polygon (field after margin inset)
    pub margin_polygon: GeoJsonFeature,
    /// Ground cover area polygons
    pub ground_cover_areas: Vec<GeoJsonFeature>,
    /// Intersection points (for debugging/visualization)
    pub intersection_points: Vec<GeoJsonFeature>,
    /// Individual tree markers
    pub tree_marker_array: Vec<TreeMarker>,
    /// Ground cover areas in square meters by species ID
    pub ground_cover_areas_m2: HashMap<String, f64>,
    /// Strip polygons for all rows
    #[serde(default)]
    pub strip_polygons: Vec<GeoJsonFeature>,
    /// Strip areas in square meters
    #[serde(default)]
    pub strip_areas_m2: Vec<f64>,
}

/// Species count entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeciesCount {
    /// Species reference
    pub species: SpeciesRef,
    /// Number of trees
    pub count: u32,
}

/// Tree row line with system design index
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeRowLine {
    /// The line geometry
    pub line: GeoJsonFeature,
    /// Index into system design rows array
    pub system_design_row_index: usize,
}

/// Individual tree marker
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeMarker {
    /// Species for this tree
    pub species: SpeciesRef,
    /// Point location
    pub point: GeoJsonFeature,
    /// Circle polygon for visualization (omitted when not needed to reduce payload size)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub circle: Option<GeoJsonFeature>,
}

/// GeoJSON Feature wrapper
/// We use serde_json::Value for flexibility with different geometry types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoJsonFeature {
    #[serde(rename = "type")]
    pub feature_type: String,
    pub geometry: serde_json::Value,
    #[serde(default)]
    pub properties: Option<serde_json::Value>,
}

impl GeoJsonFeature {
    /// Create a new GeoJSON Feature
    pub fn new(geometry: serde_json::Value, properties: Option<serde_json::Value>) -> Self {
        Self {
            feature_type: "Feature".to_string(),
            geometry,
            properties,
        }
    }

    /// Create a Point feature
    pub fn point(coords: [f64; 2], properties: Option<serde_json::Value>) -> Self {
        Self::new(
            serde_json::json!({
                "type": "Point",
                "coordinates": coords
            }),
            properties,
        )
    }

    /// Create a LineString feature
    pub fn line_string(coords: Vec<[f64; 2]>, properties: Option<serde_json::Value>) -> Self {
        Self::new(
            serde_json::json!({
                "type": "LineString",
                "coordinates": coords
            }),
            properties,
        )
    }

    /// Create a Polygon feature
    pub fn polygon(rings: Vec<Vec<[f64; 2]>>, properties: Option<serde_json::Value>) -> Self {
        Self::new(
            serde_json::json!({
                "type": "Polygon",
                "coordinates": rings
            }),
            properties,
        )
    }
}

// =============================================================================
// API Request/Response types
// =============================================================================

/// API request body
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutRequest {
    /// System design configuration
    pub systemdesign: SystemDesign,
    /// Field geometry as GeoJSON string
    #[serde(alias = "field_geometry")]
    #[serde(rename = "fieldGeometry")]
    pub field_geometry: String,
}

/// API response body
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutResponse {
    /// Whether the request was successful
    pub success: bool,
    /// Layout result (if successful)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<SystemBasedLayout>,
    /// Error message (if failed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Timing information in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing_ms: Option<f64>,
}

impl LayoutResponse {
    /// Create a successful response
    pub fn success(data: SystemBasedLayout, timing_ms: f64) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            timing_ms: Some(timing_ms),
        }
    }

    /// Create an error response
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
            timing_ms: None,
        }
    }
}
