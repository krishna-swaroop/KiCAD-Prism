"""Acceptance tests for the Release Studio R4 canonicalization registry.

    The semantic tests intentionally generate their inputs from durable R0
    fixtures with the pinned live KiCad executor.  No handcrafted
miniature Gerber, drill, STEP, SVG, PDF, or report files are checked into the
locked ``fixtures/release-studio`` root.  The generated files live only in a
temporary directory for the test process; their provenance is documented in
``docs/release-studio/R4.md`` and by :func:`_generate_samples` below.
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
_SVG_TIMESTAMP_COMMENT = re.compile(
    r"<!--.*?(?:date|created|generated|timestamp).*?-->",
    re.IGNORECASE | re.DOTALL,
)
_SVG_METADATA = re.compile(
    r"<metadata\b[^>]*(?:/>|>.*?</metadata\s*>)",
    re.IGNORECASE | re.DOTALL,
)
_EXCELLON_METADATA_COMMENT = re.compile(
    r"^;\s*(?:"
    r"DATE(?:\s*[:=].*)?"
    r"|DRILL\s+FILE\b.*\b(?:DATE|CREATED|GENERATED|CREATION)\b.*"
    r"|(?:CREATED|GENERATED|CREATION)\s+(?:BY|ON|AT|DATE|TIME)\b.*"
    r")$",
    re.IGNORECASE,
)
_CSV_GENERATED_HEADER = re.compile(
    r"^\s*(?:#|//|;)\s*(?:"
    r"(?:GENERATED|CREATED)\s+(?:ON|AT|BY)\b.*"
    r"|(?:GENERATION|CREATION)\s+(?:DATE|TIME)\b.*"
    r")",
    re.IGNORECASE,
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
        expected = re.sub(
            r"%TF\.CreationDate,[^*]*\*%",
            "",
            raw_text,
            flags=re.IGNORECASE,
        ).replace("\r\n", "\n").replace("\r", "\n")
        self.assertEqual(cleaned_text, expected)

    def test_gbrjob_removes_only_general_specs_creation_date(self) -> None:
        raw_payload = json.loads(self.samples["gbrjob"].read_bytes())
        cleaned_payload = json.loads(canonicalize("gbrjob", json.dumps(raw_payload).encode()))
        expected = copy.deepcopy(raw_payload)
        general = expected.get("GeneralSpecs")
        self.assertIsInstance(general, dict)
        if isinstance(general, dict):
            general.pop("CreationDate", None)
        self.assertEqual(cleaned_payload, expected)
        self.assertNotIn("CreationDate", cleaned_payload.get("GeneralSpecs", {}))

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
