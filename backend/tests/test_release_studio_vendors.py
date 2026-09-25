"""Vendor packs, pipeline progress, and configuration vendors key."""

from __future__ import annotations

import io
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace

from app.release_studio.canonical import write_deterministic_archive, write_deterministic_zip
from app.release_studio.config.loader import parse_configuration_yaml
from app.release_studio.config.digests import technical_config_digest
from app.release_studio.pipeline import PipelineTracker, pipeline_skeleton
from app.release_studio.vendors.jlcpcb import JlcpcbProfile, VendorGenerateError
from app.release_studio.vendors.pack import VendorPackError, build_vendor_pack
from app.release_studio.vendors.registry import public_profile_payload


_MIN_CONFIG = """
schema: prism.release-studio.configuration/1
title: Demo
board: board.kicad_pcb
schematic: board.kicad_sch
jobset: Outputs.kicad_jobset
"""


class VendorRegistryTests(unittest.TestCase):
    def test_registry_lists_jlcpcb(self) -> None:
        ids = [item["id"] for item in public_profile_payload()]
        self.assertEqual(ids, ["jlcpcb"])
        self.assertTrue(all("pack_filename" in item for item in public_profile_payload()))

    def test_omitted_vendors_defaults_to_jlcpcb(self) -> None:
        parsed = parse_configuration_yaml(_MIN_CONFIG)
        self.assertEqual(parsed["vendors"], ["jlcpcb"])

    def test_unknown_vendor_is_a_load_error(self) -> None:
        from app.release_studio.config.errors import ConfigSchemaError

        with self.assertRaisesRegex(ConfigSchemaError, "unknown vendor"):
            parse_configuration_yaml(_MIN_CONFIG + "\nvendors:\n  - pcbway\n")

    def test_vendors_move_the_technical_digest(self) -> None:
        base = parse_configuration_yaml(_MIN_CONFIG)
        empty = parse_configuration_yaml(_MIN_CONFIG + "\nvendors: []\n")
        self.assertNotEqual(technical_config_digest(base), technical_config_digest(empty))


class PipelineTrackerTests(unittest.TestCase):
    def test_skeleton_has_stable_job_ids(self) -> None:
        jobs = pipeline_skeleton(vendor_ids=["jlcpcb"])["jobs"]
        self.assertEqual(
            [job["id"] for job in jobs],
            ["closure", "checks", "assembly", "artwork", "documents", "package"],
        )
        assembly = next(job for job in jobs if job["id"] == "assembly")
        self.assertIn("vendor-jlcpcb", [step["id"] for step in assembly["steps"]])

    def test_progress_payload_is_the_full_tree(self) -> None:
        emitted: list[dict] = []

        def progress(**kwargs):
            emitted.append(kwargs)

        tracker = PipelineTracker(progress, vendor_ids=["jlcpcb"])
        tracker.seed()
        tracker.start("drc")
        tracker.succeed("drc", elapsed_ms=12, log="ok")
        last = emitted[-1]
        self.assertIn("pipeline", last["payload_updates"])
        self.assertTrue(last["force"])
        self.assertEqual(emitted[1]["message"], "Running DRC")
        self.assertEqual(emitted[-1]["message"], "Finished DRC")
        checks = next(
            job
            for job in last["payload_updates"]["pipeline"]["jobs"]
            if job["id"] == "checks"
        )
        drc = next(step for step in checks["steps"] if step["id"] == "drc")
        self.assertEqual(drc["status"], "success")
        self.assertEqual(drc["elapsed_ms"], 12)


class JobPipelineStatusTests(unittest.TestCase):
    def test_slim_status_exposes_pipeline_from_payload(self) -> None:
        from app.api.jobs import _slim_status

        status = _slim_status(
            {
                "job_id": "job-1",
                "kind": "release_studio_build",
                "status": "running",
                "payload": {"pipeline": {"jobs": [{"id": "checks", "status": "in_progress"}]}},
                "result_metadata": {},
            }
        )
        self.assertEqual(status["pipeline"]["jobs"][0]["id"], "checks")

    def test_slim_status_falls_back_to_result_metadata(self) -> None:
        from app.api.jobs import _slim_status

        status = _slim_status(
            {
                "job_id": "job-1",
                "kind": "release_studio_build",
                "status": "completed",
                "payload": {},
                "result_metadata": {"pipeline": {"jobs": [{"id": "package", "status": "success"}]}},
            }
        )
        self.assertEqual(status["pipeline"]["jobs"][0]["id"], "package")


