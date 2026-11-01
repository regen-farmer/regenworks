// Who is calling? Only Auth0 decides.
//
// The browser sends the Auth0 access token it got at login:
//   Authorization: Bearer <token>
// We ask Auth0's /userinfo endpoint who that token belongs to and trust only
// that answer. Answers are cached for a few minutes per token so a page that
// fires many requests causes one Auth0 call, not one per request.
//
// Before November 2026 the browser sent the user's profile as plain JSON and
// the backend believed it, so anyone could claim to be anyone. During the
// switch-over (web app and desktop app updating to Bearer tokens) that legacy
// header is still accepted. Set LEGACY_AUTH_HEADER=refuse to close it; the
// default flips to "refuse" once every client sends Bearer tokens.
import { createHash } from "node:crypto";
import { isPlainObject } from "../utils/mongoSafety.ts";

export type VerifiedIdentity = {
  sub: string;
  email?: string;
  email_verified: boolean;
  /** "auth0" when Auth0 confirmed the token; "legacy" for the unverified old header. */
  source: "auth0" | "legacy";
};

const CACHE_MS = 10 * 60 * 1000;
const MAX_CACHE = 5000;
const cache = new Map<string, { identity: VerifiedIdentity | null; expires: number }>();
const inFlight = new Map<string, Promise<VerifiedIdentity | null>>();

function issuerBaseUrl(): string | undefined {
  const raw = process.env.AUTH0_ISSUER_BASE_URL || process.env.AUTH_AUTH0_ISSUER;
  return raw ? raw.replace(/\/+$/, "") : undefined;
}

function cacheKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Ask Auth0 who owns this access token. Null if Auth0 says no or can't be reached. */
async function askAuth0(token: string): Promise<VerifiedIdentity | null> {
  const issuer = issuerBaseUrl();
  if (!issuer) {
    console.error("AUTH0_ISSUER_BASE_URL is not set: nobody can log in to the backend");
    return null;
  }
  try {
    const res = await fetch(`${issuer}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const info = (await res.json()) as Record<string, unknown>;
    if (typeof info.sub !== "string" || !info.sub) return null;
    return {
      sub: info.sub,
      email: typeof info.email === "string" ? info.email : undefined,
      email_verified: info.email_verified === true,
      source: "auth0",
    };
  } catch (err) {
    console.error("Auth0 /userinfo failed:", (err as Error).message);
    return null;
  }
}

export async function verifyAccessToken(token: string): Promise<VerifiedIdentity | null> {
  const key = cacheKey(token);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.identity;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = askAuth0(token).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  const identity = await pending;
  // Cache failures briefly too, so a bad token can't make us hammer Auth0.
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, { identity, expires: Date.now() + (identity ? CACHE_MS : 30_000) });
  return identity;
}

export function legacyAuthHeaderPolicy(): "allow" | "refuse" {
  return process.env.LEGACY_AUTH_HEADER === "refuse" ? "refuse" : "allow";
}

function legacyIdentity(header: string): VerifiedIdentity | null {
  if (legacyAuthHeaderPolicy() === "refuse") return null;
  try {
    const parsed = JSON.parse(header) as unknown;
    if (!isPlainObject(parsed)) return null;
    const p = parsed as Record<string, unknown>;
    if (typeof p.sub !== "string" || !p.sub) return null;
    return {
      sub: p.sub,
      email: typeof p.email === "string" ? p.email : undefined,
      email_verified: p.email_verified === true,
      source: "legacy",
    };
  } catch {
    return null;
  }
}

/** The caller's identity from the Authorization header, or null for anonymous/invalid. */
export async function identify(
  authorization: string | undefined,
): Promise<VerifiedIdentity | null> {
  if (!authorization || authorization === "undefined") return null;
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization);
  if (bearer) return verifyAccessToken(bearer[1].trim());
  return legacyIdentity(authorization);
}

/** For tests only. */
export function _clearIdentityCache() {
  cache.clear();
  inFlight.clear();
}
