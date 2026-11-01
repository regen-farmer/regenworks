# End-to-end tests

Playwright smoke + authenticated tests guarding against dependency breakage. Run
on PRs and pushes to `dev` (Dependabot targets `dev`).

## Layers

- `app.smoke.spec.ts` — unauthenticated: app boots, public routes render, auth
  gate shows. No Auth0 needed.
- `auth.setup.ts` — logs in once via real Auth0, saves the session to
  `.auth/user.json`.
- `app.authed.spec.ts` — reuses that session for gated UI, including the home
  maplibre farms map.
- `app.tour.authed.spec.ts` — click-through tour as the test user: top-level
  pages, then the first farm → first project → 3D map and back. Fails on page
  crashes, console errors and any WebGL/shader error (e.g. mixed deck.gl
  versions). Attaches a screenshot of every step to the HTML report; download
  the `playwright-report` artifact from the CI run to look through them. Only
  safe buttons are clicked (navigation and view toggles). The project test is
  skipped if the test user has no farm with a project on staging.

The authed build connects to the staging backend
(`regenworks-dev-backend.onrender.com`) so gated pages render real data. Use
`build:e2e` (not `build`) for the e2e build.

## Running locally

```bash
cd packages/isomorphic
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm build:e2e

# Smoke only (no credentials):
pnpm test:e2e --project=smoke

# Full run: add E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD to
# packages/isomorphic/.env (a dedicated test user in the staging tenant), then:
pnpm test:e2e
```

`playwright.config.ts` loads `.env` into the test runner; CI supplies the same
vars via the environment.

## Auth0 prerequisites (one-time)

The staging Auth0 application must allow the local callback:

- **Allowed Callback URLs:** `http://localhost:10000/api/auth/callback/auth0`
- **Allowed Web Origins:** `http://localhost:10000`

Use a dedicated test user (verified email). If MFA or bot detection is enforced,
exempt the test user.

## CI secrets

Stored as repo secrets (Actions) and mirrored to Dependabot secrets:

`AUTH_SECRET`, `AUTH_AUTH0_ID`, `AUTH_AUTH0_SECRET`, `AUTH_AUTH0_ISSUER`,
`VITE_BASE_URL`, `VITE_GEOCODER_API_KEY`, `VITE_STRIPE_MODE`,
`E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`.
