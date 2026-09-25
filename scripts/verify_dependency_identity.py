#!/usr/bin/env python3
"""Fail when a Prism runtime does not match the repository-owned toolchain."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import re
import subprocess
import sys
from pathlib import Path

from packaging.requirements import InvalidRequirement, Requirement


ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "requirements" / "runtime.lock"


def normalized(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def locked_versions() -> dict[str, str]:
    versions: dict[str, str] = {}
    for raw in LOCK.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or raw[:1].isspace():
            continue
        try:
            requirement = Requirement(line)
        except InvalidRequirement as exc:
            raise SystemExit(f"invalid requirement in {LOCK}: {line!r}: {exc}") from exc
        if requirement.marker is not None and not requirement.marker.evaluate():
            continue
        pins = [
            specifier.version
            for specifier in requirement.specifier
            if specifier.operator == "==" and not specifier.version.endswith(".*")
        ]
        if len(pins) != 1:
            raise SystemExit(f"runtime lock entry is not an exact pin: {line!r}")
        versions[normalized(requirement.name)] = pins[0]
    return versions


def verify_python() -> dict[str, str]:
    required_python = (ROOT / ".python-version").read_text(encoding="utf-8").strip()
    actual_python = ".".join(str(part) for part in sys.version_info[:3])
    if actual_python != required_python:
        raise SystemExit(
            f"Python drift: repository requires {required_python}, runtime has {actual_python}"
        )
    locked = locked_versions()
    installed = {
        normalized(distribution.metadata["Name"]): distribution.version
        for distribution in importlib.metadata.distributions()
        if distribution.metadata["Name"]
    }
    missing = sorted(set(locked) - set(installed))
    unexpected = sorted(set(installed) - set(locked))
    mismatched = sorted(
        name
        for name in set(locked) & set(installed)
        if locked[name] != installed[name]
    )
    if missing or unexpected or mismatched:
        details = []
        if missing:
            details.append("missing " + ", ".join(missing))
        if unexpected:
            details.append("unexpected " + ", ".join(unexpected))
        if mismatched:
            details.append(
                "mismatched "
                + ", ".join(
                    f"{name}={installed[name]} (lock {locked[name]})"
                    for name in mismatched
                )
            )
        raise SystemExit("Python dependency drift: " + "; ".join(details))
    identity = {
        "python": actual_python,
        "python-packages": str(len(installed)),
        "kicad-monkey": installed["kicad-monkey"],
        "kicad-cruncher": installed["kicad-cruncher"],
    }
    return identity


def verify_node() -> dict[str, str]:
    expected = (ROOT / ".node-version").read_text(encoding="utf-8").strip()
    node = subprocess.check_output(["node", "--version"], text=True).strip().removeprefix("v")
    if node != expected:
        raise SystemExit(f"Node drift: repository requires {expected}, runtime has {node}")
    package_manifests = (
        ROOT / "frontend" / "package.json",
        ROOT / "kicad-prism-viewer" / "package.json",
    )
    npm_identities = {
        json.loads(path.read_text(encoding="utf-8"))["packageManager"]
        for path in package_manifests
    }
    if len(npm_identities) != 1:
        raise SystemExit(
            "npm drift: package manifests disagree: " + ", ".join(sorted(npm_identities))
        )
    npm_identity = npm_identities.pop()
    if not npm_identity.startswith("npm@"):
        raise SystemExit(f"unsupported package manager identity: {npm_identity}")
    expected_npm = npm_identity.removeprefix("npm@")
    npm = subprocess.check_output(["npm", "--version"], text=True).strip()
    if npm != expected_npm:
        raise SystemExit(f"npm drift: repository requires {expected_npm}, runtime has {npm}")
    return {"node": node, "npm": npm}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--python-only", action="store_true")
    parser.add_argument("--node-only", action="store_true")
    args = parser.parse_args()
    if args.python_only and args.node_only:
        parser.error("--python-only and --node-only are mutually exclusive")
    identity: dict[str, str] = {}
    if not args.node_only:
        identity.update(verify_python())
    if not args.python_only:
        identity.update(verify_node())
    print(json.dumps(identity, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
