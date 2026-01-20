import { solidStart } from "@solidjs/start/config";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	Object.assign(process.env, env);

	return {
		server: {
			port: Number(process.env.PORT) || 10000,
		},
		plugins: [solidStart()],
	};
});
