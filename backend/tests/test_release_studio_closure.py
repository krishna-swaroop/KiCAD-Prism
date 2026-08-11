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
    ExternalPathError,
    LfsMaterializationError,
    PinnedToolchainResource,
    materialize_input_closure,
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

    def test_monorepo_external_host_library_path_is_rejected(self) -> None:
        self.repo.joinpath("hardware/board/model.step").write_bytes(b"small hydrated STEP payload\n")
        self.repo.joinpath("hardware/board/fp-lib-table").write_text(
            '(fp_lib_table (version 7) '
            '(lib (name "Host") (type "KiCad") '
            '(uri "/tmp/host-only-footprints") (options "") (descr "")))\n',
            encoding="utf-8",
        )
        hostile_commit = self._commit(self.repo, "host path")
        with self.assertRaisesRegex(ExternalPathError, "escapes"):
            materialize_input_closure(
                self.repo,
                hostile_commit,
                self.root / "host-rejected",
                relative_path="hardware/board",
            )

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
        resource_digest = hashlib.sha256(b"pinned-resource").hexdigest()
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
                "KICAD10_FOOTPRINT_DIR": PinnedToolchainResource(
                    "KICAD10_FOOTPRINT_DIR", copied_toolchain, resource_digest
                )
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
