#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUST_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-1.91.0}"
WASM_PACK_VERSION="${WASM_PACK_VERSION:-0.15.0}"

if ! command -v rustup >/dev/null 2>&1; then
	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- \
		-y \
		--profile minimal \
		--default-toolchain "$RUST_TOOLCHAIN"
fi

if [ -f "$HOME/.cargo/env" ]; then
	# shellcheck disable=SC1091
	. "$HOME/.cargo/env"
fi

rustup toolchain install "$RUST_TOOLCHAIN" --profile minimal
rustup target add wasm32-unknown-unknown --toolchain "$RUST_TOOLCHAIN"

if ! command -v wasm-pack >/dev/null 2>&1 ||
	[ "$(wasm-pack --version)" != "wasm-pack ${WASM_PACK_VERSION}" ]; then
	cargo +"$RUST_TOOLCHAIN" install wasm-pack --locked --version "$WASM_PACK_VERSION" --force
fi

cd "$REPO_ROOT/packages/modelling/layout-geometry-kernel"
wasm-pack build --target web --out-dir pkg -- --no-default-features --features wasm
