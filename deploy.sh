#!/usr/bin/env bash
# KiCAD Prism deployment installer (Linux, macOS, WSL2).
#
# Thin launcher: locates a Python interpreter and hands over to
# scripts/prism_deploy. All logic lives there so Windows and Unix share one
# implementation rather than two that drift.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

for candidate in python3 python; do
	if command -v "$candidate" >/dev/null 2>&1; then
		if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
			exec "$candidate" -m scripts.prism_deploy "$@"
		fi
	fi
done

echo "Python 3.9 or newer is required." >&2
echo "  Debian/Ubuntu:  sudo apt install python3" >&2
echo "  macOS:          brew install python3" >&2
exit 1
