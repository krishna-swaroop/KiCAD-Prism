#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$(cd "$ROOT/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-/Users/Swaroop/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3}"

export PYTHONPATH="$ROOT/references/kicad_monkey/src/py:$ROOT${PYTHONPATH:+:$PYTHONPATH}"

"$PYTHON_BIN" -m pipeline.topology_compiler schematic-world \
  "$WORKSPACE/JTYU-OBC/OBC.kicad_pro" \
  --output "$ROOT/samples/jtyu-obc-gltf"
