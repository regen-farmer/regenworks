import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
	ssr: true,
	server: {
		compatibilityDate: '2024-11-23'
	},
	solid: {
		babel: {
			env: {
				development: {
					compact: true
				}
			}
		}
	}
});
