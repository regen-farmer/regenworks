import { HeadContent, Outlet, createRootRoute } from "@tanstack/solid-router";
import { Suspense } from "solid-js";
import { SessionProvider } from "~/auth/SessionProvider.tsx";
import { ThemeToggler } from "~/theme.tsx";
import ElectronUpdater from "~/components/ElectronUpdater.tsx";
// Side-effect CSS imports — kept in the route module graph so TanStack Start
// auto-collects them for SSR's `/@tanstack-start/styles.css` endpoint, and so
// vite injects them via JS with HMR in the SPA dev build.
import "~/app.css";
import "~/style.css";

// Pure TanStack Router root — no SSR primitives. The HTML shell lives in
// `index.html` for the SPA build (Electron) and in `@rw/isomorphic`'s own
// `__root.tsx` for web SSR.
export function RootComponent() {
  return (
    <ThemeToggler>
      <Suspense>
        <SessionProvider>
          <div class="d-flex flex-column" style={{ height: "100%" }}>
            <HeadContent />
            <Outlet />
          </div>
        </SessionProvider>
      </Suspense>
      <ElectronUpdater />
    </ThemeToggler>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => (
    <main>
      <h1 class="h1">Page Not Found</h1>
    </main>
  ),
});
