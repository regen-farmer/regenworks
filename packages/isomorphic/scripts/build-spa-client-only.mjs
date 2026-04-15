#!/usr/bin/env node
/**
 * Fast incremental build for Electron dev: builds ONLY the client environment.
 * Skips the SSR build and the prerender step (which together cost ~half the
 * total build time). Call this on every file change after an initial full
 * `pnpm build:spa` has produced `dist/client/_shell.html`.
 *
 * `_shell.html` stays valid between client-only rebuilds because the client
 * entry filename is pinned to `assets/main.js` (no content hash) in
 * `vite.config.ts` when ELECTRON_BUILD=1.
 */
import { createBuilder } from "vite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

process.env.ELECTRON_BUILD = "1";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const startedAt = Date.now();

// The client build empties dist/client/, so we preserve `_shell.html` (created
// by the initial full `pnpm build:spa`) across rebuilds and write it back.
const shellPath = path.resolve(process.cwd(), "dist/client/_shell.html");
let shellContent = null;
if (existsSync(shellPath)) {
	shellContent = readFileSync(shellPath);
} else {
	console.error(
		"[build-spa-client-only] dist/client/_shell.html not found — run `pnpm build:spa` first",
	);
	process.exit(1);
}

const builder = await createBuilder();
const clientEnv = builder.environments.client;
if (!clientEnv) {
	console.error("[build-spa-client-only] client environment not found");
	process.exit(1);
}
await builder.build(clientEnv);

writeFileSync(shellPath, shellContent);

console.log(
	`[build-spa-client-only] built in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
);
