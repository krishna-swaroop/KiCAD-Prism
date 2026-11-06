"""Fetching KiCad path libraries: by commit into an object store, extracted, published, kept current, swept.

The remotes are real repositories on disk, reached over ``file://`` (the one
protocol production never allows).
"""

from __future__ import annotations

import email.message
import os
import sys
import tarfile
import tempfile
import time
import unittest
import urllib.error
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
            "subdir": library.subdir, "update_policy": library.update_policy, "pinned_commit": library.pinned_commit,
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
        with mock.patch.object(fetch, "_run_streaming", side_effect=AssertionError("git fetch ran")):
            fetch.fetch_version(library, self.first)
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


class SizeLimitTests(FetchCase):
    def assert_nothing_served(self, library: libs.Library) -> None:
        self.assertIsNone(library.published())
        self.assertEqual([p.name for p in library.clone_dir.iterdir() if p.name.endswith(".partial")], [])

    def test_a_library_larger_than_the_limit_is_refused_before_anything_is_written(self) -> None:
        library = self.library()
        with mock.patch.object(fetch, "max_bytes", return_value=5), \
                mock.patch.object(fetch, "_write_member", side_effect=AssertionError("a file was written")):
            with self.assertRaises(fetch.FetchError) as raised:
                fetch.fetch_version(library, self.first)
        self.assertTrue(raised.exception.permanent)
        self.assertIn("PRISM_KICAD_LIBRARY_MAX_GB", str(raised.exception))
        self.assert_nothing_served(library)

    def test_a_library_the_volume_has_no_room_for_is_refused_before_anything_is_written(self) -> None:
        library = self.library()
        fetch.fetch_into_store(library, self.first)
        with mock.patch.object(fetch, "free_bytes", return_value=fetch.MIN_FREE_BYTES), \
                mock.patch.object(fetch, "tree_bytes", return_value=fetch.MIN_FREE_BYTES):
            with self.assertRaises(fetch.FetchError) as raised:
                fetch.fetch_version(library, self.first)
        self.assertIn("free space", str(raised.exception))
        self.assert_nothing_served(library)

    def test_one_large_file_is_stopped_while_it_is_written(self) -> None:
        write_files(self.remote, {"lsf.3dshapes/big.step": os.urandom(3 * 1024 * 1024)})
        commit = commit_all(self.remote, "a large model")
        library = self.library()
        # The size read before the write is passed; the limit still holds as the file streams.
        with mock.patch.object(fetch, "max_bytes", return_value=1024 * 1024), \
                mock.patch.object(fetch, "tree_bytes", return_value=0):
            with self.assertRaises(fetch.FetchError) as raised:
                fetch.fetch_version(library, commit)
        self.assertIn("PRISM_KICAD_LIBRARY_MAX_GB", str(raised.exception))
        self.assert_nothing_served(library)

    def test_free_space_is_read_while_a_file_is_written(self) -> None:
        library = self.library()
        with mock.patch.object(fetch, "_require_space"), mock.patch.object(fetch, "_SPACE_EVERY", 1), \
                mock.patch.object(fetch, "free_bytes", return_value=1024):
            with self.assertRaises(fetch.FetchError) as raised:
                fetch.fetch_version(library, self.first)
        self.assertIn("ran out of space", str(raised.exception))
        self.assert_nothing_served(library)

    def test_a_download_that_outgrows_the_limit_is_stopped(self) -> None:
        library = self.library()
        sizes = iter([0])
        with mock.patch.object(fetch, "_TICK_SECONDS", 0), \
                mock.patch.object(fetch, "folder_size", side_effect=lambda path: next(sizes, 10**12)):
            with self.assertRaises(fetch.FetchError) as raised:
                fetch.fetch_into_store(library, self.first)
        self.assertIn("PRISM_KICAD_LIBRARY_MAX_GB", str(raised.exception))

    def test_a_download_is_stopped_when_the_volume_runs_short(self) -> None:
        library = self.library()
        with mock.patch.object(fetch, "_TICK_SECONDS", 0), mock.patch.object(fetch, "_require_space"), \
                mock.patch.object(fetch, "free_bytes", return_value=1024):
            with self.assertRaises(fetch.FetchError) as raised:
                fetch.fetch_into_store(library, self.first)
        self.assertIn("ran out of space", str(raised.exception))

    def test_the_tree_size_is_what_the_files_hold(self) -> None:
        library = self.library(subdir="lsf.3dshapes")
        fetch.fetch_into_store(library, self.first)
        self.assertEqual(fetch.tree_bytes(library, self.first), len("cap v1"))
        self.assertEqual(fetch.tree_bytes(self.library(), self.first), len("cap v1") + len("sheet") + len("readme"))


