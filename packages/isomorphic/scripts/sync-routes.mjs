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
 */
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, symlinkSync } from "node:fs";
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

if (existsSync(target)) rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

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

linkRecursive(frontendRoutes, target, true);

console.log(`[sync-routes] linked frontend pages → ${path.relative(pkgRoot, target)}`);
