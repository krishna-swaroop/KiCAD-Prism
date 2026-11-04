"""Fetching KiCad path libraries: by commit into an object store, extracted, published, kept current, swept.

The remotes are real repositories on disk, reached over ``file://`` (the one
protocol production never allows).
"""

from __future__ import annotations

import os
import sys
import tarfile
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import kicad_libraries as libs  # noqa: E402
from app.services import kicad_library_fetch as fetch  # noqa: E402
from support.repo import commit_all, git, init_repo, write_files  # noqa: E402


class FetchCase(unittest.TestCase):
    """A remote repository, and a projects root where libraries are published."""

    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.remote = self.root / "remote"
        self.first = init_repo(
            self.remote,
            {"lsf.3dshapes/cap.step": "cap v1", "layouts/A4.kicad_wks": "sheet", "README.md": "readme"},
        )
        git(self.remote, "config", "uploadpack.allowAnySHA1InWant", "true")
        self.url = self.remote.as_uri()
        for patch in (
            mock.patch.multiple(libs.settings, KICAD_PROJECTS_ROOT=str(self.root / "data")),
            mock.patch.object(fetch, "ALLOWED_PROTOCOLS", ("https", "file")),
            mock.patch.object(libs, "check_git_url", lambda url: url),
            mock.patch.object(libs, "declared_rows", return_value=[]),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        libs.unpin()

    def library(self, **fields: object) -> libs.Library:
        values = {"name": "lsf", "variables": ("LSF_KICAD_LIB",), "git": self.url, "ref": "main", **fields}
        return libs.Library(**values)  # type: ignore[arg-type]

    def refuse_commit_ids(self) -> list[list[str]]:
        """The remote will not serve a commit by its id: the first git fetch fails, the rest run.

        A real server cannot be made to refuse a branch tip (tips are advertised),
        and git's newer protocol serves any id, so the refusal is simulated; the
        fallback to the ref is what is under test. Returns the commands run.
        """

        real = fetch._run_streaming
        commands: list[list[str]] = []

        def refusing(command, **kwargs):
            commands.append(command)
            if len(commands) == 1:
                return 128, "fatal: remote error: upload-pack: not our ref"
            return real(command, **kwargs)

        patcher = mock.patch.object(fetch, "_run_streaming", refusing)
        patcher.start()
        self.addCleanup(patcher.stop)
        return commands

    def advance(self, text: str = "cap v2") -> str:
        write_files(self.remote, {"lsf.3dshapes/cap.step": text})
        return commit_all(self.remote, text)

    def declare(self, library: libs.Library) -> mock._patch:
        entry = {
            "name": library.name, "variables": list(library.variables), "git": library.git, "ref": library.ref,
            "subdir": library.subdir,
        }
        patcher = mock.patch.object(libs, "declared_rows", return_value=[entry])
        patcher.start()
        self.addCleanup(patcher.stop)
        return patcher


class PublishTests(FetchCase):
    def test_a_fetch_publishes_the_subdir_of_the_commit(self) -> None:
        library = self.library(subdir="lsf.3dshapes")
        size = fetch.fetch_version(library, self.first)
        published = library.published()
        self.assertEqual((published.commit, published.directory), (self.first, library.directory_for(self.first)))
        self.assertEqual((library.folder / "cap.step").read_text(encoding="utf-8"), "cap v1")
        self.assertFalse((library.folder.parent / "README.md").exists())
        self.assertGreater(size, 0)

    def test_without_a_subdir_the_whole_repository_is_the_library(self) -> None:
        library = self.library()
        fetch.fetch_version(library, self.first)
        self.assertEqual((library.folder / "layouts" / "A4.kicad_wks").read_text(encoding="utf-8"), "sheet")
        self.assertEqual(library.folder.name, self.first)

    def test_the_published_library_binds_its_variable(self) -> None:
        library = self.library(subdir="lsf.3dshapes")
        self.declare(library)
        fetch.fetch_version(library, self.first)
        binding = libs.snapshot({}).bindings["LSF_KICAD_LIB"]
        self.assertEqual(binding.folder, library.folder)
        self.assertTrue(binding.fingerprint.endswith(f"@{self.first}"))

    def test_a_later_commit_is_published_beside_the_first_and_the_first_gets_a_grace_period(self) -> None:
        library = self.library(subdir="lsf.3dshapes")
        fetch.fetch_version(library, self.first)
        old_folder = library.folder
        second = self.advance()
        fetch.fetch_version(library, second)
        self.assertEqual(library.published().commit, second)
        self.assertEqual((library.folder / "cap.step").read_text(encoding="utf-8"), "cap v2")
        self.assertTrue(old_folder.is_dir(), "a job reading the old version must not lose it")
        self.assertTrue((library.clone_dir / f"{library.directory_for(self.first)}.superseded").is_file())

    def test_the_grace_period_decides_when_the_old_version_goes(self) -> None:
        library = self.library()
        self.declare(library)
        fetch.fetch_version(library, self.first)
        second = self.advance()
        fetch.fetch_version(library, second)
        self.assertEqual(fetch.sweep(grace=3600), [])
        self.assertTrue((library.clone_dir / self.first).is_dir())
        removed = fetch.sweep(grace=-1)
        self.assertEqual(removed, [str(library.clone_dir / self.first)])
        self.assertFalse((library.clone_dir / self.first).exists())
        self.assertEqual(library.published().commit, second)
        self.assertTrue((library.clone_dir / second).is_dir())

    def test_going_back_to_a_kept_commit_needs_no_network(self) -> None:
        library = self.library()
        self.declare(library)
        fetch.fetch_version(library, self.first)
        fetch.fetch_version(library, self.advance())
        fetch.sweep(grace=-1)
        self.assertFalse((library.clone_dir / self.first).exists())
        offline = self.library(git=(self.root / "gone").as_uri())
        fetch.fetch_version(offline, self.first)
        self.assertEqual(library.published().commit, self.first)
        self.assertEqual((library.folder / "lsf.3dshapes" / "cap.step").read_text(encoding="utf-8"), "cap v1")

    def test_publishing_a_commit_again_clears_its_pending_removal(self) -> None:
        library = self.library()
        self.declare(library)
        fetch.fetch_version(library, self.first)
        fetch.fetch_version(library, self.advance())
        fetch.fetch_version(library, self.first)
        self.assertFalse((library.clone_dir / f"{self.first}.superseded").exists())
        second = library.clone_dir / (library.directory_for(git(self.remote, "rev-parse", "HEAD")))
        self.assertEqual(fetch.sweep(grace=-1), [str(second)], "only the version just replaced goes")
        self.assertTrue((library.clone_dir / self.first).is_dir())

    def test_a_missing_subdir_fails_for_good_and_serves_nothing(self) -> None:
        library = self.library(subdir="absent")
        with self.assertRaises(fetch.FetchError) as raised:
            fetch.fetch_version(library, self.first)
        self.assertTrue(raised.exception.permanent)
        self.assertIsNone(library.published())
        self.assertFalse(any(p.name.endswith(".partial") for p in library.clone_dir.iterdir()))

    def test_a_failed_update_keeps_the_old_version_serving(self) -> None:
        library = self.library()
        self.declare(library)
        fetch.fetch_version(library, self.first)
        missing = "f" * 40
        with self.assertRaises(fetch.FetchError):
            fetch.fetch_version(library, missing)
        self.assertEqual(library.published().commit, self.first)
        self.assertIn("LSF_KICAD_LIB", libs.snapshot({}).bindings)

    def test_a_remote_that_refuses_commit_ids_is_fetched_by_its_ref(self) -> None:
        commands = self.refuse_commit_ids()
        library = self.library()
        head = git(self.remote, "rev-parse", "HEAD")
        fetch.fetch_version(library, head)
        self.assertEqual(library.published().commit, head)
        self.assertEqual(len(commands), 2, "the commit was refused, then the ref was fetched")
        self.assertIn("refs/heads/main", " ".join(commands[1]))

    def test_the_ref_moving_during_a_refused_fetch_is_not_published_as_the_old_commit(self) -> None:
        self.refuse_commit_ids()
        stale = git(self.remote, "rev-parse", "HEAD")
        self.advance()
        library = self.library()
        with self.assertRaises(fetch.FetchError):
            fetch.fetch_version(library, stale)
        self.assertIsNone(library.published())

    def test_low_disk_space_stops_a_fetch_before_it_starts(self) -> None:
        library = self.library()
        with mock.patch.object(fetch, "free_bytes", return_value=1024):
            with self.assertRaises(fetch.FetchError) as raised:
                fetch.fetch_version(library, self.first)
        self.assertIn("free", str(raised.exception))
        self.assertIsNone(library.published())


class RemoteTests(FetchCase):
    def test_a_branch_resolves_to_its_head(self) -> None:
        self.assertEqual(fetch.resolve_remote(self.url, "main"), self.first)
        second = self.advance()
        self.assertEqual(fetch.resolve_remote(self.url, "main"), second)

    def test_an_annotated_tag_resolves_to_the_commit_not_the_tag_object(self) -> None:
        git(self.remote, "tag", "-a", "v1", "-m", "release")
        git(self.remote, "tag", "light")
        self.assertEqual(fetch.resolve_remote(self.url, "v1"), self.first)
        self.assertEqual(fetch.resolve_remote(self.url, "light"), self.first)

    def test_a_ref_the_remote_lacks_is_a_permanent_error(self) -> None:
        with self.assertRaises(fetch.FetchError) as raised:
            fetch.resolve_remote(self.url, "nope")
        self.assertTrue(raised.exception.permanent)

    def test_an_unreachable_remote_is_a_retryable_error(self) -> None:
        with self.assertRaises(fetch.FetchError) as raised:
            fetch.resolve_remote((self.root / "gone").as_uri(), "main")
        self.assertFalse(raised.exception.permanent)

    def test_the_remote_check_lists_tags_newest_first_and_the_default_branch_first(self) -> None:
        for tag in ("9.0.9", "10.0.4", "10.0.4-rc1", "nightly"):
            git(self.remote, "tag", tag)
        with mock.patch.object(fetch.kicad_libraries, "check_git_url", lambda url: url):
            found = fetch.check_remote(self.url, "10.0.4")
        self.assertTrue(found["reachable"])
        self.assertEqual(found["tags"], ["10.0.4", "10.0.4-rc1", "9.0.9", "nightly"])
        self.assertEqual((found["defaultBranch"], found["refFound"]), ("main", True))

    def test_the_remote_check_refuses_other_schemes_and_credentials(self) -> None:
        for url in ("http://example.org/x.git", "https://user:pw@example.org/x.git", "--upload-pack=x"):
            with self.subTest(url=url):
                self.assertFalse(fetch.check_remote(url)["reachable"])


class ExtractionSafetyTests(unittest.TestCase):
    def member(self, name: str, kind: bytes = tarfile.REGTYPE, link: str = "") -> tarfile.TarInfo:
        info = tarfile.TarInfo(name)
        info.type = kind
        info.linkname = link
        return info

    def test_names_that_could_leave_the_folder_raise(self) -> None:
        for name in ("../x", "a/../../x", "/abs", "\\abs", "a\\b", "C:/x", "a/b:stream", "a/\x00b"):
            with self.subTest(name=name), self.assertRaises(fetch.UnsafeArchive):
                fetch._checked_member(self.member(name))

    def test_links_and_special_files_are_skipped(self) -> None:
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE):
            with self.subTest(kind=kind):
                self.assertIsNone(fetch._checked_member(self.member("a/link", kind, "/etc/passwd")))

    def test_regular_files_and_folders_are_written_with_plain_modes(self) -> None:
        file_member = fetch._checked_member(self.member("a/b.step"))
        folder = fetch._checked_member(self.member("a", tarfile.DIRTYPE))
        self.assertEqual((file_member.mode, folder.mode), (0o644, 0o755))

    @unittest.skipUnless(os.name == "posix", "git on this platform may not store symlinks")
    def test_a_symlink_in_the_repository_is_not_written(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            remote = Path(tmp) / "remote"
            sha = init_repo(remote, {"lib/a.step": "a"})
            os.symlink("/etc/passwd", remote / "lib" / "evil")
            sha = commit_all(remote, "link")
            git(remote, "config", "uploadpack.allowAnySHA1InWant", "true")
            with mock.patch.multiple(libs.settings, KICAD_PROJECTS_ROOT=str(Path(tmp) / "data")), \
                    mock.patch.object(fetch, "ALLOWED_PROTOCOLS", ("https", "file")):
                library = libs.Library(name="x", variables=("X_LIB",), git=remote.as_uri(), ref="main", subdir="lib")
                fetch.fetch_version(library, sha)
                self.assertTrue((library.folder / "a.step").is_file())
                self.assertFalse(os.path.lexists(library.folder / "evil"))


class SweepTests(FetchCase):
    def test_a_removed_library_stops_serving_at_once_and_its_files_go_after_the_grace(self) -> None:
        library = self.library()
        patcher = self.declare(library)
        fetch.fetch_version(library, self.first)
        patcher.stop()
        with mock.patch.object(libs, "declared_rows", return_value=[]):
            fetch.unpublish(library.clone_dir)
            self.assertEqual(dict(libs.snapshot({}).bindings), {})
            self.assertTrue((library.clone_dir / self.first).is_dir())
            self.assertEqual(fetch.sweep(grace=3600), [])
            self.assertEqual(fetch.sweep(grace=-1), [str(library.clone_dir)])
            self.assertFalse(library.clone_dir.exists())

    def test_a_library_declared_again_before_the_grace_ends_is_served_again(self) -> None:
        library = self.library()
        patcher = self.declare(library)
        fetch.fetch_version(library, self.first)
        patcher.stop()
        with mock.patch.object(libs, "declared_rows", return_value=[]):
            fetch.unpublish(library.clone_dir)
        self.declare(library)
        fetch.fetch_version(library, self.first)
        self.assertIn("LSF_KICAD_LIB", libs.snapshot({}).bindings)
        self.assertEqual(fetch.sweep(grace=-1), [])

    def test_a_crashed_extraction_is_cleaned_up_after_the_grace(self) -> None:
        library = self.library()
        self.declare(library)
        fetch.fetch_version(library, self.first)
        stale = library.clone_dir / ("c" * 40 + ".partial")
        stale.mkdir()
        old = time.time() - 7200
        os.utime(stale, (old, old))
        self.assertEqual(fetch.sweep(grace=3600), [str(stale)])

    def test_unreferenced_objects_leave_the_store(self) -> None:
        library = self.library()
        self.declare(library)
        fetch.fetch_version(library, self.first)
        second = self.advance()
        fetch.fetch_version(library, second)
        refs = lambda: git(None, "--git-dir", str(library.clone_dir / "store.git"), "for-each-ref", "refs/prism/keep/")
        self.assertIn(self.first, refs())
        fetch.sweep({"lsf": [second]}, grace=3600)
        self.assertNotIn(self.first, refs())
        self.assertIn(second, refs())


class ProgressTests(unittest.TestCase):
    def test_progress_maps_git_phases_to_one_scale(self) -> None:
        self.assertEqual(fetch.progress_of("Receiving objects:  50% (10/20)"), 35)
        self.assertEqual(fetch.progress_of("remote: Receiving objects: 100% (20/20), done."), 70)
        self.assertEqual(fetch.progress_of("Resolving deltas:  50% (1/2)"), 75)
        self.assertIsNone(fetch.progress_of("Cloning into 'x'..."))


if __name__ == "__main__":
    unittest.main()
