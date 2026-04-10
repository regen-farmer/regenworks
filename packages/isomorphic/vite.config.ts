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

	// Fallback: generate a minimal _shell.html for desktop SPA shells if TanStack
	// Start's prerender didn't already produce one. The prerendered shell is
	// preferred because it includes the Solid `_$HY` hydration bootstrap; this
	// fallback is only here so the build doesn't ship a missing file.
	const desktopShellHtmlPlugin = () => ({
		name: "desktop-shell-html",
		apply: "build" as const,
		async closeBundle() {
			if (!isDesktop) return;

			const fs = await import("fs");
			const path = await import("path");

			const outDir = path.resolve(process.cwd(), "dist/client");
			const shellPath = path.join(outDir, "_shell.html");

			if (fs.existsSync(shellPath)) {
				console.log("desktop-shell-html: _shell.html already exists (from prerender), skipping");
				return;
			}

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

			const cssLinks = cssFiles.map((f: string) => `<link rel="stylesheet" href="/assets/${f}">`).join("\n    ");

			// Include Solid's _$HY hydration bootstrap so client-side hydration works
			// even when the prerendered shell is unavailable.
			const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RegenWorks</title>
    <script>window._$HY||(e=>{let t=e=>e&&e.hasAttribute&&(e.hasAttribute("data-hk")?e:t(e.host&&e.host.nodeType?e.host:e.parentNode));["click","input"].forEach((o=>document.addEventListener(o,(o=>{if(!e.events)return;let s=t(o.composedPath&&o.composedPath()[0]||o.target);s&&!e.completed.has(s)&&e.events.push([s,o])}))))})(_$HY={events:[],completed:new WeakSet,r:{},fe(){}});</script>
    ${cssLinks}
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/assets/${mainJs}"></script>
  </body>
</html>`;

			fs.writeFileSync(shellPath, html);
			console.log("desktop-shell-html: wrote fallback dist/client/_shell.html");
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
