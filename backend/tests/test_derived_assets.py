"""Tests for the derived asset store and the guarantee that it keeps the
user's Git checkout untouched."""

from __future__ import annotations

import io
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.services import derived_assets


class ThumbnailStorageStaysOutsideTheCheckout(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.root = Path(self._temporary.name)
        # KICAD_PROJECTS_ROOT is a computed property on the settings model, so
        # the store's own root function is the patch point.
        patcher = mock.patch.object(
            derived_assets, "derived_root", return_value=self.root / "derived"
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._temporary.cleanup)
        self.checkout = self.root / "projects" / "type1" / "board"
        self.checkout.mkdir(parents=True)

    def _write_render(self, content: bytes = b"render-bytes") -> Path:
        staging = derived_assets.thumbnail_dir(self.checkout)
        staging.mkdir(parents=True, exist_ok=True)
        source = staging / ".encode-tmp.webp"
        source.write_bytes(content)
        return source

    def test_stored_thumbnail_is_not_written_into_the_checkout(self) -> None:
        derived_assets.store_thumbnail(self.checkout, self._write_render())
        # The whole point: nothing lands in the working tree.
        self.assertEqual(list(self.checkout.iterdir()), [])

    def test_stored_thumbnail_can_be_found_again(self) -> None:
        stored, digest, size = derived_assets.store_thumbnail(
            self.checkout, self._write_render()
        )
        found = derived_assets.find_thumbnail(self.checkout)
        self.assertEqual(found, stored)
        self.assertEqual(size, len(b"render-bytes"))
        self.assertTrue(digest)

    def test_stored_thumbnail_is_readable_by_the_nginx_worker(self) -> None:
        source = self._write_render()
        source.chmod(0o600)

        stored, _, _ = derived_assets.store_thumbnail(self.checkout, source)

        mode = stat.S_IMODE(stored.stat().st_mode)
        self.assertEqual(
            mode & (stat.S_IRGRP | stat.S_IROTH),
            stat.S_IRGRP | stat.S_IROTH,
        )

    def test_regenerating_replaces_rather_than_accumulates(self) -> None:
        derived_assets.store_thumbnail(self.checkout, self._write_render(b"first"))
        derived_assets.store_thumbnail(self.checkout, self._write_render(b"second"))
        directory = derived_assets.thumbnail_dir(self.checkout)
        self.assertEqual(len(list(directory.glob("thumbnail.*.webp"))), 1)
        found = derived_assets.find_thumbnail(self.checkout)
        assert found is not None
        self.assertEqual(found.read_bytes(), b"second")

    def test_two_projects_do_not_share_a_thumbnail(self) -> None:
        other = self.root / "projects" / "type2" / "repo" / "board-b"
        other.mkdir(parents=True)
        derived_assets.store_thumbnail(self.checkout, self._write_render(b"a"))
        self.assertIsNone(derived_assets.find_thumbnail(other))

    def test_missing_thumbnail_reads_as_none(self) -> None:
        self.assertIsNone(derived_assets.find_thumbnail(self.checkout))

    def test_discard_removes_the_stored_thumbnail(self) -> None:
        derived_assets.store_thumbnail(self.checkout, self._write_render())
        derived_assets.discard(self.checkout)
        self.assertIsNone(derived_assets.find_thumbnail(self.checkout))


try:  # Pillow is a hard requirement of the app; a bare dev venv may lack it.
    from PIL import Image as _pillow_image
except ImportError:  # pragma: no cover - exercised only on an incomplete venv
    _pillow_image = None


@unittest.skipIf(_pillow_image is None, "Pillow is not installed")
class UploadedThumbnailsLiveBesideTheRender(unittest.TestCase):
    """An upload must not destroy the render, so reverting is instant."""

    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.root = Path(self._temporary.name)
        patcher = mock.patch.object(
            derived_assets, "derived_root", return_value=self.root / "derived"
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._temporary.cleanup)
        self.checkout = self.root / "projects" / "type1" / "board"
        self.checkout.mkdir(parents=True)

    def _png(self, size: tuple[int, int] = (900, 700), colour: str = "red") -> bytes:
        from PIL import Image

        buffer = io.BytesIO()
        Image.new("RGB", size, colour).save(buffer, format="PNG")
        return buffer.getvalue()

    def _store_render(self, content: bytes = b"render") -> None:
        staging = derived_assets.thumbnail_dir(self.checkout)
        staging.mkdir(parents=True, exist_ok=True)
        source = staging / ".tmp.webp"
        source.write_bytes(content)
        derived_assets.store_thumbnail(self.checkout, source)

    def test_upload_is_stored_and_found_as_custom(self) -> None:
        stored, digest, size = derived_assets.store_uploaded_thumbnail(
            self.checkout, self._png()
        )
        self.assertEqual(derived_assets.find_thumbnail(self.checkout, kind="custom"), stored)
        self.assertTrue(digest)
        self.assertGreater(size, 0)

    def test_upload_is_re_encoded_rather_than_stored_as_received(self) -> None:
        """Prism serves this back to the whole workspace; only pixels survive."""
        from PIL import Image

        stored, _, _ = derived_assets.store_uploaded_thumbnail(self.checkout, self._png())
        with Image.open(stored) as image:
            self.assertEqual(image.format, "WEBP")
            # Also downscaled into the thumbnail box rather than kept at 900x700.
            self.assertLessEqual(image.width, derived_assets.THUMBNAIL_BOX[0])
            self.assertLessEqual(image.height, derived_assets.THUMBNAIL_BOX[1])

    def test_upload_does_not_disturb_the_render(self) -> None:
        self._store_render(b"the-render")
        derived_assets.store_uploaded_thumbnail(self.checkout, self._png())
        render = derived_assets.find_thumbnail(self.checkout)
        assert render is not None
        self.assertEqual(render.read_bytes(), b"the-render")

    def test_discarding_the_upload_leaves_the_render(self) -> None:
        self._store_render(b"the-render")
        derived_assets.store_uploaded_thumbnail(self.checkout, self._png())
        self.assertTrue(derived_assets.discard_thumbnail(self.checkout, kind="custom"))
        self.assertIsNone(derived_assets.find_thumbnail(self.checkout, kind="custom"))
        self.assertIsNotNone(derived_assets.find_thumbnail(self.checkout))

    def test_replacing_an_upload_does_not_accumulate(self) -> None:
        derived_assets.store_uploaded_thumbnail(self.checkout, self._png(colour="red"))
        derived_assets.store_uploaded_thumbnail(self.checkout, self._png(colour="blue"))
        directory = derived_assets.thumbnail_dir(self.checkout)
        self.assertEqual(len(list(directory.glob("custom.*.webp"))), 1)

    def test_transparency_is_flattened_onto_white(self) -> None:
        from PIL import Image

        buffer = io.BytesIO()
        Image.new("RGBA", (100, 100), (0, 0, 0, 0)).save(buffer, format="PNG")
        stored, _, _ = derived_assets.store_uploaded_thumbnail(
            self.checkout, buffer.getvalue()
        )
        with Image.open(stored) as image:
            self.assertEqual(image.convert("RGB").getpixel((5, 5)), (255, 255, 255))

    def test_a_non_image_is_refused(self) -> None:
        with self.assertRaises(derived_assets.ThumbnailImageError):
            derived_assets.store_uploaded_thumbnail(self.checkout, b"#!/bin/sh\nrm -rf /")

    def test_an_empty_upload_is_refused(self) -> None:
        with self.assertRaises(derived_assets.ThumbnailImageError):
            derived_assets.store_uploaded_thumbnail(self.checkout, b"")

    def test_an_oversized_upload_is_refused_before_decoding(self) -> None:
        oversized = b"\x00" * (derived_assets.MAX_UPLOAD_BYTES + 1)
        with self.assertRaises(derived_assets.ThumbnailImageError) as caught:
            derived_assets.store_uploaded_thumbnail(self.checkout, oversized)
        self.assertIn("MB", str(caught.exception))

    def test_a_failed_upload_leaves_no_partial_file_behind(self) -> None:
        with self.assertRaises(derived_assets.ThumbnailImageError):
            derived_assets.store_uploaded_thumbnail(self.checkout, b"not an image")
        directory = derived_assets.thumbnail_dir(self.checkout)
        self.assertEqual(list(directory.glob("*")), [])


class LegacyInTreeThumbnailCleanup(unittest.TestCase):
    """Checkouts made by an older Prism carry generated thumbnails in-tree."""

    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.checkout = Path(self._temporary.name)
        self.addCleanup(self._temporary.cleanup)
        self.thumbnails = self.checkout / "assets" / "thumbnail"
        self.thumbnails.mkdir(parents=True)

    def _repo(self, tracked: list[str]) -> mock.Mock:
        repo = mock.Mock()
        repo.working_tree_dir = str(self.checkout)
        repo.git.ls_files.return_value = "\n".join(tracked)
        return repo

    def test_untracked_generated_thumbnail_is_removed(self) -> None:
        stale = self.thumbnails / "thumbnail.0123456789abcdef.webp"
        stale.write_bytes(b"x")
        removed = derived_assets.purge_legacy_in_tree_thumbnails(
            self.checkout, self._repo([])
        )
        self.assertEqual(removed, [stale.name])
        self.assertFalse(stale.exists())

    def test_committed_thumbnail_is_left_alone(self) -> None:
        # Someone deliberately committed this; it is the team's own asset and
        # removing it would be data loss.
        committed = self.thumbnails / "thumbnail.0123456789abcdef.webp"
        committed.write_bytes(b"x")
        removed = derived_assets.purge_legacy_in_tree_thumbnails(
            self.checkout,
            self._repo(["assets/thumbnail/thumbnail.0123456789abcdef.webp"]),
        )
        self.assertEqual(removed, [])
        self.assertTrue(committed.exists())

    def test_unrelated_images_are_left_alone(self) -> None:
        other = self.thumbnails / "board-photo.png"
        other.write_bytes(b"x")
        removed = derived_assets.purge_legacy_in_tree_thumbnails(
            self.checkout, self._repo([])
        )
        self.assertEqual(removed, [])
        self.assertTrue(other.exists())

    def test_checkout_without_the_directory_is_a_no_op(self) -> None:
        bare = Path(self._temporary.name) / "elsewhere"
        bare.mkdir()
        self.assertEqual(
            derived_assets.purge_legacy_in_tree_thumbnails(bare, self._repo([])), []
        )

    def test_unreadable_git_index_leaves_the_checkout_untouched(self) -> None:
        # Without a trustworthy tracked-file list there is no safe deletion.
        stale = self.thumbnails / "thumbnail.0123456789abcdef.webp"
        stale.write_bytes(b"x")
        repo = self._repo([])
        repo.git.ls_files.side_effect = RuntimeError("not a git repository")
        self.assertEqual(
            derived_assets.purge_legacy_in_tree_thumbnails(self.checkout, repo), []
        )
        self.assertTrue(stale.exists())


if __name__ == "__main__":
    unittest.main()
