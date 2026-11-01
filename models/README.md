# Model runners

Process-based models (SHAMBA and DynACof now; CAF next) packaged so GroveWorks
can run them. Each model gets one container that wraps the **unchanged**
upstream code with a thin adapter and speaks the same small HTTP contract.

This folder is deliberately outside the pnpm workspace (`packages/*`): nothing
here is built, linted or deployed with the app, and the app does not call these
runners yet. Background and plan: the "Model integration" proposal (Grove
project, `Tech/Model Integration Proposal.md`) and DigitAF deliverable D2.9.

| Model | Folder | Upstream | Status |
|---|---|---|---|
| SHAMBA v1.2 (carbon balance, RothC soil) | `shamba/` | [shamba-model/shamba](https://github.com/shamba-model/shamba) | Wrapper + golden test |
| DynACof.jl 1.5.3 (coffee agroforestry growth, yield, water) | `dynacof/` | [VEZY/DynACof.jl](https://github.com/VEZY/DynACof.jl) | Wrapper + golden test |
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
   commit or package version (a lockfile such as Julia's `Manifest.toml`); CI
   uses the same pin for the tests.
2. **Golden test:** the wrapper must reproduce the upstream example's
   published or directly computed result at the pinned commit.
3. **No network during a run.** Inputs such as climate and soil arrive in the
   request (GroveWorks builds them once per field and caches them).
4. **No user-supplied code.** Only built-in model options are accepted. Where
   a model's own parameter files are code (DynACof's `.jl` files), the runner
   takes typed values and builds the parameters itself.
5. **Limits are part of the description:** run time, memory, concurrent runs,
   body size, model-specific maximums (years, cohorts).
6. **A token is required when hosted** (`<MODEL>_API_TOKEN`), and the
   container runs as a non-root user with a read-only filesystem.
7. **Isolate runs.** A fresh process per run where start-up is cheap (SHAMBA);
   a pool of long-lived workers that are killed and replaced on time-out where
   start-up is expensive (DynACof: ~20 s of Julia compilation).

## Hosting (not set up yet)

Agreed direction: Fly.io or Google Cloud Run, scale to zero, with usage limits
set before anything is deployed (monthly spend cap with alerts, per-run CPU,
memory and time, max concurrent runs, runs per user per day). GroveWorks will
call runners from the backend only, behind Grove roles under `/internal`.

Cold starts differ: SHAMBA answers within seconds of boot; DynACof needs
~20–60 s to compile before its first run. With scale-to-zero, the first
DynACof run after idle pays that wait (GroveWorks should treat 503 "starting"
as "retry shortly"). A precompiled Julia system image (PackageCompiler) would
cut it to a few seconds if that becomes a problem.

## Adding a model

1. `models/<id>/` with `Dockerfile` (pinned upstream), `adapter/` (schema,
   translation to the model's native files, runner, server, cli),
   `schema/`, `tests/` with a golden test, and a README.
2. A job in `.github/workflows/models.yml`, path-filtered to its folder.
3. A row in the table above.
