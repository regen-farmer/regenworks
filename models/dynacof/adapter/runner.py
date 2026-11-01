"""Validate, run on a pooled Julia worker with limits, and build the response."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from datetime import datetime, timezone

from . import ADAPTER_VERSION
from .pool import Pool, WorkerError
from .schema import DynacofInputs, ExecuteResponse

MODEL_VERSION = "1.5.3"  # DynACof.jl, pinned in ../worker/Manifest.toml

TIMEOUT_S = int(os.environ.get("DYNACOF_TIMEOUT_S", "180"))
MEMORY_MB = int(os.environ.get("DYNACOF_MEMORY_MB", "2048"))
MAX_CONCURRENT = int(os.environ.get("DYNACOF_MAX_CONCURRENT", "1"))

STATUS = {"bad_input": 400, "timeout": 504, "model_error": 500, "busy": 429}


class JobError(Exception):
    def __init__(self, kind: str, detail: str):
        super().__init__(detail)
        self.kind, self.detail = kind, detail
        self.status = STATUS.get(kind, 500)


_pool: Pool | None = None


def pool() -> Pool:
    global _pool
    if _pool is None:
        _pool = Pool(MAX_CONCURRENT, MEMORY_MB)
    return _pool


def input_sha256(inputs: DynacofInputs) -> str:
    canonical = json.dumps(inputs.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def execute(inputs: DynacofInputs) -> ExecuteResponse:
    worker = pool().acquire()
    if worker is None:
        raise JobError("busy", f"{MAX_CONCURRENT} run(s) already in progress; retry later")
    started = time.time()
    try:
        with tempfile.TemporaryDirectory(prefix="dynacof-") as workdir:
            with open(os.path.join(workdir, "request.json"), "w") as f:
                json.dump({"inputs": inputs.model_dump(mode="json", exclude_none=True)}, f)
            try:
                worker.run(workdir, TIMEOUT_S)
            except WorkerError as e:
                raise JobError(e.kind, e.detail)
            with open(os.path.join(workdir, "result.json")) as f:
                result = json.load(f)
    finally:
        pool().release(worker)

    run = result["run"]
    return ExecuteResponse.model_validate(
        {
            "outputs": result["outputs"],
            "run": {
                "model_version": MODEL_VERSION,
                "adapter_version": ADAPTER_VERSION,
                "input_sha256": input_sha256(inputs),
                "started_at": datetime.fromtimestamp(started, timezone.utc).isoformat(),
                "duration_s": round(time.time() - started, 3),
                "model_seconds": run["model_seconds"],
                "first_date": run["first_date"],
                "last_date": run["last_date"],
                "warnings": run["warnings"],
            },
        }
    )
