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


class TwoProjectsInOneDirectoryKeepSeparateThumbnails(unittest.TestCase):
    """Issue #193 follow-up.

    KiCad lets two projects share a directory, and Prism now imports both. The
    derived store still keyed a thumbnail on the directory alone, so the second
    render replaced the first and the two projects showed one board.
    """

    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.root = Path(self._temporary.name)
        patcher = mock.patch.object(
            derived_assets, "derived_root", return_value=self.root / "derived"
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._temporary.cleanup)
        self.checkout = self.root / "projects" / "fixture"
        self.checkout.mkdir(parents=True)
        (self.checkout / "base.kicad_pro").write_text("{}")
        (self.checkout / "top.kicad_pro").write_text("{}")

    def _render(self, content: bytes) -> Path:
        staging = derived_assets.derived_root() / "staging"
        staging.mkdir(parents=True, exist_ok=True)
        source = staging / f".encode-{content.decode()}.webp"
        source.write_bytes(content)
        return source

    def test_each_project_keeps_its_own_render(self) -> None:
        derived_assets.store_thumbnail(
            self.checkout, self._render(b"base"), anchor="base.kicad_pro"
        )
        derived_assets.store_thumbnail(
            self.checkout, self._render(b"top"), anchor="top.kicad_pro"
        )

        base = derived_assets.find_thumbnail(self.checkout, anchor="base.kicad_pro")
        top = derived_assets.find_thumbnail(self.checkout, anchor="top.kicad_pro")
        self.assertIsNotNone(base)
        self.assertIsNotNone(top)
        self.assertEqual(base.read_bytes(), b"base")
        self.assertEqual(top.read_bytes(), b"top")

    def test_discarding_one_leaves_the_sibling_alone(self) -> None:
        derived_assets.store_thumbnail(
            self.checkout, self._render(b"base"), anchor="base.kicad_pro"
        )
        derived_assets.store_thumbnail(
            self.checkout, self._render(b"top"), anchor="top.kicad_pro"
        )

        derived_assets.discard_thumbnail(
            self.checkout, kind="generated", anchor="top.kicad_pro"
        )

        self.assertIsNone(
            derived_assets.find_thumbnail(self.checkout, anchor="top.kicad_pro")
        )
        self.assertIsNotNone(
            derived_assets.find_thumbnail(self.checkout, anchor="base.kicad_pro")
        )

    def test_a_lone_project_still_finds_its_pre_anchor_thumbnail(self) -> None:
        # Every thumbnail already on disk was stored under the unanchored key,
        # so upgrading Prism must not silently drop existing renders and custom
        # uploads. This used to be arranged by keeping the key unanchored while
        # a project was alone, which made identity depend on the neighbours;
        # the store adopts the old directory onto the anchored key instead.
        lone = self.root / "projects" / "solo"
        lone.mkdir(parents=True)
        (lone / "solo.kicad_pro").write_text("{}")
        derived_assets.store_thumbnail(lone, self._render(b"old"))

        found = derived_assets.find_thumbnail(lone, anchor="solo.kicad_pro")
        self.assertIsNotNone(found)
        self.assertEqual(found.read_bytes(), b"old")

    def test_siblings_do_not_share_the_directory_key(self) -> None:
        anchored = derived_assets.thumbnail_dir(
            self.checkout, anchor="base.kicad_pro"
        )
        self.assertNotEqual(
            anchored, derived_assets.thumbnail_dir(self.checkout, anchor="top.kicad_pro")
        )
        self.assertNotEqual(anchored, derived_assets.thumbnail_dir(self.checkout))


