import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteSolid from "vite-plugin-solid";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Pure client SPA build. Uses TanStack Router directly (no `@tanstack/solid-start`).
// Consumed by `@rw/isomorphic` (web SSR via `virtualRouteConfig`) and
// `@rw/desktop-electron` (dev: `vite dev` with HMR; packaged: dist/ served via
// `app://`).
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	Object.assign(process.env, env);

	// Stub out server-only modules for the client bundle. Some components import
	// `@rw/db/*` types as side effects or pull in `@tauri-apps/*`. Without tauri
	// installed anywhere in the workspace right now, we always stub it.
	const stubServerModulesPlugin = () => ({
		name: "stub-server-only-modules",
		enforce: "pre" as const,
		resolveId(id: string) {
			if (id.startsWith("@tauri-apps/")) return "\0stub-server-module";
			if (id.startsWith("@rw/desktop-tauri")) return "\0stub-server-module";
			if (id.startsWith("@rw/db/")) return "\0stub-server-module";
		},
		load(id: string) {
			if (id === "\0stub-server-module") return "export default {}; export {};";
		},
	});

	return {
		base: "/",
		server: {
			host: process.env.VITE_DEV_HOST || undefined,
			port: Number(process.env.PORT) || 10100,
			strictPort: true,
		},
		resolve: {
			tsconfigPaths: true,
		},
		build: {
			outDir: "dist",
			emptyOutDir: true,
		},
		plugins: [
			tailwindcss(),
			stubServerModulesPlugin(),
			tanstackRouter({
				target: "solid",
				routesDirectory: "./src/routes",
				generatedRouteTree: "./src/routeTree.gen.ts",
				autoCodeSplitting: false,
			}),
			viteSolid(),
		],
	};
});
