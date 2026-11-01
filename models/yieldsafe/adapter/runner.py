"""Validate a request, run it in a child process with limits, return the response."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone

from yieldsafe import MODEL_VERSION

from . import ADAPTER_VERSION
from .schema import ExecuteResponse, YieldSafeInputs

# SHA-256 of "Yield-SAFE v2.xlsx" as downloaded from Cranfield (CORD), the workbook the
# golden test was generated from (tests/fixtures/workbook_default.json.gz).
REFERENCE_WORKBOOK_SHA256 = "4499e230301244338caddac6d81b3decd8161a53a9ffe821ff72c722c2a94b96"

# Limits (override with environment variables on the host). A 30-year run takes ~0.3 s.
TIMEOUT_S = int(os.environ.get("YIELDSAFE_TIMEOUT_S", "60"))
MEMORY_MB = int(os.environ.get("YIELDSAFE_MEMORY_MB", "1024"))


class JobError(Exception):
    def __init__(self, status: int, kind: str, detail: str):
        super().__init__(detail)
        self.status, self.kind, self.detail = status, kind, detail


def input_sha256(inputs: YieldSafeInputs) -> str:
    canonical = json.dumps(inputs.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def execute(inputs: YieldSafeInputs) -> ExecuteResponse:
    started = time.time()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with tempfile.TemporaryDirectory(prefix="yieldsafe-") as workdir:
        with open(os.path.join(workdir, "request.json"), "w") as f:
            json.dump({"inputs": inputs.model_dump(mode="json")}, f)
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": workdir,
            "PYTHONPATH": root,
            "PYTHONDONTWRITEBYTECODE": "1",
            "YIELDSAFE_MEMORY_MB": str(MEMORY_MB),
        }
        try:
            proc = subprocess.run(
                [sys.executable, "-m", "adapter.run_job", workdir],
                env=env, cwd=root, capture_output=True, text=True, timeout=TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            raise JobError(504, "timeout", f"Yield-SAFE did not finish within {TIMEOUT_S} s") from None
        result_path = os.path.join(workdir, "result.json")
        if not os.path.exists(result_path):
            tail = (proc.stderr or "")[-500:]
            raise JobError(500, "model_error", f"Yield-SAFE exited with code {proc.returncode}: {tail}")
        with open(result_path) as f:
            result = json.load(f)

    if proc.returncode == 2:
        raise JobError(400, "bad_input", result.get("detail", "invalid input"))
    if proc.returncode != 0:
        raise JobError(500, "model_error", result.get("detail", "model error"))

    return ExecuteResponse.model_validate(
        {
            "outputs": result["outputs"],
            "run": {
                "model_version": MODEL_VERSION,
                "reference_workbook_sha256": REFERENCE_WORKBOOK_SHA256,
                "adapter_version": ADAPTER_VERSION,
                "input_sha256": input_sha256(inputs),
                "started_at": datetime.fromtimestamp(started, timezone.utc).isoformat(),
                "duration_s": round(time.time() - started, 3),
                "first_day": result["first_day"],
                "last_day": result["last_day"],
                "warnings": result["warnings"],
            },
        }
    )
