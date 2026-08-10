"""Tests for the Release Studio jobset model and hermetic output closures."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from app.release_studio.jobset import (
    HERMETIC_STEP_TYPES,
    WORKFLOW_OUTPUT_IDS,
    classify_output_hermetic,
    load_jobset,
    step_closure_for_output,
    workflow_output_id,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_JOBSET = REPO_ROOT / "assets" / "Outputs.kicad_jobset"


class ReleaseStudioJobsetTests(unittest.TestCase):
    def test_workflow_output_ids_match_reference_jobset_and_legacy_mapping(self) -> None:
        model = load_jobset(REFERENCE_JOBSET)
        output_ids = {output.id for output in model.outputs}
        self.assertEqual(
            WORKFLOW_OUTPUT_IDS,
            {
                "design": "28dab1d3-7bf2-4d8a-9723-bcdd14e1d814",
                "manufacturing": "9e5c254b-cb26-4a49-beea-fa7af8a62903",
                "render": "81c80ad4-e8b9-4c9a-8bed-df7864fdefc6",
            },
        )
        for workflow_type, output_id in WORKFLOW_OUTPUT_IDS.items():
            self.assertIn(output_id, output_ids)
            self.assertEqual(workflow_output_id(workflow_type), output_id)

        project_service_source = (
            REPO_ROOT / "backend" / "app" / "services" / "project_service.py"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "from app.release_studio.jobset import WORKFLOW_OUTPUT_IDS as _WORKFLOW_OUTPUT_IDS",
            project_service_source,
        )
        self.assertNotIn(
            '"design": "28dab1d3-7bf2-4d8a-9723-bcdd14e1d814"',
            project_service_source,
        )

    def test_reference_outputs_are_hermetic_despite_unreferenced_special_execute(
        self,
    ) -> None:
        model = load_jobset(REFERENCE_JOBSET)
        special_ids = {job.id for job in model.jobs if job.type == "special_execute"}
        self.assertEqual(special_ids, {"676cbc40-2829-462c-a885-27563c1e4396"})
        self.assertNotIn("special_execute", HERMETIC_STEP_TYPES)

        for output_id in WORKFLOW_OUTPUT_IDS.values():
            closure = classify_output_hermetic(model, output_id)
            self.assertTrue(closure.hermetic, output_id)
            self.assertEqual(closure.non_hermetic_reasons, ())
            closed_ids = {job.id for job in closure.jobs}
            self.assertTrue(closed_ids.isdisjoint(special_ids), output_id)
            self.assertEqual(
                [job.id for job in closure.jobs],
                list(model.output_by_id()[output_id].only),
            )

    def test_output_whose_closure_includes_special_execute_is_flagged(self) -> None:
        payload = {
            "jobs": [
                {
                    "id": "safe-job",
                    "type": "pcb_export_gerbers",
                    "settings": {},
                },
                {
                    "id": "unsafe-job",
                    "type": "special_execute",
                    "settings": {"command": "echo hi"},
                },
            ],
            "outputs": [
                {
                    "id": "nested-safe",
                    "type": "folder",
                    "only": ["safe-job"],
                    "settings": {},
                },
                {
                    "id": "with-special",
                    "type": "folder",
                    "only": ["nested-safe", "unsafe-job"],
                    "settings": {},
                },
            ],
            "meta": {"version": 1},
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "sample.kicad_jobset"
            path.write_text(json.dumps(payload), encoding="utf-8")
            model = load_jobset(path)

            nested = classify_output_hermetic(model, "nested-safe")
            self.assertTrue(nested.hermetic)
            self.assertEqual([job.id for job in nested.jobs], ["safe-job"])

            flagged = classify_output_hermetic(model, "with-special")
            self.assertFalse(flagged.hermetic)
            self.assertEqual(
                [job.id for job in flagged.jobs],
                ["safe-job", "unsafe-job"],
            )
            self.assertEqual(len(flagged.non_hermetic_reasons), 1)
            reason = flagged.non_hermetic_reasons[0]
            self.assertEqual(reason.step_id, "unsafe-job")
            self.assertEqual(reason.step_type, "special_execute")

            # Recursive expansion must visit nested outputs before sibling jobs.
            self.assertEqual(
                [job.id for job in step_closure_for_output(model, "with-special")],
                ["safe-job", "unsafe-job"],
            )

    def test_unknown_and_cyclic_closures_raise(self) -> None:
        payload = {
            "jobs": [{"id": "job-a", "type": "pcb_drc", "settings": {}}],
            "outputs": [
                {
                    "id": "out-a",
                    "type": "folder",
                    "only": ["out-b"],
                    "settings": {},
                },
                {
                    "id": "out-b",
                    "type": "folder",
                    "only": ["out-a"],
                    "settings": {},
                },
            ],
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "cycle.kicad_jobset"
            path.write_text(json.dumps(payload), encoding="utf-8")
            model = load_jobset(path)
            with self.assertRaisesRegex(ValueError, "cyclic"):
                step_closure_for_output(model, "out-a")
            with self.assertRaisesRegex(ValueError, "unknown jobset output"):
                step_closure_for_output(model, "missing")


if __name__ == "__main__":
    unittest.main()
