/**
 * Platform detection utilities
 *
 * Helps determine the runtime environment (web browser, Tauri desktop, etc.)
 */

/**
 * Check if we're running inside a Tauri desktop application
 */
export function isTauri(): boolean {
	if (typeof window === "undefined") return false;
	return "__TAURI__" in window;
}

/**
 * Check if we're running in a browser environment
 */
export function isBrowser(): boolean {
	return typeof window !== "undefined";
}

/**
 * Check if we're running on the server (SSR)
 */
export function isServer(): boolean {
	return typeof window === "undefined";
}

/**
 * Get the current platform name
 */
export function getPlatform(): "tauri" | "browser" | "server" {
	if (isServer()) return "server";
	if (isTauri()) return "tauri";
	return "browser";
}

/**
 * Test utilities for Tauri native layout engine
 * Call these from DevTools console: window.testTauri.testLayout()
 */
export function initTauriTestUtils() {
	if (!isBrowser() || !isTauri()) return;

	const testUtils = {
		// Simple health check
		async healthCheck() {
			const { invoke } = await import("@tauri-apps/api/core");
			const result = await invoke<boolean>("health_check");
			console.log("Health check:", result ? "OK" : "FAILED");
			return result;
		},

		// Get engine version
		async version() {
			const { invoke } = await import("@tauri-apps/api/core");
			const version = await invoke<string>("get_engine_version");
			console.log("Engine version:", version);
			return version;
		},

		// Test layout generation with sample data
		async testLayout() {
			const { invoke } = await import("@tauri-apps/api/core");

			// Sample field geometry (simple rectangle in WGS84)
			const fieldGeometry = JSON.stringify({
				type: "Feature",
				properties: {},
				geometry: {
					type: "Polygon",
					coordinates: [
						[
							[-1.5, 51.5],
							[-1.5, 51.502],
							[-1.497, 51.502],
							[-1.497, 51.5],
							[-1.5, 51.5],
						],
					],
				},
			});

			// Sample system design
			const systemDesign = {
				rows: [
					{
						sequence: [
							{
								species: { _id: "apple1", nameCommon: "Apple" },
								spacingAfter: 5.0,
							},
						],
						width: 3.0,
					},
					{
						sequence: [
							{
								species: { _id: "pear1", nameCommon: "Pear" },
								spacingAfter: 4.0,
							},
						],
						width: 2.5,
						groundcover: { _id: "clover1", nameCommon: "Clover" },
					},
				],
				bearing: 45.0,
				margin: 2.0,
				headland: 5.0,
			};

			console.log("Testing native layout generation...");
			console.log("System design:", systemDesign);

			const startTime = performance.now();

			try {
				const result = await invoke("generate_layout", {
					systemdesign: systemDesign,
					field_geometry: fieldGeometry,
				});

				const elapsed = performance.now() - startTime;
				console.log(`Layout generated in ${elapsed.toFixed(1)}ms`);
				console.log("Result:", result);
				return result;
			} catch (error) {
				console.error("Layout generation failed:", error);
				throw error;
			}
		},

		// Test with custom data
		async generateLayout(systemDesign: unknown, fieldGeometryGeoJSON: unknown) {
			const { invoke } = await import("@tauri-apps/api/core");

			const fieldGeometry =
				typeof fieldGeometryGeoJSON === "string"
					? fieldGeometryGeoJSON
					: JSON.stringify(fieldGeometryGeoJSON);

			const startTime = performance.now();
			const result = await invoke("generate_layout", {
				systemdesign: systemDesign,
				field_geometry: fieldGeometry,
			});
			const elapsed = performance.now() - startTime;

			console.log(`Layout generated in ${elapsed.toFixed(1)}ms`);
			return result;
		},
	};

	(window as unknown as { testTauri: typeof testUtils }).testTauri = testUtils;
	console.log("[Tauri] Test utilities available at window.testTauri");
	console.log("  - testTauri.healthCheck()");
	console.log("  - testTauri.version()");
	console.log("  - testTauri.testLayout()");
	console.log("  - testTauri.generateLayout(systemDesign, fieldGeoJSON)");

	// Initialize auto-updater after a delay
	initAutoUpdater();
}

/**
 * Initialize the auto-updater
 * Checks for updates after app startup
 */
async function initAutoUpdater(delayMs: number = 5000) {
	if (!isTauri()) return;

	setTimeout(async () => {
		try {
			// Get current version
			const { getVersion } = await import("@tauri-apps/api/app");
			const currentVersion = await getVersion();
			console.log(`[Updater] Current version: ${currentVersion}`);

			// Check for updates
			const { check } = await import("@tauri-apps/plugin-updater");
			console.log("[Updater] Checking for updates...");

			const update = await check();

			if (update) {
				console.log(`[Updater] Update available: ${update.version}`);

				const shouldInstall = window.confirm(
					`A new version (${update.version}) is available!\n\n` +
						`${update.body || "Bug fixes and improvements."}\n\n` +
						`Would you like to download and install it now?`,
				);

				if (shouldInstall) {
					console.log("[Updater] Downloading update...");

					await update.downloadAndInstall((progress) => {
						if (progress.event === "Started") {
							console.log(`[Updater] Download started`);
						} else if (progress.event === "Finished") {
							console.log("[Updater] Download complete");
						}
					});

					console.log("[Updater] Restarting app...");
					const { relaunch } = await import("@tauri-apps/plugin-process");
					await relaunch();
				}
			} else {
				console.log("[Updater] App is up to date");
			}
		} catch (error) {
			// Don't crash the app if update check fails
			console.warn("[Updater] Update check failed:", error);
		}
	}, delayMs);
}
