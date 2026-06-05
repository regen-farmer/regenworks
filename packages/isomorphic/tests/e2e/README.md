# End-to-end tests

Playwright smoke + authenticated tests that guard against dependency breakage
(run automatically on PRs and pushes to `dev`; Dependabot targets `dev`).

## Layers

- `app.smoke.spec.ts` — unauthenticated. App boots, public routes render, auth
  gate shows the login screen. No Auth0 needed.
- `auth.setup.ts` — logs in once through the real Auth0 Universal Login flow and
  saves the session to `.auth/user.json`.
- `app.authed.spec.ts` — reuses that session to exercise gated UI, including the
  home maplibre farms map rendered against the real staging backend.

The authed build connects to the staging backend
(`regenworks-dev-backend.onrender.com`) so gated pages render real data. Use
`build:e2e` (not `build`) for the e2e build; it bakes the dev backend by default
and respects `VITE_BACKEND_URL` when set.

## Running locally

```bash
cd packages/isomorphic
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm build:e2e                  # builds .output connected to the dev backend

# Smoke only (no credentials required):
pnpm test:e2e --project=smoke

# Full run incl. authenticated tests: add the test user to packages/isomorphic/.env
#   E2E_TEST_USER_EMAIL=...    # a dedicated test user in the staging tenant
#   E2E_TEST_USER_PASSWORD=...
pnpm test:e2e
```

`playwright.config.ts` loads `packages/isomorphic/.env` into the test runner
(`process.loadEnvFile`), so the E2E credentials and `AUTH_*` / `VITE_*` vars come
from that one file locally; in CI they come from the environment (which takes
precedence over `.env`). Playwright also starts the built server itself
(`node --env-file-if-exists=.env .output/server/index.mjs`). The production
`start` script (run by Render.com) is left untouched.

## Auth0 prerequisites (one-time)

For the authenticated flow to complete against a locally served build, the
tenant's Auth0 Application must allow the local callback:

- **Allowed Callback URLs:** `http://localhost:10000/api/auth/callback/auth0`
- **Allowed Web Origins / Logout URLs:** `http://localhost:10000`

Create a dedicated **test user** (verified email) in the staging tenant for CI.
If the tenant enforces MFA or bot detection on this app, exempt the test user or
use a connection without MFA, otherwise the scripted login cannot complete.

## CI secrets / variables

Configured on the `staging` GitHub Environment (CI runs on `dev` only) in
`.github/workflows/ci.yml`:

| Name | Kind | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | secret | Auth.js session encryption |
| `AUTH_AUTH0_ID` | secret | Auth0 application client id |
| `AUTH_AUTH0_SECRET` | secret | Auth0 application client secret |
| `AUTH_AUTH0_ISSUER` | secret/var | Auth0 issuer URL |
| `E2E_TEST_USER_EMAIL` | secret | Test user login |
| `E2E_TEST_USER_PASSWORD` | secret | Test user password |
| `VITE_BASE_URL` | var | Public base URL |
| `VITE_GEOCODER_API_KEY` | secret | Build-time geocoder key |
| `VITE_STRIPE_MODE` | var | `test` / `live` |

`AUTH_URL` is set to `http://localhost:10000` by the workflow so the Auth0
callback returns to the CI-served build. `VITE_BACKEND_URL` is hardcoded to the
dev backend in the workflow, not configured per environment.
