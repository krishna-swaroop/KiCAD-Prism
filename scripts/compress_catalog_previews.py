#!/usr/bin/env python3
"""Gzip catalog previews written before previews were stored compressed.

New previews are written as ``<sha256>.svg.gz``; rows keep the ``.svg`` path,
and every reader resolves the stored file. This converts the plain ``.svg``
files left from earlier, in place. Safe to rerun and to run while the app is
serving: each file is replaced by its gzipped form atomically, and readers
accept either form.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
for candidate in (REPO_ROOT / "backend", REPO_ROOT):
    if (candidate / "app").is_dir():
        sys.path.insert(0, str(candidate))
        break


def main() -> int:
    from app.services.catalog.preview_files import compress_in_place  # noqa: PLC0415

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("previews_root", type=Path, help="The catalog store's previews directory")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    versions = args.previews_root / "versions"
    files = sorted(versions.rglob("*.svg")) if versions.is_dir() else []
    saved = 0
    for path in files:
        if not args.dry_run:
            saved += compress_in_place(path)
    print(json.dumps({"files": len(files), "bytes_saved": saved, "dry_run": args.dry_run}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
