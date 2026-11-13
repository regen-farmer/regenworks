"""Write the JSON Schemas to ../schema/. Run with --check in CI to fail if they are stale."""

from __future__ import annotations

import json
import os
import sys

from .schema import ExecuteRequest, ExecuteResponse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "schema")
FILES = {
    "request.schema.json": ExecuteRequest,
    "response.schema.json": ExecuteResponse,
}


def render(model) -> str:
    schema = model.model_json_schema()
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    return json.dumps(schema, indent=2, ensure_ascii=False) + "\n"


def main(check: bool) -> int:
    os.makedirs(OUT, exist_ok=True)
    stale = []
    for name, model in FILES.items():
        path = os.path.join(OUT, name)
        text = render(model)
        current = open(path).read() if os.path.exists(path) else None
        if current != text:
            if check:
                stale.append(name)
            else:
                with open(path, "w") as f:
                    f.write(text)
    if stale:
        print("Stale schema files (run python -m adapter.export_schema):", ", ".join(stale))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