class DeterministicZipTests(unittest.TestCase):
    def test_member_order_does_not_change_bytes(self) -> None:
        first = write_deterministic_zip({"b.txt": b"b", "a.txt": b"a"})
        second = write_deterministic_zip({"a.txt": b"a", "b.txt": b"b"})
        self.assertEqual(first, second)
        self.assertEqual(first[:2], b"PK")

    def test_mtime_is_written_into_zip_headers(self) -> None:
        from datetime import datetime, timezone

        stamp = int(datetime(2026, 8, 14, 3, 39, tzinfo=timezone.utc).timestamp())
        first = write_deterministic_zip({"a.txt": b"a"}, mtime=stamp)
        second = write_deterministic_zip({"a.txt": b"a"}, mtime=stamp)
        self.assertEqual(first, second)
        with zipfile.ZipFile(io.BytesIO(first)) as archive:
            self.assertEqual(archive.getinfo("a.txt").date_time, (2026, 8, 14, 3, 39, 0))


class VendorPackTests(unittest.TestCase):
    def test_pack_contains_gerbers_and_vendor_workbooks(self) -> None:
        dossier = write_deterministic_archive(
            {
                "fabrication/gerbers/board-F_Cu.gbr": b"G04 gerber*\n",
                "fabrication/drill/board-PTH.drl": b"M48\n",
                "manufacturing/vendors/jlcpcb/bom.csv": b"Comment,Designator\n",
                "manufacturing/vendors/jlcpcb/cpl.csv": b"Designator,PosX\n",
                "manifest.json": b"{}",
            }
        )
        evidence = write_deterministic_archive(
            {
                "raw/vendors/jlcpcb/bom.xlsx": b"xlsx-bom",
                "raw/vendors/jlcpcb/cpl.xlsx": b"xlsx-cpl",
            }
        )
        pack = build_vendor_pack(
            "jlcpcb", dossier_bytes=dossier, evidence_bytes=evidence
        )
        with zipfile.ZipFile(io.BytesIO(pack)) as archive:
            names = set(archive.namelist())
        self.assertIn("gerbers/board-F_Cu.gbr", names)
        self.assertIn("drill/board-PTH.drl", names)
        self.assertIn("bom.xlsx", names)
        self.assertIn("cpl.xlsx", names)

    def test_unknown_profile_is_not_jlc_shaped(self) -> None:
        with self.assertRaisesRegex(VendorPackError, "unknown vendor"):
            build_vendor_pack("pcbway", dossier_bytes=b"not-a-tar")

    def test_second_profile_pack_is_not_jlc_shaped(self) -> None:
        from unittest.mock import patch

        class AcmeProfile:
            id = "acme"
            title = "Acme Fab"
            pack_filename = "acme-upload.zip"
            description = "fixture"

        dossier = write_deterministic_archive(
            {
                "fabrication/gerbers/board-F_Cu.gbr": b"G04 gerber*\n",
                "fabrication/drill/board-PTH.drl": b"M48\n",
                "manufacturing/vendors/acme/paste.csv": b"ref,x\n",
                "manufacturing/vendors/jlcpcb/bom.csv": b"Comment,Designator\n",
            }
        )
        evidence = write_deterministic_archive(
            {
                "raw/vendors/acme/notes.txt": b"acme-notes",
                "raw/vendors/jlcpcb/bom.xlsx": b"xlsx-bom",
            }
        )
        with patch(
            "app.release_studio.vendors.pack.profile_by_id",
            return_value=AcmeProfile(),
        ):
            pack = build_vendor_pack(
                "acme", dossier_bytes=dossier, evidence_bytes=evidence
            )
        with zipfile.ZipFile(io.BytesIO(pack)) as archive:
            names = set(archive.namelist())
        self.assertIn("gerbers/board-F_Cu.gbr", names)
        self.assertIn("paste.csv", names)
        self.assertIn("notes.txt", names)
        self.assertNotIn("bom.csv", names)
        self.assertNotIn("bom.xlsx", names)

    def test_missing_gerbers_fail_closed(self) -> None:
        dossier = write_deterministic_archive({"manifest.json": b"{}"})
        with self.assertRaisesRegex(VendorPackError, "missing gerber"):
            build_vendor_pack("jlcpcb", dossier_bytes=dossier)

    def test_incomplete_jlc_pack_is_not_ready_and_names_every_missing_requirement(self) -> None:
        from app.release_studio.vendors.pack import vendor_pack_readiness

        dossier = write_deterministic_archive(
            {"fabrication/gerbers/board-F_Cu.gbr": b"G04 gerber*\n"}
        )
        readiness = vendor_pack_readiness("jlcpcb", dossier_bytes=dossier)
        self.assertFalse(readiness["ready"])
        self.assertEqual(
            readiness["missing_requirements"],
            ["drill", "bom.csv", "cpl.csv", "bom.xlsx", "cpl.xlsx"],
        )
        with self.assertRaisesRegex(VendorPackError, "missing drill, bom.csv, cpl.csv, bom.xlsx, cpl.xlsx"):
            build_vendor_pack("jlcpcb", dossier_bytes=dossier)


