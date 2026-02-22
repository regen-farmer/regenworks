import { mount, StartClient } from "@solidjs/start/client";
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauri } from "~/util/platform.ts";

if (typeof window !== "undefined" && isTauri()) {
	const API_URL = import.meta.env.VITE_API_URL || "https://staging.regenfarmer.com";
	const originalFetch = window.fetch;
	window.fetch = async (...args) => {
		let [resource, config] = args;
		if (typeof resource === 'string' && resource.includes('_server') && !resource.startsWith('http')) {
			resource = resource.replace(/^\.?\/?_server/, `${API_URL}/_server`);
			config = config || {};
			config.credentials = 'include';
			return tauriFetch(resource, config);
		}
		return originalFetch(resource, config);
	};
}

mount(() => <StartClient />, document.getElementById("app")!);
