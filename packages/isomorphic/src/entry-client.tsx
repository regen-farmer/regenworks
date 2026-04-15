import { hydrate } from "solid-js/web";
import { StartClient, hydrateStart } from "@tanstack/solid-start/client";

// Web SSR hydration entry. Electron uses @rw/frontend's standalone entry-client
// directly — its fetch-proxy logic for `_server/*` lives there.

hydrateStart().then((router) => {
	hydrate(() => <StartClient router={router} />, document);
});
