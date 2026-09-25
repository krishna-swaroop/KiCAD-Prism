"""Acceptance tests for the Release Studio R4 canonicalization registry.

    The semantic tests intentionally generate their inputs from durable R0
    fixtures with the pinned live KiCad executor.  No handcrafted
miniature Gerber, drill, STEP, SVG, PDF, or report files are checked into the
locked ``fixtures/release-studio`` root.  The generated files live only in a
temporary directory for the test process; their provenance is documented in
``docs/release-studio/ARTIFACTS.md`` and by :func:`_generate_samples` below.
"""

from __future__ import annotations

import copy
import csv
import hashlib
import io
import json
import re
import shutil
import tarfile
import tempfile
import unittest
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from app.release_studio.canonical import (
    CANONICALIZER_REGISTRY_VERSION,
    CANONICALIZER_VERSIONS,
    REGISTRY,
    SVG_PRECISION,
    STEP_FILE_NAME_SENTINEL,
    canonical_json,
    canonicalize,
    canonicalizer_registry,
    write_deterministic_archive,
)
from app.release_studio.canonical.json import canonical_json_bytes
from app.services.fabrication_compare_service import parse_excellon, parse_gerber
from app.services.job_artifact_service import JobArtifactService
from app.services.job_runtime import JobContext
from tests.release_studio_support import (
    fixture_entrypoint,
    fixture_root,
    requires_kicad_cli,
    run_kicad_cli,
)


_STEP_ENTITY_RE = re.compile(rb"(?m)^\s*#\d+\s*=")
# Any ISO-8601-ish instant.  The single property every text canonicalizer owes
# the reproducibility guarantee is that none of these survives.
_VOLATILE_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}")

_SVG_TIMESTAMP_COMMENT = re.compile(
    r"<!--.*?(?:date|created|generated|timestamp).*?-->",
    re.IGNORECASE | re.DOTALL,
)
_SVG_METADATA = re.compile(
    r"<metadata\b[^>]*(?:/>|>.*?</metadata\s*>)",
    re.IGNORECASE | re.DOTALL,
)
# Imported, never re-declared.  These tests assert that *only* the lines the
# rule identifies are removed, so a private copy of the rule is not a second
# opinion -- it is a second implementation that goes stale.  It did: when the
# X1 `; #@! TF.CreationDate` form was added to the canonicalizer, the copy here
# kept the old pattern and this test began asserting that a timestamp KiCad
# writes must survive canonicalization.
from app.release_studio.canonical import (  # noqa: E402
    _CSV_GENERATED_HEADER,
    _EXCELLON_METADATA_COMMENT,
)


class _RunningJobService:
    def get(self, job_id: str) -> dict[str, object]:
        return {"job_id": job_id, "fence": 1, "status": "running"}


def _expected_report_without_top_level_date(
    payload: dict[str, object],
) -> dict[str, object]:
    """Project a real KiCad report after removing only its top-level date."""

    result = copy.deepcopy(payload)
    result.pop("date", None)
    for key in ("violations", "unconnected_items", "schematic_parity"):
        violations = result.get(key)
        if isinstance(violations, list):
            result[key] = sorted(violations, key=_report_violation_sort_key)
    sheets = result.get("sheets")
    if isinstance(sheets, list):
        for sheet in sheets:
            if isinstance(sheet, dict) and isinstance(sheet.get("violations"), list):
                sheet["violations"] = sorted(
                    sheet["violations"],
                    key=_report_violation_sort_key,
                )
    return result


def _report_violation_sort_key(item: object) -> tuple[str, str]:
    if not isinstance(item, dict):
        return ("", canonical_json(item))
    return (
        "|".join(
            str(item.get(key) or "")
            for key in ("type", "severity", "description")
        ),
        canonical_json(item),
    )


def _fabrication_projection(text: str, parser):
    layer = parser(text)
    apertures = tuple(
        sorted(
            (
                key,
                aperture.shape,
                tuple(aperture.params),
                aperture.macro,
                tuple(
                    (primitive.code, tuple(primitive.values))
                    for primitive in aperture.primitives
                ),
            )
            for key, aperture in layer.apertures.items()
        )
    )
    operations = tuple(
        sorted(
            (
                operation.kind,
                operation.aperture,
                operation.points,
                operation.dark,
                operation.offset,
                operation.sweep,
            )
            for operation in layer.ops
        )
    )
    return apertures, operations


