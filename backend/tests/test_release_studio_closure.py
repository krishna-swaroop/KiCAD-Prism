"""Dynamic, offline Git fixtures for the Release Studio input closure."""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from app.release_studio.canonical import sha256_canonical
from app.release_studio.closure import (
    ClosureError,
    LfsMaterializationError,
    PinnedToolchainResource,
    materialize_input_closure,
    resource_root_digest,
)


GIT = shutil.which("git")


@unittest.skipUnless(GIT, "git is required for closure fixtures")
class ReleaseStudioClosureTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.root = Path(self._temporary.name)
        self.repo = self.root / "monorepo"
        self.nested = self.root / "nested-library"
        self.submodule = self.root / "board-library"
        self._init_repo(self.nested)
        (self.nested / "nested-footprint.kicad_mod").write_text(
            "(footprint nested)", encoding="utf-8"
        )
        self.nested_commit = self._commit(self.nested, "nested library")

        self._init_repo(self.submodule)
        (self.submodule / "submodule-footprint.kicad_mod").write_text(
            "(footprint submodule)", encoding="utf-8"
        )
        self._git(
            self.submodule,
            "-c",
            "protocol.file.allow=always",
            "submodule",
            "add",
            "--quiet",
            str(self.nested),
            "nested",
        )
        self.submodule_commit = self._commit(self.submodule, "board library")

        self._init_repo(self.repo)
        (self.repo / "common/footprints/Common.pretty").mkdir(parents=True)
        (self.repo / "common/symbols").mkdir(parents=True)
        (self.repo / "common/footprints/Common.pretty/common.kicad_mod").write_text(
            "(footprint common)", encoding="utf-8"
        )
        (self.repo / "common/symbols/Common.kicad_sym").write_text(
            "(kicad_symbol_lib)", encoding="utf-8"
        )
        (self.repo / "hardware/board/.prism/release-studio").mkdir(parents=True)
        (self.repo / "hardware/board/.prism/release-studio/release.yaml").write_text(
            "name: fixture\n", encoding="utf-8"
        )
        (self.repo / "hardware/board/fp-lib-table").write_text(
            '(fp_lib_table\n'
            '  (version 7)\n'
            '  (lib (name "Common") (type "KiCad") '
            '(uri "${KIPRJMOD}/../../common/footprints") '
            '(options "") (descr ""))\n'
            ')\n',
            encoding="utf-8",
        )
        (self.repo / "hardware/board/sym-lib-table").write_text(
            '(sym_lib_table\n'
            '  (version 7)\n'
            '  (lib (name "Common") (type "KiCad") '
            '(uri "${KIPRJMOD}/../../common/symbols/Common.kicad_sym") '
            '(options "") (descr ""))\n'
            ')\n',
            encoding="utf-8",
        )
        (self.repo / "hardware/board/board.kicad_pcb").write_text(
            '(kicad_pcb (version 20240108) '
            '(general (thickness 1.6)) '
            '(model "${KIPRJMOD}/model.step"))\n',
            encoding="utf-8",
        )
        (self.repo / "hardware/board/model.step").write_bytes(self.lfs_pointer())
        self._git(
            self.repo,
            "-c",
            "protocol.file.allow=always",
            "submodule",
            "add",
            "--quiet",
            str(self.submodule),
            "vendor/board-library",
        )
        self._git(
            self.repo,
            "-c",
            "protocol.file.allow=always",
            "submodule",
            "update",
            "--init",
            "--recursive",
        )
        (self.repo / ".prism/release-studio/project.yaml").parent.mkdir(
            parents=True, exist_ok=True
        )
        (self.repo / ".prism/release-studio/project.yaml").write_text(
            "closure: whole-tree\n", encoding="utf-8"
        )
        self.commit = self._commit(self.repo, "release fixture")

    def tearDown(self) -> None:
        self._temporary.cleanup()

    def test_full_tree_recursive_submodules_lfs_and_digest_are_deterministic(self) -> None:
        payload = b"small hydrated STEP payload\n"
        source_lfs_path = self.repo / "hardware/board/model.step"
        clone = self.root / "monorepo-independent-clone"
        self._git(
            self.root,
            "-c",
            "protocol.file.allow=always",
            "clone",
            "--quiet",
            "--no-local",
            "--recurse-submodules",
            str(self.repo),
            str(clone),
        )
        self.assertEqual(self._git(clone, "rev-parse", "HEAD").strip(), self.commit)
        # Clone-local submodule URL/config state may contain different host
        # paths, but the recorded commit tree and gitlinks must be identical.
        self.assertEqual(
            self._git(self.repo, "ls-tree", "-r", "--full-tree", self.commit),
            self._git(clone, "ls-tree", "-r", "--full-tree", self.commit),
        )
        source_lfs_path.write_bytes(payload)
        clone_lfs_path = clone / "hardware/board/model.step"
        clone_lfs_path.write_bytes(payload)
        before_status = self._status(self.repo)
        clone_before_status = self._status(clone)
        before_source = source_lfs_path.read_bytes()
        clone_before_source = clone_lfs_path.read_bytes()

        destination = self.root / "materialized-a"
        second_destination = self.root / "materialized-b"
        first = materialize_input_closure(
            self.repo,
            self.commit,
            destination,
            relative_path="hardware/board",
        )
        second = materialize_input_closure(
            clone,
            self.commit,
            second_destination,
            relative_path="hardware/board",
        )

        self.assertEqual(first.input_closure_digest, second.input_closure_digest)
        self.assertEqual(first.input_closure_digest, sha256_canonical(first.to_dict(False)))
        self.assertEqual(first.to_dict(), second.to_dict())
        record_text = repr(first.to_dict())
        for host_path in (self.repo, clone, destination, second_destination):
            self.assertNotIn(str(host_path), record_text)
        self.assertEqual(
            (destination / ".prism/release-studio/project.yaml").read_text(),
            "closure: whole-tree\n",
        )
        self.assertEqual(
            (destination / "hardware/board/.prism/release-studio/release.yaml").read_text(),
            "name: fixture\n",
        )
        self.assertEqual(
            (destination / "vendor/board-library/submodule-footprint.kicad_mod").read_text(),
            "(footprint submodule)",
        )
        self.assertEqual(
            (destination / "vendor/board-library/nested/nested-footprint.kicad_mod").read_text(),
            "(footprint nested)",
        )
        self.assertIn("vendor/board-library/nested/nested-footprint.kicad_mod",
                      {item.path for item in first.repository_inputs})
        self.assertEqual(
            {item.path for item in first.submodule_inputs},
            {"vendor/board-library", "vendor/board-library/nested"},
        )
        self.assertEqual(first.lfs_inputs[0].pointer_blob_sha, self._blob_sha(self.commit))
        self.assertEqual(first.lfs_inputs[0].lfs_oid, f"sha256:{hashlib.sha256(payload).hexdigest()}")
        self.assertEqual(first.lfs_inputs[0].materialized_digest, hashlib.sha256(payload).hexdigest())
        self.assertEqual(first.env_bindings[0].name, "KIPRJMOD")
        self.assertEqual(first.env_bindings[0].value, "hardware/board")
        self.assertIn(
            "common/footprints",
            {reference.resolved_path for reference in first.library_references},
        )
        self.assertEqual(before_status, self._status(self.repo))
        self.assertEqual(before_source, source_lfs_path.read_bytes())
        self.assertEqual(clone_before_status, self._status(clone))
        self.assertEqual(clone_before_source, clone_lfs_path.read_bytes())

    def test_unmaterialized_and_mismatched_lfs_content_fail_closed(self) -> None:
        with self.assertRaisesRegex(LfsMaterializationError, "unmaterialized"):
            materialize_input_closure(self.repo, self.commit, self.root / "pointer")

        self.repo.joinpath("hardware/board/model.step").write_bytes(b"wrong bytes")
        with self.assertRaisesRegex(LfsMaterializationError, r"(size|sha256) mismatch"):
            materialize_input_closure(self.repo, self.commit, self.root / "mismatch")

    def test_host_library_table_paths_are_recorded_not_fatal(self) -> None:
        self.repo.joinpath("hardware/board/model.step").write_bytes(b"small hydrated STEP payload\n")
        self.repo.joinpath("hardware/board/fp-lib-table").write_text(
            '(fp_lib_table (version 7) '
            '(lib (name "Host") (type "KiCad") '
            '(uri "/tmp/host-only-footprints") (options "") (descr "")))\n',
            encoding="utf-8",
        )
        hostile_commit = self._commit(self.repo, "host path")
        # Recorded, and not fatal: the closure still materializes, so a
        # documentation build is never refused over a library table.
        closure = materialize_input_closure(
            self.repo,
            hostile_commit,
            self.root / "host-recorded",
            relative_path="hardware/board",
        )
        # A footprint library is a real input. Calling it advisory would let a
        # build whose footprints came off the host record itself as hermetic,
        # so it counts against hermeticity even though it does not block.
        self.assertTrue(
            any("/tmp/host-only-footprints" in reason for reason in closure.non_hermetic_reasons())
        )
        self.assertEqual(closure.advisory_reasons(), [])

    def test_hermeticity_still_distinguishes_a_clean_closure(self) -> None:
        """The flag has to be able to say no, or recording it means nothing.

        Pinned alongside the two tests above: they prove an off-closure input
        makes `hermetic` false, and this proves an ordinary board leaves it
        true. Without both, a regression that hard-codes either answer passes.
        """

        self.repo.joinpath("hardware/board/model.step").write_bytes(
            b"small hydrated STEP payload\n"
        )
        commit = self._commit(self.repo, "clean closure")
        closure = materialize_input_closure(
            self.repo,
            commit,
            self.root / "clean",
            relative_path="hardware/board",
        )
        self.assertEqual(closure.non_hermetic_reasons(), [])

    def test_a_missing_library_table_entry_is_recorded_not_fatal(self) -> None:
        self.repo.joinpath("hardware/board/model.step").write_bytes(
            b"small hydrated STEP payload\n"
        )
        self.repo.joinpath("hardware/board/fp-lib-table").write_text(
            '(fp_lib_table (version 7) '
            '(lib (name "Gone") (type "KiCad") '
            '(uri "${KIPRJMOD}/libraries/absent.pretty") (options "") (descr "")))\n',
            encoding="utf-8",
        )
        commit = self._commit(self.repo, "missing footprint library")
        closure = materialize_input_closure(
            self.repo,
            commit,
            self.root / "missing-lib",
            relative_path="hardware/board",
        )
        # Same rule as the host-absolute URI above: a footprint library the
        # design names but the closure does not hold is a hermeticity finding,
        # reported rather than fatal.
        self.assertTrue(
            any("absent.pretty" in reason for reason in closure.non_hermetic_reasons())
        )
        self.assertEqual(closure.advisory_reasons(), [])

    def test_a_stock_3d_model_reference_is_advisory_not_a_blocker(self) -> None:
        # Every real KiCad board carries `(model "${KICAD9_3DMODEL_DIR}/...")`
        # nodes pointing at the stock 3D library, which the pinned executor
        # image does not ship.  No Stage 1 manufacturing step reads one, so the
        # closure records the offending path and says so -- but it does not
        # count against hermeticity, because the released outputs do not depend
        # on it and a release must not be blocked by it.
        self.repo.joinpath("hardware/board/model.step").write_bytes(
            b"small hydrated STEP payload\n"
        )
        self.repo.joinpath("hardware/board/board.kicad_pcb").write_text(
            '(kicad_pcb (version 20240108) '
            '(general (thickness 1.6)) '
            '(model "${KIPRJMOD}/model.step") '
            '(model "${KICAD9_3DMODEL_DIR}/Resistor_SMD.3dshapes/R_0603.step"))\n',
            encoding="utf-8",
        )
        commit = self._commit(self.repo, "stock 3d model reference")

        closure = materialize_input_closure(
            self.repo,
            commit,
            self.root / "stock-3d",
            relative_path="hardware/board",
        )

        self.assertEqual(closure.external_references, ())
        self.assertEqual(closure.non_hermetic_reasons(), [])

        advisory = closure.advisory_references
        self.assertEqual(len(advisory), 1)
        self.assertEqual(advisory[0].source_path, "hardware/board/board.kicad_pcb")
        self.assertIn("KICAD9_3DMODEL_DIR", advisory[0].reference)
        self.assertTrue(advisory[0].advisory)
        notes = closure.advisory_reasons()
        self.assertEqual(len(notes), 1)
        self.assertIn("R_0603.step", notes[0])
        self.assertIn("no build step reads it", notes[0])
        # The project's own model still resolves into the closure.
        self.assertIn(
            "hardware/board/model.step",
            {
                reference.resolved_path
                for reference in closure.library_references
                if reference.location == "closure"
            },
        )

    def test_a_comma_in_a_quoted_model_path_is_not_truncated(self) -> None:
        # The unquoted-variable scan stops at `,`, so running it over a quoted
        # value invented a reference to `.../BUK9K18-40E` for a real file named
        # `BUK9K18-40E,115.stp` -- and then failed the build because the
        # invented path does not exist.
        self.repo.joinpath("hardware/board/model.step").write_bytes(
            b"small hydrated STEP payload\n"
        )
        models = self.repo / "hardware/board/packages3D"
        models.mkdir(parents=True, exist_ok=True)
        (models / "BUK9K18-40E,115.stp").write_text("solid", encoding="utf-8")
        self.repo.joinpath("hardware/board/board.kicad_pcb").write_text(
            '(kicad_pcb (version 20240108) '
            '(general (thickness 1.6)) '
            '(model "${KIPRJMOD}/packages3D/BUK9K18-40E,115.stp"))\n',
            encoding="utf-8",
        )
        commit = self._commit(self.repo, "comma in a model filename")

        closure = materialize_input_closure(
            self.repo,
            commit,
            self.root / "comma",
            relative_path="hardware/board",
        )

        self.assertEqual(closure.non_hermetic_reasons(), [])
        self.assertIn(
            "hardware/board/packages3D/BUK9K18-40E,115.stp",
            {
                reference.resolved_path
                for reference in closure.library_references
                if reference.location == "closure"
            },
        )

    def test_a_model_missing_from_the_closure_is_advisory_not_a_blocker(self) -> None:
        # Boards routinely carry stale `(model ...)` paths whose case or
        # extension no longer matches the file on disk.  No Stage 1 step reads
        # them, so they are reported and do not block a release.
        self.repo.joinpath("hardware/board/model.step").write_bytes(
            b"small hydrated STEP payload\n"
        )
        self.repo.joinpath("hardware/board/board.kicad_pcb").write_text(
            '(kicad_pcb (version 20240108) '
            '(general (thickness 1.6)) '
            '(model "${KIPRJMOD}/packages3D/Absent.STEP"))\n',
            encoding="utf-8",
        )
        commit = self._commit(self.repo, "stale model path")

        closure = materialize_input_closure(
            self.repo,
            commit,
            self.root / "stale-model",
            relative_path="hardware/board",
        )

        self.assertEqual(closure.non_hermetic_reasons(), [])
        advisory = closure.advisory_references
        self.assertEqual(len(advisory), 1)
        self.assertEqual(advisory[0].location, "missing")
        notes = closure.advisory_reasons()
        self.assertEqual(len(notes), 1)
        self.assertIn("is not present in the release closure", notes[0])
        self.assertIn("Absent.STEP", notes[0])

    def test_only_this_designs_files_are_scanned_for_path_references(self) -> None:
        """An archived revision's stale paths are not defects in this release.

        Scanning every KiCad file in the repository made a project's own
        `archive/` directory the source of most of its hermeticity findings --
        for boards that are not in the release and are not built.
        """

        board = self.repo / "hardware/board"
        board.joinpath("model.step").write_bytes(b"small hydrated STEP payload\n")

        # An archived board and its schematic, both carrying an unresolvable
        # library path of the kind that used to fail the whole closure.
        archive = board / "archive/rev-a"
        archive.mkdir(parents=True, exist_ok=True)
        for name in ("old.kicad_pcb", "old.kicad_sch"):
            archive.joinpath(name).write_text(
                '(kicad_pcb (lib (uri "${NOT_BOUND_ANYWHERE}/gone.pretty")))\n',
                encoding="utf-8",
            )

        # The design itself: a root schematic pointing into `Subsheets/`, one
        # of which points on to a third sheet.
        board.joinpath("board.kicad_sch").write_text(
            '(kicad_sch (sheet (property "Sheetfile" "Subsheets/power.kicad_sch")))\n',
            encoding="utf-8",
        )
        subsheets = board / "Subsheets"
        subsheets.mkdir(parents=True, exist_ok=True)
        subsheets.joinpath("power.kicad_sch").write_text(
            '(kicad_sch (sheet (property "Sheetfile" "regulator.kicad_sch")))\n',
            encoding="utf-8",
        )
        subsheets.joinpath("regulator.kicad_sch").write_text(
            '(kicad_sch (model "${KIPRJMOD}/model.step"))\n', encoding="utf-8"
        )
        # Filed with its siblings but not instantiated: still part of the design.
        subsheets.joinpath("detached.kicad_sch").write_text(
            '(kicad_sch (model "${KIPRJMOD}/model.step"))\n', encoding="utf-8"
        )
        commit = self._commit(self.repo, "archive and hierarchy")

        closure = materialize_input_closure(
            self.repo, commit, self.root / "scoped", relative_path="hardware/board"
        )

        # The archived revision contributed nothing at all.
        self.assertEqual(closure.non_hermetic_reasons(), [])
        sources = {reference.source_path for reference in closure.library_references}
        self.assertFalse(
            {path for path in sources if "archive/" in path},
            f"an archived revision was scanned: {sources}",
        )
        # The design's own hierarchy was.
        self.assertIn("hardware/board/Subsheets/regulator.kicad_sch", sources)
        self.assertIn("hardware/board/Subsheets/detached.kicad_sch", sources)

    def test_symlink_and_regular_file_are_distinct_closure_inputs(self) -> None:
        repository = self.root / "link-repo"
        self._init_repo(repository)
        (repository / "payload.txt").write_text("same bytes", encoding="utf-8")
        (repository / "entry.txt").write_text("payload.txt", encoding="utf-8")
        regular_commit = self._commit(repository, "regular entry")
        (repository / "entry.txt").unlink()
        (repository / "entry.txt").symlink_to("payload.txt")
        symlink_commit = self._commit(repository, "symlink entry")

        regular = materialize_input_closure(
            repository, regular_commit, self.root / "regular"
        )
        symlink = materialize_input_closure(
            repository, symlink_commit, self.root / "symlink"
        )

        self.assertNotEqual(regular.input_closure_digest, symlink.input_closure_digest)
        regular_entry = next(item for item in regular.repository_inputs if item.path == "entry.txt")
        symlink_entry = next(item for item in symlink.repository_inputs if item.path == "entry.txt")
        self.assertEqual(regular_entry.type, "regular_file")
        self.assertEqual(symlink_entry.type, "symlink")
        self.assertEqual(regular_entry.git_object_id, symlink_entry.git_object_id)
        self.assertEqual(regular_entry.materialized_digest, symlink_entry.materialized_digest)
        self.assertTrue((self.root / "symlink/entry.txt").is_symlink())

    def test_explicit_toolchain_resource_is_a_stable_allowed_path(self) -> None:
        toolchain = self.root / "pinned-kicad/footprints"
        (toolchain / "Common.pretty").mkdir(parents=True)
        (toolchain / "Common.pretty/common.kicad_mod").write_text(
            "(footprint toolchain)", encoding="utf-8"
        )
        self.repo.joinpath("hardware/board/model.step").write_bytes(b"small hydrated STEP payload\n")
        self.repo.joinpath("hardware/board/fp-lib-table").write_text(
            '(fp_lib_table (version 7) '
            '(lib (name "Pinned") (type "KiCad") '
            '(uri "${KICAD10_FOOTPRINT_DIR}/Common.pretty") '
            '(options "") (descr "")))\n',
            encoding="utf-8",
        )
        resource_digest = resource_root_digest(toolchain)
        self.assertTrue(resource_digest)
        copied_toolchain = self.root / "pinned-kicad-copy/footprints"
        shutil.copytree(toolchain, copied_toolchain)
        pinned_commit = self._commit(self.repo, "pinned resource")
        closure = materialize_input_closure(
            self.repo,
            pinned_commit,
            self.root / "pinned-closure",
            relative_path="hardware/board",
            toolchain_resources={
                "KICAD10_FOOTPRINT_DIR": PinnedToolchainResource(
                    "KICAD10_FOOTPRINT_DIR", toolchain, resource_digest
                )
            },
        )
        copied_closure = materialize_input_closure(
            self.repo,
            pinned_commit,
            self.root / "pinned-closure-copy",
            relative_path="hardware/board",
            toolchain_resources={
                "KICAD10_FOOTPRINT_DIR": {
                    "root": copied_toolchain,
                    "digest": resource_digest,
                }
            },
        )
        self.assertEqual(closure.input_closure_digest, copied_closure.input_closure_digest)
        self.assertEqual(closure.to_dict(), copied_closure.to_dict())
        self.assertEqual(closure.toolchain_resources[0].digest, resource_digest)
        self.assertIn(
            "toolchain:KICAD10_FOOTPRINT_DIR/Common.pretty",
            {reference.resolved_path for reference in closure.library_references},
        )
        self.assertEqual(closure.env_bindings[0].value, "toolchain:KICAD10_FOOTPRINT_DIR")

        (toolchain / "Common.pretty/common.kicad_mod").write_text(
            "(footprint mutated)", encoding="utf-8"
        )
        with self.assertRaisesRegex(ClosureError, "digest mismatch"):
            materialize_input_closure(
                self.repo,
                pinned_commit,
                self.root / "pinned-closure-mutated",
                relative_path="hardware/board",
                toolchain_resources={
                    "KICAD10_FOOTPRINT_DIR": {
                        "root": toolchain,
                        "digest": resource_digest,
                    }
                },
            )

        with self.assertRaisesRegex(ClosureError, "no pinned digest"):
            materialize_input_closure(
                self.repo,
                pinned_commit,
                self.root / "pinned-closure-invalid",
                relative_path="hardware/board",
                toolchain_resources={
                    "KICAD10_FOOTPRINT_DIR": PinnedToolchainResource(
                        "KICAD10_FOOTPRINT_DIR", toolchain, ""
                    )
                },
            )

    def _init_repo(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        self._git(path, "init", "--quiet", "--initial-branch=main")
        self._git(path, "config", "user.name", "Release Studio Fixture")
        self._git(path, "config", "user.email", "release-studio@example.test")

    def _commit(self, path: Path, message: str) -> str:
        self._git(path, "add", "--all")
        self._git(path, "commit", "--quiet", "-m", message)
        return self._git(path, "rev-parse", "HEAD").strip()

    def _git(self, path: Path, *args: str) -> str:
        process = subprocess.run(
            [GIT or "git", "-C", str(path), *args],
            check=False,
            capture_output=True,
            text=True,
            shell=False,
        )
        if process.returncode:
            self.fail(f"git {' '.join(args)} failed:\n{process.stdout}\n{process.stderr}")
        return process.stdout

    def _status(self, path: Path) -> str:
        return self._git(path, "status", "--porcelain")

    def _blob_sha(self, commit: str) -> str:
        return self._git(
            self.repo,
            "rev-parse",
            f"{commit}:hardware/board/model.step",
        ).strip()

    def lfs_pointer(self) -> bytes:
        payload = b"small hydrated STEP payload\n"
        return (
            "version https://git-lfs.github.com/spec/v1\n"
            f"oid sha256:{hashlib.sha256(payload).hexdigest()}\n"
            f"size {len(payload)}\n"
        ).encode("ascii")


if __name__ == "__main__":
    unittest.main()


class PathReferenceDiscriminationTests(unittest.TestCase):
    """KiCad text variables are not library paths.

    A real board substitutes built-in *text* variables into field and
    drawing-sheet content. Treating a bare ``${DNP}`` as a library path failed
    the closure closed on boards that are perfectly hermetic, which is the
    worst kind of false negative: it blocks a correct release.
    """

    def test_builtin_text_variables_are_not_path_references(self) -> None:
        from app.release_studio.closure import _is_path_reference

        for value in (
            "${DNP}",
            "${REFERENCE}",
            "${VALUE}",
            "${FOOTPRINT}",
            "${DATASHEET}",
            "${ISSUE_DATE}",
            "${COMMENT1}",
            "${SHEETNAME}",
            "${SHEETPATH}",
            "${PROJECTNAME}",
            "${DNP} not fitted",
            # KiCad binds this itself for a special_execute job and it names an
            # output directory, so it can never resolve into the closure.
            "${JOBSET_OUTPUT_WORK_PATH}",
            "${JOBSET_OUTPUT_WORK_PATH}/archive.zip",
        ):
            with self.subTest(value=value):
                self.assertFalse(_is_path_reference(value))

    def test_genuine_path_references_are_still_detected(self) -> None:
        from app.release_studio.closure import _is_path_reference

        for value in (
            "${KIPRJMOD}",
            "${KIPRJMOD}/../../common/footprints",
            "${KICAD10_FOOTPRINT_DIR}",
            "${KICAD10_3DMODEL_DIR}/Resistor_SMD.3dshapes",
            "${MY_LIBRARY_PATH}",
            "some/relative/${VAR}/path",
        ):
            with self.subTest(value=value):
                self.assertTrue(_is_path_reference(value))

    def test_a_board_using_text_variables_still_closes(self) -> None:
        """End to end: a DNP-annotated board must not be rejected."""

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = root / "repo"
            self._init_repo(repo)
            (repo / "board.kicad_pcb").write_text(
                '(kicad_pcb (version 20240108)\n'
                '  (property "Reference" "${REFERENCE}")\n'
                '  (property "Fitted" "${DNP}")\n'
                '  (gr_text "Issued ${ISSUE_DATE}")\n'
                ')\n',
                encoding="utf-8",
            )
            commit = self._commit(repo, "board with text variables")

            closure = materialize_input_closure(repo, commit, root / "out")
            self.assertTrue(closure.input_closure_digest)
            self.assertEqual(closure.library_references, ())

    def _init_repo(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        self._git(path, "init", "--quiet", "--initial-branch=main")
        self._git(path, "config", "user.name", "Release Studio Fixture")
        self._git(path, "config", "user.email", "release-studio@example.test")

    def _commit(self, path: Path, message: str) -> str:
        self._git(path, "add", "--all")
        self._git(path, "commit", "--quiet", "-m", message)
        return self._git(path, "rev-parse", "HEAD").strip()

    def _git(self, path: Path, *args: str) -> str:
        process = subprocess.run(
            [GIT or "git", "-C", str(path), *args],
            check=True,
            capture_output=True,
            text=True,
            shell=False,
        )
        return process.stdout

    def test_a_jobset_special_execute_command_does_not_break_the_closure(self) -> None:
        """The reference jobset's plugin command must not fail a hermetic board.

        `Outputs.kicad_jobset` invokes InteractiveHtmlBom through
        `${KICAD9_3RD_PARTY}` inside a `special_execute` command that none of
        its outputs reference. Those paths belong to the command, not to the
        project, and R1 already classifies the job by type.
        """

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = root / "repo"
            self._init_repo(repo)
            (repo / "board.kicad_pcb").write_text("(kicad_pcb (version 20240108))\n")
            (repo / "Outputs.kicad_jobset").write_text(
                '{"jobs": [{"id": "x", "type": "special_execute", "settings": '
                '{"command": "python \\"${KICAD9_3RD_PARTY}plugins/ibom.py\\" '
                '--dest-dir \\"${JOBSET_OUTPUT_WORK_PATH}.\\""}}], "outputs": []}\n'
            )
            commit = self._commit(repo, "jobset with a plugin command")

            closure = materialize_input_closure(repo, commit, root / "out")
            self.assertTrue(closure.input_closure_digest)
            self.assertIn(
                "Outputs.kicad_jobset", {item.path for item in closure.repository_inputs}
            )
