import { Link } from "@tanstack/solid-router";
import { NavBar } from "~/components/NavBar.tsx";

import { isElectron, isTauri } from "~/util/platform.ts";

export default function NewUser() {
  // In packaged desktop apps (Tauri or Electron), the app loads from a local file/custom scheme
  // so auth must go through the deployed server. In browser or Electron dev (localhost), use local route.
  const needsRemoteAuth =
    typeof window !== "undefined" &&
    (isTauri() || (isElectron() && !window.location.href.startsWith("http")));
  const authPath = needsRemoteAuth
    ? `${import.meta.env.VITE_API_URL || "https://staging.regenfarmer.com"}/api/auth/signin`
    : "/api/auth/signin";

  const handleLogin = (e: MouseEvent) => {
    e.preventDefault();
    window.location.href = authPath;
  };

  return (
    <>
      <NavBar />
      <div class="container" style="text-align: center; margin-top: 80px;">
        <a
          rel="external"
          href={authPath}
          onclick={handleLogin}
          class="rounded-sm p-4 m-1 btn-default text-base inline-block"
        >
          Log in or create new user
        </a>
        <p class="mt-4 dark:text-zinc-200 text-xs leading-4">
          By creating a user you agree to our <br />
          <Link class="underline-offset-2 underline" to="/terms">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link class="underline-offset-2 underline" to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </>
  );
}
