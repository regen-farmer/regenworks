import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import viteSolid from "vite-plugin-solid";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	Object.assign(process.env, env);

	const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined || process.env.TAURI_PLATFORM !== undefined || process.env.TAURI_ENV_ARCH !== undefined;
	const isElectron = process.env.ELECTRON_BUILD === "1";
	const isDesktop = isTauri || isElectron;

	// Stub out server-only @rw/db/* modules for the browser bundle.
	// app.tsx imports mongoose schemas at the top level (side effects to register models).
	// These use Node.js APIs and cannot be transformed for the browser — Vite returns 500.
	// In browser context (options.ssr falsy) we return an empty module instead.
	const stubServerModulesPlugin = () => ({
		name: "stub-server-only-modules",
		enforce: "pre" as const,
		resolveId(id: string, _importer: string | undefined, options: { ssr?: boolean }) {
			// @tauri-apps/* and @rw/desktop-tauri are only available under Tauri — stub in both client and SSR
			if (!isTauri && id.startsWith("@tauri-apps/")) return "\0stub-server-module";
			if (!isTauri && id.startsWith("@rw/desktop-tauri")) return "\0stub-server-module";
			// @rw/db/* is server-only — only stub in client builds
			if (options?.ssr) return null;
			if (id.startsWith("@rw/db/")) return "\0stub-server-module";
		},
		load(id: string) {
			if (id === "\0stub-server-module") return "export default {}; export {};";
		},
	});

	return {
		base: "/",
		server: {
			port: Number(process.env.PORT) || 10000,
		},
		resolve: {
			tsconfigPaths: true,
		},
		plugins: [
			tailwindcss(),
			stubServerModulesPlugin(),
			// `spa.prerender.outputPath: "/_shell"` makes TanStack Start emit the
			// full prerendered shell to `dist/client/_shell.html` (with the `$_TSR`
			// bootstrap hydration needs). Without it, prerender would write
			// `index.html` and our Electron `app://` handler would fall back to a
			// shell that never gets created.
			tanstackStart({
				spa: isDesktop
					? { enabled: true, maskPath: "/", prerender: { outputPath: "/_shell" } }
					: undefined,
			}),
			viteSolid({ ssr: true }),
		],
	};
});