class JlcpcbGeneratorTests(unittest.TestCase):
    def test_fake_runner_renames_csv_and_xlsx(self) -> None:
        tmp = Path(self._tmp())
        design = tmp / "board.kicad_pcb"
        design.write_text("(kicad_pcb)\n", encoding="utf-8")
        output_root = tmp / "out"

        def runner(argv, **kwargs):  # noqa: ARG001
            # Config mode: one invocation per tool emits every kind the config
            # lists, named by kind rather than by tool.
            destination = Path(argv[argv.index("-o") + 1])
            destination.mkdir(parents=True, exist_ok=True)
            if argv[1] == "bom":
                (destination / "board_base_jlc-csv.csv").write_text("Comment,Designator\nR,R1\n")
                (destination / "board_base_jlc-xlsx.xlsx").write_bytes(b"xlsx-bom")
            elif argv[1] == "pnp":
                (destination / "board_base_jlc-cpl.csv").write_text("Designator,Mid X\nR1,1\n")
                (destination / "board_base_jlc-cpl-xlsx.xlsx").write_bytes(b"xlsx-cpl")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        artifacts = JlcpcbProfile().generate(
            cruncher_path="kicad-cruncher",
            design_file=design,
            output_root=output_root,
            runner=runner,
        )
        self.assertEqual(artifacts.returncode, 0)
        self.assertTrue(artifacts.canonical_files["manufacturing/vendors/jlcpcb/bom.csv"].is_file())
        self.assertTrue(artifacts.evidence_files["vendors/jlcpcb/bom.xlsx"].is_file())
        self.assertNotIn("xlsx", "".join(artifacts.canonical_files))

    def test_one_invocation_per_tool_not_one_per_format(self) -> None:
        """Four formats must not cost four parses of the design.

        `--format` overrides config mode and emits a single kind, so asking for
        it four times loaded JTYU-OBC four times -- 114s where 60s does.
        """

        tmp = Path(self._tmp())
        design = tmp / "board.kicad_pcb"
        design.write_text("(kicad_pcb)\n", encoding="utf-8")
        calls: list[list[str]] = []

        def runner(argv, **kwargs):  # noqa: ARG001
            calls.append(list(argv))
            destination = Path(argv[argv.index("-o") + 1])
            destination.mkdir(parents=True, exist_ok=True)
            if argv[1] == "bom":
                (destination / "b_base_jlc-csv.csv").write_text("a\n")
                (destination / "b_base_jlc-xlsx.xlsx").write_bytes(b"x")
            else:
                (destination / "b_base_jlc-cpl.csv").write_text("a\n")
                (destination / "b_base_jlc-cpl-xlsx.xlsx").write_bytes(b"x")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        artifacts = JlcpcbProfile().generate(
            cruncher_path="kicad-cruncher",
            design_file=design,
            output_root=tmp / "out",
            runner=runner,
        )
        self.assertEqual([call[1] for call in calls], ["bom", "pnp"])
        self.assertTrue(all("--format" not in call for call in calls))
        # An install path is not part of the build's identity: recording one
        # would make the same build differ between two checkouts.
        for recorded in artifacts.normalized_argv:
            self.assertNotIn("/", recorded.split("jlcpcb.config")[0][-40:])

    def test_the_vendor_config_pins_what_reaches_a_fab_house(self) -> None:
        """Two config defaults would change the BOM, so they are asserted here.

        The template ships `include_dnp: true`, which puts do-not-populate
        parts in the assembler's BOM, and groups on description, which split
        one OBC line into three. Both were found by diffing real output.
        """

        import json
        import re

        from app.release_studio.vendors.jlcpcb import VENDOR_CONFIG

        text = VENDOR_CONFIG.read_text(encoding="utf-8")
        body = re.sub(r"^\s*//.*$", "", text, flags=re.M)
        config = json.loads(body)
        self.assertIs(config["bom"]["include_dnp"], False)
        self.assertEqual(config["bom"]["group_fields"], ["value", "footprint"])
        self.assertEqual(config["variants"]["mode"], "base")

    def test_editing_the_vendor_config_moves_the_build_key(self) -> None:
        """Otherwise a pack could change under an unchanged build key."""

        from unittest.mock import patch

        from app.release_studio.documents import renderer_resource_digest

        before = renderer_resource_digest()
        with patch(
            "app.release_studio.vendors.jlcpcb.VENDOR_CONFIG"
        ) as fake:
            fake.read_bytes.return_value = b'{"schema": "changed"}'
            after = renderer_resource_digest()
        self.assertNotEqual(before, after)

    def test_missing_outputs_raise(self) -> None:
        tmp = Path(self._tmp())
        design = tmp / "board.kicad_pcb"
        design.write_text("(kicad_pcb)\n", encoding="utf-8")

        def runner(argv, **kwargs):  # noqa: ARG001
            Path(argv[argv.index("-o") + 1]).mkdir(parents=True, exist_ok=True)
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with self.assertRaises(VendorGenerateError):
            JlcpcbProfile().generate(
                cruncher_path="kicad-cruncher",
                design_file=design,
                output_root=tmp / "out",
                runner=runner,
            )

    def _tmp(self) -> str:
        import tempfile

        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        return directory.name


if __name__ == "__main__":
    unittest.main()
