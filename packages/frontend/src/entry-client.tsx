/// <reference types="vite/client" />
// Side-effect CSS imports — vite bundles and injects them in prod, and in dev
// it applies them via JS with HMR. This is the standard SPA pattern.
import "~/app.css";
import "~/style.css";
import { render } from "solid-js/web";
import { RouterProvider, createRouter } from "@tanstack/solid-router";
import { routeTree } from "~/routeTree.gen";
import { isElectron } from "~/util/platform.ts";

// Electron fetch proxy: server function calls (`/_server/*`) and future
// same-origin API paths are rewritten to the configured backend URL so the
// desktop shell can hit a remote backend even though it loads from `app://`
// (packaged) or `http://localhost:10100` (dev). Web builds skip this because
// calls are already same-origin.
if (typeof window !== "undefined" && isElectron()) {
  const API_URL =
    (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL ||
    "https://staging.regenfarmer.com";
  const originalFetch = window.fetch;

  // Electron: proxy _server calls through the main process to bypass CORS.
  const electronAPI = (window as unknown as {
    electronAPI?: {
      invoke: (
        channel: string,
        ...args: unknown[]
      ) => Promise<{ status: number; statusText: string; body: string }>;
    };
  }).electronAPI;
  if (electronAPI) {
    window.fetch = async (...args) => {
      const [resource, config] = args;
      if (
        typeof resource === "string" &&
        resource.includes("_server") &&
        !resource.startsWith("http")
      ) {
        const url = resource.replace(/^\.?\/?_server/, `${API_URL}/_server`);
        const headers: Record<string, string> = {};
        if (config?.headers) {
          const h = config.headers as Record<string, string>;
          for (const [k, v] of Object.entries(h)) headers[k] = v;
        }
        const resp = await electronAPI.invoke("native_fetch", url, {
          method: (config?.method as string) || "GET",
          headers,
          body: config?.body as string | undefined,
        });
        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
        });
      }
      return originalFetch(resource, config);
    };
  }
}

const router = createRouter({ routeTree });

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

const mount = document.getElementById("app");
if (!mount) throw new Error("#app element missing in index.html");
render(() => <RouterProvider router={router} />, mount);