def _csv_projection(text: str) -> tuple[tuple[str, ...], Counter[tuple[str, ...]]]:
    rows = list(csv.reader(io.StringIO(text, newline="")))
    rows = [
        tuple(row)
        for row in rows
        if any(value.strip() for value in row)
        and not row[0].strip().startswith(("#", "//", ";"))
    ]
    return rows[0], Counter(rows[1:])


def _svg_projection(text: str) -> tuple[tuple[str, tuple[tuple[str, str], ...]], ...]:
    root = ET.fromstring(text)
    geometry_tags = {"path", "polyline", "polygon", "line", "circle", "rect"}
    attributes = {
        "d",
        "points",
        "x",
        "y",
        "x1",
        "y1",
        "x2",
        "y2",
        "cx",
        "cy",
        "r",
        "rx",
        "ry",
        "width",
        "height",
        "transform",
    }
    projection = []
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag not in geometry_tags:
            continue
        projection.append(
            (
                tag,
                tuple(
                    sorted(
                        (key, value)
                        for key, value in element.attrib.items()
                        if key in attributes
                    )
                ),
            )
        )
    return tuple(projection)


def _pdf_projection(data: bytes) -> tuple[int, str]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return len(reader.pages), text


def _step_projection(data: bytes) -> tuple[int, bytes]:
    _, separator, body = data.partition(b"DATA;")
    if not separator:
        raise AssertionError("generated STEP output has no DATA; section")
    return len(_STEP_ENTITY_RE.findall(body)), body


def _assert_kicad_output(
    result,
    output: Path,
    label: str,
    *,
    directory: bool = False,
) -> None:
    if result.returncode != 0:
        raise AssertionError(f"{label} generation failed:\n{result.stdout}\n{result.stderr}")
    if directory:
        files = (
            [path for path in output.iterdir() if path.is_file() and path.stat().st_size > 0]
            if output.is_dir()
            else []
        )
        if not files:
            raise AssertionError(f"{label} generation produced no files: {output}")
    elif not output.is_file() or output.stat().st_size == 0:
        raise AssertionError(f"{label} generation produced an empty output: {output}")


