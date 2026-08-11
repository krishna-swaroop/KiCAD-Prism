#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -n "${PRISM_VIEWER_ROOT:-}" ]]; then
  SRC="$PRISM_VIEWER_ROOT/native/prism-clipper2"
else
  SRC="$ROOT/kicad-prism-viewer/native/prism-clipper2"
fi
BUILD="$SRC/build"

case "$(uname -s)" in
  Darwin)
    OS="darwin"
    EXT="dylib"
    ;;
  Linux)
    OS="linux"
    EXT="so"
    ;;
  *)
    echo "unsupported OS: $(uname -s)" >&2
    exit 2
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64)
    ARCH="arm64"
    ;;
  x86_64|amd64)
    ARCH="x86_64"
    ;;
  *)
    echo "unsupported arch: $(uname -m)" >&2
    exit 2
    ;;
esac

DEST="$SRC/$OS-$ARCH"

cmake -S "$SRC" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD" --config Release --parallel
ctest --test-dir "$BUILD" --output-on-failure

mkdir -p "$DEST"
cp "$BUILD/libprism_clipper2.$EXT" "$DEST/libprism_clipper2.$EXT"

python3 - "$SRC" "$OS-$ARCH" "$DEST/libprism_clipper2.$EXT" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
platform_key = sys.argv[2]
library = Path(sys.argv[3])
manifest_path = root / "manifest.json"
if manifest_path.exists():
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
else:
    manifest = {
        "schema": "prism.clipper2_bundle_a0",
        "version": "0.1.0",
        "abi": 20260708,
        "protocols": ["a2"],
        "libraries": {},
    }
digest = hashlib.sha256(library.read_bytes()).hexdigest()
manifest.setdefault("libraries", {})[platform_key] = {
    "path": library.relative_to(root).as_posix(),
    "sha256": digest,
}
manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(manifest["libraries"][platform_key], indent=2))
PY
