"""HTTP server for the Yield-SAFE process, shaped on OGC API - Processes Part 1.

    uvicorn adapter.server:app --host 0.0.0.0 --port 8080

Endpoints:
  GET  /                              landing page (links)
  GET  /conformance                   conformance classes
  GET  /processes                     list (one process: yieldsafe)
  GET  /processes/yieldsafe              description with input/output JSON Schemas
  POST /processes/yieldsafe/execution    run synchronously, body {"inputs": {...}}
  GET  /health                        liveness

Only synchronous execution is offered. Queuing, retries and storing results
belong to the GroveWorks job runner, which calls this endpoint.

Settings (environment):
  YIELDSAFE_API_TOKEN    if set, every request except /health needs
                      "Authorization: Bearer <token>". Always set it when hosted.
  YIELDSAFE_MAX_CONCURRENT  runs at once in this container (default 2); extra
                      requests get 429 instead of queueing.
  YIELDSAFE_MAX_BODY_KB  request size limit (default 4096)
  YIELDSAFE_TIMEOUT_S, YIELDSAFE_MEMORY_MB  per-run limits (see runner.py)
"""

from __future__ import annotations

import asyncio
import hmac
import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from yieldsafe import MODEL_VERSION
from yieldsafe.model import DAILY_COLUMNS
from yieldsafe.templates import CROPS, SOILS, TREES

from . import ADAPTER_VERSION
from .runner import MEMORY_MB, REFERENCE_WORKBOOK_SHA256, TIMEOUT_S, JobError, execute
from .schema import MAX_DAYS, MAX_YEARS, ExecuteRequest, ExecuteResponse

API_TOKEN = os.environ.get("YIELDSAFE_API_TOKEN", "")
MAX_CONCURRENT = int(os.environ.get("YIELDSAFE_MAX_CONCURRENT", "2"))
MAX_BODY = int(os.environ.get("YIELDSAFE_MAX_BODY_KB", "4096")) * 1024  # 100 years of weather ~2 MB

app = FastAPI(
    title="Yield-SAFE process (GroveWorks wrapper)",
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
        "id": "yieldsafe",
        "title": "Yield-SAFE v2 (tree, crop and agroforestry yields; Cranfield University)",
        "description": "Daily simulation of tree growth, crop growth and the soil water balance for "
        "tree-only, crop-only and agroforestry (silvoarable, silvopastoral) systems in temperate Europe. "
        "Returns yearly crop yields, tree height, diameter, timber volume and tree carbon, plus optional daily variables.",
        "version": f"{MODEL_VERSION}+adapter.{ADAPTER_VERSION}",
        "jobControlOptions": ["sync-execute"],
        "outputTransmission": ["value"],
        "upstream": {
            "model": "Yield-SAFE v2 model in Excel (Burgess, Graves, Upson, Palma, Wiltshire 2023), Cranfield University",
            "repository": "https://dspace.lib.cranfield.ac.uk/ (Cranfield Online Research Data: 'Yield-SAFE v2')",
            "port": "Python port in this container, reproducing the workbook's daily columns; see NOTICE.md",
            "referenceWorkbookSha256": REFERENCE_WORKBOOK_SHA256,
            "licence": "The authors allow use and modification for research and education; "
            "commercial use needs their permission (p.burgess@cranfield.ac.uk, a.graves@cranfield.ac.uk).",
            "reference": "van der Werf et al. (2007) Ecological Engineering 29: 419-433; Upson (2014) PhD thesis, Cranfield University",
        },
        "opaInterfaces": {"inputs": ["I1", "I2", "I3", "I4"], "outputs": ["I5", "I8"]},
        "templates": {
            "trees": {k: label for k, (label, _) in TREES.items()},
            "crops": {str(code): c.name for code, c in CROPS.items()},
            "soils": {k: v["label"] for k, v in SOILS.items()},
        },
        "limits": {
            "maxDays": MAX_DAYS,
            "maxYears": MAX_YEARS,
            "timeoutSeconds": TIMEOUT_S,
            "memoryMB": MEMORY_MB,
            "maxConcurrent": MAX_CONCURRENT,
            "maxBodyKB": MAX_BODY // 1024,
            "network": "none: weather must be supplied in the request",
        },
        "dailyVariables": [{"name": n, "unit": u, "description": d} for n, (_c, u, d) in DAILY_COLUMNS.items()],
        "inputs": ExecuteRequest.model_json_schema(),
        "outputs": ExecuteResponse.model_json_schema(),
        "links": [{"href": "/processes/yieldsafe/execution", "rel": "http://www.opengis.net/def/rel/ogc/1.0/execute"}],
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def landing():
    return {
        "title": "GroveWorks model runner: Yield-SAFE",
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


@app.get("/processes/yieldsafe")
def process():
    return description()


@app.post("/processes/yieldsafe/execution", response_model=ExecuteResponse)
async def run(body: ExecuteRequest):
    if _slots.locked():
        return problem(429, "busy", f"{MAX_CONCURRENT} runs already in progress; retry later")
    async with _slots:
        try:
            return await run_in_threadpool(execute, body.inputs)
        except JobError as e:
            return problem(e.status, e.kind, e.detail)
