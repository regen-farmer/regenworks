# RegenWorks Tauri Desktop

This package is currently disabled and excluded from the pnpm workspace while
the frontend split and Electron desktop path are active.

Do not publish or re-enable the Tauri build until the upstream Tauri dependency
tree no longer resolves to vulnerable `glib` 0.18.x and `rand` 0.7.x transitive
crates. When re-enabling this package, regenerate `src-tauri/Cargo.lock` from a
patched Tauri stack and restore the release workflow intentionally.
