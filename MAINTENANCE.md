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
3. Check MongoDB backups and storage use, and run
   `migrate.ts status` on staging and production: both should list the same
   migrations (see "Changing the database").

**Yearly**
1. Renew the Apple Developer membership and signing certificate before they
   expire, or desktop releases will fail.
2. Review who has access to each account below and remove people who have left.
3. Restore a production backup into a scratch database and open a few projects,
   to prove the backups work.

## Accounts the app depends on

The owner of the company should hold an admin login for every one of these,
not only the developer. Rotate keys whenever a person with access leaves.

| Service | Used for | Where the key lives |
|---|---|---|
| GitHub (`regen-farmer`) | code, CI, releases | repository and environment secrets |
| Render | hosting web app, backend, tile server | Render environment settings |
| MongoDB (mongodb.com) | all application data; staging and production have separate databases | `DATABASEURL` |
| Auth0 | logins | `AUTH_AUTH0_*`, `AUTH_SECRET` |
| Stripe | subscriptions and payments | `STRIPE_SECRET_KEY`, `STRIPE_MODE` |
| Resend | email | `RESEND_API_KEY` |
| Geocoding provider | address search | `GEOCODER_API_KEY`, `VITE_GEOCODER_API_KEY` |
| MapTiler | base maps | frontend configuration |
| Apple Developer | signing and notarising the macOS app | `MAC_CERT_*`, `APPLE_*` secrets |
| Domain registrar / DNS | `regenworks.com` | registrar account |

Environment variable names are listed in `packages/backend/.env.example`,
`packages/isomorphic/.env.example` and `.env.docker.example`.

## Changing the database

So far every schema change has only **added** things (new collections, new
optional fields), which is why old projects keep loading. Keep it that way
unless there is a reason not to, and when there is, make it a planned change.

**Rules**
1. **Add by default.** New fields are optional, or have a default that is also
   correct for old documents. Code that reads a document copes with the field
   being missing.
2. **Never rename, remove or change the type of a field in a schema alone.**
   Ship it together with a migration script, and keep reading the old shape
   until the migration has run on staging and production.
3. **Snapshots are never migrated.** A sent offer, a chosen plan and stake-out
   exports are frozen copies of what someone saw or signed. Store what is needed
   to show them again inside the snapshot, with a version number, and keep code
   that can render old versions.
4. **A version number on records that will change shape.** When a collection
   needs a breaking change, add `schemaVersion` to its documents. Old documents
   can then be upgraded when they are opened, instead of in one big batch.
5. **Breaking changes get a review** by the `reviewer` agent, like other schema
   changes (see `CLAUDE.md`).

**Writing a migration.** One standalone script per change in
`packages/db/migrations/`, named `<what>-<yyyy>-<mm>.ts`, whose first line is
`// migration: dry-run-by-default` (the runner refuses scripts without it). It
reads `DATABASEURL`, prints what it would do, writes only with `--apply`, and
exits non-zero on any error: don't catch and carry on (see
`plant-catalogue-2026-11.ts`). Running it twice must be harmless.

**Running a migration** with the runner, which keeps a ledger (the `migrations`
collection) of what ran on each database, from which commit, after which backup:

```sh
DATABASEURL=<staging> node packages/db/migrations/migrate.ts run packages/db/migrations/<file>.ts   # dry run
# take a backup of staging (or note the latest snapshot), then:
DATABASEURL=<staging> node packages/db/migrations/migrate.ts run packages/db/migrations/<file>.ts --apply --backup "<snapshot id or time>"
# check the app on staging, then the same two steps on production
DATABASEURL=<db> node packages/db/migrations/migrate.ts status
```

`status` and dry runs only read. With `--apply`, the runner first claims the
name in the ledger (state `running`), so two people can't apply the same
migration at once, then marks it `done` or `failed`. It refuses to apply
without `--backup`, from uncommitted or unpushed code, or when the name already
has a ledger entry in any state. A `running` or `failed` entry means: check the
data (or restore the backup), then delete the entry by hand before trying again.
To undo, restore the backup; there are no down-migrations.

A migration applied before the ledger existed is recorded with
`migrate.ts record <name> --note "<who, when, where>"`. **To do once:**
`plant-catalogue-2026-11` was applied on staging and production in Nov 2026
but is not in either ledger yet; record it on both. The scripts in
`migrations/legacy/` are older one-offs without a dry run; they are kept for
reference and must not be run.

**Breaking with old data.** Some planned changes will restructure data, for
example the farm / field / scenario rename (routes and collections). Before
such a change, count documents per collection by last activity and by owner,
and decide on purpose: migrate everything, or migrate recently used projects
and keep older ones read-only with an export.

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

The app makes RTK stake-out files directly: scenario → Export → "Stake-out files
(RTK)" (Grove users) downloads a zip with Trimble CSV grid points (ETRS89 / UTM
32N, mm), row start/end points, DXF, a check KML and a summary. Code:
`packages/modelling/planting/stakeout.ts` (projection in `utm.ts`, tested
against pyproj). Trees are named `<prefix>R<row>T<tree>`.

`scripts/kml-to-stakeout.py` makes the same file format and projection from an
"Export trees as KML" file, for designs exported before this existed. It
guesses rows from distances, so in odd-shaped fields its row numbers can differ
from the app's: don't mix files from the two for one field. Both take the
design's lon/lat as ETRS89 (no datum shift).

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
