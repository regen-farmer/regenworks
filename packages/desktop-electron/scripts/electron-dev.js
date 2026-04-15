#!/usr/bin/env node
/**
 * Launch Electron for dev.
 *
 * Orchestrates:
 *   1. `@rw/frontend` vite dev server (HMR). Runs on port 10100 by default.
 *   2. Electron, launched once the dev server answers. Points at the dev URL.
 *
 * Electron's renderer now loads directly from vite dev over HTTP — no SSR,
 * no bundle rebuild loop, full HMR when you edit files in packages/frontend/src.
 * Packaged builds still use the `app://` protocol and consume the built SPA
 * from extraResources (see main.ts).
 *
 * Env quirks: Terminals set ELECTRON_RUN_AS_NODE=1
 * which makes Electron run as plain Node.js. pnpm bin shims set NODE_PATH
 * which shadows Electron's module resolution. Both are stripped below.
 */
const proc = require("child_process");
const path = require("path");
const net = require("node:net");

const electronPath = require("electron"); // binary path
const pkgRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(pkgRoot, "..", "..");

const DEV_PORT = Number(process.env.FRONTEND_DEV_PORT || 10100);
const DEV_URL = process.env.FRONTEND_DEV_URL || `http://localhost:${DEV_PORT}`;

const env = { ...process.env, FRONTEND_DEV_URL: DEV_URL };
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

// 1. Start the @rw/frontend dev server.
console.log(`[electron-dev] starting @rw/frontend dev on :${DEV_PORT}…`);
viteChild = proc.spawn(
	"pnpm",
	["--filter", "@rw/frontend", "dev"],
	{ cwd: repoRoot, stdio: "inherit", env },
);
viteChild.on("error", (err) => {
	console.error("[electron-dev] vite dev spawn error:", err);
	shutdown("SIGTERM");
	process.exit(1);
});
viteChild.on("close", (code) => {
	if (!shuttingDown) {
		console.error(`[electron-dev] vite dev exited (${code}); shutting down`);
		shutdown("SIGTERM");
		process.exit(code ?? 1);
	}
});

// 2. Wait for the dev server to accept connections, then launch Electron.
// Use `localhost` so the socket probe follows Node's DNS resolution — vite 8
// often binds IPv6 only on macOS, and a hardcoded 127.0.0.1 probe would hang.
function waitForPort(port, host = "localhost", timeoutMs = 120_000) {
	return new Promise((resolve, reject) => {
		const startedAt = Date.now();
		const tryConnect = () => {
			if (shuttingDown) return;
			const sock = new net.Socket();
			sock.setTimeout(500);
			sock.once("connect", () => {
				sock.destroy();
				resolve();
			});
			sock.once("error", () => {
				sock.destroy();
				retry();
			});
			sock.once("timeout", () => {
				sock.destroy();
				retry();
			});
			sock.connect(port, host);
		};
		const retry = () => {
			if (Date.now() - startedAt > timeoutMs) {
				reject(new Error(`timed out waiting for ${host}:${port}`));
				return;
			}
			setTimeout(tryConnect, 200);
		};
		tryConnect();
	});
}

(async () => {
	try {
		await waitForPort(DEV_PORT);
	} catch (err) {
		console.error("[electron-dev]", err);
		shutdown("SIGTERM");
		process.exit(1);
	}
	if (shuttingDown) return;

	console.log(`[electron-dev] launching Electron against ${DEV_URL}`);
	electronChild = proc.spawn(electronPath, ["."], { cwd: pkgRoot, stdio: "inherit", env });
	electronChild.on("error", (err) => console.error("[electron-dev] electron spawn error:", err));
	electronChild.on("close", (code) => {
		shutdown("SIGTERM");
		process.exit(code ?? 0);
	});
})();
