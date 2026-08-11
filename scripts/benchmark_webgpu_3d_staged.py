#!/usr/bin/env python3
"""Run a cold staged WebGPU 3D build without starting the Prism API server."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services import semantic_visualizer_service


class ReadinessProbe:
    def __init__(self, job: dict) -> None:
        self.job = job
        self.started = time.perf_counter()
        self.last_revision: str | None = None
        self.events: list[dict] = []

    def __call__(self) -> None:
        readiness = self.job.get("readiness") or {}
        revision = readiness.get("revision")
        if not revision or revision == self.last_revision:
            return
        self.last_revision = str(revision)
        event = {
            "stage": readiness.get("stage"),
            "elapsed_ms": round((time.perf_counter() - self.started) * 1000.0, 3),
            "progress": readiness.get("progress"),
            "available_assets": readiness.get("available_assets") or [],
            "bundle_url": self.job.get("bundle_url"),
        }
        self.events.append(event)
        print(json.dumps(event, sort_keys=True), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("project", type=Path, help="KiCad .kicad_pro project")
    parser.add_argument("--store", type=Path, required=True, help="Empty benchmark artifact store")
    parser.add_argument("--cache", type=Path, required=True, help="Empty benchmark compiler cache")
    parser.add_argument("--project-id", default="staged-benchmark")
    args = parser.parse_args()

    project_file = args.project.resolve()
    if not project_file.is_file():
        raise SystemExit(f"Project does not exist: {project_file}")
    args.store.mkdir(parents=True, exist_ok=True)
    args.cache.mkdir(parents=True, exist_ok=True)

    project = SimpleNamespace(
        id=args.project_id,
        name=project_file.stem,
        display_name=project_file.stem,
        path=str(project_file.parent),
    )
    job = {"logs": [], "performance": [], "status": "running", "percent": 0}
    probe = ReadinessProbe(job)
    source_hash = semantic_visualizer_service.source_fingerprint_for_project_file(project_file)

    with (
        patch.object(
            semantic_visualizer_service,
            "semantic_store_root",
            return_value=args.store.resolve(),
        ),
        patch.object(
            semantic_visualizer_service,
            "semantic_compiler_cache_root",
            return_value=args.cache.resolve(),
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

    summary = {
        "schema": "prism.staged_3d_benchmark.a0",
        "board_compilation": "unified",
        "total_ms": round((time.perf_counter() - probe.started) * 1000.0, 3),
        "events": probe.events,
        "status": status,
    }
    print(json.dumps(summary, indent=2, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
