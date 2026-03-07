// @refresh reload

import { query, Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { onMount, Suspense } from "solid-js";
import "./app.css";
import "./style.css";
import { SessionProvider } from "~/auth/SessionProvider.tsx";
import { getSession } from "~/server/auth.ts";
import { initTauriTestUtils, isTauri } from "~/util/platform.ts";

// Initialize Tauri test utilities in development
if (typeof window !== "undefined" && isTauri()) {
  initTauriTestUtils();
}

// Import mongoose models
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

import { ThemeToggler } from "./theme.tsx";

// Query the session data for SSR hydration
export const getSessionData = query(async () => {
  "use server";
  return await getSession();
}, "session");

export default function App() {
  return (
    <Router
      root={(props) => {
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
                  {props.children}
                </div>
              </SessionProvider>
            </Suspense>
          </ThemeToggler>
        );
      }}
    >
      <FileRoutes />
    </Router>
  );
}
