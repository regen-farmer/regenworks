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

/** Auth0 couldn't answer (rate limit, outage, timeout). Not the same as "not logged in". */
export class IdentityUnavailableError extends Error {}

const CACHE_MS = 10 * 60 * 1000;
const REJECT_CACHE_MS = 30 * 1000;
const MAX_CACHE = 5000;
const cache = new Map<string, { identity: VerifiedIdentity | null; expires: number }>();
const inFlight = new Map<string, Promise<VerifiedIdentity | null>>();

/** Auth0 tenant URL, e.g. https://grove.eu.auth0.com (scheme added, trailing slash removed). */
export function issuerBaseUrl(): string | undefined {
  const raw = (process.env.AUTH0_ISSUER_BASE_URL || process.env.AUTH_AUTH0_ISSUER || "").trim();
  if (!raw) return undefined;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** Check the auth settings once at startup. Throws if the backend would let nobody in. */
export function checkAuthConfig(): void {
  const issuer = issuerBaseUrl();
  if (!issuer) {
    if (legacyAuthHeaderPolicy() === "refuse") {
      throw new Error("AUTH0_ISSUER_BASE_URL must be set when LEGACY_AUTH_HEADER=refuse");
    }
    console.warn("AUTH0_ISSUER_BASE_URL is not set: Bearer tokens can't be checked yet");
    return;
  }
  try {
    new URL(issuer);
  } catch {
    throw new Error(`AUTH0_ISSUER_BASE_URL is not a valid URL: ${issuer}`);
  }
}

function cacheKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Ask Auth0 who owns this access token.
 * Null when Auth0 says the token is not valid (401/403).
 * Throws IdentityUnavailableError when Auth0 can't answer right now.
 */
async function askAuth0(token: string): Promise<VerifiedIdentity | null> {
  const issuer = issuerBaseUrl();
  if (!issuer) return null; // reported once at startup by checkAuthConfig
  let res: Response;
  try {
    res = await fetch(`${issuer}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    throw new IdentityUnavailableError(`Auth0 /userinfo unreachable: ${(err as Error).message}`);
  }
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new IdentityUnavailableError(`Auth0 /userinfo answered ${res.status}`);
  try {
    const info = (await res.json()) as Record<string, unknown>;
    if (typeof info.sub !== "string" || !info.sub) return null;
    return {
      sub: info.sub,
      email: typeof info.email === "string" ? info.email : undefined,
      email_verified: info.email_verified === true,
      source: "auth0",
    };
  } catch {
    throw new IdentityUnavailableError("Auth0 /userinfo returned something unreadable");
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
  const identity = await pending; // throws IdentityUnavailableError: nothing cached
  // Remember answers: valid tokens for 10 min, rejected ones for 30 s so a bad
  // token can't make us hammer Auth0.
  if (!cache.has(key)) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(key, { identity, expires: Date.now() + (identity ? CACHE_MS : REJECT_CACHE_MS) });
  }
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
