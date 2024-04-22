import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
	ssr: true,
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
