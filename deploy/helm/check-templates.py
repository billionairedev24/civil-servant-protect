#!/usr/bin/env python3
"""
Structural check for the Helm templates.

`helm template` is the real check and CI runs it. This exists for environments
where Helm is not installed, and as a fast pre-commit: it drops the Go-template
control flow, turns block helpers into a placeholder key, and parses what is left
as YAML.

It cannot catch a logic error — a wrong value, a missing conditional — but it does
catch the indentation and nesting mistakes that are most of what goes wrong in a
chart, and it needs nothing but Python.

    python3 deploy/helm/check-templates.py
"""

import pathlib
import re
import sys

import yaml

TEMPLATES = pathlib.Path(__file__).parent / "csp" / "templates"

# {{/* ... */}} may span lines, so it is removed before anything else.
COMMENT = re.compile(r"\{\{-?\s*/\*.*?\*/\s*-?\}\}", re.S)
CONTROL = re.compile(r"^\s*\{\{-?\s*(if|else|end|range|with|define)\b")
# A line that is only an expression expands to a block — a labels map, a
# securityContext. One key keeps the nesting parseable.
BLOCK_ONLY = re.compile(r"^(\s*)\{\{-?.*\}\}\s*$")
EXPR = re.compile(r"\{\{-?.*?-?\}\}", re.S)


def flatten(source: str) -> str:
    out = []
    for line in COMMENT.sub("", source).splitlines():
        if CONTROL.match(line):
            continue
        block = BLOCK_ONLY.match(line)
        if block:
            out.append(f"{block.group(1)}rendered: block")
            continue
        if "toYaml" in line or "include" in line:
            out.append(line.split(":")[0] + ": placeholder")
            continue
        out.append(EXPR.sub("placeholder", line))
    return "\n".join(out)


def main() -> int:
    failures = 0
    checked = 0
    for path in sorted(TEMPLATES.glob("*.yaml")):
        try:
            docs = [d for d in yaml.safe_load_all(flatten(path.read_text())) if isinstance(d, dict)]
        except yaml.YAMLError as error:
            print(f"  {path.name:22} FAIL {str(error).splitlines()[0]}")
            failures += 1
            continue

        kinds = sorted({d["kind"] for d in docs if "kind" in d})
        if not kinds:
            print(f"  {path.name:22} FAIL no Kubernetes object produced")
            failures += 1
            continue

        print(f"  {path.name:22} ok   {', '.join(kinds)}")
        checked += 1

    print(f"\n{checked} template(s) parse, {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
