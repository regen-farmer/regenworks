// @refresh reload
import { createServerFn } from "@tanstack/solid-start";
import { getSession } from "~/server/auth.ts";
import { initTauriTestUtils, isTauri } from "~/util/platform.ts";

// Initialize Tauri test utilities in development
if (typeof window !== "undefined" && isTauri()) {
  initTauriTestUtils();
}

// Server function to query the session data
export const getSessionData = createServerFn({ method: "GET" }).handler(async () => {
  return await getSession();
});
