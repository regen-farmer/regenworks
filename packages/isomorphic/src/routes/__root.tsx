/// <reference types="vite/client" />
import { HeadContent, Scripts, createRootRoute } from "@tanstack/solid-router";
import { HydrationScript } from "solid-js/web";
import type * as Solid from "solid-js";
import { RootComponent } from "@rw/frontend/src/routes/__root.tsx";
// Note: CSS is imported as a side effect inside `RootComponent`'s module graph
// (see `@rw/frontend/src/routes/__root.tsx`). TanStack Start auto-collects
// those imports for SSR via its `/@tanstack-start/styles.css` endpoint.

// Web SSR root. Pulls the layout (`RootComponent`) from `@rw/frontend` and adds
// the SSR-only HTML shell + head metadata.
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
