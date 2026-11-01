# Maintaining RegenWorks

A handover guide for whoever looks after this repository next. It covers how the
pieces fit together, how changes reach users, and the routine jobs that keep the
app healthy. Setup steps for a fresh clone are in `README.md`.

## How the system fits together

| Part | Package | Runs on | Notes |
|---|---|---|---|
| Web app (SolidStart, server-rendered) | `packages/isomorphic` | Render | Login via Auth.js + Auth0. Built by `scripts/render-build-isomorphic.sh` |
| Shared UI, map and design tools | `packages/frontend` | bundled into web and desktop | SolidJS, MapLibre/MapTiler, deck.gl |
| API | `packages/backend` | Render (`regenworks-dev-backend.onrender.com` for dev) | Express 5, MongoDB via Mongoose, Stripe, Resend, geocoding |
| Database models | `packages/db` | shared | Mongoose schemas used by backend and modelling |
| Layout engine | `packages/modelling` | backend, browser (WebAssembly), desktop | TypeScript/turf layouts plus the Rust geometry kernel |
| Native geometry addon | `packages/gis-napi` | Electron desktop | Rust, built with napi-rs per platform |
| Desktop app | `packages/desktop-electron` | Windows, macOS, Linux | Signed builds published by GitHub Actions |
| Desktop app (alternative) | `packages/desktop-tauri` | not built | Disabled in `pnpm-workspace.yaml` |
| Danish soil map tiles | external | `martin-lpis.onrender.com` | Martin tile server used by the jordart layer |

Toolchain: Node 24 (`.nvmrc`), pnpm 11.3, Rust stable with the
`wasm32-unknown-unknown` target, and `wasm-pack` 0.15.

## Branches and releases

- **`dev`** is the working branch. All pull requests target `dev`, and CI
  (`.github/workflows/ci.yml`) runs lint, a full web build and the Playwright
  end-to-end tests against the dev backend.
- **`main`** is production. It only moves by fast-forward through the
  **Promote dev to main** workflow (Actions tab → run workflow; tick *dry run*
  first). It uses the `production` environment, so it may need approval.
- **Desktop releases** are triggered by a change to the `version` field in
  `packages/desktop-electron/package.json` on `dev` or `main`. Builds are signed
  (Apple certificate and notarisation secrets) and published to a separate
  distribution repository via `DIST_REPO_TOKEN`.
- Old feature branches are not deleted automatically. Delete a branch once its
  pull request is merged or abandoned.

## Routine maintenance

**Weekly (about 30 minutes)**
1. Look at open Dependabot pull requests. Patch and minor updates merge
   automatically once CI is green (`auto-merge-dependabot.yml`). Major updates
   stay open: read the changelog, check the CI result, then merge or close.
2. Check the Actions tab for failed runs on `dev`.
3. Check GitHub → Security for code-scanning and Dependabot alerts.

**Monthly**
1. Promote `dev` to `main` if there are user-facing fixes waiting.
2. Check the Render services for errors, memory and plan limits.
3. Check MongoDB backups and storage use.

**Yearly**
1. Renew the Apple Developer membership and signing certificate before they
   expire, or desktop releases will fail.
2. Review who has access to each account below and remove people who have left.

## Accounts the app depends on

The owner of the company should hold an admin login for every one of these,
not only the developer. Rotate keys whenever a person with access leaves.

| Service | Used for | Where the key lives |
|---|---|---|
| GitHub (`regen-farmer`) | code, CI, releases | repository and environment secrets |
| Render | hosting web app, backend, tile server | Render environment settings |
| MongoDB (hosting provider to confirm) | all application data | `DATABASEURL` |
| Auth0 | logins | `AUTH_AUTH0_*`, `AUTH_SECRET` |
| Stripe | subscriptions and payments | `STRIPE_SECRET_KEY`, `STRIPE_MODE` |
| Resend | email | `RESEND_API_KEY` |
| Geocoding provider | address search | `GEOCODER_API_KEY`, `VITE_GEOCODER_API_KEY` |
| MapTiler | base maps | frontend configuration |
| Apple Developer | signing and notarising the macOS app | `MAC_CERT_*`, `APPLE_*` secrets |
| Domain registrar / DNS | `regenworks.com` | registrar account |

Environment variable names are listed in `packages/backend/.env.example`,
`packages/isomorphic/.env.example` and `.env.docker.example`.

## Security notes

- The repository is public. Never commit `.env` files, keys or data exports.
- A full-history scan with `gitleaks` (October 2026) found no current keys in the
  code, but older commits (2018–2025) contain a Stripe **test** key, Mapbox
  public tokens, an ipify API key, a few hard-coded request secrets from the old
  Express app, and an expired Auth0 login token that includes a user's name and
  email. Rotate or revoke any of these that still exist in the provider
  dashboards. Rewriting history is optional and only worth doing for personal data.
- Re-run the scan after big merges:
  `gitleaks git --redact -v .`

## Field tools

`scripts/kml-to-stakeout.py` turns a "Export trees as KML" file into RTK
stake-out files (ETRS89 / UTM 32N grid coordinates with one name per tree, row
lines and a DXF). Run `python3 scripts/kml-to-stakeout.py --help` for details.

## Known issues and follow-ups

- **Old internal names.** The screens say farm, field and scenario, but the code,
  API paths and database still use the old names:

  | On screen | In code, API and database |
  |---|---|
  | Farm | `Parcel` (`/parcels/...`) |
  | Field | `Layer` (`/layers/...`) |
  | Scenario (a design on a field) | `Project` (`/projects/...`) |
  | System (template of rows and species) | `System`, `SystemDesign` |

  Renaming them touches routes, saved links, database collections and the
  desktop app. Leave it until the e2e tour covers the main flows, then do it in
  one planned change with a database migration and redirects from the old URLs.
- **Systems page for normal users:** the systems list (`GET /systems`) is
  admin-only on the backend, so the page is empty for other users. Make the page
  admin-only or open the list.

- **Tree spacing scale:** the turf-based layout places trees along rows with
  spherical distances in longitude/latitude. In Denmark this makes real spacing
  0.1–0.3 % longer than designed (a 300 m row ends up to about 1 m longer).
  Laying out in a projected metric grid (UTM 32N) would remove this.
- **Tree KML export** names every point by species only. A per-tree ID and a
  direct grid-coordinate CSV export would remove the need for the conversion
  script above.
- The Tauri desktop package is disabled; decide whether to keep or remove it.
- A few lint warnings (unused variables) in `packages/backend`.
