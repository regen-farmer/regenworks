import { createRouter } from "@tanstack/solid-router";
import { routeTree } from "./routeTree.gen";
// Side-effect import: registers `setWebSessionResolver(getSessionData)` so
// `@rw/frontend`'s SessionProvider can resolve the web session via the server
// function during SSR and on the client.
import "./app.tsx";

// Isomorphic router — pulls in the composed routeTree that includes frontend
// pages + isomorphic /api server handlers (see src/routes/__virtual.tsx).
export function getRouter() {
	return createRouter({
		routeTree,
		defaultPreload: "intent",
		scrollRestoration: true,
		defaultNotFoundComponent: () => (
			<main>
				<h1 class="h1">Page Not Found</h1>
			</main>
		),
	});
}

declare module "@tanstack/solid-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
