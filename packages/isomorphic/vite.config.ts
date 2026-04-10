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

	// Generate a static _shell.html for desktop SPA shells (Tauri + Electron).
	// TanStack Start doesn't produce one, so we scan the build output for the
	// main entry JS and all CSS files.
	const desktopShellHtmlPlugin = () => ({
		name: "desktop-shell-html",
		apply: "build" as const,
		async closeBundle() {
			if (!isDesktop) return;

			const fs = await import("fs");
			const path = await import("path");

			const outDir = path.resolve(process.cwd(), "dist/client");
			const assetsDir = path.join(outDir, "assets");

			if (!fs.existsSync(assetsDir)) {
				console.error("desktop-shell-html: dist/client/assets/ not found");
				return;
			}

			const files = fs.readdirSync(assetsDir);
			const mainJs = files.find((f: string) => f.startsWith("main-") && f.endsWith(".js"));
			const cssFiles = files.filter((f: string) => f.endsWith(".css"));

			if (!mainJs) {
				console.error("desktop-shell-html: no main-*.js entry found in assets/");
				return;
			}

			const cssLinks = cssFiles.map((f: string) => `<link rel="stylesheet" href="./assets/${f}">`).join("\n    ");

			const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RegenWorks</title>
    ${cssLinks}
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./assets/${mainJs}"></script>
  </body>
</html>`;

			fs.writeFileSync(path.join(outDir, "_shell.html"), html);
			console.log("desktop-shell-html: wrote dist/client/_shell.html");
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
			tanstackStart({ spa: isDesktop ? { enabled: true, maskPath: "/" } : undefined }),
			viteSolid({ ssr: true }),
			desktopShellHtmlPlugin(),
		],
	};
});
