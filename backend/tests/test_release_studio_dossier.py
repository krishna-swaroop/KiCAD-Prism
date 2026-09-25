"""R7/R10 acceptance: evidence capture, dossier assembly, and reproducibility.

The step runner is faked so the whole pipeline — canonicalize, fingerprint,
manifest, package — is exercised in the default gate.  The fake writes the
byte shapes KiCad 10.0.4 actually emits, including the wall-clock stamps, so
the reproducibility assertion here is meaningful rather than trivially true.
"""

from __future__ import annotations

import json
import sys
import tarfile
import io
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:  # pragma: no cover - import bootstrap
    sys.path.insert(0, str(REPO_ROOT))

from app.release_studio import dossier as dossier_module  # noqa: E402
from app.release_studio.canonical import sha256_canonical  # noqa: E402
from app.release_studio.canonical.json import canonical_json_bytes  # noqa: E402
from app.release_studio.dossier import (  # noqa: E402
    DossierError,
    assemble,
    assert_no_governance_leak,
    compute_dossier_digest,
)
from app.release_studio.steps import (  # noqa: E402
    STEP_BY_ID,
    STEP_CATALOGUE,
    evidence_counts,
    run_step_catalogue,
)


GERBER = (
    "%TF.GenerationSoftware,KiCad,Pcbnew,10.0.4*%\n"
    "%TF.CreationDate,{stamp}*%\n"
    "%FSLAX46Y46*%\n"
    "G04 Created by KiCad (PCBNEW 10.0.4) date {plain}*\n"
    "%MOMM*%\n%ADD10C,0.200000*%\nD10*\nX1000Y1000D02*\nX2000Y2000D01*\nM02*\n"
)
DRILL = (
    "M48\n; DRILL file KiCad 10.0.4 date {stamp}\n"
    "; #@! TF.CreationDate,{stamp}\nFMAT,2\nMETRIC\nT1C0.300\n%\nG90\nT1\nX10.0Y10.0\nM30\n"
)
POSITIONS = (
    "### Footprint positions - created on {stamp} ###\n"
    "# Ref,Val,Package,PosX,PosY,Rot,Side\n"
    "R1,10k,R_0402,10.000000,-10.000000,90.000000,top\n"
)
BOM = "Reference,Value,Footprint,Qty\nR1,10k,R_0402,1\n"
DRC = {
    "$schema": "https://schemas.kicad.org/drc.v1.json",
    "date": "{stamp}",
    "source": "board.kicad_pcb",
    "violations": [
        {"type": "clearance", "severity": "error", "description": "Clearance violation"},
        {"type": "silk_overlap", "severity": "warning", "description": "Silkscreen overlap"},
    ],
    "unconnected_items": [],
    "schematic_parity": [],
}
ERC = {
    "$schema": "https://schemas.kicad.org/erc.v1.json",
    "date": "{stamp}",
    "sheets": [
        {"violations": [{"type": "pin_not_connected", "severity": "warning", "description": "NC"}]}
    ],
}
STATS = {"metadata": {"date": "{stamp}"}, "drill": {"total": 12}, "layers": 2}


def _member_fields(member) -> dict:
    return {
        "path": member.path,
        "member_kind": member.member_kind,
        "media_type": member.media_type,
        "size_bytes": member.size_bytes,
        "released_digest": member.released_digest,
        "source_raw_digest": member.source_raw_digest,
        "canonicalizer": member.canonicalizer,
        "domains": member.domains,
        "step_id": member.step_id,
    }


