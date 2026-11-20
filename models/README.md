# Model runners

Process-based models (SHAMBA now; DynACof and CAF next) packaged so GroveWorks
can run them. Section D of GroveWorks (APCCO Uganda, `/grove/apcco`) builds their inputs from
imported field data and stores every run with its provenance. Each model gets one container that wraps the **unchanged**
upstream code with a thin adapter and speaks the same small HTTP contract.

This folder is deliberately outside the pnpm workspace (`packages/*`): nothing
here is built, linted or deployed with the app. The app calls a runner over HTTP
(`MODEL_<MODEL>_URL`, `MODEL_<MODEL>_TOKEN` on the backend); see "Hosting" below. Background and plan: the "Model integration" proposal (Grove
project, `Tech/Model Integration Proposal.md`) and DigitAF deliverable D2.9.

| Model | Folder | Upstream | Status |
|---|---|---|---|
| SHAMBA v1.2 (carbon balance, RothC soil) | `shamba/` | [shamba-model/shamba](https://github.com/shamba-model/shamba) | Wrapper + golden test; called from section D |
| DynACof (coffee agroforestry growth/yield) | – | [VEZY/DynACof](https://github.com/VEZY/DynACof) | Runner in draft PR #288; next |
| CAF2021 (coffee agroforestry) | – | CAF2021 (Zenodo) | Runner in draft PR #290; next |

## The contract

The shape follows [OGC API – Processes, Part 1](https://ogcapi.ogc.org/processes/)
(core + JSON), synchronous execution only:

| Method | Path | Returns |
|---|---|---|
| GET | `/processes` | list of processes in this container |
| GET | `/processes/{id}` | description: version, upstream repo + commit, licence, limits, OPA interfaces, and the **input and output JSON Schemas** |
| POST | `/processes/{id}/execution` | body `{"inputs": {...}}` → `{"outputs": {...}, "run": {...}}` |
| GET | `/health` | liveness (no token needed) |

- **Errors** are `application/problem+json` with `status` and `detail`:
  400 bad input, 401 no/wrong token, 413 body too large, 429 busy, 504 timeout, 500 model error.
- **`run`** is the provenance record GroveWorks stores with every result:
  model version, upstream commit, adapter version, SHA-256 of the canonical
  input, start time, duration, warnings the model logged.
- **Same image, batch mode:** `python -m adapter.cli request.json response.json`
  (exit codes 0 ok, 2 bad input, 3 model error, 4 timeout) for job platforms
  that run a container once per job.
- The JSON Schemas are generated from the adapter's models and committed in
  `<model>/schema/`. CI fails if they are out of date.

## Rules for every runner

1. **Don't copy upstream code into this repo.** The Dockerfile fetches a pinned
   commit; CI fetches the same commit for the tests.
2. **Golden test:** the wrapper must reproduce the upstream example's
   published or directly computed result at the pinned commit.
3. **No network during a run.** Inputs such as climate and soil arrive in the
   request (GroveWorks builds them once per field and caches them).
4. **No user-supplied code.** Only built-in model options are accepted.
5. **Limits are part of the description:** run time, memory, concurrent runs,
   body size, model-specific maximums (years, cohorts).
6. **A token is required when hosted** (`<MODEL>_API_TOKEN`), and the
   container runs as a non-root user with a read-only filesystem.

## Hosting on Google Cloud Run

Decided 20 Nov 2026 (Kris): **Google Cloud**, spend cap **300 kr/month**. Each runner is a
Cloud Run service that scales to zero, deployed by hand with the *Deploy model runner* workflow
(`.github/workflows/models-deploy.yml`). Images go to Grove's **private** Artifact Registry
(SHAMBA's terms: no public images). Limits per service: max 2 instances × 2 runs, 1 vCPU,
2 GiB, 5 min per request. The GroveWorks backend is the only caller (section D, `/internal/apcco`,
Grove team only), with a bearer token; it also caps runs at 20 per person per day and 3 at once.

**One-time setup (Kris, in the Google Cloud console):**
1. Create a project (e.g. `grove-models`) and link billing.
2. **Billing → Budgets & alerts:** budget 300 kr/month on the project, alerts at 50 %, 80 % and 100 %.
   (Budgets alert; they don't stop spending. The max-instances limit is the hard cap.)
3. Enable the APIs: Cloud Run, Artifact Registry, Secret Manager, IAM Credentials.
4. **Artifact Registry:** a Docker repository `models` in `europe-west1`.
5. **Secret Manager:** a secret `shamba-api-token` with a long random value. Put the same value
   on the Render backend as `MODEL_SHAMBA_TOKEN` (never in chat or in the repo).
6. **Service account** `github-deployer` with the roles Cloud Run Admin, Artifact Registry Writer,
   Service Account User and Secret Manager Secret Accessor (for the runtime service account).
7. **Workload Identity Federation** for GitHub: a pool and provider for `regen-farmer/regenworks`,
   allowed to impersonate `github-deployer` (no key file). Google's guide: "Configure Workload
   Identity Federation with deployment pipelines" (GitHub Actions).
8. In GitHub → regenworks → Settings → Secrets and variables → Actions:
   - secrets `GCP_WORKLOAD_IDENTITY_PROVIDER` (the provider's full name) and `GCP_SERVICE_ACCOUNT`
     (the service account's email);
   - variables `GCP_PROJECT_ID`, `GCP_REGION` = `europe-west1`, `GCP_ARTIFACT_REPO` = `models`.
9. Run *Actions → Deploy model runner → shamba*. Copy the service URL from the run summary to the
   Render backend as `MODEL_SHAMBA_URL`.

## Adding a model

1. `models/<id>/` with `Dockerfile` (pinned upstream), `adapter/` (schema,
   translation to the model's native files, runner, server, cli),
   `schema/`, `tests/` with a golden test, and a README.
2. A job in `.github/workflows/models.yml`, path-filtered to its folder.
3. A row in the table above.
