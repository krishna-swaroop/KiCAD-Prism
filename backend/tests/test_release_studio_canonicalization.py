"""Tests for Release Studio canonicalization."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from app.release_studio.canonical import (
    STEP_FILE_NAME_SENTINEL,
    canonicalize,
    write_deterministic_archive,
)
from app.release_studio.canonical.encoding import canonical_json
from app.services.fabrication_compare_service import parse_excellon, parse_gerber
from app.services.job_artifact_service import JobArtifactService


SAMPLES = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "release-studio"
    / "canonical-samples"
)


class ReleaseStudioCanonicalizationTests(unittest.TestCase):
    def test_canonical_json_sorts_keys_unlike_prepare_json(self) -> None:
        payload = {"b": 1, "a": {"z": 2, "y": 3}}
        canonical = canonical_json(payload)
        self.assertEqual(canonical, '{"a":{"y":3,"z":2},"b":1}')

        # prepare_json encodes without sort_keys; insertion order is preserved.
        unsorted = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        self.assertEqual(unsorted, '{"b":1,"a":{"z":2,"y":3}}')
        self.assertNotEqual(canonical, unsorted)

        source = Path(JobArtifactService.prepare_json.__code__.co_filename).read_text(
            encoding="utf-8"
        )
        self.assertIn(
            'json.dumps(payload, separators=(",", ":"), ensure_ascii=False)',
            source,
        )
        self.assertNotIn("sort_keys=True", source.split("def prepare_json", 1)[1].split("def prepare_file", 1)[0])

    def test_gerber_drops_creation_date_and_preserves_geometry(self) -> None:
        raw = (SAMPLES / "sample.gbr").read_bytes()
        cleaned = canonicalize("gerber", raw)
        text = cleaned.decode("utf-8")
        self.assertNotIn("CreationDate", text)
        self.assertIn("%TF.GenerationSoftware,KiCad,PCB,10.0.4*%", text)
        self.assertEqual(parse_gerber(text), parse_gerber(raw.decode("utf-8")))

    def test_gbrjob_drops_creation_date(self) -> None:
        raw = (SAMPLES / "sample.gbrjob").read_bytes()
        cleaned = json.loads(canonicalize("gbrjob", raw))
        self.assertNotIn("CreationDate", cleaned["GeneralSpecs"])
        self.assertEqual(cleaned["GeneralSpecs"]["ProjectId"]["Name"], "demo")
        self.assertEqual(cleaned["FilesAttributes"][0]["Path"], "F_Cu.gbr")

    def test_excellon_drops_date_headers_and_preserves_holes(self) -> None:
        raw = (SAMPLES / "sample.drl").read_bytes()
        cleaned = canonicalize("excellon", raw)
        text = cleaned.decode("utf-8")
        self.assertNotIn("DATE", text.upper().split("M48", 1)[0])
        self.assertEqual(parse_excellon(text), parse_excellon(raw.decode("utf-8")))

    def test_step_replaces_file_name_timestamp_only(self) -> None:
        raw = (SAMPLES / "sample.step").read_text(encoding="utf-8")
        cleaned = canonicalize("step", raw.encode("utf-8")).decode("utf-8")
        self.assertIn(STEP_FILE_NAME_SENTINEL, cleaned)
        self.assertNotIn("/tmp/generated.step", cleaned)
        self.assertEqual(
            cleaned.split("DATA;", 1)[1],
            raw.split("DATA;", 1)[1],
        )

    def test_csv_drops_generated_header_rows(self) -> None:
        cleaned = canonicalize("csv", (SAMPLES / "sample.csv").read_bytes()).decode("utf-8")
        self.assertNotIn("Generated", cleaned)
        self.assertEqual(
            [line for line in cleaned.splitlines() if line],
            ["Reference,Value,Footprint", "R1,10k,R_0805", "C1,100n,C_0805"],
        )

    def test_drc_json_drops_timestamp_and_sorts_violations(self) -> None:
        cleaned = json.loads(
            canonicalize("drc_erc_json", (SAMPLES / "sample-drc.json").read_bytes())
        )
        self.assertNotIn("date", cleaned)
        types = [item["type"] for item in cleaned["violations"]]
        self.assertEqual(types, sorted(types, key=lambda value: value))

    def test_svg_strips_metadata_and_date_comments(self) -> None:
        cleaned = canonicalize("svg", (SAMPLES / "sample.svg").read_bytes()).decode("utf-8")
        self.assertNotIn("<metadata", cleaned.lower())
        self.assertNotIn("created date", cleaned.lower())
        self.assertIn('d="M0 0 L10 0"', cleaned)

    def test_board_stats_drops_metadata_date(self) -> None:
        cleaned = json.loads(
            canonicalize(
                "board_stats_json",
                (SAMPLES / "board-stats.json").read_bytes(),
            )
        )
        self.assertNotIn("date", cleaned["metadata"])
        self.assertEqual(cleaned["tracks"], 12)

    def test_deterministic_archive_is_byte_identical_across_builds(self) -> None:
        members = {"b.txt": b"beta\n", "a.txt": b"alpha\n"}
        first = write_deterministic_archive(members)
        second = write_deterministic_archive(dict(reversed(list(members.items()))))
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
