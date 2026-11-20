"""Validate a request, run it in a child process with limits, return the response."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time

from . import ADAPTER_VERSION
from .schema import ExecuteResponse, ShambaInputs

MODEL_VERSION = "1.2"
UPSTREAM_COMMIT = os.environ.get("SHAMBA_COMMIT", "unknown")

# Limits (override with environment variables on the host).
TIMEOUT_S = int(os.environ.get("SHAMBA_TIMEOUT_S", "120"))
MEMORY_MB = int(os.environ.get("SHAMBA_MEMORY_MB", "1024"))


class JobError(Exception):
    def __init__(self, status: int, kind: str, detail: str):
        super().__init__(detail)
        self.status, self.kind, self.detail = status, kind, detail


def input_sha256(inputs: ShambaInputs) -> str:
    canonical = json.dumps(inputs.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def execute(inputs: ShambaInputs) -> ExecuteResponse:
    started = time.time()
    with tempfile.TemporaryDirectory(prefix="shamba-") as workdir:
        with open(os.path.join(workdir, "request.json"), "w") as f:
            json.dump({"inputs": inputs.model_dump(mode="json")}, f)

        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "SHAMBA_SRC": os.environ.get("SHAMBA_SRC", ""),
            "MPLBACKEND": "Agg",
            "MPLCONFIGDIR": workdir,
            "HOME": workdir,
            "PYTHONPATH": os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "SHAMBA_MEMORY_MB": str(MEMORY_MB),
        }
        try:
            proc = subprocess.run(
                [sys.executable, "-m", "adapter.run_job", workdir],
                env=env,
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            raise JobError(504, "timeout", f"SHAMBA did not finish within {TIMEOUT_S} s")

        result_path = os.path.join(workdir, "result.json")
        if not os.path.exists(result_path):
            tail = (proc.stderr or "")[-500:]
            raise JobError(500, "model_error", f"SHAMBA exited with code {proc.returncode}: {tail}")
        with open(result_path) as f:
            result = json.load(f)

    if proc.returncode == 2:
        raise JobError(400, "bad_input", result.get("detail", "invalid input"))
    if proc.returncode != 0:
        raise JobError(500, "model_error", result.get("detail", "model error"))

    run = result["run"]
    return ExecuteResponse.model_validate(
        {
            "outputs": result["outputs"],
            "run": {
                "model_version": MODEL_VERSION,
                "upstream_commit": UPSTREAM_COMMIT,
                "adapter_version": ADAPTER_VERSION,
                "input_sha256": input_sha256(inputs),
                "started_at": run["started_at"],
                "duration_s": round(time.time() - started, 3),
                "gwp": run["gwp"],
                "warnings": run["warnings"],
            },
        }
    )
