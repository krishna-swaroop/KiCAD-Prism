"""Tests for the Release Studio jobset model and hermetic output closures."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from app.release_studio.jobset import (
    HERMETIC_STEP_TYPES,
    KICAD_10_0_4_JOB_TYPES,
    KICAD_10_0_4_STEP_TYPE_STATUS,
    StepTypeStatus,
    WORKFLOW_OUTPUT_IDS,
    classify_step_type,
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

        from app.services import project_service

        self.assertIs(project_service._WORKFLOW_OUTPUT_IDS, WORKFLOW_OUTPUT_IDS)
        with self.assertRaises(TypeError):
            WORKFLOW_OUTPUT_IDS["new-workflow"] = "must-not-mutate"  # type: ignore[index]

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
            self.assertIs(closure.status, StepTypeStatus.HERMETIC)
            self.assertEqual(closure.non_hermetic_reasons, ())
            self.assertEqual(closure.unsupported_reasons, ())
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
                    "id": "with-special",
                    "type": "folder",
                    "only": ["safe-job", "unsafe-job"],
                    "settings": {},
                },
            ],
            "meta": {"version": 1},
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "sample.kicad_jobset"
            path.write_text(json.dumps(payload), encoding="utf-8")
            model = load_jobset(path)

            flagged = classify_output_hermetic(model, "with-special")
            self.assertFalse(flagged.hermetic)
            self.assertIs(flagged.status, StepTypeStatus.NON_HERMETIC)
            self.assertEqual(
                [job.id for job in flagged.jobs],
                ["safe-job", "unsafe-job"],
            )
            self.assertEqual(len(flagged.non_hermetic_reasons), 1)
            reason = flagged.non_hermetic_reasons[0]
            self.assertEqual(reason.step_id, "unsafe-job")
            self.assertEqual(reason.step_type, "special_execute")
            self.assertEqual(
                [job.id for job in step_closure_for_output(model, "with-special")],
                ["safe-job", "unsafe-job"],
            )

    def test_missing_or_empty_only_selects_every_job(self) -> None:
        payload = {
            "jobs": [
                {"id": "safe-job", "type": "pcb_export_stats", "settings": {}},
                {
                    "id": "unsafe-job",
                    "type": "special_execute",
                    "settings": {"command": "echo hi"},
                },
            ],
            "outputs": [
                {"id": "missing-only", "type": "folder", "settings": {}},
                {"id": "empty-only", "type": "folder", "only": [], "settings": {}},
            ],
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "default-selection.kicad_jobset"
            path.write_text(json.dumps(payload), encoding="utf-8")
            model = load_jobset(path)

            for output_id in ("missing-only", "empty-only"):
                self.assertEqual(
                    [job.id for job in step_closure_for_output(model, output_id)],
                    ["safe-job", "unsafe-job"],
                )
                closure = classify_output_hermetic(model, output_id)
                self.assertFalse(closure.hermetic)
                self.assertIs(closure.status, StepTypeStatus.NON_HERMETIC)
                self.assertEqual(
                    [(reason.step_id, reason.step_type)
                     for reason in closure.non_hermetic_reasons],
                    [("unsafe-job", "special_execute")],
                )

    def test_kicad_10_0_4_registry_classification_is_explicit(self) -> None:
        expected_hermetic = {
            "pcb_drc",
            "pcb_export_3d",
            "pcb_export_drill",
            "pcb_export_dxf",
            "pcb_export_gencad",
            "pcb_export_gerbers",
            "pcb_export_hpgl",
            "pcb_export_ipc2581",
            "pcb_export_ipcd356",
            "pcb_export_odb",
            "pcb_export_pdf",
            "pcb_export_pos",
            "pcb_export_ps",
            "pcb_export_stats",
            "pcb_export_svg",
            "pcb_render",
            "sch_erc",
            "sch_export_bom",
            "sch_export_netlist",
            "sch_export_plot_dxf",
            "sch_export_plot_hpgl",
            "sch_export_plot_pdf",
            "sch_export_plot_ps",
            "sch_export_plot_svg",
        }
        self.assertEqual(HERMETIC_STEP_TYPES, frozenset(expected_hermetic))
        self.assertEqual(
            KICAD_10_0_4_JOB_TYPES,
            expected_hermetic | {"special_copyfiles", "special_execute"},
        )
        self.assertEqual(
            set(KICAD_10_0_4_STEP_TYPE_STATUS),
            KICAD_10_0_4_JOB_TYPES,
        )

        for step_type in expected_hermetic:
            classification = classify_step_type(step_type)
            self.assertIs(classification.status, StepTypeStatus.HERMETIC)

        for step_type in ("special_copyfiles", "special_execute"):
            classification = classify_step_type(step_type)
            self.assertIs(classification.status, StepTypeStatus.NON_HERMETIC)

        unknown = classify_step_type("customer_plugin_job")
        self.assertIs(unknown.status, StepTypeStatus.UNSUPPORTED)

    def test_unknown_types_are_unsupported_not_non_hermetic(self) -> None:
        payload = {
            "jobs": [
                {"id": "unknown-job", "type": "customer_plugin_job", "settings": {}},
            ],
            "outputs": [
                {
                    "id": "unknown-type-output",
                    "type": "folder",
                    "only": ["unknown-job"],
                    "settings": {},
                },
            ],
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "unknown-type.kicad_jobset"
            path.write_text(json.dumps(payload), encoding="utf-8")
            closure = classify_output_hermetic(
                load_jobset(path), "unknown-type-output"
            )

        self.assertFalse(closure.hermetic)
        self.assertIs(closure.status, StepTypeStatus.UNSUPPORTED)
        self.assertEqual(closure.non_hermetic_reasons, ())
        self.assertEqual(len(closure.unsupported_reasons), 1)
        reason = closure.unsupported_reasons[0]
        self.assertEqual(reason.step_id, "unknown-job")
        self.assertEqual(reason.step_type, "customer_plugin_job")

    def test_only_is_flat_jobs_take_precedence_and_unknown_ids_fail_closed(self) -> None:
        payload = {
            "jobs": [
                {"id": "shared-id", "type": "pcb_export_svg", "settings": {}},
            ],
            "outputs": [
                {
                    "id": "out-a",
                    "type": "folder",
                    "only": ["shared-id", "missing-id"],
                    "settings": {},
                },
                {
                    "id": "shared-id",
                    "type": "folder",
                    "only": ["out-a"],
                    "settings": {},
                },
            ],
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "flat-only.kicad_jobset"
            path.write_text(json.dumps(payload), encoding="utf-8")
            model = load_jobset(path)
            self.assertEqual(
                [job.id for job in step_closure_for_output(model, "out-a")],
                ["shared-id"],
            )
            closure = classify_output_hermetic(model, "out-a")
            self.assertIs(closure.status, StepTypeStatus.UNSUPPORTED)
            self.assertEqual(closure.unresolved_references, ("missing-id",))
            self.assertEqual(
                closure.unsupported_reasons[0].reference,
                "missing-id",
            )

            with self.assertRaisesRegex(ValueError, "unknown jobset output"):
                step_closure_for_output(model, "missing")


if __name__ == "__main__":
    unittest.main()
