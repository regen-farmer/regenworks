#!/usr/bin/env node
/**
 * Populate packages/isomorphic/src/routes/_pages/ with SYMLINKS to
 * @rw/frontend/src/routes/** so TanStack Start's route crawler sees them as
 * local files (it rejects external paths in virtualRouteConfig) while letting
 * relative imports inside those files still resolve against frontend's src
 * tree. `__root.tsx` is excluded — isomorphic has its own thin re-export at
 * the routes top level.
 *
 * Destination is .gitignored — think of it as build output.
 *
 * Pass `--watch` to keep it running and re-sync when routes are added,
 * removed, or renamed in frontend. Edits to existing files don't need a
 * re-sync (the symlink resolves to the live file).
 */
import {
	existsSync,
	mkdirSync,
	rmSync,
	readdirSync,
	statSync,
	symlinkSync,
	watch,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const frontendRoutes = path.resolve(pkgRoot, "..", "frontend", "src", "routes");
const target = path.resolve(pkgRoot, "src", "routes", "_pages");

if (!existsSync(frontendRoutes)) {
	console.error(`[sync-routes] ${frontendRoutes} not found`);
	process.exit(1);
}

function linkRecursive(srcDir, dstDir, topLevel = false) {
	for (const entry of readdirSync(srcDir)) {
		if (topLevel && entry === "__root.tsx") continue;
		const srcPath = path.join(srcDir, entry);
		const dstPath = path.join(dstDir, entry);
		const st = statSync(srcPath);
		if (st.isDirectory()) {
			mkdirSync(dstPath, { recursive: true });
			linkRecursive(srcPath, dstPath);
		} else {
			symlinkSync(srcPath, dstPath);
		}
	}
}

function syncOnce() {
	if (existsSync(target)) rmSync(target, { recursive: true, force: true });
	mkdirSync(target, { recursive: true });
	linkRecursive(frontendRoutes, target, true);
	console.log(`[sync-routes] linked frontend pages → ${path.relative(pkgRoot, target)}`);
}

syncOnce();

if (process.argv.includes("--watch")) {
	// Coalesce bursts of events — editors write-then-rename, directories fire
	// multiple events, etc. One re-sync per 150ms burst is plenty.
	let timer = null;
	const schedule = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			try {
				syncOnce();
			} catch (err) {
				console.error("[sync-routes] re-sync failed:", err);
			}
		}, 150);
	};

	watch(frontendRoutes, { recursive: true }, (_event, filename) => {
		if (!filename) return;
		// Ignore edits — only re-sync when the directory listing may have changed.
		// We can't easily detect add/remove/rename vs modify from fs.watch, so
		// just always schedule. `syncOnce` is fast (symlinks only) so over-syncing
		// is harmless.
		schedule();
	});

	console.log(`[sync-routes] watching ${path.relative(pkgRoot, frontendRoutes)} for changes`);
}
