# Model runners

Process-based models (SHAMBA now; DynACof and CAF next) packaged so GroveWorks
can run them. Each model gets one container that wraps the **unchanged**
upstream code with a thin adapter and speaks the same small HTTP contract.

This folder is deliberately outside the pnpm workspace (`packages/*`): nothing
here is built, linted or deployed with the app, and the app does not call these
runners yet. Background and plan: the "Model integration" proposal (Grove
project, `Tech/Model Integration Proposal.md`) and DigitAF deliverable D2.9.

| Model | Folder | Upstream | Status |
|---|---|---|---|
| SHAMBA v1.2 (carbon balance, RothC soil) | `shamba/` | [shamba-model/shamba](https://github.com/shamba-model/shamba) | Wrapper + golden test |
| DynACof (coffee agroforestry growth/yield) | – | [VEZY/DynACof](https://github.com/VEZY/DynACof) | Planned |
| CAF (coffee agroforestry) | – | version to confirm | Planned |

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

## Hosting (not set up yet)

Agreed direction: Fly.io or Google Cloud Run, scale to zero, with usage limits
set before anything is deployed (monthly spend cap with alerts, per-run CPU,
memory and time, max concurrent runs, runs per user per day). GroveWorks will
call runners from the backend only, behind Grove roles under `/internal`.

## Adding a model

1. `models/<id>/` with `Dockerfile` (pinned upstream), `adapter/` (schema,
   translation to the model's native files, runner, server, cli),
   `schema/`, `tests/` with a golden test, and a README.
2. A job in `.github/workflows/models.yml`, path-filtered to its folder.
3. A row in the table above.
