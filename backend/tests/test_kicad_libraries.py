"""KiCad path libraries: validation, precedence over the environment, the published layout, the snapshot."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.services import kicad_libraries as libs

COMMIT = "a" * 40
OTHER = "b" * 40


def row(name: str = "lsf", variables: tuple[str, ...] = ("LSF_KICAD_LIB",), **fields: object) -> dict:
    return {
        "name": name,
        "variables": list(variables),
        "git": "https://gitlab.com/lsf/lsf-kicad-lib.git",
        "ref": "main",
        **fields,
    }


def publish(root: Path, name: str, commit: str, files: dict[str, str] | None = None, subdir: str = "") -> Path:
    """What a fetch leaves behind: one folder per commit and the file naming the served one."""

    library = root / ".kicad-prism" / "libraries" / name
    folder = library / commit / subdir if subdir else library / commit
    folder.mkdir(parents=True)
    for relative, text in (files or {"a.step": "x"}).items():
        target = folder / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    (library / libs.PUBLISHED_FILE).write_text(
        json.dumps({"source": f"https://gitlab.com/lsf/lsf-kicad-lib.git#{subdir}", "commit": commit, "dir": commit}),
        encoding="utf-8",
    )
    return folder


class Configured:
    """Settings rooted at a temp folder, with ``rows`` as the declared libraries."""

    def __init__(self, root: Path, *rows: dict, mount: Path | None = None) -> None:
        self._patches = [
            mock.patch.multiple(
                libs.settings,
                KICAD_PROJECTS_ROOT=str(root),
                PRISM_KICAD_LIBRARY_MOUNT_ROOT=str(mount) if mount else "",
            ),
            mock.patch.object(libs, "declared_rows", return_value=list(rows)),
        ]

    def __enter__(self) -> "Configured":
        for patch in self._patches:
            patch.__enter__()
        libs.unpin()
        return self

    def __exit__(self, *exc: object) -> None:
        libs.unpin()
        for patch in reversed(self._patches):
            patch.__exit__(*exc)


class ValidationTests(unittest.TestCase):
    def test_a_plain_git_library_is_accepted_with_defaults(self) -> None:
        library = libs.validate_entry(row())
        self.assertEqual(library.update_policy, "follow")
        self.assertEqual(library.check_interval_seconds, 86400)
        self.assertEqual(library.variables, ("LSF_KICAD_LIB",))

    def test_variables_the_process_itself_uses_are_refused(self) -> None:
        for name in ("PATH", "HOME", "LD_PRELOAD", "PYTHONPATH", "GIT_SSH_COMMAND", "KIPRJMOD", "KICAD_PROJECTS_ROOT", "PRISM_X"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                libs.validate_entry(row(variables=(name,)))

    def test_variable_names_are_upper_case(self) -> None:
        with self.assertRaises(ValueError):
            libs.validate_entry(row(variables=("lsf_lib",)))
        with self.assertRaises(ValueError):
            libs.validate_entry(row(variables=("1LIB",)))

    def test_a_url_with_credentials_or_another_scheme_is_refused(self) -> None:
        for url in ("https://user:pw@host/x.git", "https://user@host/x.git", "http://host/x.git", "git@host:x.git", "https://host/a b.git", "-ohttps://x"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                libs.validate_entry(row(git=url))

    def test_a_url_follows_the_hosts_project_imports_may_use(self) -> None:
        with mock.patch.object(libs.settings, "IMPORT_ALLOWED_HOSTS_STR", "gitlab.com, git.example.org"):
            self.assertEqual(libs.validate_entry(row(git="https://gitlab.com/kicad/x.git")).git, "https://gitlab.com/kicad/x.git")
            with self.assertRaises(ValueError) as raised:
                libs.validate_entry(row(git="https://github.com/acme/x.git"))
            self.assertIn("not an allowed repository host", str(raised.exception))
        with mock.patch.object(libs.settings, "IMPORT_ALLOWED_HOSTS_STR", ""):
            self.assertTrue(libs.validate_entry(row(git="https://github.com/acme/x.git")).git)

    def test_a_url_needs_a_repository_path_without_dot_segments(self) -> None:
        for url in ("https://example.org/", "https://example.org/a/../b.git"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                libs.validate_entry(row(git=url))

    def test_a_row_that_no_longer_validates_says_why_and_binds_nothing(self) -> None:
        from app.services import kicad_library_store as store

        stored = {
            "name": "lsf", "kind": "git", "variables": ["LSF_KICAD_LIB"], "git_url": "https://github.com/acme/x.git",
            "ref": "main", "subdir": "", "path": None, "update_policy": "follow", "pinned_commit": None,
            "check_interval_seconds": 86400, "generation": 1, "last_checked_at": None, "last_check_error": None,
            "remote_commit": None, "fetched_commit": None, "state": "ready", "error": None, "progress": None,
            "size_bytes": None, "fetched_at": None, "created_at": None, "updated_at": None, "updated_by": "a",
            "row_version": 1,
        }
        with mock.patch.object(libs.settings, "IMPORT_ALLOWED_HOSTS_STR", "gitlab.com"):
            view = store._view(stored)
        self.assertFalse(view["ready"])
        self.assertIn("not an allowed repository host", view["problem"])
        with mock.patch.object(libs.settings, "IMPORT_ALLOWED_HOSTS_STR", ""):
            self.assertIsNone(store._view(stored)["problem"])

    def test_a_ref_cannot_be_an_option_or_a_revision_expression(self) -> None:
        for ref in ("--upload-pack=x", "-b", "a..b", "HEAD~1", "a b", "main^", "x:y", ""):
            with self.subTest(ref=ref), self.assertRaises(ValueError):
                libs.validate_entry(row(ref=ref))

    def test_a_subdir_must_stay_below_the_repository(self) -> None:
        for subdir in ("..", "../x", "/abs", "C:/x", "a//b"):
            with self.subTest(subdir=subdir), self.assertRaises(ValueError):
                libs.validate_entry(row(subdir=subdir))
        self.assertEqual(libs.validate_entry(row(subdir="lsf.3dshapes")).subdir, "lsf.3dshapes")

    def test_exactly_one_of_git_and_path(self) -> None:
        with self.assertRaises(ValueError):
            libs.validate_entry(row(path="x"))
        with self.assertRaises(ValueError):
            libs.validate_entry({"name": "x", "variables": ["X_LIB"]})

    def test_policy_interval_and_pin_are_checked(self) -> None:
        with self.assertRaises(ValueError):
            libs.validate_entry(row(update_policy="always"))
        with self.assertRaises(ValueError):
            libs.validate_entry(row(check_interval_seconds=60))
        with self.assertRaises(ValueError):
            libs.validate_entry(row(update_policy="pinned", pinned_commit="main"))
        self.assertEqual(libs.validate_entry(row(update_policy="pinned", pinned_commit=COMMIT)).pinned_commit, COMMIT)


class PublishedLayoutTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_nothing_is_served_before_a_fetch_publishes(self) -> None:
        with Configured(self.root, row()):
            snapshot = libs.snapshot({})
        self.assertEqual(dict(snapshot.bindings), {})

    def test_a_published_version_binds_its_variable_to_that_commits_folder(self) -> None:
        folder = publish(self.root, "lsf", COMMIT)
        with Configured(self.root, row()):
            snapshot = libs.snapshot({})
        binding = snapshot.bindings["LSF_KICAD_LIB"]
        self.assertEqual(binding.folder, folder)
        self.assertEqual(binding.fingerprint, f"git:https://gitlab.com/lsf/lsf-kicad-lib.git#@{COMMIT}")

    def test_the_subdir_is_the_folder_the_variable_points_at(self) -> None:
        folder = publish(self.root, "lsf", COMMIT, subdir="lsf.3dshapes")
        with Configured(self.root, row(subdir="lsf.3dshapes")):
            snapshot = libs.snapshot({})
        self.assertEqual(snapshot.bindings["LSF_KICAD_LIB"].folder, folder)

    def test_a_missing_subdir_serves_nothing(self) -> None:
        publish(self.root, "lsf", COMMIT)
        with Configured(self.root, row(subdir="absent")):
            self.assertEqual(dict(libs.snapshot({}).bindings), {})

    def test_changing_the_declaration_does_not_unbind_the_served_version(self) -> None:
        publish(self.root, "lsf", COMMIT)
        with Configured(self.root, row(ref="a-newer-branch")):
            self.assertIn("LSF_KICAD_LIB", libs.snapshot({}).bindings)

    def test_the_fingerprint_follows_the_commit_not_the_mount_point(self) -> None:
        publish(self.root, "lsf", COMMIT)
        first = libs
        with Configured(self.root, row()):
            before = libs.snapshot({}).fingerprints(["LSF_KICAD_LIB"])
        with tempfile.TemporaryDirectory() as other:
            publish(Path(other), "lsf", COMMIT)
            with Configured(Path(other), row()):
                elsewhere = first.snapshot({}).fingerprints(["LSF_KICAD_LIB"])
        self.assertEqual(before, elsewhere)
        publish_dir = self.root / ".kicad-prism" / "libraries" / "lsf"
        (publish_dir / OTHER).mkdir()
        (publish_dir / libs.PUBLISHED_FILE).write_text(
            json.dumps({"source": "https://gitlab.com/lsf/lsf-kicad-lib.git#", "commit": OTHER, "dir": OTHER}), encoding="utf-8"
        )
        with Configured(self.root, row()):
            self.assertNotEqual(before, libs.snapshot({}).fingerprints(["LSF_KICAD_LIB"]))

    def test_a_published_file_naming_a_folder_outside_the_library_is_ignored(self) -> None:
        library = self.root / ".kicad-prism" / "libraries" / "lsf"
        library.mkdir(parents=True)
        (library / libs.PUBLISHED_FILE).write_text(
            json.dumps({"source": "x#", "commit": COMMIT, "dir": "../../.."}), encoding="utf-8"
        )
        with Configured(self.root, row()):
            self.assertEqual(dict(libs.snapshot({}).bindings), {})

    def test_a_garbled_published_file_serves_nothing(self) -> None:
        library = self.root / ".kicad-prism" / "libraries" / "lsf"
        library.mkdir(parents=True)
        (library / libs.PUBLISHED_FILE).write_text("{not json", encoding="utf-8")
        with Configured(self.root, row()):
            self.assertEqual(dict(libs.snapshot({}).bindings), {})


class PrecedenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        publish(self.root, "lsf", COMMIT)

    def test_a_folder_the_environment_sets_wins_over_the_library(self) -> None:
        mine = str(self.root / "mine")
        os.mkdir(mine)
        with Configured(self.root, row()):
            snapshot = libs.snapshot({"LSF_KICAD_LIB": mine})
        self.assertNotIn("LSF_KICAD_LIB", snapshot.bindings)
        self.assertEqual(snapshot.overridden, {"LSF_KICAD_LIB": "lsf"})
        self.assertEqual(snapshot.env({"LSF_KICAD_LIB": mine})["LSF_KICAD_LIB"], mine)
        self.assertEqual(snapshot.folder_of("LSF_KICAD_LIB"), Path(mine))
        fingerprint = snapshot.fingerprints(["LSF_KICAD_LIB"])["LSF_KICAD_LIB"]
        self.assertTrue(fingerprint.startswith("env:"))
        self.assertNotIn(mine, fingerprint, "the value is the server's own and is written to disk")

    def test_an_environment_value_that_is_not_a_folder_leaves_the_library_bound(self) -> None:
        with Configured(self.root, row()):
            snapshot = libs.snapshot({"LSF_KICAD_LIB": "/no/such/folder"})
        self.assertIn("LSF_KICAD_LIB", snapshot.bindings)
        self.assertEqual(snapshot.overridden, {})

    def test_a_board_cannot_read_the_servers_own_environment(self) -> None:
        folder = str(self.root)
        environ = {
            "SESSION_SECRET": folder,  # a setting, even one that names a folder
            "HOME": folder,  # the process's plumbing
            "GIT_DIR": folder,  # a reserved prefix
            "POSTGRES_PASSWORD": "hunter2",  # a secret that is not a folder
            "GITHUB_TOKEN": "ghp_x",
        }
        snapshot = libs.Snapshot(environ=environ)
        for name in environ:
            with self.subTest(name=name):
                self.assertIsNone(snapshot.folder_of(name))
                self.assertFalse(snapshot.defines(name))
                self.assertEqual(snapshot.fingerprints([name]), {name: None})

    def test_an_environment_folder_a_library_could_bind_is_defined(self) -> None:
        snapshot = libs.Snapshot(environ={"TEAM_LIB": str(self.root)})
        self.assertTrue(snapshot.defines("TEAM_LIB"))
        first = snapshot.fingerprints(["TEAM_LIB"])
        moved = libs.Snapshot(environ={"TEAM_LIB": str(self.root / ".kicad-prism")}).fingerprints(["TEAM_LIB"])
        self.assertNotEqual(first, moved, "another folder is another fingerprint")

    def test_an_empty_environment_value_does_not_count_as_set(self) -> None:
        with Configured(self.root, row()):
            snapshot = libs.snapshot({"LSF_KICAD_LIB": ""})
        self.assertIn("LSF_KICAD_LIB", snapshot.bindings)

    def test_a_library_binds_a_variable_the_environment_lacks(self) -> None:
        with Configured(self.root, row()):
            snapshot = libs.snapshot({})
        self.assertEqual(snapshot.env({"A": "1"})["LSF_KICAD_LIB"], str(snapshot.bindings["LSF_KICAD_LIB"].folder))
        self.assertEqual(snapshot.env({"A": "1"})["A"], "1")

    def test_an_unknown_variable_has_no_fingerprint(self) -> None:
        with Configured(self.root, row()):
            snapshot = libs.snapshot({})
        self.assertEqual(snapshot.fingerprints(["NOPE_LIB"]), {"NOPE_LIB": None})

    def test_two_libraries_cannot_bind_one_variable(self) -> None:
        with Configured(self.root, row(), row(name="other")):
            libraries, problems = libs.configured()
        self.assertEqual([lib.name for lib in libraries], ["lsf"])
        self.assertEqual(len(problems), 1)

    def test_an_invalid_row_is_reported_and_skipped(self) -> None:
        with Configured(self.root, row(variables=("PATH",))):
            libraries, problems = libs.configured()
        self.assertEqual(libraries, ())
        self.assertIn("PATH", problems[0])

    def test_model_dir_arguments_carry_the_environments_stock_variables_and_every_binding(self) -> None:
        stock = str(self.root / "stock9")
        os.mkdir(stock)
        with Configured(self.root, row()):
            snapshot = libs.snapshot({"KICAD9_3DMODEL_DIR": stock, "KICAD8_3DMODEL_DIR": "/gone", "UNRELATED": "x"})
        arguments = snapshot.model_dir_args()
        self.assertIn(f"KICAD9_3DMODEL_DIR={stock}", arguments)
        self.assertFalse(any("KICAD8_3DMODEL_DIR" in a for a in arguments), "a value that is not a folder is not passed")
        self.assertTrue(any(a.startswith("LSF_KICAD_LIB=") for a in arguments))
        self.assertFalse(any("UNRELATED" in a for a in arguments))

    def test_no_libraries_binds_and_defines_nothing(self) -> None:
        self.assertEqual(libs.NO_LIBRARIES.env({"A": "1"}), {"A": "1"})
        self.assertEqual(libs.NO_LIBRARIES.fingerprints(["LSF_KICAD_LIB"]), {"LSF_KICAD_LIB": None})
        self.assertEqual(libs.NO_LIBRARIES.model_dir_args(), [])


class PinningTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_a_pinned_snapshot_is_not_moved_by_a_library_publishing_during_the_job(self) -> None:
        publish(self.root, "lsf", COMMIT)
        with Configured(self.root, row()):
            with libs.pinned() as taken:
                library = self.root / ".kicad-prism" / "libraries" / "lsf"
                (library / OTHER).mkdir()
                (library / libs.PUBLISHED_FILE).write_text(
                    json.dumps({"source": "https://gitlab.com/lsf/lsf-kicad-lib.git#", "commit": OTHER, "dir": OTHER}),
                    encoding="utf-8",
                )
                self.assertIs(libs.current(), taken)
                self.assertTrue(libs.current().bindings["LSF_KICAD_LIB"].fingerprint.endswith(COMMIT))
            self.assertTrue(libs.current().bindings["LSF_KICAD_LIB"].fingerprint.endswith(OTHER))

    def test_an_unpinned_process_takes_a_fresh_snapshot_each_time(self) -> None:
        with Configured(self.root, row()):
            self.assertEqual(dict(libs.current().bindings), {})
            publish(self.root, "lsf", COMMIT)
            self.assertIn("LSF_KICAD_LIB", libs.current().bindings)


class OpenFileTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        publish(self.root, "lsf", COMMIT, {"layouts/A4.kicad_wks": "sheet"})
        (self.root / "secret.txt").write_text("no", encoding="utf-8")

    def test_a_file_below_the_library_opens(self) -> None:
        with Configured(self.root, row()), libs.pinned(libs.snapshot({})) as taken:
            handle = libs.open_file("LSF_KICAD_LIB", "layouts/A4.kicad_wks", using=taken)
            self.assertIsNotNone(handle)
            with handle:
                self.assertEqual(handle.read(), b"sheet")

    def test_a_path_leaving_the_library_is_refused(self) -> None:
        with Configured(self.root, row()):
            taken = libs.snapshot({})
            for relative in ("../../../../secret.txt", "/etc/passwd", "..\\..\\secret.txt", "", "layouts"):
                with self.subTest(relative=relative):
                    self.assertIsNone(libs.open_file("LSF_KICAD_LIB", relative, using=taken))

    def test_an_unbound_variable_opens_nothing(self) -> None:
        with Configured(self.root, row()):
            self.assertIsNone(libs.open_file("NOPE_LIB", "x", using=libs.snapshot({})))

    @unittest.skipUnless(hasattr(os, "symlink"), "needs symlinks")
    def test_a_link_pointing_out_of_the_library_is_refused(self) -> None:
        link = self.root / ".kicad-prism" / "libraries" / "lsf" / COMMIT / "escape.txt"
        try:
            os.symlink(self.root / "secret.txt", link)
        except OSError:
            self.skipTest("symlinks are not permitted here")
        with Configured(self.root, row()):
            self.assertIsNone(libs.open_file("LSF_KICAD_LIB", "escape.txt", using=libs.snapshot({})))


class PathLibraryTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        self.mount = self.root / "mount"
        (self.mount / "team" / "3d").mkdir(parents=True)
        self.projects = self.root / "projects"
        self.projects.mkdir()

    def entry(self, **fields: object) -> dict:
        return {"name": "team", "variables": ["TEAM_LIB"], "path": "team/3d", **fields}

    def test_a_folder_under_the_mount_binds_and_its_fingerprint_follows_the_generation(self) -> None:
        with Configured(self.projects, self.entry(), mount=self.mount):
            first = libs.snapshot({}).fingerprints(["TEAM_LIB"])
        with Configured(self.projects, self.entry(generation=2), mount=self.mount):
            second = libs.snapshot({}).fingerprints(["TEAM_LIB"])
        self.assertEqual(first, {"TEAM_LIB": "path:team/3d#g1"})
        self.assertEqual(second, {"TEAM_LIB": "path:team/3d#g2"})

    def test_path_libraries_are_off_without_a_mount_root(self) -> None:
        with Configured(self.projects, self.entry()):
            self.assertEqual(dict(libs.snapshot({}).bindings), {})

    def test_a_missing_folder_serves_nothing(self) -> None:
        with Configured(self.projects, self.entry(path="team/absent"), mount=self.mount):
            self.assertEqual(dict(libs.snapshot({}).bindings), {})

    def test_a_mount_root_that_reaches_the_projects_root_serves_nothing_and_stops_startup(self) -> None:
        (self.projects / "team" / "3d").mkdir(parents=True)
        for label, mount in (("the same folder", self.projects), ("above it", self.root), ("inside it", self.projects / "team")):
            entry = self.entry(path="3d") if label == "inside it" else self.entry()
            with self.subTest(label), Configured(self.projects, entry, mount=mount):
                self.assertIn("KICAD_PROJECTS_ROOT", libs.mount_root_problem())
                self.assertEqual(dict(libs.snapshot({}).bindings), {})
                with mock.patch("sys.stderr"), self.assertRaises(SystemExit):
                    libs.verify_mount_root_or_exit("The worker")

    def test_a_mount_root_beside_the_projects_root_is_fine(self) -> None:
        with Configured(self.projects, self.entry(), mount=self.mount):
            self.assertIsNone(libs.mount_root_problem())
            libs.verify_mount_root_or_exit("The worker")

    def test_a_path_outside_the_mount_is_refused(self) -> None:
        for path in ("../mount2", "/etc", "C:/x"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                libs.validate_entry(self.entry(path=path))

    @unittest.skipUnless(hasattr(os, "symlink"), "needs symlinks")
    def test_a_link_inside_the_mount_pointing_out_is_not_followed(self) -> None:
        outside = self.root / "outside"
        outside.mkdir()
        try:
            os.symlink(outside, self.mount / "team" / "link", target_is_directory=True)
        except OSError:
            self.skipTest("symlinks are not permitted here")
        with Configured(self.projects, self.entry(path="team/link"), mount=self.mount):
            self.assertEqual(dict(libs.snapshot({}).bindings), {})


class ConsumerTests(unittest.TestCase):
    """What the tools, keys and arguments that read the snapshot do with it."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        self.folder = publish(self.root, "lsf", COMMIT)

    def run_tool(self, **kwargs: object) -> str:
        from app.services import kicad_tools

        tool = kicad_tools.LocalTool("probe", lambda: sys.executable, isolate=False, **kwargs)
        result = tool.run(["-c", "import os; print(os.environ.get('LSF_KICAD_LIB', ''))"], timeout=30)
        return result.stdout.strip()

    def test_a_tool_runs_with_the_pinned_snapshots_variables(self) -> None:
        with Configured(self.root, row()), libs.pinned():
            self.assertEqual(self.run_tool(), str(self.folder))

    def test_a_tool_that_opts_out_sees_no_library(self) -> None:
        with Configured(self.root, row()), libs.pinned():
            self.assertEqual(self.run_tool(libraries=libs.NO_LIBRARIES), "")

    def test_a_tool_keeps_the_snapshot_it_started_with_when_a_library_publishes_later(self) -> None:
        with Configured(self.root, row()), libs.pinned():
            library = self.root / ".kicad-prism" / "libraries" / "lsf"
            (library / OTHER).mkdir()
            (library / libs.PUBLISHED_FILE).write_text(
                json.dumps({"source": "https://gitlab.com/lsf/lsf-kicad-lib.git#", "commit": OTHER, "dir": OTHER}),
                encoding="utf-8",
            )
            self.assertEqual(self.run_tool(), str(self.folder))

    def test_the_catalogs_cli_sees_no_library(self) -> None:
        from app.services import kicad_tools

        with Configured(self.root, row()), libs.pinned():
            tool = kicad_tools.kicad_cli(libraries=libs.NO_LIBRARIES)
            self.assertIs(tool._libraries, libs.NO_LIBRARIES)
            self.assertIs(tool.with_cancel(None)._libraries, libs.NO_LIBRARIES)

    def test_prism_kicad_is_told_every_bound_directory(self) -> None:
        from app.services.design_bundle import stage_models

        with Configured(self.root, row()), libs.pinned(),                 mock.patch.object(stage_models.settings, "GEOMETER_EXECUTABLE", "/opt/geometer"),                 mock.patch.object(stage_models.settings, "KICAD_PROJECTS_ROOT", str(self.root)):
            args = stage_models.hlr_args()
        self.assertIn(f"LSF_KICAD_LIB={self.folder}", args)

    def test_the_release_studio_render_key_moves_with_a_librarys_commit_and_not_its_mount(self) -> None:
        from app.release_studio.documents import render_cache

        board = self.root / "board.kicad_pcb"
        board.write_text("(kicad_pcb)", encoding="utf-8")

        def key() -> str:
            with mock.patch.object(render_cache, "_board_inputs_digest", return_value="d"):
                return render_cache.cache_key(board=board, render_args=["pcb"], cli_version="10", environ={})

        with Configured(self.root, row()):
            before = key()
        with tempfile.TemporaryDirectory() as other:
            publish(Path(other), "lsf", COMMIT)
            with Configured(Path(other), row()):
                elsewhere = key()
        self.assertEqual(before, elsewhere)
        newer = self.root / ".kicad-prism" / "libraries" / "lsf"
        (newer / OTHER).mkdir()
        (newer / libs.PUBLISHED_FILE).write_text(
            json.dumps({"source": "https://gitlab.com/lsf/lsf-kicad-lib.git#", "commit": OTHER, "dir": OTHER}),
            encoding="utf-8",
        )
        with Configured(self.root, row()):
            self.assertNotEqual(before, key())
        with Configured(self.root):
            self.assertNotEqual(before, key())

    def test_a_3d_render_is_drawn_again_when_a_library_changes_and_a_2d_plot_is_not(self) -> None:
        from app.services.design_render import service

        three_d, plot = {"view": "3d"}, {"view": "pcb"}
        with Configured(self.root):
            plain = service.render_id("p", "c" * 40, three_d, service.library_fingerprints(three_d))
            self.assertEqual(plain, service.render_id("p", "c" * 40, three_d), "no library bound: the id is unchanged")
        with Configured(self.root, row()):
            bound = service.render_id("p", "c" * 40, three_d, service.library_fingerprints(three_d))
            self.assertNotEqual(bound, plain)
            self.assertEqual(service.library_fingerprints(plot), {})
            self.assertEqual(
                service.render_id("p", "c" * 40, plot, service.library_fingerprints(plot)),
                service.render_id("p", "c" * 40, plot),
            )


if __name__ == "__main__":
    unittest.main()