class StreamingTests(unittest.TestCase):
    def test_a_quiet_command_is_still_ticked(self) -> None:
        ticks: list[float] = []
        quiet = [sys.executable, "-c", "import time; time.sleep(0.6)"]
        with mock.patch.object(fetch, "_TICK_SECONDS", 0.1):
            code, _tail = fetch._run_streaming(quiet, on_progress=lambda percent: None, on_tick=lambda: ticks.append(1))
        self.assertEqual(code, 0)
        self.assertGreaterEqual(len(ticks), 3, "a command that prints nothing is checked on every tick")

    def test_a_tick_that_raises_stops_the_command(self) -> None:
        slow = [sys.executable, "-c", "import time; time.sleep(30)"]
        started = time.monotonic()

        def full() -> None:
            raise fetch._too_large()

        with mock.patch.object(fetch, "_TICK_SECONDS", 0.1):
            with self.assertRaises(fetch.FetchError):
                fetch._run_streaming(slow, on_progress=lambda percent: None, on_tick=full)
        self.assertLess(time.monotonic() - started, 10)


class RedeclaredTests(FetchCase):
    def setUp(self) -> None:
        super().setUp()
        self.other = self.root / "other"
        self.other_first = init_repo(self.other, {"cap.step": "another library"})
        git(self.other, "config", "uploadpack.allowAnySHA1InWant", "true")

    def test_a_name_declared_again_for_another_repository_serves_nothing_until_it_is_fetched(self) -> None:
        old = self.library()
        fetch.fetch_version(old, self.first)
        new = self.library(git=self.other.as_uri())
        self.declare(new)
        self.assertIsNone(new.published())
        self.assertIsNone(new.folder)
        self.assertIsNone(new.fingerprint)
        self.assertNotIn("LSF_KICAD_LIB", libs.snapshot({}).bindings)
        fetch.fetch_version(new, self.other_first)
        self.assertEqual((new.folder / "cap.step").read_text(encoding="utf-8"), "another library")
        self.assertTrue((new.clone_dir / f"{self.first}.superseded").is_file(), "the old repository's version goes")

    def test_a_changed_subfolder_serves_nothing_until_it_is_fetched(self) -> None:
        fetch.fetch_version(self.library(subdir="lsf.3dshapes"), self.first)
        self.assertIsNone(self.library(subdir="layouts").folder)


class RedirectTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = mock.patch.multiple(libs.settings, IMPORT_ALLOWED_HOSTS_STR="gitlab.com,github.com")
        patcher.start()
        self.addCleanup(patcher.stop)

    def answer(self, code: int, location: str = "") -> mock._patch:
        def open_(request, timeout):
            if code == 200:
                return mock.MagicMock()
            headers = email.message.Message()
            if location:
                headers["Location"] = location
            raise urllib.error.HTTPError(request.full_url, code, "redirect", headers, None)

        patcher = mock.patch.object(fetch._OPENER, "open", side_effect=open_)
        patcher.start()
        self.addCleanup(patcher.stop)
        return patcher

    def test_git_never_follows_a_redirect_itself(self) -> None:
        command = fetch._git("ls-remote", "--", "https://gitlab.com/a/lib")
        self.assertIn("http.followRedirects=false", command)

    def test_a_repository_that_answers_is_used_as_given(self) -> None:
        self.answer(200)
        self.assertEqual(fetch.remote_url("https://gitlab.com/a/lib"), "https://gitlab.com/a/lib")

    def test_a_redirect_on_an_allowed_host_is_followed(self) -> None:
        moved = self.headers("https://gitlab.com/a/lib.git/info/refs?service=git-upload-pack")
        answers = [urllib.error.HTTPError("x", 301, "moved", moved, None), mock.MagicMock()]
        with mock.patch.object(fetch._OPENER, "open", side_effect=answers) as opened:
            self.assertEqual(fetch.remote_url("https://gitlab.com/a/lib"), "https://gitlab.com/a/lib.git")
        self.assertEqual(opened.call_args.args[0].full_url, "https://gitlab.com/a/lib.git/info/refs?service=git-upload-pack")

    def test_a_redirect_to_a_host_libraries_may_not_use_fails_for_good(self) -> None:
        self.answer(302, "https://evil.example/a/lib.git/info/refs?service=git-upload-pack")
        with self.assertRaises(fetch.FetchError) as raised:
            fetch.remote_url("https://gitlab.com/a/lib")
        self.assertTrue(raised.exception.permanent)
        self.assertIn("evil.example", str(raised.exception))

    def test_a_redirect_to_something_that_is_not_a_repository_fails_for_good(self) -> None:
        self.answer(302, "https://gitlab.com/users/sign_in")
        with self.assertRaises(fetch.FetchError) as raised:
            fetch.remote_url("https://gitlab.com/a/lib")
        self.assertTrue(raised.exception.permanent)

    def test_a_host_that_does_not_answer_is_left_to_git(self) -> None:
        with mock.patch.object(fetch._OPENER, "open", side_effect=urllib.error.URLError("down")):
            self.assertEqual(fetch.remote_url("https://gitlab.com/a/lib"), "https://gitlab.com/a/lib")

    def test_the_remote_check_reports_a_refused_redirect(self) -> None:
        self.answer(302, "https://evil.example/a/lib.git/info/refs?service=git-upload-pack")
        result = fetch.check_remote("https://gitlab.com/a/lib")
        self.assertFalse(result["reachable"])
        self.assertIn("evil.example", result["error"])

    @staticmethod
    def headers(location: str) -> email.message.Message:
        headers = email.message.Message()
        headers["Location"] = location
        return headers


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

    def test_an_address_with_no_repository_is_a_permanent_error(self) -> None:
        with self.assertRaises(fetch.FetchError) as raised:
            fetch.resolve_remote((self.root / "gone").as_uri(), "main")
        self.assertTrue(raised.exception.permanent)
        self.assertIn("was not found, or it is private", str(raised.exception))

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


    def test_a_declared_library_whose_row_no_longer_validates_is_left_alone(self) -> None:
        library = self.library()
        patcher = self.declare(library)
        fetch.fetch_version(library, self.first)
        patcher.stop()
        # The row is still in the database but is not in force (a host the server stopped allowing,
        # or a cache left empty by a database that did not answer): its files are not a removed library's.
        with mock.patch.object(libs, "declared_rows", return_value=[]):
            self.assertEqual(fetch.sweep(grace=-1, declared=["lsf"]), [])
        self.assertIsNotNone(library.published())
        self.assertFalse((library.clone_dir / "removed.json").exists())

    def test_a_sweep_holds_the_lock_a_fetch_and_a_removal_hold(self) -> None:
        subject = fetch._subject("lsf")
        self.assertEqual(fetch.SWEEP.lock(subject), [{"key": "kicad-library:lsf", "mode": "write"}])
        self.assertEqual(fetch.SWEEP.lock(subject), fetch.FETCH.lock(subject))
        self.assertEqual(fetch.SWEEP.lock(subject), fetch.REMOVE.lock(subject))

    def test_a_sweep_job_sweeps_only_its_own_library(self) -> None:
        lsf, other = self.library(), self.library(name="other", variables=("OTHER_LIB",))
        rows = [
            {"name": item.name, "variables": list(item.variables), "git": item.git, "ref": item.ref}
            for item in (lsf, other)
        ]
        with mock.patch.object(libs, "declared_rows", return_value=rows):
            stale = []
            for item in (lsf, other):
                fetch.fetch_version(item, self.first)
                partial = item.clone_dir / ("c" * 40 + ".partial")
                partial.mkdir()
                os.utime(partial, (time.time() - 3 * fetch.GRACE_SECONDS,) * 2)
                stale.append(partial)
            with mock.patch.object(fetch.kicad_library_store, "declared", return_value=rows), \
                    mock.patch.object(fetch.kicad_library_store, "versions", return_value=[]):
                fetch.run_sweep_job(_Context({"name": "lsf"}))
        self.assertFalse(stale[0].exists())
        self.assertTrue(stale[1].exists(), "another library's folder waits for its own sweep")

    def test_the_upkeep_queues_a_sweep_only_for_a_library_with_something_to_sweep(self) -> None:
        library = self.library()
        self.declare(library)
        fetch.fetch_version(library, self.first)
        for name in ("a-lib", "b-lib"):  # removed libraries
            (libs.libraries_root() / name).mkdir(parents=True)
        recorded = [{"commit": self.first}]
        with mock.patch.object(fetch.kicad_library_store, "declared", return_value=[{"name": "lsf"}]), \
                mock.patch.object(fetch.kicad_library_store, "versions", return_value=recorded), \
                mock.patch.object(fetch.JobKind, "enqueue", autospec=True) as enqueue:
            self.assertEqual(fetch.request_sweeps(), ["a-lib", "b-lib"], "lsf has nothing to sweep and costs no job")
            self.assertEqual({call.args[0].name for call in enqueue.call_args_list}, {fetch.SWEEP_KIND})
            self.assertEqual(
                [call.kwargs["artifact_key"] for call in enqueue.call_args_list],
                ["kicad_library_sweep:a-lib", "kicad_library_sweep:b-lib"],
            )
            enqueue.reset_mock()
            fetch.fetch_version(library, self.advance())  # the first version is superseded, within its grace
            self.assertEqual(fetch.request_sweeps(), ["a-lib", "b-lib"])
            self.assertEqual(fetch.request_sweeps(grace=-1), ["a-lib", "b-lib", "lsf"])


