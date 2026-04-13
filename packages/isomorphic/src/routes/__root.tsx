/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/solid-router";
import { HydrationScript } from "solid-js/web";
import { Suspense } from "solid-js";
import type * as Solid from "solid-js";
import { SessionProvider } from "~/auth/SessionProvider.tsx";
import { ThemeToggler } from "~/theme.tsx";
import ElectronUpdater from "~/components/ElectronUpdater.tsx";
import { isTauri } from "~/util/platform.ts";
import { onMount } from "solid-js";
import appCss from "~/app.css?url";
import styleCss from "~/style.css?url";

// Import mongoose models (side-effect imports for model registration)
import "@rw/db/schemas/activity.ts";
import "@rw/db/schemas/animal.ts";
import "@rw/db/schemas/area.ts";
import "@rw/db/schemas/asset.ts";
import "@rw/db/schemas/budget.ts";
import "@rw/db/schemas/farmflow.ts";
import "@rw/db/schemas/flow.ts";
import "@rw/db/schemas/layer.ts";
import "@rw/db/schemas/log.ts";
import "@rw/db/schemas/note.ts";
import "@rw/db/schemas/nursery.ts";
import "@rw/db/schemas/nurseryproduct.ts";
import "@rw/db/schemas/parcel.ts";
import "@rw/db/schemas/posting.ts";
import "@rw/db/schemas/practice.ts";
import "@rw/db/schemas/project.ts";
import "@rw/db/schemas/rateLimiterIP.ts";
import "@rw/db/schemas/rotation.ts";
import "@rw/db/schemas/row.ts";
import "@rw/db/schemas/saptest.ts";
import "@rw/db/schemas/sequence.ts";
import "@rw/db/schemas/soiltest.ts";
import "@rw/db/schemas/species.ts";
import "@rw/db/schemas/system.ts";
import "@rw/db/schemas/systemflow.ts";
import "@rw/db/schemas/user.ts";
import "@rw/db/schemas/variety.ts";
import "@rw/db/schemas/well.ts";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charset: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "description",
        content:
          "RegenWorks by Regen Farmer makes it easy to implement and manage regenerative agriculture.",
      },
      {
        name: "keywords",
        content:
          "regenerative agriculture management app software assessment tool implementation open data",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: styleCss },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "shortcut icon", type: "image/png", href: "/images/icon.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css?family=Open+Sans:400,700",
      },
      {
        rel: "stylesheet",
        href: "https://use.fontawesome.com/releases/v6.4.0/css/all.css",
      },
    ],
    scripts: [
      {
        src: `https://maps.googleapis.com/maps/api/js?libraries=places&key=${import.meta.env.VITE_GEOCODER_API_KEY}`,
      },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <main>
      <h1 class="h1">Page Not Found</h1>
    </main>
  ),
});

function RootComponent() {
  onMount(async () => {
    if (typeof window !== "undefined" && isTauri()) {
      console.log("Initializing Tauri update check...");
      const { initUpdater } = await import("@rw/desktop-tauri/src/updater.ts");
      initUpdater();
    }
  });

  return (
    <ThemeToggler>
      <Suspense>
        <SessionProvider>
          <div class="d-flex flex-column" style={{ height: "100%" }}>
            <Outlet />
          </div>
        </SessionProvider>
      </Suspense>
      <ElectronUpdater />
    </ThemeToggler>
  );
}

function RootDocument({ children }: { children: Solid.JSX.Element }) {
  return (
    <html lang="en">
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        <div id="app">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
