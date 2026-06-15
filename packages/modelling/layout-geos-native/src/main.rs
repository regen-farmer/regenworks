//! HTTP server for the layout modelling service
//!
//! Provides a REST API endpoint for generating layouts.

use axum::{
    extract::Json,
    http::StatusCode,
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use gis_rs::{
    layout::process_layout_request,
    types::{LayoutRequest, LayoutResponse},
};

/// Health check endpoint
async fn health() -> &'static str {
    "OK"
}

/// Layout generation endpoint
async fn generate_layout(Json(request): Json<LayoutRequest>) -> (StatusCode, Json<LayoutResponse>) {
    info!("Received layout request");

    let response = process_layout_request(&request);

    if response.success {
        info!(
            "Layout generated successfully in {:.2}ms",
            response.timing_ms.unwrap_or(0.0)
        );
        (StatusCode::OK, Json(response))
    } else {
        info!("Layout generation failed: {:?}", response.error);
        (StatusCode::BAD_REQUEST, Json(response))
    }
}

#[tokio::main]
async fn main() {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber).expect("Failed to set tracing subscriber");

    // Configure CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build the router
    let app = Router::new()
        .route("/health", get(health))
        .route("/layout", post(generate_layout))
        .layer(cors);

    // Run the server
    let addr = "0.0.0.0:3002";
    info!("Starting GIS layout server on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
