/**
 * Tauri Auto-Updater Integration
 *
 * Checks for updates on app startup and provides UI hooks for manual checks.
 */

/**
 * Check for updates and prompt user to install if available
 * Returns true if an update was found, false otherwise
 */
export async function checkForUpdates(): Promise<boolean> {
	// Only run in Tauri environment
	if (!("__TAURI__" in window)) {
		console.log("[Updater] Not in Tauri environment, skipping update check");
		return false;
	}

	try {
		const { check } = await import("@tauri-apps/plugin-updater");

		console.log("[Updater] Checking for updates...");
		const update = await check();

		if (update) {
			console.log(`[Updater] Update available: ${update.version}`);
			console.log(`[Updater] Release notes: ${update.body}`);

			// Prompt user to install
			const { ask } = await import("@tauri-apps/plugin-dialog");
			const shouldInstall = await ask(
				`A new version (${update.version}) is available!\n\n` +
					`${update.body || "No release notes available."}\n\n` +
					`Would you like to download and install it now?`,
				{ title: "Update Available", kind: "info" }
			);

			if (shouldInstall) {
				console.log("[Updater] User accepted, downloading update...");

				// Download and install
				await update.downloadAndInstall((progress) => {
					if (progress.event === "Started") {
						console.log(
							`[Updater] Download started, total: ${progress.data.contentLength} bytes`,
						);
					} else if (progress.event === "Progress") {
						console.log(
							`[Updater] Downloaded: ${progress.data.chunkLength} bytes`,
						);
					} else if (progress.event === "Finished") {
						console.log("[Updater] Download finished");
					}
				});

				// Restart to apply update
				console.log("[Updater] Restarting to apply update...");
				const { relaunch } = await import("@tauri-apps/plugin-process");
				await relaunch();
			} else {
				console.log("[Updater] User declined update");
			}

			return true;
		} else {
			console.log("[Updater] No updates available");
			return false;
		}
	} catch (error) {
		console.error("[Updater] Failed to check for updates:", error);
		return false;
	}
}

/**
 * Get current app version
 */
export async function getAppVersion(): Promise<string | null> {
	if (!("__TAURI__" in window)) {
		return null;
	}

	try {
		const { getVersion } = await import("@tauri-apps/api/app");
		return await getVersion();
	} catch (error) {
		console.error("[Updater] Failed to get app version:", error);
		return null;
	}
}

/**
 * Initialize updater - call this on app startup
 * Checks for updates after a short delay to not block app startup
 */
export function initUpdater(delayMs: number = 5000): void {
	if (!("__TAURI__" in window)) {
		return;
	}

	setTimeout(async () => {
		try {
			const version = await getAppVersion();
			console.log(`[Updater] Current version: ${version}`);
			await checkForUpdates();
		} catch (error) {
			console.error("[Updater] Init failed:", error);
		}
	}, delayMs);
}
