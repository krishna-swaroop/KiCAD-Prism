"""Which of the three possible thumbnails a project actually shows.

A project can have up to three candidate images at once: one Prism rendered
with kicad-cli, one somebody uploaded in the workspace, and one committed to
the repository under assets/thumbnail. Precedence used to favour the committed
image, so a stale picture outranked a render of the board as it is now. The
render is the default; a deliberate upload beats it; the committed image is
only a stand-in for a project with nothing to render.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services import derived_assets, project_import_service


class ThumbnailPrecedence(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.root = Path(self._temporary.name)
        self.addCleanup(self._temporary.cleanup)
        self.checkout = self.root / "projects" / "board"
        self.checkout.mkdir(parents=True)

        derived_patch = mock.patch.object(
            derived_assets, "derived_root", return_value=self.root / "derived"
        )
        derived_patch.start()
        self.addCleanup(derived_patch.stop)

        self.repository_thumbnail_dir = self.checkout / "assets" / "thumbnail"
        resolve_patch = mock.patch.object(
            project_import_service.path_config_service,
            "resolve_paths",
            return_value=SimpleNamespace(
                schematic=None,
                pcb=None,
                thumbnail_dir=str(self.repository_thumbnail_dir),
                jobset_path=None,
                design_outputs_dir=None,
            ),
        )
        resolve_patch.start()
        self.addCleanup(resolve_patch.stop)

    def _store(self, kind: str, content: bytes) -> Path:
        directory = derived_assets.thumbnail_dir(self.checkout)
        directory.mkdir(parents=True, exist_ok=True)
        source = directory / ".staging.webp"
        source.write_bytes(content)
        stored, _digest, _size = derived_assets.store_thumbnail(
            self.checkout, source, kind=kind
        )
        return stored

    def _commit_repository_image(self, content: bytes = b"committed") -> Path:
        self.repository_thumbnail_dir.mkdir(parents=True, exist_ok=True)
        image = self.repository_thumbnail_dir / "board.png"
        image.write_bytes(content)
        return image

    def _resolve(self, current_source: str | None = None) -> dict:
        return project_import_service.resolve_cached_paths(
            str(self.checkout), current_source=current_source
        )

    def test_render_beats_an_image_committed_to_the_repository(self) -> None:
        """The old order showed a stale committed picture over a live render."""
        self._commit_repository_image()
        render = self._store("generated", b"render")

        cached = self._resolve()

        self.assertEqual(cached["thumbnail_source"], "generated")
        self.assertEqual(cached["thumbnail_rel"], render.name)

    def test_repository_image_is_used_only_when_nothing_was_rendered(self) -> None:
        # A schematic-only project has no board to render; showing the team's
        # committed image beats showing nothing at all.
        self._commit_repository_image()

        cached = self._resolve()

        self.assertEqual(cached["thumbnail_source"], "repository")
        self.assertEqual(cached["thumbnail_rel"], "assets/thumbnail/board.png")

    def test_a_project_with_no_image_anywhere_records_none(self) -> None:
        cached = self._resolve()
        self.assertIsNone(cached["thumbnail_rel"])
        self.assertIsNone(cached["thumbnail_digest"])

    def test_an_upload_beats_the_render_once_it_is_the_recorded_source(self) -> None:
        self._store("generated", b"render")
        upload = self._store("custom", b"upload")

        cached = self._resolve(current_source="custom")

        self.assertEqual(cached["thumbnail_source"], "custom")
        self.assertEqual(cached["thumbnail_rel"], upload.name)

    def test_a_rescan_does_not_quietly_replace_an_upload_with_a_render(self) -> None:
        """A re-render must refresh the backing image, not the visible one."""
        self._store("custom", b"upload")
        self._store("generated", b"a fresh render")

        cached = self._resolve(current_source="custom")

        self.assertEqual(cached["thumbnail_source"], "custom")

    def test_a_removed_upload_falls_back_to_the_render(self) -> None:
        render = self._store("generated", b"render")
        self._store("custom", b"upload")
        derived_assets.discard_thumbnail(self.checkout, kind="custom")

        cached = self._resolve(current_source="custom")

        self.assertEqual(cached["thumbnail_source"], "generated")
        self.assertEqual(cached["thumbnail_rel"], render.name)

    def test_metadata_describes_the_file_actually_chosen(self) -> None:
        self._commit_repository_image()
        render = self._store("generated", b"render")

        cached = self._resolve()

        self.assertEqual(cached["thumbnail_size_bytes"], len(b"render"))
        self.assertEqual(cached["thumbnail_media_type"], "image/webp")
        self.assertTrue(render.exists())


class RefreshReadsTheRecordedSource(unittest.TestCase):
    """Callers must not have to remember to pass the current source through."""

    def test_refresh_passes_the_rows_source_to_the_rescan(self) -> None:
        with (
            mock.patch.object(
                project_import_service.workspace,
                "get_project_by_id",
                return_value={"id": "prj_1", "path": "/tmp/board", "thumbnail_source": "custom"},
            ),
            mock.patch.object(
                project_import_service,
                "resolve_cached_paths",
                return_value={"thumbnail_source": "custom"},
            ) as resolve,
            mock.patch.object(
                project_import_service.workspace, "update_project"
            ) as update_project,
        ):
            project_import_service.refresh_project_assets("prj_1")

        self.assertEqual(resolve.call_args.kwargs["current_source"], "custom")
        update_project.assert_called_once_with("prj_1", thumbnail_source="custom")

    def test_refresh_of_an_unknown_project_changes_nothing(self) -> None:
        with (
            mock.patch.object(
                project_import_service.workspace, "get_project_by_id", return_value=None
            ),
            mock.patch.object(
                project_import_service.workspace, "update_project"
            ) as update_project,
        ):
            self.assertEqual(project_import_service.refresh_project_assets("gone"), {})
        update_project.assert_not_called()


if __name__ == "__main__":
    unittest.main()
