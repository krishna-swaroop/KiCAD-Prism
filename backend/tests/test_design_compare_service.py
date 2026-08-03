import copy
import os
import tempfile
import threading
import unittest
from pathlib import Path
import subprocess
from unittest import mock

from app.services import bom_diff_service, design_compare_service
from app.services.design_compare_benchmark import DesignCompareBenchmark


class DesignCompareServiceTests(unittest.TestCase):
    @staticmethod
    def _design(*, components=None, nets=None, terminals=None):
        return {
            "components": components or [],
            "nets": nets or [],
            "terminals": terminals or [],
        }

    @staticmethod
    def _component(reference, source_id, *, value="A", page="root.kicad_sch"):
        return {
            "componentUid": f"cmp:{source_id}",
            "reference": reference,
            "fields": {"Value": value},
            "schematicRefs": [{"symbolUuid": source_id, "page": page}],
        }

    @staticmethod
    def _net(name, uid, source_id, *, labels=0):
        return {
            "netUid": uid,
            "name": name,
            "schematicRefs": [{
                "wireUuids": [source_id],
                "labelUuids": [f"label-{index}" for index in range(labels)],
                "labelInstanceCount": labels,
                "pinUuids": [],
            }],
        }

    def test_generated_kicad_files_are_folded_out_of_semantic_sources(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            primary = root / "board.kicad_sch"
            backup = root / "board-backups" / "board-backup-2026-01-01.kicad_sch"
            autosave = root / "autosave" / "board.kicad_pcb"
            backup.parent.mkdir()
            autosave.parent.mkdir()
            primary.write_text("(kicad_sch)", encoding="utf-8")
            backup.write_text("(kicad_sch)", encoding="utf-8")
            autosave.write_text("(kicad_pcb)", encoding="utf-8")
            sources = design_compare_service._list_kicad_sources(root)
        self.assertEqual([source["path"] for source in sources], ["board.kicad_sch"])

    def test_snapshot_archives_design_inputs_without_manufacturing_assets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "repo"
            destination = Path(temporary) / "snapshot"
            root.mkdir()
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.name", "Test"], check=True)
            subprocess.run(
                ["git", "-C", str(root), "config", "user.email", "test@example.invalid"],
                check=True,
            )
            (root / "board.kicad_pro").write_text("{}", encoding="utf-8")
            (root / "board.kicad_sch").write_text("(kicad_sch)", encoding="utf-8")
            manufacturing = root / "Manufacturing-Outputs"
            manufacturing.mkdir()
            (manufacturing / "board.step").write_bytes(b"large-model")
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "fixture"], check=True)

            design_compare_service._snapshot_commit(root, "HEAD", destination, None)

            self.assertTrue((destination / "board.kicad_pro").exists())
            self.assertTrue((destination / "board.kicad_sch").exists())
            self.assertFalse((destination / "Manufacturing-Outputs").exists())



























    def test_revision_builds_overlap_and_identical_shas_are_deduplicated(self) -> None:
        barrier = threading.Barrier(2)
        started = []
        started_lock = threading.Lock()

        def fake_load(_project, _repo, _relative, commit, logs, *, on_progress):
            with started_lock:
                started.append(commit)
            on_progress("started")
            barrier.wait(timeout=2)
            logs.append(f"built {commit}")
            return {"commit": commit}

        with mock.patch.dict(os.environ, {"PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS": "2"}), mock.patch.object(
            design_compare_service,
            "_load_or_build_revision",
            side_effect=fake_load,
        ) as load:
            revisions, revision_logs = design_compare_service._build_revisions(
                "project",
                Path("/repo"),
                "board.kicad_pro",
                "base",
                "head",
                lambda _message, _percent=None: None,
            )
        self.assertCountEqual(started, ["base", "head"])
        self.assertEqual(set(revisions), {"base", "head"})
        self.assertEqual(revision_logs["base"], ["built base"])
        self.assertEqual(load.call_count, 2)

        with mock.patch.object(
            design_compare_service,
            "_load_or_build_revision",
            return_value={"commit": "same"},
        ) as deduplicated:
            revisions, _ = design_compare_service._build_revisions(
                "project",
                Path("/repo"),
                "board.kicad_pro",
                "same",
                "same",
                lambda _message, _percent=None: None,
            )
        self.assertEqual(revisions, {"same": {"commit": "same"}})
        deduplicated.assert_called_once()





    def test_bom_unchanged_rows_are_opt_in_and_detected_fields_are_exposed(self) -> None:
        old = [{"Reference": "R1", "Value": "10k", "Tolerance": "1%"}]
        new = [{"Reference": "R1", "Value": "10k", "Tolerance": "1%"}]
        compact = bom_diff_service.diff_boms(old, new, ["Value"])
        full = bom_diff_service.diff_boms(old, new, ["Value"], include_unchanged=True)
        self.assertEqual(compact["changes"], [])
        self.assertEqual(full["changes"][0]["status"], "unchanged")
        self.assertIn("Tolerance", full["fields"])

    def test_bom_value_change_with_kicad_cli_refs_header(self) -> None:
        """Default kicad-cli BOM CSV uses Refs, not Reference."""
        old_csv = "Refs,Value,Footprint,Qty,DNP\nR5,5.1k,R_0805_2012Metric,1,\n"
        new_csv = "Refs,Value,Footprint,Qty,DNP\nR5,2.4k,R_0805_2012Metric,1,\n"
        old = bom_diff_service.parse_bom_csv(old_csv)
        new = bom_diff_service.parse_bom_csv(new_csv)
        result = bom_diff_service.diff_boms(old, new, ["Value", "Footprint"])
        self.assertEqual(result["summary"], {"added": 0, "removed": 0, "changed": 1})
        self.assertEqual(result["changes"][0]["ref"], "R5")
        self.assertEqual(result["changes"][0]["status"], "changed")
        self.assertEqual(
            result["changes"][0]["diffs"]["Value"],
            {"old": "5.1k", "new": "2.4k"},
        )

    def test_stackup_extract_reads_thickness_after_color(self) -> None:
        """KiCad often writes (color ...) between (type ...) and (thickness ...)."""
        pcb_text = """(kicad_pcb
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
  )
  (setup
    (stackup
      (layer "F.Mask"
        (type "Top Solder Mask")
        (color "Green")
        (thickness 0.0254)
      )
      (layer "F.Cu"
        (type "copper")
        (thickness 0.035)
      )
      (layer "dielectric 1"
        (type "core")
        (color "FR4 natural")
        (thickness 1.51)
        (material "FR4")
        (epsilon_r 4.2)
        (loss_tangent 0.02)
      )
      (layer "B.Cu"
        (type "copper")
        (thickness 0.035)
      )
      (copper_finish "ENIG")
      (dielectric_constraints yes)
    )
  )
)
"""
        with tempfile.TemporaryDirectory() as temporary:
            snap = Path(temporary)
            (snap / "board.kicad_pcb").write_text(pcb_text, encoding="utf-8")
            stackup = design_compare_service._extract_stackup(snap)
        self.assertTrue(stackup["present"])
        by_name = {layer["name"]: layer for layer in stackup["layers"]}
        self.assertEqual(by_name["F.Mask"]["thickness"], 0.0254)
        self.assertEqual(by_name["dielectric 1"]["thickness"], 1.51)
        self.assertEqual(by_name["dielectric 1"]["material"], "FR4")
        self.assertEqual(by_name["dielectric 1"]["epsilon_r"], 4.2)
        self.assertEqual(by_name["dielectric 1"]["loss_tangent"], 0.02)
        self.assertEqual(stackup["settings"]["copper_finish"], "ENIG")
        self.assertTrue(stackup["settings"]["dielectric_constraints"])
        self.assertEqual(by_name["F.Cu"]["type"], "copper")

    def test_stackup_diff_detects_thickness_change(self) -> None:
        base = {
            "present": True,
            "layers": [
                {"name": "F.Cu", "type": "copper", "thickness": 0.035},
                {"name": "dielectric 1", "type": "core", "thickness": 1.51},
            ],
        }
        head = {
            "present": True,
            "layers": [
                {"name": "F.Cu", "type": "copper", "thickness": 0.035},
                {"name": "dielectric 1", "type": "core", "thickness": 1.2},
            ],
        }
        diff = design_compare_service._diff_stackup(base, head)
        self.assertTrue(diff["changed"])
        self.assertTrue(diff["present"])
        self.assertEqual(diff["head"][1]["thickness"], 1.2)

    def test_stackup_diff_detects_material_and_finish_changes(self) -> None:
        base = {
            "present": True,
            "layers": [{"name": "dielectric 1", "type": "core", "material": "FR4", "epsilon_r": 4.2}],
            "settings": {"copper_finish": "HASL", "dielectric_constraints": False},
        }
        head = {
            "present": True,
            "layers": [{"name": "dielectric 1", "type": "core", "material": "Megtron 6", "epsilon_r": 3.6}],
            "settings": {"copper_finish": "ENIG", "dielectric_constraints": True},
        }

        diff = design_compare_service._diff_stackup(base, head)

        self.assertTrue(diff["changed"])
        self.assertEqual(diff["head"][0]["material"], "Megtron 6")
        self.assertEqual(diff["base_settings"]["copper_finish"], "HASL")
        self.assertTrue(diff["head_settings"]["dielectric_constraints"])

    def test_bom_grouped_refs_expand_to_per_designator_rows(self) -> None:
        old_csv = "Refs,Value,Footprint\n\"R1, R2\",10k,R_0805_2012Metric\n"
        new_csv = "Refs,Value,Footprint\n\"R1, R2\",4.7k,R_0805_2012Metric\n"
        old = bom_diff_service.parse_bom_csv(old_csv)
        new = bom_diff_service.parse_bom_csv(new_csv)
        result = bom_diff_service.diff_boms(old, new, ["Value"])
        self.assertEqual(result["summary"]["changed"], 2)
        self.assertEqual(
            {row["ref"] for row in result["changes"]},
            {"R1", "R2"},
        )

    def test_revision_resolution_returns_full_immutable_sha(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.name", "Test"], check=True)
            subprocess.run(
                ["git", "-C", str(root), "config", "user.email", "test@example.invalid"],
                check=True,
            )
            (root / "board.kicad_pro").write_text("{}", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "board.kicad_pro"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "fixture"], check=True)
            resolved = design_compare_service._resolve_revision(root, "HEAD")
            self.assertRegex(resolved, r"^[0-9a-f]{40}$")
            with self.assertRaises(ValueError):
                design_compare_service._resolve_revision(root, "../not-a-revision")

    def test_semantic_bom_projection_reuses_components_and_excludes_non_bom(self) -> None:
        rows = design_compare_service._semantic_bom_rows({
            "components": [
                {
                    "reference": "R1",
                    "value": "10k",
                    "footprint": "R_0402",
                    "fields": {"Manufacturer": "ACME", "kicad_in_bom": "true"},
                },
                {
                    "reference": "TP1",
                    "fields": {"kicad_in_bom": "false"},
                },
            ],
        })
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["Reference"], "R1")
        self.assertEqual(rows[0]["Manufacturer"], "ACME")

    def test_initial_stage_workers_overlap_and_publish_both_revisions(self) -> None:
        barrier = threading.Barrier(2)

        def fake_initial(_project, _repo, _relative, commit, logs, **_kwargs):
            barrier.wait(timeout=2)
            logs.append(f"initial {commit}")
            return {"commit": commit}

        with mock.patch.dict(
            os.environ,
            {
                "PRISM_DESIGN_COMPARE_MAX_INITIAL_WORKERS": "2",
                # A threading.Barrier only synchronises within one process,
                # and a patched module attribute does not survive into a
                # spawned worker. This case is about the fan-out mechanics,
                # so it stays in-process; the worker contract used by the
                # process path is covered separately below.
                "PRISM_DESIGN_COMPARE_REVISION_PROCESSES": "0",
            },
        ), mock.patch.object(
            design_compare_service,
            "_load_or_build_initial_revision",
            side_effect=fake_initial,
        ):
            revisions, logs = design_compare_service._build_initial_revisions(
                "project",
                Path("/repo"),
                None,
                "base",
                "head",
                lambda _message, _percent=None: None,
            )

        self.assertEqual(set(revisions), {"base", "head"})
        self.assertEqual(logs["head"], ["initial head"])

    def test_revision_processes_are_the_default_and_can_be_switched_off(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PRISM_DESIGN_COMPARE_REVISION_PROCESSES", None)
            self.assertTrue(design_compare_service._revision_processes_enabled())
        for disabled in ("0", "false", "no", "off", "OFF"):
            with mock.patch.dict(
                os.environ,
                {"PRISM_DESIGN_COMPARE_REVISION_PROCESSES": disabled},
            ):
                self.assertFalse(
                    design_compare_service._revision_processes_enabled(),
                    msg=f"{disabled!r} should disable the process pool",
                )

    def test_initial_revision_task_returns_logs_and_events_for_the_parent(self) -> None:
        # The worker runs where the caller's logs list, progress callback and
        # benchmark cannot reach it, so it has to hand all three back.
        def fake_initial(_project, repo, _relative, commit, logs, **kwargs):
            logs.append(f"built {commit}")
            benchmark = kwargs["benchmark"]
            benchmark.mark("snapshot", scope=f"revision:{commit}:initial")
            self.assertEqual(repo, Path("/repo"))
            return {"commit": commit}

        with mock.patch.object(
            design_compare_service,
            "_load_or_build_initial_revision",
            side_effect=fake_initial,
        ):
            result = design_compare_service._initial_revision_task({
                "project_id": "project",
                "repo_path": "/repo",
                "relative_path": None,
                "commit": "head",
                "benchmark_job_id": "job-1",
            })

        self.assertEqual(result["revision"], {"commit": "head"})
        self.assertEqual(result["logs"], ["built head"])
        self.assertEqual([event["phase"] for event in result["events"]], ["snapshot"])

    def test_initial_revision_task_skips_benchmarking_when_unrequested(self) -> None:
        def fake_initial(_project, _repo, _relative, commit, logs, **kwargs):
            self.assertIsNone(kwargs["benchmark"])
            logs.append(commit)
            return {"commit": commit}

        with mock.patch.object(
            design_compare_service,
            "_load_or_build_initial_revision",
            side_effect=fake_initial,
        ):
            result = design_compare_service._initial_revision_task({
                "project_id": "project",
                "repo_path": "/repo",
                "relative_path": None,
                "commit": "base",
                "benchmark_job_id": None,
            })

        self.assertEqual(result["events"], [])

    def test_pcb_stage_workers_overlap_and_reuse_initial_revisions(self) -> None:
        barrier = threading.Barrier(2)
        received_initial = {}

        def fake_pcb(_project, commit, initial, logs, **_kwargs):
            received_initial[commit] = initial
            barrier.wait(timeout=2)
            logs.append(f"pcb {commit}")
            return {"commit": commit, "initial": initial}

        initial = {
            "base": {"commit": "base", "stage": "initial"},
            "head": {"commit": "head", "stage": "initial"},
        }
        with mock.patch.dict(
            os.environ,
            {"PRISM_DESIGN_COMPARE_MAX_PCB_WORKERS": "2"},
        ), mock.patch.object(
            design_compare_service,
            "_load_or_build_pcb_revision",
            side_effect=fake_pcb,
        ):
            revisions, logs = design_compare_service._build_pcb_revisions(
                "project",
                "base",
                "head",
                initial,
                lambda _message, _percent=None: None,
            )

        self.assertEqual(set(revisions), {"base", "head"})
        self.assertIs(received_initial["base"], initial["base"])
        self.assertIs(received_initial["head"], initial["head"])
        self.assertEqual(logs["base"], ["pcb base"])

    def test_stage_worker_count_honors_global_fallback_and_stage_override(self) -> None:
        with mock.patch.dict(
            os.environ,
            {"PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS": "1"},
            clear=False,
        ):
            os.environ.pop("PRISM_DESIGN_COMPARE_MAX_INITIAL_WORKERS", None)
            os.environ.pop("PRISM_DESIGN_COMPARE_MAX_PCB_WORKERS", None)
            self.assertEqual(
                design_compare_service._stage_worker_count("initial", 2),
                1,
            )
            self.assertEqual(
                design_compare_service._stage_worker_count("pcb", 2),
                1,
            )
            os.environ["PRISM_DESIGN_COMPARE_MAX_PCB_WORKERS"] = "2"
            self.assertEqual(
                design_compare_service._stage_worker_count("pcb", 2),
                2,
            )

    def test_initial_assembly_marks_only_schematic_and_bom_ready(self) -> None:
        revision = {
            "semantic": self._design(),
            "geometry": {"schematic": {}, "pcb": {}},
            "sources": [{"filename": "root.kicad_sch", "path": "root.kicad_sch"}],
            "bom_rows": [],
        }
        benchmark = DesignCompareBenchmark(job_id="staged-test")
        result, _state = design_compare_service._assemble_initial_comparison(
            project_id="project",
            base="base",
            head="head",
            revisions={"base": revision, "head": revision},
            object_delta={
                "changes": [],
                "base": {"nativeObjects": [], "routeMetrics": {}},
                "head": {"nativeObjects": [], "routeMetrics": {}},
            },
            include_unchanged=False,
            benchmark=benchmark,
        )
        self.assertEqual(result["readiness"]["stage"], "initial-ready")
        self.assertEqual(result["readiness"]["domains"]["schematic"], "ready")
        self.assertEqual(result["readiness"]["domains"]["bom"], "ready")
        self.assertEqual(result["readiness"]["domains"]["pcb"], "building")
        self.assertEqual(result["readiness"]["domains"]["stackup"], "building")

    def test_job_publishes_initial_result_before_starting_background_stage(self) -> None:
        events = []
        job_id = "staged-job"
        design_compare_service.design_compare_jobs[job_id] = {
            "job_id": job_id,
            "status": "running",
            "logs": [],
            "result": None,
        }
        initial_result = {
            "readiness": {
                "stage": "initial-ready",
                "domains": {
                    "schematic": "ready",
                    "bom": "ready",
                    "pcb": "building",
                    "stackup": "building",
                },
            },
            "schematic": {"changes": []},
            "pcb": {"changes": []},
            "bom": {"changes": []},
        }
        complete_result = {
            **initial_result,
            "readiness": {
                "stage": "complete",
                "domains": {
                    "schematic": "ready",
                    "bom": "ready",
                    "pcb": "ready",
                    "stackup": "ready",
                },
            },
        }

        def publish(_job_id, job, result, *, version, benchmark):
            del benchmark
            events.append(f"publish-{version}")
            job["result"] = result
            job["result_version"] = version
            job["readiness"] = result["readiness"]
            result_path = design_compare_service._JOB_ROOT / _job_id / "result.json"
            result_path.parent.mkdir(parents=True, exist_ok=True)
            result_path.write_text("{}", encoding="utf-8")
            return result_path

        def build_pcb(*_args, **_kwargs):
            self.assertEqual(events, ["publish-1"])
            events.append("pcb-start")
            return {"base": {}, "head": {}}, {"base": [], "head": []}

        with tempfile.TemporaryDirectory() as temporary, mock.patch.object(
            design_compare_service,
            "_JOB_ROOT",
            Path(temporary),
        ), mock.patch.object(
            design_compare_service,
            "_repo_paths",
            return_value=(Path("/repo"), None, Path("/repo")),
        ), mock.patch.object(
            design_compare_service,
            "_prepare_comparison_snapshots",
        ), mock.patch.object(
            design_compare_service,
            "_build_initial_revisions",
            return_value=({"base": {}, "head": {}}, {"base": [], "head": []}),
        ), mock.patch.object(
            design_compare_service,
            "_run_ecad_object_delta",
            return_value={
                "changes": [],
                "base": {"nativeObjects": [], "routeMetrics": {}},
                "head": {"nativeObjects": [], "routeMetrics": {}},
            },
        ), mock.patch.object(
            design_compare_service,
            "_assemble_initial_comparison",
            return_value=(initial_result, {"schematic_changes": []}),
        ), mock.patch.object(
            design_compare_service,
            "_publish_comparison_result",
            side_effect=publish,
        ), mock.patch.object(
            design_compare_service,
            "_build_pcb_revisions",
            side_effect=build_pcb,
        ), mock.patch.object(
            design_compare_service,
            "_complete_comparison",
            return_value=complete_result,
        ), mock.patch.object(
            design_compare_service,
            "_persist_job",
        ), mock.patch.object(
            design_compare_service.logger,
            "exception",
        ):
            design_compare_service._run_job(
                job_id,
                "project",
                "base",
                "head",
                False,
            )

        self.assertEqual(events, ["publish-1", "pcb-start", "publish-2"])
        self.assertEqual(design_compare_service.design_compare_jobs[job_id]["status"], "completed")
        design_compare_service.design_compare_jobs.pop(job_id, None)

    def test_background_failure_preserves_initial_result_and_marks_late_domains_failed(self) -> None:
        job_id = "staged-background-failure"
        design_compare_service.design_compare_jobs[job_id] = {
            "job_id": job_id,
            "status": "running",
            "logs": [],
            "result": None,
        }
        initial_result = {
            "readiness": {
                "stage": "initial-ready",
                "domains": {
                    "schematic": "ready",
                    "bom": "ready",
                    "pcb": "building",
                    "stackup": "building",
                },
            },
            "schematic": {"changes": [{"id": "schematic-change"}]},
            "pcb": {"changes": []},
            "bom": {"changes": [{"ref": "R1"}]},
        }
        published = []

        def publish(_job_id, job, result, *, version, benchmark):
            del benchmark
            published.append((version, copy.deepcopy(result)))
            job["result"] = result
            job["result_version"] = version
            job["readiness"] = result["readiness"]
            result_path = design_compare_service._JOB_ROOT / _job_id / "result.json"
            result_path.parent.mkdir(parents=True, exist_ok=True)
            result_path.write_text("{}", encoding="utf-8")
            return result_path

        with tempfile.TemporaryDirectory() as temporary, mock.patch.object(
            design_compare_service,
            "_JOB_ROOT",
            Path(temporary),
        ), mock.patch.object(
            design_compare_service,
            "_repo_paths",
            return_value=(Path("/repo"), None, Path("/repo")),
        ), mock.patch.object(
            design_compare_service,
            "_prepare_comparison_snapshots",
        ), mock.patch.object(
            design_compare_service,
            "_build_initial_revisions",
            return_value=({"base": {}, "head": {}}, {"base": [], "head": []}),
        ), mock.patch.object(
            design_compare_service,
            "_run_ecad_object_delta",
            return_value={
                "changes": [],
                "base": {"nativeObjects": [], "routeMetrics": {}},
                "head": {"nativeObjects": [], "routeMetrics": {}},
            },
        ), mock.patch.object(
            design_compare_service,
            "_assemble_initial_comparison",
            return_value=(initial_result, {"schematic_changes": []}),
        ), mock.patch.object(
            design_compare_service,
            "_publish_comparison_result",
            side_effect=publish,
        ), mock.patch.object(
            design_compare_service,
            "_build_pcb_revisions",
            side_effect=RuntimeError("PCB worker failed"),
        ), mock.patch.object(
            design_compare_service,
            "_persist_job",
        ), mock.patch.object(
            design_compare_service.logger,
            "exception",
        ):
            design_compare_service._run_job(
                job_id,
                "project",
                "base",
                "head",
                False,
            )

        self.assertEqual([version for version, _result in published], [1, 2])
        failed_result = published[-1][1]
        self.assertEqual(failed_result["readiness"]["stage"], "background-failed")
        self.assertEqual(failed_result["readiness"]["domains"]["schematic"], "ready")
        self.assertEqual(failed_result["readiness"]["domains"]["bom"], "ready")
        self.assertEqual(failed_result["readiness"]["domains"]["pcb"], "failed")
        self.assertEqual(failed_result["readiness"]["domains"]["stackup"], "failed")
        self.assertEqual(failed_result["schematic"], initial_result["schematic"])
        self.assertEqual(
            design_compare_service.design_compare_jobs[job_id]["status"],
            "failed",
        )
        design_compare_service.design_compare_jobs.pop(job_id, None)


class FabricationDomainTests(unittest.TestCase):
    """The fabrication domain must never take the rest of the comparison down.

    Plotting Gerbers is the one part of Design Comparison that shells out to
    KiCad. Everything else is pure parsing, so a missing or broken CLI has to
    degrade this domain alone.
    """

    def test_a_revision_without_a_board_reports_no_fabrication_output(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / "snapshot").mkdir()
            logs: list[str] = []

            result = design_compare_service._export_fabrication(
                root, root / "snapshot", "abc1234", logs
            )

        self.assertFalse(result["present"])
        self.assertIn("no board file", result["reason"])

    def test_a_failed_plot_is_logged_and_leaves_no_partial_export(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            snapshot = root / "snapshot"
            snapshot.mkdir()
            (snapshot / "board.kicad_pcb").write_text("(kicad_pcb)")
            logs: list[str] = []

            with mock.patch.object(
                design_compare_service.fabrication_compare_service,
                "export_gerbers",
                return_value=(False, "kicad-cli is not available"),
            ):
                result = design_compare_service._export_fabrication(
                    root, snapshot, "abc1234", logs
                )

            self.assertFalse((root / "fabrication").exists())

        self.assertFalse(result["present"])
        self.assertEqual(result["reason"], "kicad-cli is not available")
        self.assertTrue(any("abc1234" in line for line in logs))

    def test_one_revision_without_fabrication_output_disables_the_domain(self):
        result = design_compare_service._diff_fabrication(
            {"fabrication": {"present": True, "dir": "/nonexistent/base"}},
            {"fabrication": {"present": False, "reason": "gerber export timed out"}},
        )

        self.assertFalse(result["present"])
        self.assertEqual(result["warnings"], ["gerber export timed out"])
        self.assertEqual(result["layers"], [])

    def test_every_fabrication_payload_answers_the_same_questions(self):
        """The partial result is published while the PCB pass still runs.

        A payload missing keys the reviewer reads crashes the whole Design
        Comparison view mid-render, not just this tab.
        """

        required = {"present", "summary", "layers", "warnings", "bounds"}
        placeholder = design_compare_service._empty_fabrication()
        unavailable = design_compare_service._diff_fabrication(
            {"fabrication": {"present": False, "reason": "no kicad-cli"}},
            {"fabrication": {"present": False, "reason": "no kicad-cli"}},
        )

        for payload in (placeholder, unavailable):
            self.assertTrue(required <= set(payload), sorted(required - set(payload)))
            self.assertIn("changedLayers", payload["summary"])
        self.assertEqual(unavailable["warnings"], ["no kicad-cli"])

    def test_a_cached_export_directory_that_vanished_is_reported(self):
        result = design_compare_service._diff_fabrication(
            {"fabrication": {"present": True, "dir": "/nonexistent/base"}},
            {"fabrication": {"present": True, "dir": "/nonexistent/head"}},
        )

        self.assertFalse(result["present"])
        self.assertEqual(result["warnings"], ["cached fabrication output was removed"])


if __name__ == "__main__":
    unittest.main()
