import { useLocation } from "@tanstack/solid-router";
import { createMemo, createResource, createSignal, onMount, Show } from "solid-js";
import NewUser from "~/auth/signup.tsx";
import { ShowAfterAuth } from "./useAuth.tsx";
import { isElectron } from "~/util/platform.ts";

// Routes that should be accessible without authentication
const PUBLIC_ROUTES = ["/scenario-preview/", "/farm-scenario-preview/", "/privacy", "/terms"];

type ElectronSession = { auth0Token: string; auth0User: Record<string, unknown> } | null;
type WebSession = Record<string, unknown> | null;

// Injection seam: `@rw/isomorphic` calls `setWebSessionResolver(getSessionData)`
// at startup so the SSR path can reach its `createServerFn`-wrapped session
// loader. In pure-client consumers (Electron SPA) the resolver stays undefined
// and session comes from the Electron main process over IPC.
let webSessionResolver: (() => Promise<WebSession>) | undefined;
export function setWebSessionResolver(fn: () => Promise<WebSession>) {
	webSessionResolver = fn;
}

const SessionProvider = (props: any) => {
  const location = useLocation();
  const [session] = createResource(() =>
    isElectron() ? null : webSessionResolver ? webSessionResolver() : null,
  );

  // Electron: session lives in the main process, not on a server. Subscribe to
  // session changes and drive the same `hasSession` toggle.
  const [electronSession, setElectronSession] = createSignal<ElectronSession>(null);
  onMount(async () => {
    if (!isElectron()) return;
    const api = (window as unknown as { electronAPI?: { auth?: {
      getSession: () => Promise<ElectronSession>;
      onSessionChanged: (cb: (s: ElectronSession) => void) => void;
    } } }).electronAPI?.auth;
    if (!api) return;
    api.onSessionChanged((s) => setElectronSession(s));
    setElectronSession(await api.getSession());
  });

  const hasSession = () => (isElectron() ? !!electronSession() : !!session());

  // Check if current route is a public route
  const isPublicRoute = createMemo(() => {
    const path = location().pathname;
    return PUBLIC_ROUTES.some((route) => path.startsWith(route));
  });

  return (
    <>
      <Show when={isPublicRoute()}>
        {/* Public routes - render without auth wrapper */}
        {props.children}
      </Show>
      <Show when={!isPublicRoute()}>
        {/* Protected routes - require authentication */}
        <Show when={hasSession()} fallback={<NewUser />}>
          <ShowAfterAuth>{props.children}</ShowAfterAuth>
        </Show>
      </Show>
    </>
  );
};

export { SessionProvider };
