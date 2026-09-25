#!/usr/bin/env python3
"""Reproduce Prism's locked Python and Node development environments."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYTHON_VERSION = (ROOT / ".python-version").read_text(encoding="utf-8").strip()
NODE_VERSION = (ROOT / ".node-version").read_text(encoding="utf-8").strip()
RUNTIME_INPUT = ROOT / "requirements" / "runtime.in"
RUNTIME_LOCK = ROOT / "requirements" / "runtime.lock"
BACKEND_PYTHON = ROOT / "backend" / "venv" / (
    "Scripts/python.exe" if sys.platform == "win32" else "bin/python"
)


def run(*argv: str, cwd: Path = ROOT) -> None:
    subprocess.run(argv, cwd=cwd, check=True)


def tool(name: str) -> str:
    resolved = shutil.which(name)
    if resolved is None:
        raise SystemExit(f"{name} is required but is not on PATH")
    return resolved


def update_lock() -> None:
    uv = tool("uv")
    run(
        uv,
        "pip",
        "compile",
        str(RUNTIME_INPUT),
        "--output-file",
        str(RUNTIME_LOCK),
        "--python-version",
        PYTHON_VERSION,
        "--universal",
        "--upgrade",
        "--custom-compile-command",
        "python scripts/sync_dependencies.py --update-lock",
    )


def sync_python() -> None:
    uv = tool("uv")
    venv = ROOT / "backend" / "venv"
    run(uv, "venv", str(venv), "--python", PYTHON_VERSION, "--clear")
    run(uv, "pip", "sync", "--python", str(BACKEND_PYTHON), str(RUNTIME_LOCK))
    run(
        str(BACKEND_PYTHON),
        str(ROOT / "scripts" / "verify_dependency_identity.py"),
        "--python-only",
    )


def current_node_version() -> str:
    output = subprocess.check_output([tool("node"), "--version"], text=True).strip()
    return output.removeprefix("v")


def sync_node() -> None:
    actual = current_node_version()
    if actual != NODE_VERSION:
        raise SystemExit(
            f"Node {NODE_VERSION} is required; current Node is {actual}. "
            "Select the version in .node-version and rerun."
        )
    run(
        sys.executable,
        str(ROOT / "scripts" / "verify_dependency_identity.py"),
        "--node-only",
    )
    npm = tool("npm")
    run(npm, "ci", cwd=ROOT / "frontend")
    run(npm, "ci", cwd=ROOT / "kicad-prism-viewer")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--update-lock", action="store_true")
    parser.add_argument("--python-only", action="store_true")
    parser.add_argument("--node-only", action="store_true")
    args = parser.parse_args()
    if args.python_only and args.node_only:
        parser.error("--python-only and --node-only are mutually exclusive")
    if args.update_lock:
        update_lock()
    if not args.node_only:
        sync_python()
    if not args.python_only:
        sync_node()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
