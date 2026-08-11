#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$(cd "$ROOT/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-/Users/Swaroop/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3}"

export PYTHONPATH="$ROOT/references/kicad_monkey/src/py:$ROOT${PYTHONPATH:+:$PYTHONPATH}"

"$PYTHON_BIN" -m pipeline.topology_compiler from-project \
  "$WORKSPACE/USB-PD-Trigger-Board/USB-PD-Trigger-Board.kicad_pro" \
  --output "$ROOT/samples/usb-pd-trigger-board"
