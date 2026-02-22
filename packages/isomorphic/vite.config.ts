import { solidStart } from "@solidjs/start/config";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	Object.assign(process.env, env);

	const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined || process.env.TAURI_PLATFORM !== undefined || process.env.TAURI_ENV_ARCH !== undefined;

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
				
				const htmlBlocks = allCss.map(cssFile => `<link rel="stylesheet" href="/${cssFile}">`).join("\n    ");
				
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
    <script type="module" src="/${jsFile}"></script>
  </body>
</html>`;
				
				fs.writeFileSync(path.join(outDir, "index.html"), html);
				console.log("Successfully wrote dist/client/index.html");
			}
		};
	};

	return {
		server: {
			port: Number(process.env.PORT) || 10000,
		},
		plugins: [
			solidStart({ ssr: !isTauri }),
			tauriIndexHtmlPlugin()
		],
	};
});
