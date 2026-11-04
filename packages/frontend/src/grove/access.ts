// Who sees the Grove tools in the web app. This only tidies the screen; the
// backend enforces the same roles on every /internal route.
import { canSeeMoney as canSeeMoneyFor, hasRole } from "@rw/db/access.ts";
import { getMongoDBUser } from "~/auth/useAuth";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export const isGroveUser = () => hasRole(getMongoDBUser(), "grove-field");
export const canSeeMoney = () => canSeeMoneyFor(getMongoDBUser());
/** grove-team and up (e.g. model sites: other farms' systems, not money). */
export const isGroveTeam = () => hasRole(getMongoDBUser(), "grove-team");

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

/** multipart upload (lets the browser set the boundary) */
export async function uploadForm<T>(path: string, form: FormData): Promise<T> {
  const defaults = apiFetchOptions();
  const headers = new Headers(defaults.headers);
  headers.delete("Content-Type");
  const res = await fetch(`${BACKEND_URL}${path}`, { ...defaults, method: "POST", headers, body: form });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(body?.error ?? `Upload failed (${res.status})`);
  return body as T;
}

export const kr = (n: number | undefined | null) =>
  n === undefined || n === null || !Number.isFinite(n)
    ? "–"
    : `${n.toLocaleString("da-DK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kr`;
