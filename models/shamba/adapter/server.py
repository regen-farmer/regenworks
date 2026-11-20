"""HTTP server for the SHAMBA process, shaped on OGC API - Processes Part 1.

    uvicorn adapter.server:app --host 0.0.0.0 --port 8080

Endpoints:
  GET  /                              landing page (links)
  GET  /conformance                   conformance classes
  GET  /processes                     list (one process: shamba)
  GET  /processes/shamba              description with input/output JSON Schemas
  POST /processes/shamba/execution    run synchronously, body {"inputs": {...}}
  GET  /health                        liveness

Only synchronous execution is offered. Queuing, retries and storing results
belong to the GroveWorks job runner, which calls this endpoint.

Settings (environment):
  SHAMBA_API_TOKEN    if set, every request except /health needs
                      "Authorization: Bearer <token>". Always set it when hosted.
  SHAMBA_MAX_CONCURRENT  runs at once in this container (default 2); extra
                      requests get 429 instead of queueing.
  SHAMBA_MAX_BODY_KB  request size limit (default 512)
  SHAMBA_TIMEOUT_S, SHAMBA_MEMORY_MB  per-run limits (see runner.py)
"""

from __future__ import annotations

import asyncio
import hmac
import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import ADAPTER_VERSION
from .runner import MEMORY_MB, MODEL_VERSION, TIMEOUT_S, UPSTREAM_COMMIT, JobError, execute
from .schema import MAX_COHORTS, MAX_YEARS, ExecuteRequest, ExecuteResponse

API_TOKEN = os.environ.get("SHAMBA_API_TOKEN", "")
MAX_CONCURRENT = int(os.environ.get("SHAMBA_MAX_CONCURRENT", "2"))
MAX_BODY = int(os.environ.get("SHAMBA_MAX_BODY_KB", "512")) * 1024

app = FastAPI(
    title="SHAMBA process (GroveWorks wrapper)",
    version=ADAPTER_VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
_slots = asyncio.Semaphore(MAX_CONCURRENT)


def problem(status: int, kind: str, detail: str) -> JSONResponse:
    return JSONResponse(
        {"type": f"urn:groveworks:models:{kind}", "title": kind.replace("_", " "), "status": status, "detail": detail},
        status_code=status,
        media_type="application/problem+json",
    )


@app.middleware("http")
async def guard(request: Request, call_next):
    if request.url.path != "/health":
        if API_TOKEN:
            sent = request.headers.get("authorization", "")
            if not hmac.compare_digest(sent, f"Bearer {API_TOKEN}"):
                return problem(401, "unauthorized", "missing or wrong bearer token")
        length = request.headers.get("content-length")
        if length and int(length) > MAX_BODY:
            return problem(413, "too_large", f"request body over {MAX_BODY // 1024} KB")
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def invalid(_request: Request, exc: RequestValidationError):
    msgs = []
    for e in exc.errors()[:20]:
        where = ".".join(str(p) for p in e.get("loc", ()) if p != "body")
        msgs.append(f"{where}: {e.get('msg')}")
    return problem(400, "bad_input", "; ".join(msgs))


def description() -> dict:
    return {
        "id": "shamba",
        "title": "SHAMBA v1.2 (Small-Holder Agriculture Mitigation Benefit Assessment)",
        "description": "Annual greenhouse-gas balance of a baseline vs. a project land use "
        "(trees, crops, soil with RothC, litter, fertiliser, fire), per hectare.",
        "version": f"{MODEL_VERSION}+adapter.{ADAPTER_VERSION}",
        "jobControlOptions": ["sync-execute"],
        "outputTransmission": ["value"],
        "upstream": {
            "repository": "https://github.com/shamba-model/shamba",
            "commit": UPSTREAM_COMMIT,
            "licence": "University of Edinburgh Open Technology terms (see the upstream LICENCE.txt)",
            "documentation": "https://www.planvivo.org/pt001",
        },
        "opaInterfaces": {"inputs": ["I1", "I2", "I3", "I4"], "outputs": ["I8", "I9"]},
        "limits": {
            "maxYears": MAX_YEARS,
            "maxCohorts": MAX_COHORTS,
            "timeoutSeconds": TIMEOUT_S,
            "memoryMB": MEMORY_MB,
            "maxConcurrent": MAX_CONCURRENT,
            "maxBodyKB": MAX_BODY // 1024,
            "network": "none: climate and soil must be supplied in the request",
        },
        "inputs": ExecuteRequest.model_json_schema(),
        "outputs": ExecuteResponse.model_json_schema(),
        "links": [{"href": "/processes/shamba/execution", "rel": "http://www.opengis.net/def/rel/ogc/1.0/execute"}],
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def landing():
    return {
        "title": "GroveWorks model runner: SHAMBA",
        "links": [
            {"href": "/conformance", "rel": "http://www.opengis.net/def/rel/ogc/1.0/conformance"},
            {"href": "/processes", "rel": "http://www.opengis.net/def/rel/ogc/1.0/processes"},
        ],
    }


@app.get("/conformance")
def conformance():
    return {
        "conformsTo": [
            "http://www.opengis.net/spec/ogcapi-processes-1/1.0/conf/core",
            "http://www.opengis.net/spec/ogcapi-processes-1/1.0/conf/json",
        ]
    }


@app.get("/processes")
def processes():
    d = description()
    return {"processes": [{k: d[k] for k in ("id", "title", "version", "jobControlOptions", "links")}]}


@app.get("/processes/shamba")
def process():
    return description()


@app.post("/processes/shamba/execution", response_model=ExecuteResponse)
async def run(body: ExecuteRequest):
    if _slots.locked():
        return problem(429, "busy", f"{MAX_CONCURRENT} runs already in progress; retry later")
    async with _slots:
        try:
            return await run_in_threadpool(execute, body.inputs)
        except JobError as e:
            return problem(e.status, e.kind, e.detail)