def _fake_runner(stamp: str, plain: str):
    """Return a runner that writes what the requested step would have written."""

    def run(argv, cwd, timeout_seconds):  # noqa: ARG001 - signature is the contract
        out = Path(argv[argv.index("--output") + 1])
        text = lambda body: body.format(stamp=stamp, plain=plain)  # noqa: E731
        jdump = lambda payload: json.dumps(payload).replace("{stamp}", stamp)  # noqa: E731
        if argv[1:3] == ["export", "gerbers"] or argv[2:4] == ["export", "gerbers"]:
            out.mkdir(parents=True, exist_ok=True)
            (out / "board-F_Cu.gbr").write_text(text(GERBER))
            (out / "board-B_Cu.gbr").write_text(text(GERBER))
            (out / "board-job.gbrjob").write_text(
                json.dumps({"GeneralSpecs": {"CreationDate": stamp, "ProjectId": {"Name": "b"}}})
            )
        elif "drill" in argv:
            out.mkdir(parents=True, exist_ok=True)
            (out / "board-PTH.drl").write_text(text(DRILL))
        elif "pos" in argv:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(text(POSITIONS))
        elif "bom" in argv:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(BOM)
        elif "drc" in argv:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(jdump(DRC))
        elif "erc" in argv:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(jdump(ERC))
        elif "stats" in argv:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(jdump(STATS))
        else:
            # pdf steps are optional; report failure so the optional path runs
            return type("R", (), {"returncode": 1, "stdout": "", "stderr": "no pdf here"})()
        return type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    return run


class StepCatalogueOrderTests(unittest.TestCase):
    """The catalogue reports in catalogue order even if a step is slow.

    Member ordering feeds `dossier_digest`, so results must not follow
    completion order.
    """

    def test_results_follow_the_catalogue_not_the_finishing_order(self) -> None:
        import time

        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        closure = root / "closure"
        (closure / "hardware").mkdir(parents=True)
        (closure / "hardware/board.kicad_pcb").write_text("(kicad_pcb)")
        (closure / "hardware/board.kicad_sch").write_text("(kicad_sch)")

        inner = _fake_runner("2026-01-01T00:00:00+00:00", "2026-01-01")
        started: list[float] = []

        def run(argv, cwd, timeout_seconds):
            started.append(time.monotonic())
            # Invert the finishing order relative to the catalogue: the first
            # step waits longest, so a completion-ordered result would be
            # visibly reversed.
            time.sleep(0.05 if "drc" in argv else 0.0)
            return inner(argv, cwd=cwd, timeout_seconds=timeout_seconds)

        outputs = run_step_catalogue(
            closure_root=closure,
            board_rel="hardware/board.kicad_pcb",
            schematic_rel="hardware/board.kicad_sch",
            output_root=root / "out",
            cli_path="/usr/bin/true",
            runner=run,
        )

        produced = [output.step_id for output in outputs]
        expected = [
            spec.step_id
            for spec in STEP_CATALOGUE
            if spec.step_id in set(produced)
        ]
        self.assertEqual(produced, expected)
        self.assertGreater(len(started), 1)
        # Catalogue steps run one kicad-cli at a time; DRC's 50ms sleep
        # must finish before the next step starts.
        self.assertGreaterEqual(max(started) - min(started), 0.04)


class CatalogueWaveCoverageTests(unittest.TestCase):
    def test_every_catalogue_step_is_in_exactly_one_wave(self) -> None:
        from app.release_studio.steps import (
            CATALOGUE_WAVE_ARTWORK,
            CATALOGUE_WAVE_BOM,
            CATALOGUE_WAVE_CHECKS,
            CATALOGUE_WAVE_POSITIONS,
        )

        wave = (
            CATALOGUE_WAVE_CHECKS
            + CATALOGUE_WAVE_POSITIONS
            + CATALOGUE_WAVE_BOM
            + CATALOGUE_WAVE_ARTWORK
        )
        self.assertEqual(len(wave), len(set(wave)))
        self.assertEqual(set(wave), {spec.step_id for spec in STEP_CATALOGUE})

    def test_bom_is_alone_after_positions_and_checks(self) -> None:
        from app.release_studio.steps import (
            CATALOGUE_WAVE_BOM,
            CATALOGUE_WAVE_CHECKS,
            CATALOGUE_WAVE_POSITIONS,
        )

        self.assertEqual(CATALOGUE_WAVE_CHECKS, ("drc", "erc", "board_stats"))
        self.assertEqual(CATALOGUE_WAVE_POSITIONS, ("positions",))
        self.assertEqual(CATALOGUE_WAVE_BOM, ("bom",))


class ReleaseStudioDossierTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        self.closure = self.root / "closure"
        (self.closure / "hardware").mkdir(parents=True)
        (self.closure / "hardware/board.kicad_pcb").write_text("(kicad_pcb)")
        (self.closure / "hardware/board.kicad_sch").write_text("(kicad_sch)")

    def _build(
        self,
        stamp: str,
        plain: str,
        out_name: str,
        archive_mtime: int = 0,
        projections: dict | None = None,
        timings: list | None = None,
    ):
        output_root = self.root / out_name
        output_root.mkdir()
        outputs = run_step_catalogue(
            closure_root=self.closure,
            board_rel="hardware/board.kicad_pcb",
            schematic_rel="hardware/board.kicad_sch",
            output_root=output_root,
            variant="default",
            cli_path="/usr/bin/true",
            runner=_fake_runner(stamp, plain),
        )
        return assemble(
            outputs=outputs,
            commit_sha="a" * 40,
            variant="default",
            config_key="default",
            technical_config_digest="c" * 64,
            input_closure_digest="d" * 64,
            toolchain={"kicad_version": "10.0.4", "executor_image": "sha256:e"},
            toolchain_digest="t" * 64,
            build_key="b" * 64,
            config_fragments={"board": "hardware/board.kicad_pcb"},
            projections=projections,
            archive_mtime=archive_mtime,
            timings=timings,
        )

    # -- Stage 1 exit criterion 1 ------------------------------------------

    def test_every_step_leaves_a_full_log_in_build_evidence(self) -> None:
        """A release must not outlive the record of how it was built.

        The job row keeps a 4000-character tail and is pruned on the job
        retention schedule; build-evidence is pinned for as long as the release
        exists, so the durable copy belongs there.
        """

        import io
        import tarfile

        assembled = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "logs")
        with tarfile.open(fileobj=io.BytesIO(assembled.evidence_bytes)) as archive:
            logs = [name for name in archive.getnames() if name.startswith("logs/")]
            self.assertTrue(logs, "build-evidence carries no step logs")
            first = archive.extractfile(logs[0]).read().decode("utf-8")
        # The argv matters as much as the text: a log that shows output but not
        # the invocation leaves a reader guessing which command produced it.
        self.assertIn("step:", first)
        self.assertIn("argv:", first)
        self.assertIn("returncode:", first)

    def test_step_logs_stay_out_of_the_dossier(self) -> None:
        """Logs are evidence. Releasing them would change released digests."""

        import io
        import tarfile

        assembled = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "sep")
        with tarfile.open(fileobj=io.BytesIO(assembled.dossier_bytes)) as archive:
            self.assertEqual(
                [name for name in archive.getnames() if name.startswith("logs/")], []
            )
        self.assertTrue(all("logs/" not in member.path for member in assembled.members))

    def test_two_builds_at_different_times_are_semantically_identical(self) -> None:
        early = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        later = self._build("2026-08-11T09:41:12+00:00", "2026-08-11 09:41:12", "b")

        self.assertEqual(early.dossier_digest, later.dossier_digest)
        self.assertEqual(early.manifest_digest, later.manifest_digest)
        self.assertEqual(early.dossier_bytes, later.dossier_bytes)
        for member in early.members:
            other = later.member_by_path(member.path)
            self.assertIsNotNone(other, member.path)
            self.assertEqual(member.released_digest, other.released_digest, member.path)

        # ...and the raw bytes really did differ for the timestamp-bearing set,
        # otherwise the assertion above would be vacuous.
        stamped = {
            member.path
            for member in early.members
            if member.canonicalizer in {"gerber", "excellon", "gbrjob"}
        }
        self.assertTrue(stamped)
        differing = {
            member.path
            for member in early.members
            if member.source_raw_digest != later.member_by_path(member.path).source_raw_digest
        }
        self.assertTrue(stamped <= differing, f"raw bytes did not differ for {stamped - differing}")

    def test_dossier_is_a_deterministic_archive_containing_its_manifest(self) -> None:
        built = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        with tarfile.open(fileobj=io.BytesIO(built.dossier_bytes), mode="r:gz") as tar:
            names = sorted(tar.getnames())
            manifest = json.loads(tar.extractfile("manifest.json").read().decode())
            for info in tar.getmembers():
                self.assertEqual(info.mtime, 0)
                self.assertEqual((info.uid, info.gid), (0, 0))
        self.assertIn("manifest.json", names)
        self.assertEqual(manifest["dossier_digest"], built.dossier_digest)
        # The manifest never contains its own digest.
        self.assertNotIn("manifest_digest", manifest)
        for member in built.members:
            self.assertIn(member.path, names)

    def test_dossier_archive_uses_the_revision_timestamp_when_supplied(self) -> None:
        stamp = 1_786_447_809
        built = self._build(
            "2026-08-11T07:00:00+00:00",
            "2026-08-11 07:00:00",
            "revision-time",
            archive_mtime=stamp,
        )
        for payload in (built.dossier_bytes, built.evidence_bytes):
            with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
                self.assertTrue(archive.getmembers())
                self.assertTrue(all(info.mtime == stamp for info in archive.getmembers()))

    def test_manifest_excludes_every_governance_field(self) -> None:
        built = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        assert_no_governance_leak(built.manifest)
        leaked = dict(built.manifest)
        leaked["policy_binding_digest"] = "x" * 64
        with self.assertRaisesRegex(DossierError, "policy_binding_digest"):
            assert_no_governance_leak(leaked)
        nested = {"members": {"a.gbr": {"approver": "someone"}}}
        with self.assertRaisesRegex(DossierError, "approver"):
            assert_no_governance_leak(nested)
        with self.assertRaisesRegex(DossierError, "policy"):
            assert_no_governance_leak({"members": {"a.gbr": {"policy": "org:default@1"}}})
        with self.assertRaisesRegex(DossierError, "timestamp"):
            assert_no_governance_leak({"toolchain": {"timestamp": "now"}})

    def test_raw_bytes_are_retained_outside_the_dossier(self) -> None:
        built = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        with tarfile.open(fileobj=io.BytesIO(built.evidence_bytes), mode="r:gz") as tar:
            names = tar.getnames()
            raw = tar.extractfile("raw/fabrication/gerbers/board-F_Cu.gbr").read().decode()
            evidence = json.loads(tar.extractfile("build-evidence.json").read().decode())
        self.assertIn("TF.CreationDate", raw, "build evidence must keep pre-canonical bytes")
        self.assertEqual(evidence["manifest_digest"], built.manifest_digest)
        self.assertTrue(
            all(
                step["status"] in {"success", "failure", "skipped"}
                for step in evidence["steps"].values()
            )
        )
        self.assertTrue(any(name.startswith("raw/") for name in names))

    # -- domains and fingerprints ------------------------------------------

    def test_members_are_mapped_to_governed_domains(self) -> None:
        built = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        by_path = {member.path: member.domains for member in built.members}
        self.assertEqual(by_path["fabrication/gerbers/board-F_Cu.gbr"], ("bare_board",))
        self.assertEqual(by_path["assembly/positions.csv"], ("assembly",))
        self.assertEqual(by_path["evidence/drc.json"], ("evidence",))
        self.assertEqual(
            sorted(built.fingerprints), ["assembly", "bare_board", "evidence"]
        )

    def test_domain_fingerprint_moves_only_with_its_own_members(self) -> None:
        """An assembly-only change must not disturb the bare-board fingerprint.

        This is the mechanism behind the R17 carry-forward table: a variant
        population change alters the position file and nothing else, so the
        fabrication approval survives while the assembly approval does not.
        """

        built = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        mutated = tuple(
            member
            if member.path != "assembly/positions.csv"
            else dossier_module.Member(
                **{**_member_fields(member), "released_digest": "9" * 64}
            )
            for member in built.members
        )

        def fingerprint(domain: str, members) -> str:
            return dossier_module.technical_scope_fingerprint(
                domain,
                members,
                toolchain_digest="t" * 64,
                normalized_argv={},
                config_fragments={},
            )["fingerprint"]

        self.assertNotEqual(
            fingerprint("assembly", built.members), fingerprint("assembly", mutated)
        )
        self.assertEqual(
            fingerprint("bare_board", built.members), fingerprint("bare_board", mutated)
        )

    def test_board_and_semantic_projection_fidelity_is_reported_honestly(self) -> None:
        built = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        common = dict(
            domain="bare_board",
            members=built.members,
            toolchain_digest="t" * 64,
            normalized_argv={},
            config_fragments={},
        )
        artifact = dossier_module.technical_scope_fingerprint(**common)
        board = dossier_module.technical_scope_fingerprint(
            **common, projections={"stackup": {"copper_layer_count": 2}}
        )
        semantic = dossier_module.technical_scope_fingerprint(
            **common,
            projections={
                "stackup": {"copper_layer_count": 2},
                "semantic": {"bare_board": {"nets": [{"name": "GND"}]}},
            },
        )
        self.assertEqual(artifact["fidelity"], "artifact")
        self.assertEqual(board["fidelity"], "board")
        self.assertEqual(semantic["fidelity"], "semantic")
        self.assertEqual(len({artifact["fingerprint"], board["fingerprint"], semantic["fingerprint"]}), 3)

    def test_the_manifest_carries_projection_digests_not_projection_text(self) -> None:
        """The released manifest is a description, not a data dump.

        Embedding projections verbatim made a real manifest 10.5 MB, of which
        99.9% was projection text -- downloaded by every recipient, and pinned
        into `manifest_digest`.
        """

        stackup = {"layers": [{"name": f"layer-{index}"} for index in range(400)]}
        built = self._build(
            "2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a",
            projections={"stackup": stackup},
        )
        manifest = built.manifest
        self.assertNotIn("projections", manifest)
        self.assertEqual(
            manifest["projection_digests"]["stackup"], sha256_canonical(stackup)
        )
        # A manifest is metadata; a size close to the projection's own would
        # mean the text is still in there under another name.
        self.assertLess(len(canonical_json_bytes(manifest)), 100_000)

    def test_a_changed_projection_still_moves_the_fingerprint(self) -> None:
        """Hashing must not weaken what the fingerprint discriminates."""

        built = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        common = dict(
            domain="bare_board",
            members=built.members,
            toolchain_digest="t" * 64,
            normalized_argv={},
            config_fragments={},
        )
        two = dossier_module.technical_scope_fingerprint(
            **common, projections={"stackup": {"copper_layer_count": 2}}
        )
        four = dossier_module.technical_scope_fingerprint(
            **common, projections={"stackup": {"copper_layer_count": 4}}
        )
        self.assertNotEqual(two["fingerprint"], four["fingerprint"])
        # And the inputs stay small, which is the point: they are persisted
        # per (build, domain).
        self.assertLess(len(canonical_json_bytes(two["inputs"])), 10_000)

    def test_build_evidence_still_carries_the_projection_text(self) -> None:
        """Forensics must be able to reach what the digests were taken from."""

        import tarfile as _tarfile

        stackup = {"layers": [{"name": "F.Cu"}]}
        built = self._build(
            "2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a",
            projections={"stackup": stackup},
        )
        with _tarfile.open(fileobj=io.BytesIO(built.evidence_bytes), mode="r:*") as archive:
            payload = json.loads(
                archive.extractfile("build-evidence.json").read().decode("utf-8")
            )
        self.assertEqual(payload["projections"]["stackup"], stackup)
        self.assertEqual(
            payload["projection_digests"]["stackup"], sha256_canonical(stackup)
        )

    def test_build_evidence_records_timings_outside_the_manifest(self) -> None:
        """Wall clock is forensic, never a fingerprint input."""

        import tarfile as _tarfile

        timings = [{"name": "catalogue-wave-a", "elapsed_ms": 12.5}]
        plain = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        timed = self._build(
            "2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "timed",
            timings=timings,
        )
        self.assertEqual(plain.dossier_digest, timed.dossier_digest)
        self.assertEqual(plain.manifest_digest, timed.manifest_digest)
        self.assertNotIn("timings", timed.manifest)
        with _tarfile.open(fileobj=io.BytesIO(timed.evidence_bytes), mode="r:*") as archive:
            payload = json.loads(
                archive.extractfile("build-evidence.json").read().decode("utf-8")
            )
        self.assertEqual(payload["timings"], timings)
        self.assertIn("elapsed_ms", next(iter(payload["steps"].values())))

    def test_semantic_projection_excludes_cache_metadata_and_order(self) -> None:
        from app.release_studio.semantic import semantic_scope_projections

        first = semantic_scope_projections(
            {
                "schema": "prism.semantic_index_a0",
                "generatedAt": "2026-08-11T00:00:00Z",
                "generator": {"build": "one"},
                "components": [{"reference": "R2"}, {"reference": "R1"}],
                "nets": [{"name": "VCC"}, {"name": "GND"}],
                "terminals": [],
            }
        )
        second = semantic_scope_projections(
            {
                "schema": "prism.semantic_index_a0",
                "generatedAt": "2026-08-12T00:00:00Z",
                "generator": {"build": "two"},
                "components": [{"reference": "R1"}, {"reference": "R2"}],
                "nets": [{"name": "GND"}, {"name": "VCC"}],
                "terminals": [],
            }
        )
        self.assertEqual(first, second)

    def test_dossier_digest_is_order_independent(self) -> None:
        built = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        self.assertEqual(
            compute_dossier_digest(built.members),
            compute_dossier_digest(list(reversed(built.members))),
        )

    # -- evidence ----------------------------------------------------------

    def test_failing_drc_produces_evidence_rather_than_aborting(self) -> None:
        built = self._build("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00", "a")
        by_kind = {record["kind"]: record for record in built.evidence}
        self.assertEqual(sorted(by_kind), ["drc", "erc"])
        self.assertEqual(by_kind["drc"]["counts"]["error"], 1)
        self.assertEqual(by_kind["drc"]["counts"]["warning"], 1)
        self.assertEqual(by_kind["drc"]["counts"]["total"], 2)
        self.assertEqual(by_kind["erc"]["counts"]["total"], 1)
        self.assertEqual(
            by_kind["drc"]["report_digest"],
            built.member_by_path("evidence/drc.json").released_digest,
        )

    def test_evidence_counts_folds_every_kicad_violation_container(self) -> None:
        counts = evidence_counts(
            {
                "violations": [{"severity": "error"}],
                "unconnected_items": [{"severity": "warning"}],
                "schematic_parity": [{"severity": "error"}],
                "sheets": [{"violations": [{"severity": "exclusion"}]}],
            }
        )
        self.assertEqual(counts, {"error": 2, "warning": 1, "exclusion": 1, "total": 4})

    def test_evidence_counts_skip_excluded_ignored_and_waived_items(self) -> None:
        counts = evidence_counts(
            {
                "violations": [
                    {"severity": "error"},
                    {"severity": "error", "excluded": True},
                    {"severity": "error", "ignored": True},
                    {"severity": "error", "waived": True},
                    {"severity": "warning"},
                ]
            }
        )
        self.assertEqual(counts, {"error": 1, "warning": 1, "total": 2})

    def test_every_protel_gerber_extension_resolves_to_the_gerber_canonicalizer(self) -> None:
        # Transcribed from the pinned KiCad 10.0.4 source,
        # `pcbnew/pcbplot.cpp:44` `GetGerberProtelExtension`.  A jobset with
        # Protel extensions enabled emits these, and a gap fails the build only
        # once real fabrication artwork reaches canonicalization.
        protel = [
            "gtl", "gbl",              # F_Cu, B_Cu
            "gta", "gba",              # F_Adhes, B_Adhes
            "gto", "gbo",              # F_SilkS, B_SilkS
            "gts", "gbs",              # F_Mask, B_Mask
            "gtp", "gbp",              # F_Paste, B_Paste
            "gm1",                     # Edge_Cuts
            "gbr",                     # the documented default
        ]
        for extension in protel:
            with self.subTest(extension=extension):
                self.assertEqual(
                    dossier_module.canonicalizer_for(f"fabrication/board.{extension}", ""),
                    "gerber",
                )

        # Inner copper is `g` + the copper layer ordinal, so it has no fixed
        # extension and cannot be enumerated in a static table.
        for ordinal in (1, 2, 9, 30):
            with self.subTest(inner=ordinal):
                self.assertEqual(
                    dossier_module.canonicalizer_for(f"fabrication/board.g{ordinal}", ""),
                    "gerber",
                )

    def test_unknown_member_type_fails_closed(self) -> None:
        with self.assertRaisesRegex(DossierError, "no canonicalizer registered"):
            dossier_module.canonicalizer_for("fabrication/mystery.xyz", "")

    def test_catalogue_step_types_are_all_known_to_the_jobset_registry(self) -> None:
        from app.release_studio.jobset import KICAD_10_0_4_JOB_TYPES

        for spec in STEP_BY_ID.values():
            self.assertIn(spec.step_type, KICAD_10_0_4_JOB_TYPES, spec.step_id)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
