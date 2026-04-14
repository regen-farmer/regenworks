#!/usr/bin/env node
/**
 * Launch Electron for dev.
 *
 * Orchestrates:
 *   1. Isomorphic SPA watcher (vite build --watch with ELECTRON_BUILD=1) in
 *      ../isomorphic. Its output lives in ../isomorphic/dist/client/ and is
 *      what main.ts serves via the app:// protocol in dev.
 *   2. Electron itself, launched once ../isomorphic/dist/client/_shell.html
 *      exists (avoids a race where Electron opens before the first build).
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
const isoShell = path.resolve(pkgRoot, "..", "isomorphic", "dist", "client", "_shell.html");

const env = { ...process.env };
delete env.NODE_PATH;
delete env.ELECTRON_RUN_AS_NODE;

let electronChild = null;
let viteChild = null;
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  const sig = signal || "SIGTERM";
  if (electronChild && !electronChild.killed) electronChild.kill(sig);
  if (viteChild && !viteChild.killed) viteChild.kill(sig);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// 1. Start the isomorphic SPA watcher. pnpm in a workspace is resolved via
// repo root.
console.log("[electron-dev] starting isomorphic SPA watcher…");
viteChild = proc.spawn(
  "pnpm",
  ["--filter", "isomorphic", "build:spa:watch"],
  { cwd: repoRoot, stdio: "inherit", env },
);
viteChild.on("error", (err) => {
  console.error("[electron-dev] vite watcher spawn error:", err);
  shutdown("SIGTERM");
  process.exit(1);
});
viteChild.on("close", (code) => {
  if (!shuttingDown) {
    console.error(`[electron-dev] vite watcher exited (${code}); shutting down`);
    shutdown("SIGTERM");
    process.exit(code ?? 1);
  }
});

// 2. Wait for _shell.html to appear, then launch Electron.
const POLL_INTERVAL_MS = 250;
const TIMEOUT_MS = 120_000;
const startedAt = Date.now();

function waitForShell() {
  if (shuttingDown) return;
  if (fs.existsSync(isoShell)) {
    console.log("[electron-dev] shell ready; launching Electron");
    electronChild = proc.spawn(electronPath, ["."], { cwd: pkgRoot, stdio: "inherit", env });
    electronChild.on("error", (err) => console.error("[electron-dev] electron spawn error:", err));
    electronChild.on("close", (code) => {
      shutdown("SIGTERM");
      process.exit(code ?? 0);
    });
    return;
  }
  if (Date.now() - startedAt > TIMEOUT_MS) {
    console.error(`[electron-dev] timed out waiting for ${isoShell}`);
    shutdown("SIGTERM");
    process.exit(1);
  }
  setTimeout(waitForShell, POLL_INTERVAL_MS);
}

waitForShell();
