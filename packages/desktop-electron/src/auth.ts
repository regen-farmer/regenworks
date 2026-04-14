import { BrowserWindow, app, safeStorage, shell } from "electron";
import crypto from "crypto";
import path from "path";
import fs from "fs";

// Auth0 "RegenWorks Desktop" (Native) app in the dev tenant. Native apps use
// PKCE and have no client secret — safe to ship in the binary.
const AUTH0_ISSUER = "https://dev-3z62raqcp4wcxmkb.eu.auth0.com";
const CLIENT_ID = "ALDsOuZLOMNP3PoP41wYH7PQtkC2rZ47";
const REDIRECT_URI = "regenworks://callback";
const SCOPE = "openid profile email offline_access";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

type Session = {
  accessToken: string;
  idToken: string;
  refreshToken: string | null;
  expiresAt: number;
  user: Record<string, unknown>;
};

// Shape the renderer sees — mirrors the auth0Token / auth0User cookies set by
// the web server today, so useAuth.tsx consumers don't need to change.
export type RendererSession = {
  auth0Token: string;
  auth0User: Record<string, unknown>;
};

let session: Session | null = null;
let pending: {
  verifier: string;
  state: string;
  resolve: (v: RendererSession) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
} | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

const tokenStorePath = () => path.join(app.getPath("userData"), "auth.dat");

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function generatePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest(),
  );
  const state = base64url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

function parseJwt(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
}

function toRendererSession(s: Session): RendererSession {
  return { auth0Token: s.accessToken, auth0User: s.user };
}

export function getRendererSession(): RendererSession | null {
  return session ? toRendererSession(session) : null;
}

function broadcastSession() {
  const payload = getRendererSession();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("auth:session-changed", payload);
  }
}

async function exchangeCodeForTokens(
  code: string,
  verifier: string,
): Promise<Session> {
  const resp = await fetch(`${AUTH0_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code_verifier: verifier,
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });
  if (!resp.ok) {
    throw new Error(
      `Token exchange failed: ${resp.status} ${await resp.text()}`,
    );
  }
  const tokens = (await resp.json()) as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    user: parseJwt(tokens.id_token),
  };
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<Session | null> {
  const resp = await fetch(`${AUTH0_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!resp.ok) {
    console.error("[Auth] Refresh failed:", resp.status, await resp.text());
    return null;
  }
  const tokens = (await resp.json()) as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    user: parseJwt(tokens.id_token),
  };
}

function persistRefreshToken(token: string | null) {
  if (!safeStorage.isEncryptionAvailable()) return;
  const file = tokenStorePath();
  if (!token) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    fs.writeFileSync(file, safeStorage.encryptString(token));
  } catch (e) {
    console.error("[Auth] Failed to persist refresh token:", e);
  }
}

function readRefreshToken(): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const file = tokenStorePath();
  try {
    if (!fs.existsSync(file)) return null;
    return safeStorage.decryptString(fs.readFileSync(file));
  } catch {
    return null;
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  if (!session?.refreshToken) return;
  // Refresh 60 seconds before expiry
  const ms = Math.max(session.expiresAt - Date.now() - 60_000, 0);
  refreshTimer = setTimeout(async () => {
    if (!session?.refreshToken) return;
    const next = await refreshAccessToken(session.refreshToken);
    if (next) {
      session = next;
      persistRefreshToken(session.refreshToken);
      scheduleRefresh();
      broadcastSession();
    }
  }, ms);
}

export async function startLogin(): Promise<RendererSession> {
  if (pending) {
    pending.reject(new Error("Superseded by new login attempt"));
    clearTimeout(pending.timer);
    pending = null;
  }

  const { verifier, challenge, state } = generatePkce();
  const authorizeUrl = new URL(`${AUTH0_ISSUER}/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", SCOPE);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("prompt", "login");

  await shell.openExternal(authorizeUrl.toString());

  return new Promise<RendererSession>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending) {
        pending.reject(new Error("Login timed out"));
        pending = null;
      }
    }, LOGIN_TIMEOUT_MS);
    pending = { verifier, state, resolve, reject, timer };
  });
}

export async function handleCallbackUrl(url: string) {
  console.log("[Auth] handleCallbackUrl invoked with:", url);
  console.log("[Auth] pending is:", pending ? "set" : "null");
  if (!pending) {
    console.warn("[Auth] Callback received but no login is pending:", url);
    return;
  }
  const current = pending;
  pending = null;
  clearTimeout(current.timer);

  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    const returnedState = parsed.searchParams.get("state");
    const error = parsed.searchParams.get("error");

    console.log("[Auth] Callback parsed:", { hasCode: !!code, returnedState, expected: current.state });

    if (error) throw new Error(`Auth0 error: ${error}`);
    if (!code) throw new Error("No authorization code in callback");
    if (returnedState !== current.state)
      throw new Error("State mismatch — possible CSRF");

    console.log("[Auth] Exchanging code for tokens…");
    const next = await exchangeCodeForTokens(code, current.verifier);
    console.log("[Auth] Token exchange succeeded, user:", next.user.email);
    session = next;
    persistRefreshToken(session.refreshToken);
    scheduleRefresh();
    broadcastSession();
    current.resolve(toRendererSession(session));
  } catch (err) {
    console.error("[Auth] Callback handling failed:", err);
    current.reject(err as Error);
  }

  // Focus the main window so the user isn't stuck in the browser
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
}

export async function restoreSession(): Promise<RendererSession | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;
  const next = await refreshAccessToken(refreshToken);
  if (!next) {
    // Refresh token is invalid (revoked / expired). Clear it.
    persistRefreshToken(null);
    return null;
  }
  session = next;
  persistRefreshToken(session.refreshToken);
  scheduleRefresh();
  broadcastSession();
  return toRendererSession(session);
}

export function logout() {
  session = null;
  persistRefreshToken(null);
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  broadcastSession();
}
