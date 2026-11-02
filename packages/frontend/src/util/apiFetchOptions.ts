import { getAuth0Token } from "~/auth/useAuth.tsx";

/** The Auth0 access token from login (web: cookie set by the server; desktop: Electron session). */
function auth0AccessToken(): string | undefined {
  const fromSignal = getAuth0Token();
  if (typeof fromSignal === "string" && fromSignal) return fromSignal;
  if (typeof document === "undefined") return undefined;
  const cookie = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("auth0Token="));
  if (!cookie) return undefined;
  try {
    const value = decodeURIComponent(decodeURIComponent(cookie.slice("auth0Token=".length)));
    return value || undefined;
  } catch {
    return undefined;
  }
}

export const apiFetchOptions: () => RequestInit = () => {
  // The backend asks Auth0 who this token belongs to. It no longer accepts the
  // user's profile as plain JSON, which anyone could fake.
  const token = auth0AccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return {
    mode: "cors", // no-cors, *cors, same-origin
    cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
    credentials: "same-origin", // include, *same-origin, omit
    headers,
    redirect: "follow", // manual, *follow, error
    referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url}
  };
};
export const apiResponseOptions: ResponseInit = {
  headers: {
    "Content-Type": "application/json",
  },
  status: 200,
};
