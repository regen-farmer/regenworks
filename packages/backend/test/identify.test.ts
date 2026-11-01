// The backend must only trust identities confirmed by Auth0.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  _clearIdentityCache,
  checkAuthConfig,
  identify,
  IdentityUnavailableError,
  issuerBaseUrl,
} from "../src/auth/identify.ts";

process.env.AUTH0_ISSUER_BASE_URL = "https://example.eu.auth0.com/";
let calls = 0;
const realFetch = globalThis.fetch;

function fakeAuth0(response: { status: number; body?: unknown }) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls++;
    assert.equal(url, "https://example.eu.auth0.com/userinfo");
    assert.match(String((init?.headers as any)?.Authorization), /^Bearer /);
    return new Response(JSON.stringify(response.body ?? {}), { status: response.status });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = 0;
  _clearIdentityCache();
  delete process.env.LEGACY_AUTH_HEADER;
  globalThis.fetch = realFetch;
});

test("no header → anonymous", async () => {
  assert.equal(await identify(undefined), null);
  assert.equal(await identify("undefined"), null);
});

test("valid Bearer token → identity from Auth0", async () => {
  fakeAuth0({ status: 200, body: { sub: "auth0|1", email: "a@b.dk", email_verified: true } });
  assert.deepEqual(await identify("Bearer good"), {
    sub: "auth0|1",
    email: "a@b.dk",
    email_verified: true,
    source: "auth0",
  });
});

test("token Auth0 rejects → anonymous", async () => {
  fakeAuth0({ status: 401 });
  assert.equal(await identify("Bearer bad"), null);
});

test("forged JSON profile header is refused when LEGACY_AUTH_HEADER=refuse", async () => {
  process.env.LEGACY_AUTH_HEADER = "refuse";
  fakeAuth0({ status: 200, body: { sub: "should-not-be-called" } });
  const forged = JSON.stringify({ sub: "x", email: "kris@example.com", email_verified: true });
  assert.equal(await identify(forged), null);
  assert.equal(calls, 0);
});

test("during the switch-over the legacy header still works, marked as legacy", async () => {
  const r = await identify(JSON.stringify({ sub: "x", email: "a@b.dk", email_verified: true }));
  assert.equal(r?.source, "legacy");
});

test("legacy header that isn't a profile → anonymous", async () => {
  assert.equal(await identify("not json"), null);
  assert.equal(await identify(JSON.stringify(["x"])), null);
});

test("answers are cached: many requests, one Auth0 call", async () => {
  fakeAuth0({ status: 200, body: { sub: "auth0|1", email_verified: true } });
  await Promise.all([identify("Bearer t"), identify("Bearer t"), identify("Bearer t")]);
  await identify("Bearer t");
  assert.equal(calls, 1);
});

test("Auth0 down → 'unavailable', not 'logged out', and nothing cached", async () => {
  globalThis.fetch = (async () => {
    calls++;
    throw new Error("network down");
  }) as typeof fetch;
  await assert.rejects(identify("Bearer t2"), IdentityUnavailableError);
  await assert.rejects(identify("Bearer t2"), IdentityUnavailableError);
  assert.equal(calls, 2);
});

test("Auth0 rate limit (429) → 'unavailable', not cached", async () => {
  fakeAuth0({ status: 429 });
  await assert.rejects(identify("Bearer t3"), IdentityUnavailableError);
  fakeAuth0({ status: 200, body: { sub: "auth0|9", email_verified: true } });
  assert.equal((await identify("Bearer t3"))?.sub, "auth0|9");
});

test("rejected token is remembered: no second Auth0 call within 30 s", async () => {
  fakeAuth0({ status: 401 });
  assert.equal(await identify("Bearer rejected"), null);
  assert.equal(await identify("Bearer rejected"), null);
  assert.equal(calls, 1);
});

test("issuer URL: scheme added, trailing slash removed", () => {
  process.env.AUTH0_ISSUER_BASE_URL = "grove.eu.auth0.com/";
  assert.equal(issuerBaseUrl(), "https://grove.eu.auth0.com");
  process.env.AUTH0_ISSUER_BASE_URL = "https://example.eu.auth0.com/";
});

test("startup check: missing issuer is fatal only once the old header is refused", () => {
  const saved = process.env.AUTH0_ISSUER_BASE_URL;
  delete process.env.AUTH0_ISSUER_BASE_URL;
  delete process.env.AUTH_AUTH0_ISSUER;
  assert.doesNotThrow(() => checkAuthConfig());
  process.env.LEGACY_AUTH_HEADER = "refuse";
  assert.throws(() => checkAuthConfig(), /AUTH0_ISSUER_BASE_URL/);
  process.env.AUTH0_ISSUER_BASE_URL = saved;
});
