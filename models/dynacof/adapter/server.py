"""HTTP server for the DynACof process, same contract as the SHAMBA runner
(OGC API - Processes Part 1 shape, synchronous execution). See ../../README.md.

    uvicorn adapter.server:app --host 0.0.0.0 --port 8080

Settings (environment):
  DYNACOF_API_TOKEN       bearer token for everything except /health (set it when hosted)
  DYNACOF_MAX_CONCURRENT  Julia workers = runs at once (default 1); more get 429
  DYNACOF_TIMEOUT_S       per run (default 180); the worker is replaced on time-out
  DYNACOF_MEMORY_MB       heap size hint per worker (default 2048)
  DYNACOF_MAX_BODY_KB     request size limit (default 8192; 60 years of weather is ~4 MB)
  DYNACOF_LAZY_START      "1" = start workers on the first request instead of at boot
"""

from __future__ import annotations

import asyncio
import hmac
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import ADAPTER_VERSION
from .runner import MAX_CONCURRENT, MEMORY_MB, MODEL_VERSION, TIMEOUT_S, JobError, execute, pool
from .schema import MAX_DAILY_VARIABLES, MAX_DAYS, ExecuteRequest, ExecuteResponse

API_TOKEN = os.environ.get("DYNACOF_API_TOKEN", "")
MAX_BODY = int(os.environ.get("DYNACOF_MAX_BODY_KB", "8192")) * 1024
_ready = asyncio.Event()


@asynccontextmanager
async def lifespan(_app):
    # Start (compile) the workers in the background so /health can answer
    # "starting" meanwhile; runs requested before then get 503.
    async def warm():
        if os.environ.get("DYNACOF_LAZY_START") != "1":
            try:
                await run_in_threadpool(pool().start_all)
            except Exception:  # noqa: BLE001  (a worker that failed restarts on its first job)
                pass
        _ready.set()

    task = asyncio.create_task(warm())
    yield
    task.cancel()
    pool().stop_all()


app = FastAPI(
    title="DynACof process (GroveWorks wrapper)",
    version=ADAPTER_VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


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
        "id": "dynacof",
        "title": "DynACof (Dynamic Agroforestry Coffee Crop Model), Julia version",
        "description": "Daily process-based simulation of a coffee plantation with or without shade "
        "trees: carbon allocation, growth, yield, energy and water balance. Returned as yearly summaries.",
        "version": f"{MODEL_VERSION}+adapter.{ADAPTER_VERSION}",
        "jobControlOptions": ["sync-execute"],
        "outputTransmission": ["value"],
        "upstream": {
            "repository": "https://github.com/VEZY/DynACof.jl",
            "package": f"DynACof {MODEL_VERSION} (Julia General registry)",
            "licence": "GPL-3.0",
            "reference": "Vezy et al. (2020), Agricultural and Forest Meteorology, doi:10.1016/j.agrformet.2019.107856",
            "defaultParameters": "Coffea arabica under Erythrina poeppigiana, Aquiares, Costa Rica",
        },
        "opaInterfaces": {"inputs": ["I1", "I2", "I3", "I4"], "outputs": ["I5", "I8"]},
        "limits": {
            "maxDays": MAX_DAYS,
            "maxDailyVariables": MAX_DAILY_VARIABLES,
            "timeoutSeconds": TIMEOUT_S,
            "memoryMB": MEMORY_MB,
            "maxConcurrent": MAX_CONCURRENT,
            "maxBodyKB": MAX_BODY // 1024,
            "network": "none: weather must be supplied in the request",
        },
        "inputs": ExecuteRequest.model_json_schema(),
        "outputs": ExecuteResponse.model_json_schema(),
        "links": [{"href": "/processes/dynacof/execution", "rel": "http://www.opengis.net/def/rel/ogc/1.0/execute"}],
    }


@app.get("/health")
def health():
    return {"status": "ok" if _ready.is_set() else "starting"}


@app.get("/")
def landing():
    return {
        "title": "GroveWorks model runner: DynACof",
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


@app.get("/processes/dynacof")
def process():
    return description()


@app.post("/processes/dynacof/execution", response_model=ExecuteResponse)
async def run(body: ExecuteRequest):
    if not _ready.is_set():
        return problem(503, "starting", "the model is still starting (compiling); retry in a minute")
    try:
        return await run_in_threadpool(execute, body.inputs)
    except JobError as e:
        return problem(e.status, e.kind, e.detail)