class LfsCase(FetchCase):
    """A remote that keeps its models in Git LFS, served over git-lfs's file adapter."""

    def setUp(self) -> None:
        super().setUp()
        if fetch.shutil.which("git-lfs") is None:
            self.skipTest("git-lfs is not installed")
        self.remote = self.root / "lfs-remote"
        init_repo(self.remote, {"README.md": "readme"})
        git(self.remote, "config", "uploadpack.allowAnySHA1InWant", "true")
        git(self.remote, "lfs", "install", "--local")
        git(self.remote, "lfs", "track", "*.step")
        self.model = os.urandom(4000)
        write_files(self.remote, {"lsf.3dshapes/cap.step": self.model, "lsf.3dshapes/cap.txt": "plain"})
        self.commit = commit_all(self.remote, "models in lfs")
        self.url = self.remote.as_uri()
        # git-lfs's file adapter reads the repository itself, not an /info/lfs endpoint.
        patcher = mock.patch.object(fetch, "lfs_endpoint", lambda url: url)
        patcher.start()
        self.addCleanup(patcher.stop)


class LfsTests(LfsCase):
    def test_lfs_files_are_published_as_their_content_not_their_pointers(self) -> None:
        library = self.library(subdir="lsf.3dshapes")
        fetch.fetch_version(library, self.commit)
        self.assertEqual((library.folder / "cap.step").read_bytes(), self.model)
        self.assertEqual((library.folder / "cap.txt").read_text(encoding="utf-8"), "plain")
        self.assertEqual(fetch.lfs_pointers(library.folder), [])
        self.assertFalse((library.clone_dir / "store.git" / "lfs").exists(), "the version folder is the one copy kept")

    def test_two_pointers_to_one_object_both_get_its_content(self) -> None:
        write_files(self.remote, {"lsf.3dshapes/cap-copy.step": self.model})
        commit = commit_all(self.remote, "the same model twice")
        library = self.library(subdir="lsf.3dshapes")
        fetch.fetch_version(library, commit)
        self.assertEqual((library.folder / "cap.step").read_bytes(), self.model)
        self.assertEqual((library.folder / "cap-copy.step").read_bytes(), self.model)

    def test_lfs_files_past_the_limit_are_refused_before_they_are_downloaded(self) -> None:
        library = self.library(subdir="lsf.3dshapes")
        with mock.patch.object(fetch, "max_bytes", return_value=len(self.model) // 2), \
                mock.patch.object(fetch, "_run_streaming", wraps=fetch._run_streaming) as ran:
            with self.assertRaises(fetch.FetchError) as raised:
                fetch.fetch_version(library, self.commit)
        self.assertIn("PRISM_KICAD_LIBRARY_MAX_GB", str(raised.exception))
        self.assertFalse(any("lfs" in call.args[0] for call in ran.call_args_list), "git lfs fetch never ran")
        self.assertIsNone(library.published())

    def test_without_git_lfs_a_library_with_pointers_fails_for_good_and_serves_nothing(self) -> None:
        library = self.library(subdir="lsf.3dshapes")
        with mock.patch.object(fetch.shutil, "which", return_value=None):
            with self.assertRaises(fetch.FetchError) as raised:
                fetch.fetch_version(library, self.commit)
        self.assertTrue(raised.exception.permanent)
        self.assertIn("Git LFS", str(raised.exception))
        self.assertIsNone(library.published())
        self.assertEqual([p.name for p in library.clone_dir.iterdir() if p.name.endswith(".partial")], [])

    def test_a_pointer_whose_object_the_server_lacks_fails_and_the_old_version_keeps_serving(self) -> None:
        library = self.library(subdir="lsf.3dshapes")
        fetch.fetch_version(library, self.commit)
        served = library.published()
        pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:" + "0" * 64 + "\nsize 12\n"
        git(self.remote, "lfs", "untrack", "*.step")
        write_files(self.remote, {"lsf.3dshapes/gone.step": pointer})
        broken = commit_all(self.remote, "a pointer with no object")
        with self.assertRaises(fetch.FetchError):
            fetch.fetch_version(library, broken)
        self.assertEqual(library.published(), served)

    def test_a_pointer_whose_object_does_not_match_is_not_copied(self) -> None:
        target = self.root / "pointer.step"
        target.write_text("pointer", encoding="utf-8")
        source = self.root / "object"
        source.write_bytes(b"other bytes!")
        self.assertFalse(fetch._copy_verified(source, target, "0" * 64, 12))
        self.assertEqual(target.read_text(encoding="utf-8"), "pointer")


class FailureTests(unittest.TestCase):
    def test_a_private_or_missing_repository_says_so_and_is_not_retried(self) -> None:
        stderr = "remote: Repository not found.\nfatal: repository 'https://github.com/acme/lib.git/' not found"
        error = fetch._failure(stderr, "https://github.com/acme/lib.git", "git fetch failed")
        self.assertTrue(error.permanent)
        self.assertEqual(str(error), "github.com/acme/lib was not found, or it is private. Libraries must be public https repositories.")
        prompt = "fatal: could not read Username for 'https://github.com': terminal prompts disabled"
        self.assertTrue(fetch._failure(prompt, "https://github.com/acme/lib", "x").permanent)

    def test_a_network_failure_is_retried(self) -> None:
        error = fetch._failure("fatal: unable to access: Could not resolve host: example.org", "https://example.org/x.git", "x")
        self.assertEqual((str(error), error.permanent), ("Could not resolve example.org.", False))

    def test_an_unknown_failure_keeps_git_s_last_line_without_credentials(self) -> None:
        error = fetch._failure("warning: x\nfatal: unable to access 'https://token@example.org/x/': SSL", "https://example.org/x", "git fetch failed")
        self.assertEqual(str(error), "git fetch failed: fatal: unable to access 'https://example.org/x/': SSL")
        self.assertFalse(error.permanent)

    def test_the_lfs_endpoint_is_the_one_git_lfs_derives(self) -> None:
        self.assertEqual(fetch.lfs_endpoint("https://example.org/a/lib"), "https://example.org/a/lib.git/info/lfs")
        self.assertEqual(fetch.lfs_endpoint("https://example.org/a/lib.git/"), "https://example.org/a/lib.git/info/lfs")


class _Context:
    def __init__(self, payload: dict, requested_by: str = "system:library-check") -> None:
        self.job = {"payload": payload, "requested_by": requested_by}

    def progress(self, **kwargs: object) -> None:
        pass

    def check_cancelled(self) -> None:
        pass


class PinnedFetchTests(FetchCase):
    def setUp(self) -> None:
        super().setUp()
        for name in ("record_fetch", "record_published"):
            patcher = mock.patch.object(fetch.kicad_library_store, name)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_a_fetch_queued_before_the_library_was_pinned_fetches_nothing(self) -> None:
        second = self.advance()
        library = self.library(update_policy="pinned", pinned_commit=self.first)
        self.declare(library)
        result = fetch.run_fetch_job(_Context({"name": "lsf", "commit": second}))
        self.assertIn("pinned", result.message)
        self.assertIsNone(library.published())

    def test_a_library_pinned_while_a_fetch_ran_ends_up_serving_its_pin(self) -> None:
        library = self.library()
        fetch.fetch_version(library, self.first)
        second = self.advance()
        self.declare(library)
        real = fetch.fetch_version
        calls: list[str] = []

        def pinned_meanwhile(lib, commit, **kwargs):
            calls.append(commit)
            done = real(lib, commit, **kwargs)
            if len(calls) == 1:  # the administrator froze the library at what it served before
                self.declare(self.library(update_policy="pinned", pinned_commit=self.first))
            return done

        with mock.patch.object(fetch, "fetch_version", pinned_meanwhile):
            fetch.run_fetch_job(_Context({"name": "lsf", "commit": second}))
        self.assertEqual(calls, [second, self.first])
        self.assertEqual(library.published().commit, self.first)


class ProgressTests(unittest.TestCase):
    def test_progress_maps_git_phases_to_one_scale(self) -> None:
        self.assertEqual(fetch.progress_of("Receiving objects:  50% (10/20)"), 35)
        self.assertEqual(fetch.progress_of("remote: Receiving objects: 100% (20/20), done."), 70)
        self.assertEqual(fetch.progress_of("Resolving deltas:  50% (1/2)"), 75)
        self.assertIsNone(fetch.progress_of("Cloning into 'x'..."))


if __name__ == "__main__":
    unittest.main()
