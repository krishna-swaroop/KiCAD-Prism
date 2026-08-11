#!/usr/bin/env python3
"""Repeat cold WebGPU 3D staged builds and emit a median summary."""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

# Prefer the worker layout.
for candidate in (Path("/app"), Path("/app/backend")):
    if (candidate / "app").is_dir() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))
        break

from app.services import semantic_visualizer_service  # noqa: E402


def _median(values: list[float]) -> float:
    return float(statistics.median(values)) if values else 0.0


def _band_pct(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    med = _median(values)
    if med <= 0:
        return None
    return 100.0 * (max(values) - min(values)) / med


def _probe_monkey() -> dict:
    import importlib
    import pathlib

    # Prefer KICAD_MONKEY_PYTHONPATH if set.
    explicit = os.environ.get("KICAD_MONKEY_PYTHONPATH", "").strip()
    if explicit and explicit not in sys.path:
        sys.path.insert(0, explicit)
    for name in list(sys.modules):
        if name == "kicad_monkey" or name.startswith("kicad_monkey."):
            del sys.modules[name]
    import kicad_monkey

    return {
        "file": str(pathlib.Path(kicad_monkey.__file__).resolve()),
        "versionAttr": getattr(kicad_monkey, "__version__", None),
        "hasCopperEmit": hasattr(kicad_monkey, "emit_pcb_copper_geometry"),
        "copperEmitEnv": os.environ.get("PRISM_COPPER_EMIT_ENABLED"),
        "envPythonpath": explicit or None,
    }


def _one_run(project_file: Path, store: Path, cache: Path, project_id: str) -> dict:
    if store.exists():
        for path in sorted(store.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            elif path.is_dir():
                path.rmdir()
    if cache.exists():
        for path in sorted(cache.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            elif path.is_dir():
                path.rmdir()
    store.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)

    project = SimpleNamespace(
        id=project_id,
        name=project_file.stem,
        display_name=project_file.stem,
        path=str(project_file.parent),
    )
    job = {"logs": [], "performance": [], "status": "running", "percent": 0}
    events: list[dict] = []
    started = time.perf_counter()
    last_revision = None

    def probe() -> None:
        nonlocal last_revision
        readiness = job.get("readiness") or {}
        revision = readiness.get("revision")
        if not revision or revision == last_revision:
            return
        last_revision = str(revision)
        events.append(
            {
                "stage": readiness.get("stage"),
                "elapsed_ms": round((time.perf_counter() - started) * 1000.0, 3),
                "progress": readiness.get("progress"),
                "available_assets": readiness.get("available_assets") or [],
            }
        )

    source_hash = semantic_visualizer_service.source_fingerprint_for_project_file(project_file)
    with (
        patch.object(
            semantic_visualizer_service,
            "semantic_store_root",
            return_value=store.resolve(),
        ),
        patch.object(
            semantic_visualizer_service,
            "semantic_compiler_cache_root",
            return_value=cache.resolve(),
        ),
    ):
        status = semantic_visualizer_service.build_visualizer_bundle_from_project_file(
            project,
            project_file,
            job,
            probe,
            force=True,
            source_hash=source_hash,
        )
    total_ms = round((time.perf_counter() - started) * 1000.0, 3)
    performance = list(job.get("performance") or [])
    return {
        "totalMs": total_ms,
        "status": status,
        "events": events,
        "performance": performance,
        "readiness": job.get("readiness"),
        "bundleUrl": job.get("bundle_url"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("project", type=Path)
    parser.add_argument("--label", required=True)
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument("--store-root", type=Path, required=True)
    parser.add_argument("--cache-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--project-id", default="jtyu-3d-bench")
    args = parser.parse_args()

    project_file = args.project.resolve()
    if not project_file.is_file():
        raise SystemExit(f"missing project: {project_file}")

    probe = _probe_monkey()
    runs = []
    for index in range(args.rounds):
        store = args.store_root / f"run-{index}"
        cache = args.cache_root / f"run-{index}"
        print(f"[{args.label}] starting round {index + 1}/{args.rounds}", flush=True)
        run = _one_run(project_file, store, cache, f"{args.project_id}-{index}")
        runs.append(run)
        print(
            json.dumps(
                {
                    "round": index + 1,
                    "totalMs": run["totalMs"],
                    "finalStage": (run.get("events") or [{}])[-1].get("stage") if run.get("events") else None,
                },
                sort_keys=True,
            ),
            flush=True,
        )

    totals = [run["totalMs"] for run in runs]
    # Collect first-stage TTFR-ish from readiness events if present.
    first_ready = []
    for run in runs:
        for event in run.get("events") or []:
            assets = event.get("available_assets") or []
            if assets:
                first_ready.append(float(event["elapsed_ms"]))
                break

    payload = {
        "schema": "prism.webgpu_3d_h2h.v1",
        "label": args.label,
        "projectFile": str(project_file),
        "probe": probe,
        "rounds": args.rounds,
        "totalMedianMs": round(_median(totals), 3),
        "totalBandPct": None if _band_pct(totals) is None else round(_band_pct(totals), 2),
        "totalsMs": totals,
        "firstAssetMedianMs": round(_median(first_ready), 3) if first_ready else None,
        "runs": runs,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({
        "label": args.label,
        "output": str(args.output),
        "totalMedianMs": payload["totalMedianMs"],
        "totalBandPct": payload["totalBandPct"],
        "firstAssetMedianMs": payload["firstAssetMedianMs"],
        "probe": probe,
    }, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
