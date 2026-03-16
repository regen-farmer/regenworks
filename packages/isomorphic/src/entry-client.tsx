import { hydrate } from "solid-js/web";
import { StartClient, hydrateStart } from "@tanstack/solid-start/client";
import { isElectron, isTauri } from "~/util/platform.ts";

if (typeof window !== "undefined" && (isTauri() || isElectron())) {
  const API_URL = import.meta.env.VITE_API_URL || "https://staging.regenfarmer.com";
  const originalFetch = window.fetch;

  if (isTauri()) {
    import("@tauri-apps/plugin-http").then(({ fetch: tauriFetch }) => {
      window.fetch = async (...args) => {
        let [resource, config] = args;
        if (
          typeof resource === "string" &&
          resource.includes("_server") &&
          !resource.startsWith("http")
        ) {
          resource = resource.replace(/^\.?\/?_server/, `${API_URL}/_server`);
          config = config || {};
          config.credentials = "include";
          return tauriFetch(resource, config);
        }
        return originalFetch(resource, config);
      };
    });
  } else {
    // Electron: proxy _server calls through main process to bypass CORS
    const electronAPI = (window as any).electronAPI;
    window.fetch = async (...args) => {
      let [resource, config] = args;
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

hydrateStart().then((router) => {
  hydrate(() => <StartClient router={router} />, document);
});