class ThumbnailIdentityIsStable(unittest.TestCase):
    """A project's thumbnail must not depend on what its neighbours are doing.

    The store keyed on the anchor only while a sibling `.kicad_pro` happened to
    exist, so identity moved under the project's feet: adding a sibling made an
    uploaded thumbnail unreachable, and removing one orphaned the anchored
    thumbnails. The key is now fixed by the anchor alone.
    """

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.project = self.root / "checkout"
        self.project.mkdir()
        patcher = mock.patch.object(
            derived_assets, "derived_root", return_value=self.root / "derived"
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._tmp.cleanup)

    def _write(self, kind: str, anchor: str | None) -> Path:
        staged = self.root / "staged.webp"
        staged.write_bytes(b"image-bytes")
        stored, _digest, _size = derived_assets.store_thumbnail(
            self.project, staged, kind=kind, anchor=anchor
        )
        return stored

    def test_adding_a_sibling_does_not_hide_an_upload(self) -> None:
        (self.project / "base.kicad_pro").write_text("", encoding="utf-8")
        self._write("custom", "base.kicad_pro")
        self.assertIsNotNone(
            derived_assets.find_thumbnail(
                self.project, kind="custom", anchor="base.kicad_pro"
            )
        )

        # A second project appears in the same directory.
        (self.project / "top.kicad_pro").write_text("", encoding="utf-8")
        self.assertIsNotNone(
            derived_assets.find_thumbnail(
                self.project, kind="custom", anchor="base.kicad_pro"
            ),
            "the upload became unreachable when a sibling appeared",
        )

    def test_removing_a_sibling_does_not_orphan_a_thumbnail(self) -> None:
        (self.project / "base.kicad_pro").write_text("", encoding="utf-8")
        (self.project / "top.kicad_pro").write_text("", encoding="utf-8")
        self._write("custom", "top.kicad_pro")

        (self.project / "base.kicad_pro").unlink()
        self.assertIsNotNone(
            derived_assets.find_thumbnail(
                self.project, kind="custom", anchor="top.kicad_pro"
            ),
            "the thumbnail was orphaned when the sibling was removed",
        )

    def test_siblings_never_share_a_thumbnail(self) -> None:
        (self.project / "base.kicad_pro").write_text("", encoding="utf-8")
        (self.project / "top.kicad_pro").write_text("", encoding="utf-8")
        self._write("generated", "base.kicad_pro")
        self.assertIsNone(
            derived_assets.find_thumbnail(
                self.project, kind="generated", anchor="top.kicad_pro"
            )
        )

    def test_a_thumbnail_stored_before_anchors_is_adopted(self) -> None:
        # Everything already on disk was written under the bare path. A lone
        # project has to keep finding it, or every existing custom thumbnail
        # disappears on upgrade.
        (self.project / "solo.kicad_pro").write_text("", encoding="utf-8")
        self._write("custom", None)
        found = derived_assets.find_thumbnail(
            self.project, kind="custom", anchor="solo.kicad_pro"
        )
        self.assertIsNotNone(found, "the pre-anchor thumbnail was lost")

        # ... and adoption is permanent, so a sibling arriving later cannot
        # strand it a second time.
        (self.project / "other.kicad_pro").write_text("", encoding="utf-8")
        self.assertIsNotNone(
            derived_assets.find_thumbnail(
                self.project, kind="custom", anchor="solo.kicad_pro"
            )
        )

    def test_a_pre_anchor_thumbnail_is_not_adopted_when_ambiguous(self) -> None:
        # With two projects in the directory, the bare-path thumbnail could
        # belong to either. Handing it to both is how #193 looked in the first
        # place, so neither takes it.
        (self.project / "base.kicad_pro").write_text("", encoding="utf-8")
        (self.project / "top.kicad_pro").write_text("", encoding="utf-8")
        self._write("generated", None)
        self.assertIsNone(
            derived_assets.find_thumbnail(
                self.project, kind="generated", anchor="base.kicad_pro"
            )
        )
        self.assertIsNone(
            derived_assets.find_thumbnail(
                self.project, kind="generated", anchor="top.kicad_pro"
            )
        )

    def test_discarding_removes_an_adopted_thumbnail(self) -> None:
        (self.project / "solo.kicad_pro").write_text("", encoding="utf-8")
        self._write("custom", None)
        self.assertTrue(
            derived_assets.discard_thumbnail(
                self.project, kind="custom", anchor="solo.kicad_pro"
            )
        )
        self.assertIsNone(
            derived_assets.find_thumbnail(
                self.project, kind="custom", anchor="solo.kicad_pro"
            )
        )
