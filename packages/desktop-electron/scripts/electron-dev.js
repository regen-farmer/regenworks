#!/usr/bin/env node
/**
 * Launch Electron for dev.
 *
 * VS Code / Claude Desktop set ELECTRON_RUN_AS_NODE=1 in their integrated
 * terminals, which makes Electron run as plain Node.js (no browser process).
 * We must unset it so Electron initializes properly.
 *
 * pnpm bin shims also set NODE_PATH which can shadow Electron's built-in
 * module resolution — strip that too.
 */
const proc = require("child_process");

const electronPath = require("electron"); // binary path

const env = { ...process.env };
delete env.NODE_PATH;
delete env.ELECTRON_RUN_AS_NODE;

const child = proc.spawn(electronPath, ["."], { stdio: "inherit", env });
child.on("error", (err) => console.error("[electron-dev] spawn error:", err));

child.on("close", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