def _generate_samples(root: Path) -> dict[str, Path]:
    """Generate R4 inputs from R0 synthetic using the live KiCad CLI.

    The source board/schematic/jobset is copied before execution so KiCad lock,
    preference, or cache files cannot modify the durable R0 fixture.  Gerbers,
    Excellon, STEP, SVG, DRC JSON, PDF, and BOM CSV are direct KiCad outputs;
    board stats wrap the direct KiCad statistics JSON in the Release Studio
    envelope used by Release Studio.
    """

    live_root = root / "synthetic"
    shutil.copytree(fixture_root("synthetic"), live_root)
    output_root = root / "generated"
    output_root.mkdir()
    board = live_root / fixture_entrypoint("synthetic", "board").relative_to(
        fixture_root("synthetic")
    )
    schematic = live_root / fixture_entrypoint("synthetic", "schematic").relative_to(
        fixture_root("synthetic")
    )

    # The durable synthetic fixture predates the SVG precision setting.  The
    # durable Cynthion fixture carries the explicit R0 setting, so use that
    # source for the SVG sample and pin the actual board setting to 6 digits.
    svg_live_root = root / "cynthion"
    shutil.copytree(fixture_root("cynthion"), svg_live_root)
    svg_board = svg_live_root / fixture_entrypoint("cynthion", "board").relative_to(
        fixture_root("cynthion")
    )
    svg_board_text = svg_board.read_text(encoding="utf-8")
    if f"(svgprecision {SVG_PRECISION})" not in svg_board_text:
        raise AssertionError(
            f"Cynthion R0 fixture does not pin svgprecision to {SVG_PRECISION}"
        )

    gerbers = output_root / "gerbers"
    gerbers.mkdir()
    result = run_kicad_cli(
        "pcb",
        "export",
        "gerbers",
        "--output",
        str(gerbers),
        str(board),
        cwd=live_root,
    )
    _assert_kicad_output(result, gerbers, "Gerber", directory=True)

    drill = output_root / "drill"
    drill.mkdir()
    result = run_kicad_cli(
        "pcb",
        "export",
        "drill",
        "--format",
        "excellon",
        "--excellon-units",
        "mm",
        "--output",
        str(drill),
        str(board),
        cwd=live_root,
    )
    _assert_kicad_output(result, drill, "Excellon", directory=True)

    step = output_root / "board.step"
    result = run_kicad_cli(
        "pcb",
        "export",
        "step",
        "--output",
        str(step),
        str(board),
        cwd=live_root,
    )
    _assert_kicad_output(result, step, "STEP")

    svg = output_root / "board.svg"
    result = run_kicad_cli(
        "pcb",
        "export",
        "svg",
        "--layers",
        "F.Cu,B.Cu,F.SilkS,B.SilkS,Edge.Cuts",
        "--mode-single",
        "--output",
        str(svg),
        str(svg_board),
        cwd=svg_live_root,
    )
    _assert_kicad_output(result, svg, "SVG")

    drc = output_root / "board-drc.json"
    result = run_kicad_cli(
        "pcb",
        "drc",
        "--format",
        "json",
        "--output",
        str(drc),
        str(board),
        cwd=live_root,
    )
    _assert_kicad_output(result, drc, "DRC")

    erc = output_root / "schematic-erc.json"
    result = run_kicad_cli(
        "sch",
        "erc",
        "--format",
        "json",
        "--severity-all",
        "--output",
        str(erc),
        str(schematic),
        cwd=live_root,
    )
    _assert_kicad_output(result, erc, "ERC")

    raw_stats = output_root / "raw-board-stats.json"
    result = run_kicad_cli(
        "pcb",
        "export",
        "stats",
        "--format",
        "json",
        "--output",
        str(raw_stats),
        str(board),
        cwd=live_root,
    )
    _assert_kicad_output(result, raw_stats, "board statistics")

    pdf = output_root / "schematic.pdf"
    result = run_kicad_cli(
        "sch",
        "export",
        "pdf",
        "--output",
        str(pdf),
        str(schematic),
        cwd=live_root,
    )
    _assert_kicad_output(result, pdf, "PDF")

    csv_path = output_root / "bom.csv"
    result = run_kicad_cli(
        "sch",
        "export",
        "bom",
        "--variant",
        "default",
        "--exclude-dnp",
        "--output",
        str(csv_path),
        str(schematic),
        cwd=live_root,
    )
    _assert_kicad_output(result, csv_path, "CSV")

    gerber = next(
        path for path in sorted(gerbers.glob("*.gbr")) if not path.name.endswith("-job.gbr")
    )
    gbrjob = next(iter(sorted(gerbers.glob("*.gbrjob"))))
    excellon = next(iter(sorted(drill.glob("*.drl"))))

    board_bytes = board.read_bytes()
    board_stats = output_root / "board-stats.json"
    generated_stats = json.loads(raw_stats.read_text(encoding="utf-8"))
    board_stats.write_text(
        json.dumps(
            {
                "metadata": {
                    "date": datetime.now(timezone.utc).isoformat(),
                    "source_fixture": "synthetic",
                    "source_sha256": hashlib.sha256(board_bytes).hexdigest(),
                },
                "stats": generated_stats,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return {
        "gerber": gerber,
        "gbrjob": gbrjob,
        "excellon": excellon,
        "step": step,
        "csv": csv_path,
        "drc_erc_json": drc,
        "erc_json": erc,
        "svg": svg,
        "pdf": pdf,
        "board_stats_json": board_stats,
    }


class ReleaseStudioCanonicalJsonTests(unittest.TestCase):
    def test_canonical_json_has_the_declared_byte_contract(self) -> None:
        payload = {
            "b": 1,
            "a": {"z": 2, "e\u0301": "Cafe\u0301"},
            "e\u0301": "東京",
        }
        self.assertEqual(
            canonical_json(payload),
            '{"a":{"z":2,"é":"Café"},"b":1,"é":"東京"}',
        )
        self.assertEqual(
            canonical_json_bytes(payload),
            canonical_json(payload).encode("utf-8"),
        )

    def test_canonical_json_rejects_nfc_key_collisions_and_nonfinite_numbers(self) -> None:
        with self.assertRaisesRegex(ValueError, "NFC-normalized"):
            canonical_json({"é": 1, "e\u0301": 2})
        with self.assertRaisesRegex(ValueError, "NFC-normalized"):
            canonical_json({"nested": {"é": 1, "e\u0301": 2}})
        for value in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                canonical_json({"value": value})

    def test_canonical_json_rejects_non_string_keys_at_every_nesting_level(self) -> None:
        message = "canonical JSON object keys must be strings"
        with self.assertRaisesRegex(TypeError, message):
            canonical_json({1: "top-level"})
        with self.assertRaisesRegex(TypeError, message):
            canonical_json({"nested": {2: "nested"}})

    def test_canonical_json_behaves_differently_from_prepare_json(self) -> None:
        payload = {
            "b": 1,
            "a": {"z": 2, "e\u0301": "Cafe\u0301"},
            "e\u0301": "東京",
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch(
                "app.services.job_runtime.job_state_root",
                return_value=root,
            ):
                context = JobContext(
                    {"job_id": "canonical-json-test", "fence": 1, "status": "running"},
                    worker_id="test",
                    service=_RunningJobService(),
                )
                artifact = JobArtifactService(root=root).prepare_json(
                    context,
                    payload,
                    kind="test",
                    artifact_key="canonical-json-test",
                )
                prepared = Path(artifact.object_path).read_bytes()

        # This is an observed behavior of the real service call, not a source
        # inspection: prepare_json preserves insertion order by contract.
        self.assertEqual(
            prepared,
            '{"b":1,"a":{"z":2,"e\u0301":"Cafe\u0301"},"e\u0301":"東京"}'.encode(
                "utf-8"
            ),
        )
        self.assertNotEqual(prepared, canonical_json_bytes(payload))
        self.assertEqual(
            canonicalize("manifest", prepared),
            canonical_json_bytes(payload),
        )

    def test_registry_publishes_names_and_versions(self) -> None:
        metadata = canonicalizer_registry()
        self.assertEqual(metadata["name"], "release-studio")
        self.assertEqual(metadata["version"], CANONICALIZER_REGISTRY_VERSION)
        self.assertEqual(metadata["canonicalizers"], CANONICALIZER_VERSIONS)
        for name in (
            "gerber",
            "gbrjob",
            "excellon",
            "step",
            "csv",
            "drc_erc_json",
            "svg",
            "pdf",
            "board_stats_json",
            "archive",
            "json",
            "manifest",
            "attestation",
        ):
            self.assertIn(name, REGISTRY)

    def test_manifest_and_attestation_use_one_canonical_json_behavior(self) -> None:
        payload = {"z": ["é", 2], "a": {"digest": "abc", "path": "F.Cu.gbr"}}
        source = json.dumps(payload, indent=2, ensure_ascii=True).encode("utf-8")
        expected = canonical_json_bytes(payload)
        self.assertEqual(canonicalize("manifest", source), expected)
        self.assertEqual(canonicalize("attestation", source), expected)
        self.assertEqual(canonicalize("json", source), expected)

    def test_deterministic_archive_has_stable_bytes_and_metadata(self) -> None:
        members = {"b.txt": b"beta\n", "a.txt": b"alpha\n"}
        first = write_deterministic_archive(members)
        second = write_deterministic_archive(dict(reversed(list(members.items()))))
        self.assertEqual(first, second)

        with gzip_reader(first) as raw_tar:
            with tarfile.open(fileobj=raw_tar, mode="r:") as archive:
                infos = archive.getmembers()
                self.assertEqual([info.name for info in infos], ["a.txt", "b.txt"])
                for info in infos:
                    self.assertEqual(info.mtime, 0)
                    self.assertEqual(info.uid, 0)
                    self.assertEqual(info.gid, 0)
                    self.assertEqual(info.uname, "")
                    self.assertEqual(info.gname, "")
                    self.assertEqual(info.mode, 0o644)

        self.assertEqual(canonicalize("archive", first), first)
        for unsafe_name in ("a\\b", "..\\escape", "C:\\escape", "C:/escape", "C:escape"):
            with self.subTest(name=unsafe_name), self.assertRaises(ValueError):
                write_deterministic_archive({unsafe_name: b"unsafe"})

    def test_deterministic_archive_accepts_an_explicit_revision_timestamp(self) -> None:
        stamp = 1_786_447_809
        first = write_deterministic_archive({"member.txt": b"same"}, mtime=stamp)
        second = write_deterministic_archive({"member.txt": b"same"}, mtime=stamp)
        self.assertEqual(first, second)
        with tarfile.open(fileobj=io.BytesIO(first), mode="r:gz") as archive:
            self.assertEqual(archive.getmember("member.txt").mtime, stamp)
        self.assertNotEqual(first, write_deterministic_archive({"member.txt": b"same"}))


class ReleaseStudioGeneratedSemanticTests(unittest.TestCase):
    _samples: dict[str, Path] | None = None
    _temporary: tempfile.TemporaryDirectory[str] | None = None

    def setUp(self) -> None:
        # The ordinary backend job has no KiCad CLI and skips this live-only
        # class.  The R0 executor contract turns an unavailable CLI into a
        # failure, so canonicalization cannot silently fall back to hand-made
        # bytes in the required live gate.
        requires_kicad_cli(self)
        cls = type(self)
        if cls._samples is None:
            cls._temporary = tempfile.TemporaryDirectory()
            cls._samples = _generate_samples(Path(cls._temporary.name))

    @classmethod
    def tearDownClass(cls) -> None:
        if cls._temporary is not None:
            cls._temporary.cleanup()
        cls._temporary = None
        cls._samples = None

    @property
    def samples(self) -> dict[str, Path]:
        assert type(self)._samples is not None
        return type(self)._samples

    def test_gerber_removes_only_creation_date_and_preserves_apertures_geometry(self) -> None:
        raw = self.samples["gerber"].read_bytes()
        cleaned = canonicalize("gerber", raw)
        raw_text = raw.decode("utf-8")
        cleaned_text = cleaned.decode("utf-8")
        self.assertNotIn("TF.CreationDate", cleaned_text)
        self.assertEqual(
            _fabrication_projection(raw_text, parse_gerber),
            _fabrication_projection(cleaned_text, parse_gerber),
        )
        # Assert the property, not a second copy of the production regex: no
        # wall-clock instant may survive, and the generation-software
        # provenance attribute must remain.
        self.assertIsNone(_VOLATILE_TIMESTAMP.search(cleaned_text))
        self.assertIn("TF.GenerationSoftware", cleaned_text)

    def test_gbrjob_removes_the_creation_date_wherever_kicad_writes_it(self) -> None:
        """KiCad puts it in ``Header``, not ``GeneralSpecs``.

        The earlier version of this test asserted only the ``GeneralSpecs``
        location, so it passed against a real job file whose date sat in
        ``Header`` and survived -- which made every build of every board
        irreproducible on that one member.
        """

        raw_payload = json.loads(self.samples["gbrjob"].read_bytes())
        # The fixture is a real generated file; confirm the premise rather than
        # assuming it, so a future KiCad move is caught here.
        self.assertIn("CreationDate", raw_payload.get("Header", {}))

        cleaned_payload = json.loads(canonicalize("gbrjob", json.dumps(raw_payload).encode()))

        expected = copy.deepcopy(raw_payload)
        for section in ("Header", "GeneralSpecs"):
            if isinstance(expected.get(section), dict):
                expected[section].pop("CreationDate", None)
        self.assertEqual(cleaned_payload, expected)

        # Nothing volatile anywhere; provenance retained.
        self.assertNotIn("CreationDate", json.dumps(cleaned_payload))
        self.assertIn("GenerationSoftware", cleaned_payload.get("Header", {}))

    def test_gbrjob_canonicalization_is_stable_across_plot_times(self) -> None:
        raw_payload = json.loads(self.samples["gbrjob"].read_bytes())
        later = copy.deepcopy(raw_payload)
        later.setdefault("Header", {})["CreationDate"] = "2099-01-01T00:00:00+00:00"

        first = canonicalize("gbrjob", json.dumps(raw_payload).encode())
        second = canonicalize("gbrjob", json.dumps(later).encode())
        self.assertEqual(first, second)

    def test_excellon_removes_header_metadata_only_and_preserves_tool_holes(self) -> None:
        raw = self.samples["excellon"].read_bytes()
        raw_text = raw.decode("utf-8")
        # Derive a test variant from the real generated file.  The body comment
        # deliberately contains the same words that must not trigger removal.
        if "\n%" in raw_text:
            raw_text = raw_text.replace(
                "\n%",
                "\n; date in a fabrication note; created by the designer\n%",
                1,
            )
        else:
            raw_text = raw_text.replace(
                "M30",
                "; date in a fabrication note; created by the designer\nM30",
                1,
            )
        cleaned_text = canonicalize("excellon", raw_text.encode()).decode("utf-8")
        self.assertIn("date in a fabrication note", cleaned_text)
        self.assertEqual(
            _fabrication_projection(raw_text, parse_excellon),
            _fabrication_projection(cleaned_text, parse_excellon),
        )
        expected_lines: list[str] = []
        in_header = True
        for line in raw_text.replace("\r\n", "\n").replace("\r", "\n").splitlines(
            keepends=True
        ):
            if in_header:
                if _EXCELLON_METADATA_COMMENT.fullmatch(line.rstrip("\n").strip()):
                    continue
            expected_lines.append(line)
            if line.strip() == "%":
                in_header = False
        self.assertEqual(cleaned_text, "".join(expected_lines))
        in_header = True
        for line in cleaned_text.splitlines():
            if in_header:
                self.assertIsNone(
                    _EXCELLON_METADATA_COMMENT.fullmatch(line.strip()), line
                )
            if line.strip() == "%":
                in_header = False

    def test_step_replaces_timestamp_argument_and_keeps_filename_header_and_data(self) -> None:
        raw = self.samples["step"].read_bytes()
        cleaned = canonicalize("step", raw)
        raw_header, raw_separator, raw_data = raw.partition(b"DATA;")
        clean_header, clean_separator, clean_data = cleaned.partition(b"DATA;")
        self.assertTrue(raw_separator)
        self.assertEqual(clean_separator, raw_separator)
        self.assertEqual(clean_data, raw_data)
        self.assertEqual(_step_filename_argument(raw_header), _step_filename_argument(clean_header))
        self.assertIn(STEP_FILE_NAME_SENTINEL.encode(), clean_header)
        self.assertEqual(_step_projection(raw), _step_projection(cleaned))

    def test_csv_removes_generated_header_row_and_preserves_rows_columns_and_comments(self) -> None:
        raw = self.samples["csv"].read_text(encoding="utf-8")
        derived = "# Generated on " + datetime.now(timezone.utc).isoformat() + "\n" + raw
        derived += "\n# date in a design note; created by the designer\n"
        cleaned = canonicalize("csv", derived.encode()).decode("utf-8")
        self.assertNotIn("Generated on", cleaned)
        self.assertIn("date in a design note; created by the designer", cleaned)
        self.assertEqual(_csv_projection(raw), _csv_projection(cleaned))
        expected_lines: list[str] = []
        leading_header = True
        for line in derived.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
            stripped = line.strip()
            if leading_header and _CSV_GENERATED_HEADER.fullmatch(stripped):
                continue
            expected_lines.append(line.rstrip())
            if stripped and not stripped.startswith(("#", "//", ";")):
                leading_header = False
        expected = "\n".join(expected_lines)
        if not expected.endswith("\n"):
            expected += "\n"
        self.assertEqual(cleaned, expected)

    def test_drc_and_erc_json_remove_report_timestamp_and_preserve_violations(self) -> None:
        for name in ("drc_erc_json", "erc_json"):
            with self.subTest(report=name):
                raw_payload = json.loads(self.samples[name].read_bytes())
                cleaned_payload = json.loads(
                    canonicalize("drc_erc_json", json.dumps(raw_payload).encode())
                )
                self.assertIn("date", raw_payload)
                self.assertEqual(
                    _expected_report_without_top_level_date(raw_payload),
                    cleaned_payload,
                )

    def test_svg_strips_metadata_comments_and_preserves_complete_geometry(self) -> None:
        raw = self.samples["svg"].read_text(encoding="utf-8")
        timestamp_comment = (
            "<!-- generated on "
            + datetime.now(timezone.utc).isoformat()
            + " -->"
        )
        derived = timestamp_comment + "\n" + raw
        if "<metadata" not in derived.lower():
            derived = derived.replace(
                "<svg",
                "<metadata><date>generated</date></metadata>\n<svg",
                1,
            )
        cleaned = canonicalize("svg", derived.encode()).decode("utf-8")
        self.assertIsNone(_SVG_TIMESTAMP_COMMENT.search(cleaned))
        self.assertIsNone(_SVG_METADATA.search(cleaned))
        if raw.startswith("<?xml"):
            self.assertTrue(cleaned.startswith("<?xml"))
        self.assertEqual(_svg_projection(raw), _svg_projection(cleaned))
        # SVG_plotter.cpp:806 writes the plot time into <title>, which no
        # amount of <metadata>/comment stripping would have removed.
        self.assertIsNone(_VOLATILE_TIMESTAMP.search(cleaned))

    def test_pdf_preserves_page_count_and_extracted_text(self) -> None:
        raw = self.samples["pdf"].read_bytes()
        cleaned = canonicalize("pdf", raw)
        self.assertEqual(_pdf_projection(raw), _pdf_projection(cleaned))

        import pikepdf

        with pikepdf.open(io.BytesIO(cleaned)) as pdf:
            self.assertNotIn("/Info", pdf.trailer)
            self.assertNotIn("/Metadata", pdf.trailer["/Root"])
            # qpdf may create a deterministic /ID on save; it must no longer be
            # the source ID, and repeated canonicalization must be stable.
        self.assertEqual(cleaned, canonicalize("pdf", cleaned))

    def test_board_stats_removes_metadata_date_before_projection(self) -> None:
        raw_payload = json.loads(self.samples["board_stats_json"].read_bytes())
        cleaned_payload = json.loads(
            canonicalize("board_stats_json", json.dumps(raw_payload).encode())
        )
        expected = copy.deepcopy(raw_payload)
        expected["metadata"].pop("date", None)
        self.assertEqual(cleaned_payload, expected)
        self.assertNotIn("date", cleaned_payload["metadata"])


def _step_filename_argument(header: bytes) -> bytes:
    match = re.search(rb"FILE_NAME\s*\(\s*'((?:[^']|'')*)'", header, re.IGNORECASE)
    if match is None:
        raise AssertionError("STEP output has no FILE_NAME filename argument")
    return match.group(1)


def gzip_reader(data: bytes):
    import gzip

    return gzip.GzipFile(fileobj=io.BytesIO(data), mode="rb")


if __name__ == "__main__":
    unittest.main()


# The byte shapes below are transcribed from the pinned KiCad 10.0.4 source
# (tag f7414d419cae5df2d00e7eaacb16fc0e803799bc) at the emission sites named
# on each constant.  They exist so the reproducibility property is enforced in
# the default gate, not only under `kicad-live`: the live semantic tests skip
# without kicad-cli, which is exactly how unremoved timestamps shipped.
_STAMPED_SAMPLES: dict[str, tuple[str, str]] = {
    # GERBER_plotter.cpp:289 (G04 header) + gbr_metadata.h:52 (X2 block).
    "gerber": (
        "%TF.GenerationSoftware,KiCad,Pcbnew,10.0.4*%\n"
        "%TF.CreationDate,{stamp}*%\n"
        "%TF.FileFunction,Copper,L1,Top*%\n"
        "%FSLAX46Y46*%\n"
        "G04 Created by KiCad (PCBNEW 10.0.4) date {plain}*\n"
        "%MOMM*%\n%ADD10C,0.200000*%\nD10*\nX1000Y1000D02*\nX2000Y2000D01*\nM02*\n",
        "gerber",
    ),
    # gbr_metadata.h:46 -- X1 attribute form used when X2 output is disabled.
    "gerber_x1": (
        "G04 #@! TF.GenerationSoftware,KiCad,Pcbnew,10.0.4*\n"
        "G04 #@! TF.CreationDate,{stamp}*\n"
        "%FSLAX46Y46*%\n"
        "G04 Created by KiCad (PCBNEW 10.0.4) date {plain}*\n"
        "%MOMM*%\n%ADD10C,0.200000*%\nD10*\nX1000Y1000D02*\nX2000Y2000D01*\nM02*\n",
        "gerber",
    ),
    # gendrill_excellon_writer.cpp:568 + gbr_metadata.h:49.
    "excellon": (
        "M48\n"
        "; DRILL file KiCad 10.0.4 date {stamp}\n"
        "; FORMAT={{-:-/ absolute / metric / decimal}}\n"
        "; #@! TF.CreationDate,{stamp}\n"
        "; #@! TF.GenerationSoftware,Kicad,Pcbnew,10.0.4\n"
        "FMAT,2\nMETRIC\nT1C0.300\n%\nG90\nG05\nT1\nX10.0Y10.0\nT0\nM30\n",
        "excellon",
    ),
    # SVG_plotter.cpp:806-810.
    "svg": (
        '<?xml version="1.0" standalone="no"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm">\n'
        "<title>SVG Image created as board.svg date {stamp} </title>\n"
        "  <desc>Image generated by KiCad 10.0.4 </desc>\n"
        '<g style="fill:#000000"><path d="M 0,0 L 10,10 L 10,0 Z"/></g>\n'
        "</svg>\n",
        "svg",
    ),
    # place_file_exporter.cpp:229-231 (ascii) -- free text before the instant.
    "position": (
        "### Footprint positions - created on {stamp} ###\n"
        "### Printed by KiCad version 10.0.4\n"
        "## Unit = mm, Angle = deg.\n"
        "# Ref Val Package PosX PosY Rot Side\n"
        "R1 10k R_0402 10.000000 -10.000000 90.000000 top\n",
        "csv",
    ),
}


def _stamped(sample: str, iso: str, plain: str) -> bytes:
    body, _ = _STAMPED_SAMPLES[sample]
    return body.format(stamp=iso, plain=plain).encode("utf-8")


class ReleaseStudioVolatileTimestampTests(unittest.TestCase):
    """No canonicalized member may retain a wall-clock instant.

    This is the property Stage 1 exit criterion 1 rests on.  It is asserted
    directly rather than by re-applying the production regexes, so a newly
    discovered emission site fails the suite instead of passing it.
    """

    EARLY = ("2026-08-11T07:00:00+00:00", "2026-08-11 07:00:00")
    LATER = ("2026-08-11T08:30:41+00:00", "2026-08-11 08:30:41")

    def test_no_volatile_timestamp_survives_canonicalization(self) -> None:
        for sample, (_, member_type) in _STAMPED_SAMPLES.items():
            with self.subTest(sample=sample):
                cleaned = canonicalize(
                    member_type, _stamped(sample, *self.EARLY)
                ).decode("utf-8")
                self.assertIsNone(
                    _VOLATILE_TIMESTAMP.search(cleaned),
                    f"{sample}: volatile timestamp survived canonicalization",
                )

    def test_exports_at_different_times_canonicalize_identically(self) -> None:
        for sample, (_, member_type) in _STAMPED_SAMPLES.items():
            with self.subTest(sample=sample):
                early = canonicalize(member_type, _stamped(sample, *self.EARLY))
                later = canonicalize(member_type, _stamped(sample, *self.LATER))
                self.assertNotEqual(
                    _stamped(sample, *self.EARLY), _stamped(sample, *self.LATER)
                )
                self.assertEqual(
                    early, later, f"{sample}: released_digest would differ by build time"
                )

    def test_manufacturing_content_is_preserved(self) -> None:
        cleaned = canonicalize("gerber", _stamped("gerber", *self.EARLY)).decode()
        for retained in ("%ADD10C,0.200000*%", "X1000Y1000D02*", "TF.GenerationSoftware"):
            self.assertIn(retained, cleaned)

        cleaned = canonicalize("excellon", _stamped("excellon", *self.EARLY)).decode()
        for retained in ("T1C0.300", "X10.0Y10.0", "FMAT,2"):
            self.assertIn(retained, cleaned)

        cleaned = canonicalize("svg", _stamped("svg", *self.EARLY)).decode()
        self.assertIn('d="M 0,0 L 10,10 L 10,0 Z"', cleaned)
        self.assertTrue(cleaned.startswith("<?xml"))

        cleaned = canonicalize("csv", _stamped("position", *self.EARLY)).decode()
        self.assertIn("R1 10k R_0402 10.000000 -10.000000 90.000000 top", cleaned)
        self.assertIn("# Ref Val Package PosX PosY Rot Side", cleaned)

    def test_svg_comment_stripping_never_crosses_a_comment_boundary(self) -> None:
        # A lazy `.*?` spanning from the first comment to a later dated one
        # deletes every element in between.
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg">'
            "<!-- Layer F.Cu -->"
            '<path d="M 0,0 L 1,1"/>'
            '<g><path d="M 5,5 L 6,6"/></g>'
            "<!-- created 2026-08-11T07:00:00+00:00 -->"
            "</svg>"
        )
        cleaned = canonicalize("svg", svg.encode()).decode()
        self.assertEqual(cleaned.count("<path"), 2)
        self.assertIn('d="M 5,5 L 6,6"', cleaned)
        self.assertIsNone(_VOLATILE_TIMESTAMP.search(cleaned))

    def test_body_comments_and_data_rows_are_not_treated_as_headers(self) -> None:
        drill = (
            "M48\n; DRILL file KiCad 10.0.4 date 2026-08-11T07:00:00+00:00\n"
            "FMAT,2\nMETRIC\nT1C0.300\n%\nG90\n; created for slot date review\n"
            "T1\nX10.0Y10.0\nM30\n"
        )
        cleaned = canonicalize("excellon", drill.encode()).decode()
        self.assertIn("; created for slot date review", cleaned)

        rows = "# Ref,Val\nR1,10k\n# note: date codes below\nR2,22k\n"
        cleaned = canonicalize("csv", rows.encode()).decode()
        self.assertIn("# note: date codes below", cleaned)
