// @refresh reload
import "~/server/register-models.ts";
import { createServerFn } from "@tanstack/solid-start";
import { getSession } from "~/server/auth.ts";
import { setWebSessionResolver } from "@rw/frontend/src/auth/SessionProvider.tsx";

// Server function to query the session data.
export const getSessionData = createServerFn({ method: "GET" }).handler(async () => {
  return await getSession();
});

// Wire the server-function into `@rw/frontend`'s injection seam so its
// `SessionProvider` can reach the SSR session on the web. Electron bypasses
// this and gets its session over IPC from the main process.
setWebSessionResolver(() => getSessionData());
