import { solidStart } from "@solidjs/start/config";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	Object.assign(process.env, env);

	const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined || process.env.TAURI_PLATFORM !== undefined || process.env.TAURI_ENV_ARCH !== undefined;

	// Stub out server-only @rw/db/* modules for the browser bundle.
	// app.tsx imports mongoose schemas at the top level (side effects to register models).
	// These use Node.js APIs and cannot be transformed for the browser — Vite returns 500.
	// In browser context (options.ssr falsy) we return an empty module instead.
	const stubServerModulesPlugin = () => ({
		name: "stub-server-only-modules",
		enforce: "pre" as const,
		resolveId(id: string, _importer: string | undefined, options: { ssr?: boolean }) {
			if (options?.ssr) return null;
			if (id.startsWith("@rw/db/")) return "\0stub-server-module";
			// @rw/desktop-tauri and @tauri-apps/* are only available when running under Tauri
			if (!isTauri && id.startsWith("@rw/desktop-tauri")) return "\0stub-server-module";
			if (!isTauri && id.startsWith("@tauri-apps/")) return "\0stub-server-module";
		},
		load(id: string) {
			// Export a default and allow any named import via Proxy so consumers don't crash
			if (id === "\0stub-server-module") return "export default {}; export {};";
		},
	});

	// A plugin that dynamically crafts a static index.html file loading the SPA entrypoint
	// out of the vite manifest bundle, primarily because SolidStart v2 SSR doesn't emit one natively
	const tauriIndexHtmlPlugin = () => {
		return {
			name: "tauri-index-html",
			apply: "build" as const,
			async closeBundle() {
				if (!isTauri) return; // Only execute when bundling for the Tauri desktop shell
				
				const fs = await import("fs");
				const path = await import("path");
				
				console.log("Generating static index.html for Tauri bundle...");
				
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
				// Recursive function to get all CSS for the entry point
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
		base: isTauri ? "./" : "/",
		server: {
			port: Number(process.env.PORT) || 10000,
		},
		plugins: [
			stubServerModulesPlugin(),
			solidStart({ ssr: !isTauri }),
			tauriIndexHtmlPlugin()
		],
	};
});
