"""Direct contracts for immutable catalog preview persistence."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
import uuid
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog import preview_store as preview_store_module  # noqa: E402
from app.services.catalog.preview_store import CatalogPreviewStore  # noqa: E402


class _RecordingResult:
    def __init__(self, row: dict[str, object] | None) -> None:
        self._row = row

    def fetchone(self) -> dict[str, object] | None:
        return self._row


class _RecordingConnection:
    """Minimal connection fake that records SQL and returns queued rows."""

    def __init__(self, *responses: dict[str, object] | None) -> None:
        self._responses = list(responses)
        self.calls: list[tuple[str, tuple[object, ...] | None]] = []

    def execute(
        self,
        sql: str,
        params: tuple[object, ...] | None = None,
    ) -> _RecordingResult:
        self.calls.append((sql, params))
        if not self._responses:
            raise AssertionError(f"unexpected SQL: {sql}")
        return _RecordingResult(self._responses.pop(0))

    def commit(self) -> None:
        raise AssertionError("preview persistence must not commit")

    def rollback(self) -> None:
        raise AssertionError("preview persistence must not rollback")


class CatalogPreviewStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.store = CatalogPreviewStore()
        self.asset = {"id": "asset-1"}
        self.kind = "symbol:unit2"
        self.identity = {
            "generator_name": "kicad-cli",
            "generator_version": "9.0.0",
            "pipeline_version": "prism-preview-a2-multi-unit",
            "generator_fingerprint": "fingerprint-1",
        }

    def _destination(self, payload: bytes) -> Path:
        digest = hashlib.sha256(payload).hexdigest()
        return self.root / "previews" / "versions" / "symbols" / "asset-1" / f"{digest}.svg"

    def _store(
        self,
        conn: _RecordingConnection,
        payload: bytes,
        destination: Path | None = None,
    ) -> dict[str, object]:
        return self.store.store_preview_version(
            conn,
            asset=self.asset,
            kind=self.kind,
            payload=payload,
            generator_identity=self.identity,
            destination=destination or self._destination(payload),
        )

    def test_existing_valid_row_is_reused_without_file_write(self) -> None:
        payload = b"<svg>existing</svg>"
        backing = self.root / "existing.svg"
        backing.write_bytes(payload)
        row = {
            "id": "preview-existing",
            "file_path": str(backing),
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
        conn = _RecordingConnection(row)

        result = self._store(conn, payload)

        self.assertEqual(result, row)
        self.assertEqual(len(conn.calls), 1)
        self.assertEqual(
            conn.calls[0][1],
            ("asset-1", self.kind, row["sha256"], "fingerprint-1"),
        )

    def test_missing_or_corrupt_existing_backing_has_exact_error(self) -> None:
        payload = b"<svg>expected</svg>"
        digest = hashlib.sha256(payload).hexdigest()

        for state in ("missing", "corrupt"):
            with self.subTest(state=state):
                backing = self.root / state / "existing.svg"
                backing.parent.mkdir(parents=True, exist_ok=True)
                if state == "corrupt":
                    backing.write_bytes(b"<svg>corrupt</svg>")
                conn = _RecordingConnection(
                    {"file_path": str(backing), "sha256": digest}
                )

                with self.assertRaisesRegex(
                    ValueError,
                    rf"^Immutable preview backing file is missing or corrupt: {backing.resolve()}$",
                ):
                    self._store(conn, payload)

                self.assertEqual(len(conn.calls), 1)

    def test_new_preview_is_atomically_stored_and_insert_params_are_exact(self) -> None:
        payload = b"<svg>new</svg>"
        digest = hashlib.sha256(payload).hexdigest()
        destination = self._destination(payload)
        inserted = {"id": "preview-inserted", "sha256": digest}
        conn = _RecordingConnection(None, None, inserted)
        temporary_uuid = uuid.UUID("00000000-0000-0000-0000-000000000011")
        preview_uuid = uuid.UUID("00000000-0000-0000-0000-000000000012")
        now = "2026-09-01T00:00:00+00:00"
        resolved_destination = destination.resolve()
        expected_temporary = resolved_destination.with_name(
            f".{resolved_destination.name}.{temporary_uuid.hex}.tmp"
        )

        with patch.object(
            preview_store_module.uuid,
            "uuid4",
            side_effect=[temporary_uuid, preview_uuid],
        ), patch.object(
            preview_store_module,
            "utc_now_iso",
            return_value=now,
        ), patch.object(
            preview_store_module.os,
            "replace",
            side_effect=os.replace,
        ) as replace:
            result = self._store(conn, payload, destination)

        self.assertEqual(result, inserted)
        self.assertEqual(destination.read_bytes(), payload)
        self.assertFalse(expected_temporary.exists())
        replace.assert_called_once_with(expected_temporary, destination.resolve())
        self.assertEqual(
            conn.calls[1][1],
            (
                str(preview_uuid),
                "asset-1",
                self.kind,
                str(destination.resolve()),
                digest,
                len(payload),
                "kicad-cli",
                "9.0.0",
                "prism-preview-a2-multi-unit",
                "fingerprint-1",
                now,
            ),
        )
        self.assertEqual(conn.calls[2][1], (str(preview_uuid),))
        self.assertIn("INSERT INTO asset_preview_versions", conn.calls[1][0])

    def test_existing_destination_with_same_bytes_is_reused(self) -> None:
        payload = b"<svg>already-stored</svg>"
        destination = self._destination(payload)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(payload)
        conn = _RecordingConnection(None, None, {"id": "preview-existing-destination"})

        with patch.object(preview_store_module.os, "replace") as replace:
            self._store(conn, payload, destination)

        replace.assert_not_called()
        self.assertEqual(destination.read_bytes(), payload)
        self.assertEqual(len(conn.calls), 3)

    def test_destination_collision_has_exact_error(self) -> None:
        payload = b"<svg>new-content</svg>"
        destination = self._destination(payload)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"<svg>different-content</svg>")
        conn = _RecordingConnection(None)

        with self.assertRaisesRegex(
            ValueError,
            rf"^Immutable preview hash collision at {destination.resolve()}$",
        ):
            self._store(conn, payload, destination)

        self.assertEqual(destination.read_bytes(), b"<svg>different-content</svg>")
        self.assertEqual(len(conn.calls), 1)

    def test_has_ready_preview_validates_row_status_path_and_hash(self) -> None:
        payload = b"<svg>ready</svg>"
        digest = hashlib.sha256(payload).hexdigest()
        cases: list[tuple[str, dict[str, object] | None, bool]] = [
            ("no row", None, False),
            (
                "missing file",
                {"file_path": str(self.root / "missing.svg"), "sha256": digest},
                False,
            ),
        ]
        corrupt = self.root / "corrupt.svg"
        corrupt.write_bytes(b"<svg>corrupt</svg>")
        cases.append(
            ("wrong hash", {"file_path": str(corrupt), "sha256": digest}, False)
        )
        valid = self.root / "valid.svg"
        valid.write_bytes(payload)
        cases.append(("valid", {"file_path": str(valid), "sha256": digest}, True))

        for label, row, expected in cases:
            with self.subTest(label=label):
                conn = _RecordingConnection(row)
                result = self.store.has_ready_preview(
                    conn,
                    "asset-1",
                    self.kind,
                    "fingerprint-1",
                )

                self.assertEqual(result, expected)
                self.assertEqual(len(conn.calls), 1)
                self.assertEqual(
                    conn.calls[0][1],
                    ("asset-1", self.kind, "ready", "fingerprint-1"),
                )
                self.assertIn("ORDER BY created_at DESC", conn.calls[0][0])
                self.assertIn("LIMIT 1", conn.calls[0][0])


if __name__ == "__main__":
    unittest.main()
