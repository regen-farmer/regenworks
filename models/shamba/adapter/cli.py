"""Run one request from a file, for batch jobs (e.g. Cloud Run Jobs, Fly Machines).

    python -m adapter.cli request.json [response.json]

Writes the response JSON to the second path, or to stdout.
Exit codes: 0 ok, 2 bad input, 3 model error, 4 timeout.
"""

from __future__ import annotations

import json
import sys

from pydantic import ValidationError

from .runner import JobError, execute
from .schema import ExecuteRequest

CODES = {"bad_input": 2, "model_error": 3, "timeout": 4}


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    with open(argv[1]) as f:
        raw = f.read()
    try:
        req = ExecuteRequest.model_validate_json(raw)
        out = execute(req.inputs).model_dump_json(indent=2)
    except ValidationError as e:
        print(e, file=sys.stderr)
        return 2
    except JobError as e:
        print(f"{e.kind}: {e.detail}", file=sys.stderr)
        return CODES.get(e.kind, 3)
    if len(argv) > 2:
        with open(argv[2], "w") as f:
            f.write(out)
    else:
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
