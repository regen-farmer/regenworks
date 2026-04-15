import { physical, rootRoute } from "@tanstack/virtual-file-routes";

// Paths here are resolved relative to `routesDirectory` (./src/routes).
//   - `__root.tsx` re-exports the frontend root route
//   - `_pages` is populated by `scripts/sync-routes.mjs` from `@rw/frontend/src/routes`
//   - `api` is isomorphic's server-only handlers, mounted at `/api`
export default rootRoute("__root.tsx", [
	physical("/", "_pages"),
	physical("/api", "api"),
]);
