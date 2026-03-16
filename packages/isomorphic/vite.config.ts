import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
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

	// A plugin that dynamically crafts a static index.html file loading the SPA entrypoint
	// out of the vite manifest bundle, for desktop shells (Tauri + Electron)
	const tauriIndexHtmlPlugin = () => {
		return {
			name: "tauri-index-html",
			apply: "build" as const,
			async closeBundle() {
				// Generate a static index.html for desktop shells (Tauri + Electron) only.
				if (!isDesktop) return;

				const fs = await import("fs");
				const path = await import("path");

				console.log("Generating static index.html for desktop bundle...");

				const outDir = path.resolve(process.cwd(), "dist/client");
				const manifestPath = path.join(outDir, ".vite/manifest.json");

				if (!fs.existsSync(manifestPath)) {
					console.error("Vite manifest not found, cannot generate index.html");
					return;
				}

				const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
				const entryChunk = manifest["src/entry-client.tsx"];

				if (!entryChunk) {
					console.error("entry-client.tsx missing from Vite manifest");
					return;
				}

				const jsFile = entryChunk.file;
				const getCssFiles = (chunkId: string, visited = new Set<string>()): string[] => {
					if (visited.has(chunkId)) return [];
					visited.add(chunkId);

					const chunk = manifest[chunkId];
					if (!chunk) return [];

					const css = chunk.css || [];
					const importedCss = (chunk.imports || []).flatMap((imp: string) => getCssFiles(imp, visited));
					return [...css, ...importedCss];
				};

				const allCss = Array.from(new Set(getCssFiles("src/entry-client.tsx")));

				const htmlBlocks = allCss.map(cssFile => `<link rel="stylesheet" href="./${cssFile}">`).join("\n    ");

				const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RegenWorks</title>
    ${htmlBlocks}
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./${jsFile}"></script>
  </body>
</html>`;

				fs.writeFileSync(path.join(outDir, "index.html"), html);
				console.log("Successfully wrote dist/client/index.html");
			}
		};
	};

	return {
		base: "/",
		server: {
			port: Number(process.env.PORT) || 10000,
		},
		plugins: [
			tsConfigPaths({ projects: ["./tsconfig.json"] }),
			stubServerModulesPlugin(),
			tanstackStart({ spa: isDesktop ? { enabled: true, maskPath: "/" } : undefined }),
			viteSolid({ ssr: true }),
		],
	};
});
