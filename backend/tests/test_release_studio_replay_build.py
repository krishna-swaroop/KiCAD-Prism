"""A whole Release Studio build of the synthetic fixture, with kicad-cli replayed.

``execute_build`` runs every catalogue step and composes the documents through
the replay adapter: no KiCad install is needed, and the recording is the
evidence of what kicad-cli was asked and what it wrote.  The build reads its
design from the committed ``fixtures/release-studio/synthetic/models.prism``
bundle, so the steps run in bundle mode.  Two builds in different directories
must produce the same dossier digest.

Re-record after a catalogue or artwork argument change (needs kicad-cli)::

    cd backend && python -m tests.test_release_studio_replay_build --record
"""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

from app.services import release_studio_build_service as build_service
from app.services.job_artifact_service import JobArtifactService
from app.services.job_runtime import JobContext
from app.services.kicad_tool_replay import RecordingTool, ReplayTool
from app.services.kicad_tools import KicadTools, kicad_cli
from tests.release_studio_support import (
    RECORDING_ROOT,
    documents_stub,
    fixture_root,
    synthetic_bundle_design,
)

RECORDING = RECORDING_ROOT / "synthetic-build" / "recording.json"
BUNDLE = fixture_root("synthetic") / "models.prism"
CONFIG = {
    "board": "synthetic.kicad_pcb",
    "schematic": "synthetic.kicad_sch",
    "vendors": [],
}
CANDIDATE = {
    "id": "candidate-replay",
    "project_id": "project-1",
    "commit_sha": "a" * 40,
    "config_key": "default",
    "variant": "",
    "build_key": "b" * 64,
    "technical_config_digest": "c" * 64,
    "input_closure_digest": "d" * 64,
}


class _JobService:
    def __init__(self) -> None:
        self.artifacts: list[dict[str, Any]] = []

    def get(self, job_id: str) -> dict[str, Any]:
        return {"job_id": job_id, "fence": 1, "status": "running"}

    def progress(self, *args: Any, **kwargs: Any) -> bool:
        return True

    def register_fenced_artifacts(self, job_id, worker_id, fence, artifacts, **kwargs):  # noqa: ANN001
        self.artifacts.extend(dict(item) for item in artifacts)
        return [f"artifact-{index}" for index, _ in enumerate(self.artifacts, start=1)]


def run_build(root: Path, tool_for: Any) -> tuple[dict[str, Any], Any, dict[str, Any]]:
    """Build the synthetic fixture under ``root``; ``tool_for(roots)`` makes the kicad-cli."""

    closure = root / "closure"
    shutil.copytree(fixture_root("synthetic"), closure)
    service = _JobService()
    with patch("app.services.job_runtime.job_state_root", return_value=root / "jobs"):
        context = JobContext(
            {"job_id": "replay", "fence": 1, "status": "running", "payload": {}},
            worker_id="test-worker",
            service=service,  # type: ignore[arg-type]
        )
    cli = tool_for({"closure": closure, "staging": context.staging_dir})
    design = synthetic_bundle_design(closure)
    completed: dict[str, Any] = {}

    def complete_build(**kwargs: Any) -> dict[str, Any]:
        completed.update(kwargs)
        return {"id": kwargs["build_id"], "status": "succeeded"}

    with (
        patch.object(build_service.attempts, "start_build", return_value={"id": "build-replay"}),
        patch.object(build_service.attempts, "complete_build", side_effect=complete_build),
        patch.object(build_service, "executor_image", return_value="prism/kicad@sha256:" + "e" * 64),
    ):
        result = build_service.execute_build(
            context,
            candidate={**CANDIDATE, "_bundle_design": design},
            closure_root=closure,
            config=dict(CONFIG),
            artifacts=JobArtifactService(root=root / "artifacts"),
            tools=KicadTools(cli=cli),
        )
        # The build row succeeds in the job's completion transaction.
        result["build"] = result["settle"](None)
    return result, cli, completed


@unittest.skipUnless(RECORDING.is_file(), "the synthetic build recording is not checked out")
@unittest.skipUnless(BUNDLE.is_file(), "the synthetic design bundle is not checked out")
class ReplayedReleaseBuildTests(unittest.TestCase):
    def _build(self) -> tuple[dict[str, Any], ReplayTool, dict[str, Any]]:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        # The document renderer and the artwork take their lettering, frame and
        # views from prism-kicad; the reference stub keeps this build about the
        # replayed kicad-cli.
        with documents_stub():
            return run_build(Path(tmp.name), lambda roots: ReplayTool(RECORDING, roots))

    def test_a_release_build_runs_end_to_end_on_the_replayed_cli(self) -> None:
        result, replay, completed = self._build()

        self.assertEqual(replay.misses, [], "a kicad-cli run had no recorded answer")
        self.assertEqual(result["build"]["status"], "succeeded")
        dossier = result["dossier"]
        members = {member.step_id for member in dossier.members}
        for step in ("gerbers", "drill", "positions", "bom", "documents"):
            self.assertIn(step, members)
        self.assertEqual({record["kind"] for record in dossier.evidence}, {"drc", "erc"})
        # Every sheet got its artwork: nothing degraded to "unavailable".
        self.assertFalse(
            [w for w in completed["warnings"] if "unavailable" in w],
            completed["warnings"],
        )

    def test_the_toolchain_records_the_cli_version_that_ran(self) -> None:
        result, _, _ = self._build()
        self.assertEqual(
            result["dossier"].manifest["toolchain"]["kicad_version"], "10.0.7"
        )

    def test_two_replayed_builds_have_the_same_dossier_digest(self) -> None:
        first, _, _ = self._build()
        second, _, _ = self._build()
        self.assertEqual(first["dossier"].dossier_digest, second["dossier"].dossier_digest)


def _record() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        recorder: dict[str, RecordingTool] = {}

        def tool_for(roots: dict[str, Path]) -> RecordingTool:
            recorder["tool"] = RecordingTool(kicad_cli(), roots)
            return recorder["tool"]

        run_build(Path(tmp), tool_for)
        if RECORDING.parent.exists():
            shutil.rmtree(RECORDING.parent)
        recorder["tool"].write(RECORDING, fixture="synthetic")
    print(f"recorded {len(recorder['tool'].commands)} kicad-cli runs to {RECORDING}")


if __name__ == "__main__":
    if "--record" in sys.argv:
        _record()
    else:
        unittest.main()
