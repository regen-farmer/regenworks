"""Run one Yield-SAFE job in its own process.

    python -m adapter.run_job <workdir>

Reads <workdir>/request.json (an already validated request), runs the model and
writes <workdir>/result.json. The model is pure Python and keeps no state between
runs, but each job still gets a fresh process so the parent can enforce time and
memory limits the same way as for the other runners.
Exit codes: 0 ok, 2 bad input, 3 model error.
"""

from __future__ import annotations

import json
import os
import sys
import traceback


def limit_memory() -> None:
    mb = int(os.environ.get("YIELDSAFE_MEMORY_MB", "0") or 0)
    if mb > 0:
        try:
            import resource

            resource.setrlimit(resource.RLIMIT_AS, (mb * 1024 * 1024, mb * 1024 * 1024))
        except (ImportError, ValueError, OSError):
            pass


def main(workdir: str) -> int:
    limit_memory()
    from .build import run
    from .schema import ExecuteRequest

    def write(obj) -> None:
        with open(os.path.join(workdir, "result.json"), "w") as f:
            json.dump(obj, f)

    with open(os.path.join(workdir, "request.json")) as f:
        req = ExecuteRequest.model_validate_json(f.read())
    try:
        result = run(req.inputs)
    except ValueError as e:
        write({"detail": str(e)})
        return 2
    except Exception as e:  # noqa: BLE001 - report any model failure as a model error
        traceback.print_exc()
        write({"detail": f"{type(e).__name__}: {e}"})
        return 3
    write(result)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
