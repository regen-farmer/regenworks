//! RegenWorks Desktop Library
//!
//! This library provides the Tauri application setup and command handlers.

mod commands;

use std::sync::{Arc, Mutex};
use tauri::Manager;

/// Computed layout JSON bytes, stored here after `generate_layout` runs so JS
/// can retrieve them via `rwlayout://` without a second WKWebView IPC round-trip.
pub struct LayoutCache(pub Arc<Mutex<Option<Vec<u8>>>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cache: Arc<Mutex<Option<Vec<u8>>>> = Arc::new(Mutex::new(None));
    let cache_for_protocol = cache.clone();

    tauri::Builder::default()
        .manage(LayoutCache(cache))
        // JS fetches `rwlayout://localhost/layout` after invoke completes.
        // Response goes through the OS URL loading mechanism, not the WKWebView
        // postMessage bridge — so 9.47MB transfers in ~10ms instead of ~600ms.
        .register_uri_scheme_protocol("rwlayout", move |_app, _request| {
            let data = cache_for_protocol.lock().unwrap().take().unwrap_or_default();
            tauri::http::Response::builder()
                .header("Content-Type", "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(data)
                .unwrap()
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::generate_layout,
            commands::get_engine_version,
            commands::health_check,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
