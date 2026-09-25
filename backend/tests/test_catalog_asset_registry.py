"""Direct contracts for catalog asset lookup and registration persistence."""

from __future__ import annotations

import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
import uuid
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog import asset_registry as asset_registry_module  # noqa: E402
from app.services.catalog.asset_files import (  # noqa: E402
    content_type_for_asset,
)
from app.services.catalog.asset_registry import CatalogAssetRegistry  # noqa: E402
from app.services.catalog.runtime import CatalogRuntime  # noqa: E402


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
        raise AssertionError("asset registration must not commit")


class CatalogAssetRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.store = Path(temporary.name) / "components"
        self.runtime = CatalogRuntime(store_root=self.store)
        self.registry = CatalogAssetRegistry()

    def test_content_type_mapping_and_fallback(self) -> None:
        self.assertEqual(
            content_type_for_asset("symbol", Path("part.any")),
            "application/x-kicad-symbol",
        )
        self.assertEqual(
            content_type_for_asset("footprint", Path("part.any")),
            "application/x-kicad-footprint",
        )
        self.assertEqual(content_type_for_asset("3dmodel", Path("part.any")), "model/step")
        self.assertEqual(
            content_type_for_asset("spice", Path("part.LIB")),
            "application/x-spice",
        )
        self.assertEqual(
            content_type_for_asset("spice", Path("part.unknown")),
            "application/octet-stream",
        )
        self.assertEqual(
            content_type_for_asset("other", Path("part.json")),
            "application/json",
        )
        self.assertEqual(
            content_type_for_asset("other", Path("part.unknown")),
            "application/octet-stream",
        )

    def test_existing_key_with_same_hash_returns_existing_mapping(self) -> None:
        payload = b"existing asset\n"
        path = self.store / "symbols" / "Library" / "Part.kicad_sym"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        row = {"id": "asset-1", "sha256": hashlib.sha256(payload).hexdigest(), "name": path.name}
        conn = _RecordingConnection(row)

        result = self.registry.register_asset(
            self.runtime,
            conn,
            asset_type="symbol",
            canonical_path=path,
            target_library="Library",
            target_name="Part",
        )

        self.assertEqual(result, row)
        self.assertEqual(len(conn.calls), 1)
        self.assertEqual(
            conn.calls[0][1],
            ("symbol", str(path.resolve()), "Part"),
        )

    def test_changed_in_place_path_creates_immutable_revision_and_inserts(self) -> None:
        payload = b"changed asset\n"
        path = self.store / "symbols" / "Library" / "Part.kicad_sym"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        digest = hashlib.sha256(payload).hexdigest()
        immutable = self.store / "revisions" / digest / "symbols" / "Library" / path.name
        inserted = {
            "id": "asset-new",
            "asset_type": "symbol",
            "canonical_path": str(immutable),
            "sha256": digest,
        }
        conn = _RecordingConnection(
            {"id": "asset-old", "sha256": "old-hash"},
            None,
            None,
            None,
            inserted,
        )

        with patch.object(asset_registry_module.uuid, "uuid4", return_value=uuid.UUID("00000000-0000-0000-0000-000000000001")), patch.object(
            asset_registry_module, "utc_now_iso", return_value="2026-09-01T00:00:00+00:00"
        ):
            result = self.registry.register_asset(
                self.runtime,
                conn,
                asset_type="symbol",
                canonical_path=path,
                target_library="Library",
                target_name="Part",
            )

        self.assertEqual(result, inserted)
        self.assertEqual(immutable.resolve(), Path(result["canonical_path"]).resolve())
        self.assertEqual(immutable.read_bytes(), payload)
        self.assertEqual(
            [params for _, params in conn.calls],
            [
                ("symbol", str(path.resolve()), "Part"),
                ("symbol", str(immutable.resolve()), "Part"),
                ("symbol", digest, "Library", "Part"),
                (
                    "00000000-0000-0000-0000-000000000001",
                    "symbol",
                    path.name,
                    str(immutable.resolve()),
                    "Library",
                    "Part",
                    "",
                    digest,
                    len(payload),
                    "application/x-kicad-symbol",
                    "2026-09-01T00:00:00+00:00",
                    "2026-09-01T00:00:00+00:00",
                ),
                ("00000000-0000-0000-0000-000000000001",),
            ],
        )
        self.assertIn("INSERT INTO assets", conn.calls[3][0])

    def test_existing_immutable_collision_has_exact_error(self) -> None:
        payload = b"new content\n"
        path = self.store / "footprints" / "Library.pretty" / "Part.kicad_mod"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        immutable = self.store / "revisions" / "collision-digest" / "footprints" / "Library.pretty" / path.name
        immutable = immutable.resolve()
        immutable.parent.mkdir(parents=True, exist_ok=True)
        immutable.write_bytes(b"different content\n")
        conn = _RecordingConnection({"id": "asset-old", "sha256": "old-hash"})

        with patch.object(asset_registry_module, "sha256_bytes", return_value="collision-digest"):
            with self.assertRaisesRegex(
                ValueError,
                rf"^Immutable asset hash collision at {immutable}$",
            ):
                self.registry.register_asset(
                    self.runtime,
                    conn,
                    asset_type="footprint",
                    canonical_path=path,
                    target_library="Library",
                    target_name="Part",
                )

        self.assertEqual(immutable.read_bytes(), b"different content\n")
        self.assertEqual(len(conn.calls), 1)

    def test_existing_immutable_identity_mismatch_has_exact_error(self) -> None:
        payload = b"new revision\n"
        path = self.store / "symbols" / "Library" / "Part.kicad_sym"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        digest = hashlib.sha256(payload).hexdigest()
        conn = _RecordingConnection(
            {"id": "asset-old", "sha256": "old-hash"},
            {"id": "asset-revision", "sha256": "wrong-hash"},
        )

        with self.assertRaisesRegex(
            ValueError,
            "^Immutable asset identity does not match its content hash$",
        ):
            self.registry.register_asset(
                self.runtime,
                conn,
                asset_type="symbol",
                canonical_path=path,
                target_library="Library",
                target_name="Part",
            )

        immutable = self.store / "revisions" / digest / "symbols" / "Library" / path.name
        self.assertEqual(immutable.read_bytes(), payload)
        self.assertEqual(len(conn.calls), 2)

    def test_signature_dedupe_with_valid_backing_file(self) -> None:
        payload = b"shared asset\n"
        incoming = self.store / "symbols" / "Incoming" / "Part.kicad_sym"
        existing_path = self.store / "symbols" / "Library" / "Part.kicad_sym"
        incoming.parent.mkdir(parents=True, exist_ok=True)
        existing_path.parent.mkdir(parents=True, exist_ok=True)
        incoming.write_bytes(payload)
        existing_path.write_bytes(payload)
        digest = hashlib.sha256(payload).hexdigest()
        row = {
            "id": "asset-shared",
            "canonical_path": str(existing_path),
            "sha256": digest,
            "name": existing_path.name,
        }
        conn = _RecordingConnection(None, row)

        result = self.registry.register_asset(
            self.runtime,
            conn,
            asset_type="symbol",
            canonical_path=incoming,
            target_library="Library",
            target_name="Part",
        )

        self.assertEqual(result, row)
        self.assertEqual(len(conn.calls), 2)
        self.assertEqual(conn.calls[1][1], ("symbol", digest, "Library", "Part"))

    def test_missing_or_corrupt_backing_repairs_with_update_and_returns_mapping(self) -> None:
        payload = b"repaired asset\n"
        digest = hashlib.sha256(payload).hexdigest()

        for state in ("missing", "corrupt"):
            with self.subTest(state=state):
                incoming = self.store / state / "Part.kicad_sym"
                incoming.parent.mkdir(parents=True, exist_ok=True)
                incoming.write_bytes(payload)
                existing_path = self.store / state / "old.kicad_sym"
                if state == "corrupt":
                    existing_path.write_bytes(b"corrupt\n")
                same_content = {
                    "id": f"asset-{state}",
                    "canonical_path": str(existing_path),
                    "sha256": digest,
                    "name": "old.kicad_sym",
                    "size_bytes": 7,
                    "content_type": "old/type",
                    "updated_at": "old-time",
                }
                conn = _RecordingConnection(None, same_content, None)

                with patch.object(
                    asset_registry_module,
                    "utc_now_iso",
                    return_value="2026-09-01T00:01:00+00:00",
                ):
                    result = self.registry.register_asset(
                        self.runtime,
                        conn,
                        asset_type="symbol",
                        canonical_path=incoming,
                        target_library="Library",
                        target_name="Part",
                    )

                expected = dict(same_content)
                expected.update(
                    {
                        "name": incoming.name,
                        "canonical_path": str(incoming.resolve()),
                        "size_bytes": len(payload),
                        "content_type": "application/x-kicad-symbol",
                    }
                )
                self.assertEqual(result, expected)
                self.assertEqual(
                    conn.calls[2][1],
                    (
                        incoming.name,
                        str(incoming.resolve()),
                        len(payload),
                        "application/x-kicad-symbol",
                        "2026-09-01T00:01:00+00:00",
                        same_content["id"],
                    ),
                )
                self.assertIn("UPDATE assets", conn.calls[2][0])

    def test_new_insert_and_select_preserve_column_and_parameter_order(self) -> None:
        payload = b"new spice model\n"
        path = self.store / "spice" / "Library" / "Part.lib"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        digest = hashlib.sha256(payload).hexdigest()
        inserted = {"id": "asset-inserted", "sha256": digest, "name": path.name}
        conn = _RecordingConnection(None, None, None, inserted)

        with patch.object(asset_registry_module.uuid, "uuid4", return_value=uuid.UUID("00000000-0000-0000-0000-000000000002")), patch.object(
            asset_registry_module, "utc_now_iso", return_value="2026-09-01T00:02:00+00:00"
        ):
            result = self.registry.register_asset(
                self.runtime,
                conn,
                asset_type="spice",
                canonical_path=path,
                target_library="Library",
                target_name="Part",
                source_group="manual",
            )

        self.assertEqual(result, inserted)
        self.assertEqual(
            conn.calls[2][1],
            (
                "00000000-0000-0000-0000-000000000002",
                "spice",
                path.name,
                str(path.resolve()),
                "Library",
                "Part",
                "manual",
                digest,
                len(payload),
                "application/x-spice",
                "2026-09-01T00:02:00+00:00",
                "2026-09-01T00:02:00+00:00",
            ),
        )
        self.assertEqual(conn.calls[3][1], ("00000000-0000-0000-0000-000000000002",))
        self.assertIn("SELECT * FROM assets WHERE id = %s", conn.calls[3][0])


if __name__ == "__main__":
    unittest.main()
