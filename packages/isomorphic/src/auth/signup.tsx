import { Link } from "@tanstack/solid-router";
import { NavBar } from "~/components/NavBar.tsx";

import { isElectron, isTauri } from "~/util/platform.ts";

export default function NewUser() {
  // Electron: delegate to the main process's PKCE flow (opens system browser,
  // catches the regenworks:// callback). Web: hit the server auth endpoint.
  // Tauri: same remote-auth pattern as before.
  const electronAuth =
    typeof window !== "undefined"
      ? (window as unknown as { electronAPI?: { auth?: { login: () => Promise<unknown> } } })
          .electronAPI?.auth
      : undefined;

  const needsRemoteAuth =
    typeof window !== "undefined" && isTauri() && !window.location.href.startsWith("http");
  const authPath = needsRemoteAuth
    ? `${import.meta.env.VITE_API_URL || "https://staging.regenfarmer.com"}/api/auth/signin`
    : "/api/auth/signin";

  const handleLogin = (e: MouseEvent) => {
    e.preventDefault();
    if (isElectron() && electronAuth) {
      // Main process resolves after the callback arrives. The session change
      // broadcast drives the UI — no need to reload.
      electronAuth.login().catch((err) => console.error("Login failed:", err));
      return;
    }
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
