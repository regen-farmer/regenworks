#!/usr/bin/env node
/**
 * Launch Electron for dev.
 *
 * Orchestrates:
 *   1. An initial isomorphic SPA build (`pnpm --filter isomorphic build:spa`).
 *      Once that's done ../isomorphic/dist/client/ contains `_shell.html` + the
 *      JS/CSS bundles that main.ts serves via the `app://` protocol.
 *   2. Launch Electron.
 *   3. A debounced rebuild loop: watch ../isomorphic/src/ and re-run the full
 *      build on change. Sequential full builds avoid the parallel-env race in
 *      `vite build --watch` that leaves the `tanstack-start:start-manifest-plugin`
 *      without a client bundle to read.
 *
 * Env quirks: VS Code / Claude Desktop terminals set ELECTRON_RUN_AS_NODE=1,
 * which makes Electron run as plain Node.js. pnpm bin shims set NODE_PATH
 * which shadows Electron's module resolution. Both are stripped below.
 */
const proc = require("child_process");
const path = require("path");
const fs = require("fs");

const electronPath = require("electron"); // binary path
const pkgRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(pkgRoot, "..", "..");
const isoRoot = path.resolve(pkgRoot, "..", "isomorphic");
const isoSrc = path.join(isoRoot, "src");
const isoShell = path.join(isoRoot, "dist", "client", "_shell.html");

const env = { ...process.env };
delete env.NODE_PATH;
delete env.ELECTRON_RUN_AS_NODE;

let electronChild = null;
let buildChild = null;
let watcher = null;
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  const sig = signal || "SIGTERM";
  if (electronChild && !electronChild.killed) electronChild.kill(sig);
  if (buildChild && !buildChild.killed) buildChild.kill(sig);
  if (watcher) watcher.close();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function runBuild(label, variant = "full") {
  return new Promise((resolve) => {
    if (shuttingDown) return resolve(1);
    console.log(`[electron-dev] ${label}`);
    const startedAt = Date.now();
    const script = variant === "client" ? "build:spa:client" : "build:spa";
    buildChild = proc.spawn(
      "pnpm",
      ["--filter", "isomorphic", script],
      { cwd: repoRoot, stdio: "inherit", env },
    );
    buildChild.on("error", (err) => {
      console.error("[electron-dev] build spawn error:", err);
      resolve(1);
    });
    buildChild.on("close", (code) => {
      buildChild = null;
      if (code === 0) {
        console.log(`[electron-dev] build ok in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      } else {
        console.error(`[electron-dev] build exited with ${code}`);
      }
      resolve(code ?? 0);
    });
  });
}

function launchElectron() {
  console.log("[electron-dev] launching Electron");
  electronChild = proc.spawn(electronPath, ["."], { cwd: pkgRoot, stdio: "inherit", env });
  electronChild.on("error", (err) => console.error("[electron-dev] electron spawn error:", err));
  electronChild.on("close", (code) => {
    shutdown("SIGTERM");
    process.exit(code ?? 0);
  });
}

const REBUILD_DEBOUNCE_MS = 200;
let rebuildTimer = null;
let rebuildInFlight = false;
let rebuildQueued = false;

function scheduleRebuild() {
  if (shuttingDown) return;
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(async () => {
    rebuildTimer = null;
    if (rebuildInFlight) {
      rebuildQueued = true;
      return;
    }
    rebuildInFlight = true;
    await runBuild("rebuilding client on change…", "client");
    rebuildInFlight = false;
    if (rebuildQueued) {
      rebuildQueued = false;
      scheduleRebuild();
    }
  }, REBUILD_DEBOUNCE_MS);
}

function startWatcher() {
  if (!fs.existsSync(isoSrc)) {
    console.warn(`[electron-dev] ${isoSrc} not found; no rebuild on change`);
    return;
  }
  watcher = fs.watch(isoSrc, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    // Ignore editor noise and generated files.
    if (filename.endsWith("~") || filename.startsWith(".")) return;
    if (filename === "routeTree.gen.ts") return;
    scheduleRebuild();
  });
  console.log(`[electron-dev] watching ${isoSrc}`);
}

(async () => {
  const initialCode = await runBuild("initial SPA build…");
  if (initialCode !== 0 || !fs.existsSync(isoShell)) {
    console.error(`[electron-dev] initial build failed; expected ${isoShell}`);
    shutdown("SIGTERM");
    process.exit(initialCode || 1);
  }
  launchElectron();
  startWatcher();
})();
