import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import viteSolid from "vite-plugin-solid";
import { nitro } from "nitro/vite";

// @rw/isomorphic is the web SSR wrapper. UI lives in @rw/frontend; this
// package adds:
//   - Auth.js + getSession on the server
//   - /api/* route handlers (see src/routes/api/)
//   - `createServerFn` for `getSessionData`
//
// Route composition uses TanStack's virtual-file-routes: the __virtual.tsx
// file points the router at @rw/frontend's pages (via a relative path) and
// mounts isomorphic's own /api handlers at `/api`.
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	Object.assign(process.env, env);
	const frontendPublicDir = "../frontend/public";

	// Stub server-only modules out of the browser bundle.
	const stubServerModulesPlugin = () => ({
		name: "stub-server-only-modules",
		enforce: "pre" as const,
		resolveId(id: string, _importer: string | undefined, options: { ssr?: boolean }) {
			if (id.startsWith("@tauri-apps/")) return "\0stub-server-module";
			if (id.startsWith("@rw/desktop-tauri")) return "\0stub-server-module";
			if (options?.ssr) return null;
			if (id.startsWith("@rw/db/")) return "\0stub-server-module";
		},
		load(id: string) {
			if (id === "\0stub-server-module") return "export default {}; export {};";
		},
	});

	return {
		base: "/",
		// Static assets (images, 3D models, marker icons) live in `@rw/frontend`
		// so the SPA dev server can serve them directly. Point isomorphic's Vite
		// and Nitro static asset handling at that same directory.
		publicDir: frontendPublicDir,
		// Nitro defaults `copyPublicDir: false` for the client build. We opt back
		// in so Vite also copies `publicDir` into `.output/public/` for prod.
		build: { copyPublicDir: true },
		server: {
			host: process.env.VITE_DEV_HOST || undefined,
			port: Number(process.env.PORT) || 10000,
		},
		resolve: {
			tsconfigPaths: true,
		},
		// @rw/frontend is a workspace package. Vite SSR would externalize it
		// (it lives in node_modules via pnpm symlink), which breaks import
		// resolution for sub-deps like @tanstack/solid-router. Force it to be
		// bundled into the SSR graph.
		ssr: {
			noExternal: ["@rw/frontend"],
		},
		plugins: [
			tailwindcss(),
			stubServerModulesPlugin(),
			tanstackStart({
				router: {
					virtualRouteConfig: "./src/routes/__virtual.tsx",
					autoCodeSplitting: true,
				},
			}),
			viteSolid({ ssr: true }),
			// Nitro wraps the SSR server produced by `tanstackStart` into a
			// runtime bundle at `.output/` (preset: node-server by default).
			// Deploy with `node .output/server/index.mjs`.
			nitro({
				publicAssets: [{ dir: frontendPublicDir, baseURL: "/" }],
			}),
		],
	};
});
