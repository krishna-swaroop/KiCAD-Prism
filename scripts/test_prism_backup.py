"""Tests for the backup tool's pure logic.

Everything Docker-facing is left to the runbook's restore rehearsal; what is
covered here is the part that decides *what* goes into an archive and whether
one is safe to restore, which is where a silent mistake costs data.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import prism_backup


def member_names(archive_path: Path) -> set[str]:
    with tarfile.open(archive_path, "r:gz") as archive:
        return {
            name[2:] if name.startswith("./") else name
            for name in archive.getnames()
        }


class RegenerableContentTests(unittest.TestCase):
    def test_authoritative_component_store_is_kept(self) -> None:
        """The catalog's rows are useless without these files."""
        for path in (
            ".kicad-prism/components/symbols/Prism_R.kicad_sym",
            ".kicad-prism/components/footprints/R_0402.kicad_mod",
            ".kicad-prism/components/3dmodels/R_0402.step",
            ".kicad-prism/components/revisions/rev-1.json",
            "JTYU-OBC/JTYU-OBC.kicad_pcb",
        ):
            self.assertFalse(prism_backup.is_regenerable(path), path)

    def test_derived_output_is_dropped(self) -> None:
        for path in (
            ".kicad-prism/artifacts/job-1/out.glb",
            ".kicad-prism/bundles/project/scene.glb",
            ".kicad-prism/exports/kicad-dbl/library.sqlite",
            ".kicad-prism/validation/klc/run-3.json",
        ):
            self.assertTrue(prism_backup.is_regenerable(path), path)

    def test_a_prefix_match_is_not_a_path_match(self) -> None:
        """`components` must not be dropped because `cache` starts a rule."""
        self.assertFalse(prism_backup.is_regenerable(".kicad-prism/artifacts-authoritative/x"))
        self.assertFalse(prism_backup.is_regenerable(".kicad-prism/cached-work/x"))

    def test_leading_dot_slash_from_tarfile_is_handled(self) -> None:
        # tarfile hands the filter names like "./.kicad-prism/artifacts/x".
        self.assertTrue(prism_backup.is_regenerable("./.kicad-prism/artifacts/x"))


class ArchiveShapeTests(unittest.TestCase):
    def test_archiving_prunes_only_the_regenerable_tree(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "projects"
            for relative in (
                ".kicad-prism/components/symbols/a.kicad_sym",
                ".kicad-prism/artifacts/job/out.glb",
                "Board/Board.kicad_pcb",
            ):
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("x", encoding="utf-8")

            target = Path(tmp) / "projects.tar.gz"
            prism_backup.archive_directory(root, target, prune_regenerable=True)

            names = member_names(target)
            self.assertIn(".kicad-prism/components/symbols/a.kicad_sym", names)
            self.assertIn("Board/Board.kicad_pcb", names)
            self.assertNotIn(".kicad-prism/artifacts/job/out.glb", names)

    def test_ssh_payload_keeps_everything(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "ssh"
            root.mkdir()
            (root / "id_ed25519").write_text("key", encoding="utf-8")
            target = Path(tmp) / "ssh.tar.gz"

            prism_backup.archive_directory(root, target, prune_regenerable=False)

            self.assertIn("id_ed25519", member_names(target))


class ManifestTests(unittest.TestCase):
    def _manifest(self, **versions: str) -> dict:
        return prism_backup.build_manifest(
            created_at="20260727T101500Z",
            root=Path("/srv/prism"),
            env={
                "POSTGRES_USER": "kicad_prism",
                "POSTGRES_DB": "kicad_prism",
                "PRISM_BACKEND_IMAGE": "ghcr.io/x/backend@sha256:abc",
                "SESSION_SECRET": "must-not-appear",
            },
            versions=versions or {"workspace_schema": "7", "catalog_schema": "2"},
            entries={"postgres.dump": "0" * 64},
            hot=False,
        )

    def test_manifest_records_images_but_not_secrets(self) -> None:
        manifest = self._manifest()
        serialised = json.dumps(manifest)
        self.assertIn("PRISM_BACKEND_IMAGE", manifest["images"])
        self.assertNotIn("must-not-appear", serialised)
        self.assertNotIn("SESSION_SECRET", serialised)

    def test_restore_into_an_older_build_is_refused(self) -> None:
        """The archive's schema is ahead of the code being restored into."""
        manifest = self._manifest(workspace_schema="9", catalog_schema="2")

        problems = prism_backup.compare_versions(
            manifest, {"workspace_schema": "7", "catalog_schema": "2"}
        )

        self.assertEqual(len(problems), 1)
        self.assertIn("downgrade", problems[0])

    def test_restore_into_a_newer_build_is_allowed(self) -> None:
        """Forward is the normal case: startup migrations carry it the rest."""
        manifest = self._manifest(workspace_schema="5", catalog_schema="1")

        self.assertEqual(
            prism_backup.compare_versions(
                manifest, {"workspace_schema": "7", "catalog_schema": "2"}
            ),
            [],
        )

    def test_a_foreign_archive_is_rejected(self) -> None:
        manifest = dict(self._manifest(), schema="something.else")
        problems = prism_backup.compare_versions(manifest, {})
        self.assertTrue(any("schema" in problem for problem in problems))

    def test_an_unreadable_version_is_reported_rather_than_raised(self) -> None:
        """This gate decides whether to touch the deployment; it must not throw."""
        manifest = dict(self._manifest(), versions={"workspace_schema": "2026.7", "catalog_schema": "2"})

        problems = prism_backup.compare_versions(
            manifest, {"workspace_schema": "7", "catalog_schema": "2"}
        )

        self.assertEqual(len(problems), 1)
        self.assertIn("not a", problems[0])

    def test_missing_version_information_does_not_block_a_restore(self) -> None:
        """An archive from a build that could not read its ledgers still restores."""
        manifest = self._manifest()
        manifest["versions"] = {}
        self.assertEqual(prism_backup.compare_versions(manifest, {}), [])


class ChecksumGateTests(unittest.TestCase):
    """Restore runs this before it removes anything it cannot put back."""

    def _staging(self, tmp: str, payload: bytes) -> tuple[Path, dict]:
        staging = Path(tmp)
        (staging / "postgres.dump").write_bytes(payload)
        manifest = {"checksums": {"postgres.dump": prism_backup.sha256_file(staging / "postgres.dump")}}
        return staging, manifest

    def test_an_intact_payload_reports_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            staging, manifest = self._staging(tmp, b"dump-contents")
            self.assertEqual(prism_backup.checksum_problems(manifest, staging), [])

    def test_a_truncated_payload_is_caught(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            staging, manifest = self._staging(tmp, b"dump-contents")
            (staging / "postgres.dump").write_bytes(b"dump-cont")

            problems = prism_backup.checksum_problems(manifest, staging)

            self.assertEqual([name for name, _ in problems], ["postgres.dump"])

    def test_a_missing_payload_is_caught(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            staging, manifest = self._staging(tmp, b"dump-contents")
            (staging / "postgres.dump").unlink()

            problems = prism_backup.checksum_problems(manifest, staging)

            self.assertEqual(problems, [("postgres.dump", "missing from the archive")])


class DeploymentDiscoveryTests(unittest.TestCase):
    def test_release_bundle_layout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "compose.yml").write_text("services: {}", encoding="utf-8")
            (root / ".env").write_text("POSTGRES_DB=kicad_prism\n", encoding="utf-8")

            self.assertEqual(prism_backup.compose_files(root), ["compose.yml"])
            self.assertEqual(prism_backup.env_file_for(root), ".env")

    def test_source_layout_picks_up_generated_overlays(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "docker-compose.yml").write_text("services: {}", encoding="utf-8")
            (root / "docker-compose.proxy.yml").write_text("services: {}", encoding="utf-8")
            (root / "generated").mkdir()
            (root / "generated/docker-compose.generated.yml").write_text("services: {}", encoding="utf-8")
            (root / "generated/.env").write_text("POSTGRES_DB=kicad_prism\n", encoding="utf-8")

            self.assertEqual(
                prism_backup.compose_files(root),
                ["docker-compose.yml", "docker-compose.proxy.yml", "generated/docker-compose.generated.yml"],
            )
            # The installer's environment wins over a stale root .env.
            self.assertEqual(prism_backup.env_file_for(root), "generated/.env")

    def test_a_directory_that_is_not_a_deployment_is_named_as_such(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(prism_backup.BackupError):
                prism_backup.compose_files(Path(tmp))

    def test_env_parsing_keeps_values_literal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / ".env"
            path.write_text(
                "# comment\n\nPOSTGRES_DB=kicad_prism\nSESSION_SECRET=a=b=c\nBLANK=\n",
                encoding="utf-8",
            )
            values = prism_backup.read_env(path)
            self.assertEqual(values["POSTGRES_DB"], "kicad_prism")
            self.assertEqual(values["SESSION_SECRET"], "a=b=c")
            self.assertEqual(values["BLANK"], "")
            self.assertNotIn("# comment", values)


def compose_config_json(root: Path, *, projects: str = "data/projects", ssh: str = "data/ssh", extra=None) -> bytes:
    """What `docker compose config --format json` reports for the backend's mounts."""
    volumes = [
        {"type": "bind", "source": str(root / projects), "target": "/app/projects", "bind": {}},
        {"type": "bind", "source": str(root / ssh), "target": "/root/.ssh", "bind": {}},
    ]
    if extra is not None:
        volumes = extra
    return json.dumps({"services": {"backend": {"volumes": volumes}, "postgres": {}}}).encode("utf-8")


class PayloadResolutionTests(unittest.TestCase):
    """Backup archives what the running services actually mount."""

    def _resolve(self, root: Path, stdout: bytes, returncode: int = 0):
        def fake_run(command, cwd, *, capture=False):
            return subprocess.CompletedProcess(command, returncode, stdout=stdout, stderr=b"boom")

        with patch.object(prism_backup, "run", fake_run):
            return prism_backup.resolve_payloads(["docker", "compose"], root)

    def test_default_layout_resolves_to_the_default_directories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(
                self._resolve(root, compose_config_json(root)),
                [("projects", "data/projects"), ("ssh", "data/ssh")],
            )

    def test_an_overlay_that_moves_storage_is_honoured(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(
                self._resolve(root, compose_config_json(root, projects="storage/projects", ssh="secrets/ssh")),
                [("projects", "storage/projects"), ("ssh", "secrets/ssh")],
            )

    def test_a_named_volume_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            volumes = [
                {"type": "volume", "source": "prism-projects", "target": "/app/projects"},
                {"type": "bind", "source": str(root / "data/ssh"), "target": "/root/.ssh"},
            ]
            with self.assertRaisesRegex(prism_backup.BackupError, "volume mount"):
                self._resolve(root, compose_config_json(root, extra=volumes))

    def test_nested_mounts_are_refused_in_either_order(self) -> None:
        # Restore swaps projects first; SSH staged under it would be deleted.
        for projects, ssh in (("data/projects", "data/projects/ssh"), ("data/keys/projects", "data/keys")):
            with self.subTest(projects=projects, ssh=ssh), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                with self.assertRaisesRegex(prism_backup.BackupError, "overlap"):
                    self._resolve(root, compose_config_json(root, projects=projects, ssh=ssh))

    def test_identical_mounts_are_refused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaisesRegex(prism_backup.BackupError, "overlap"):
                self._resolve(root, compose_config_json(root, projects="data/shared", ssh="data/shared"))

    def test_the_deployment_root_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaisesRegex(prism_backup.BackupError, "deployment directory itself"):
                self._resolve(root, compose_config_json(root, projects=".", ssh="data/ssh"))

    def test_disjoint_relocated_mounts_with_a_shared_prefix_are_accepted(self) -> None:
        # "data/projects" vs "data/projects-ssh" share a string prefix, not a directory.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(
                self._resolve(root, compose_config_json(root, projects="data/projects", ssh="data/projects-ssh")),
                [("projects", "data/projects"), ("ssh", "data/projects-ssh")],
            )

    def test_a_mount_outside_the_deployment_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as elsewhere:
            root = Path(tmp)
            volumes = [
                {"type": "bind", "source": str(Path(elsewhere) / "projects"), "target": "/app/projects"},
                {"type": "bind", "source": str(root / "data/ssh"), "target": "/root/.ssh"},
            ]
            with self.assertRaisesRegex(prism_backup.BackupError, "outside"):
                self._resolve(root, compose_config_json(root, extra=volumes))

    def test_a_missing_mount_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            volumes = [{"type": "bind", "source": str(root / "data/projects"), "target": "/app/projects"}]
            with self.assertRaisesRegex(prism_backup.BackupError, "mounts nothing at /root/.ssh"):
                self._resolve(root, compose_config_json(root, extra=volumes))

    def test_an_unreadable_configuration_is_an_error_not_a_default(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(prism_backup.BackupError, "Could not read the Compose configuration"):
                self._resolve(Path(tmp), b"", returncode=1)

    def test_manifest_records_where_each_payload_came_from(self) -> None:
        manifest = prism_backup.build_manifest(
            created_at="now", root=Path("/deploy"), env={}, versions={}, entries={}, hot=False,
            payloads=[("projects", "storage/projects"), ("ssh", "data/ssh")],
        )
        self.assertEqual(
            manifest["payloads"],
            {
                "projects": {"source": "storage/projects", "target": "/app/projects"},
                "ssh": {"source": "data/ssh", "target": "/root/.ssh"},
            },
        )


class RestoreStageTests(unittest.TestCase):
    """Restore drives Docker through `run` and `subprocess.run`; both are faked here.

    The fake records every Compose command so a test can assert which stages
    ran, and returns the exit code configured for a command's verb.
    """

    def _deployment(self, tmp: str) -> tuple[Path, Path]:
        root = Path(tmp) / "deploy"
        root.mkdir()
        (root / "compose.yml").write_text("services: {}", encoding="utf-8")
        (root / ".env").write_text("POSTGRES_DB=kicad_prism\nPOSTGRES_USER=kicad_prism\n", encoding="utf-8")
        (root / "data/projects").mkdir(parents=True)
        (root / "data/projects/live.txt").write_text("live", encoding="utf-8")
        (root / "data/ssh").mkdir()
        (root / "data/ssh/id_ed25519").write_text("live-key", encoding="utf-8")

        staging = Path(tmp) / "staging"
        staging.mkdir()
        (staging / "postgres.dump").write_bytes(b"dump")
        for name in ("projects", "ssh"):
            source = Path(tmp) / f"src-{name}"
            source.mkdir()
            (source / "restored.txt").write_text("restored", encoding="utf-8")
            prism_backup.archive_directory(source, staging / f"{name}.tar.gz", prune_regenerable=False)
        (staging / "env").write_text("POSTGRES_DB=kicad_prism\n", encoding="utf-8")
        checksums = {path.name: prism_backup.sha256_file(path) for path in staging.iterdir()}
        manifest = {"schema": prism_backup.MANIFEST_SCHEMA, "created_at": "now", "checksums": checksums}
        (staging / prism_backup.MANIFEST_NAME).write_text(json.dumps(manifest), encoding="utf-8")
        archive = Path(tmp) / "backup.tar.gz"
        with tarfile.open(archive, "w:gz") as handle:
            for path in sorted(staging.iterdir()):
                handle.add(path, arcname=path.name)
        return root, archive

    def _restore(self, root: Path, archive: Path, *, failing: set[str]) -> tuple[int, list[list[str]], list[list[str]], str]:
        compose_calls: list[list[str]] = []
        pg_calls: list[list[str]] = []

        def fake_run(command, cwd, *, capture=False):
            verb = command[command.index("-f") + 2] if "-f" in command else command[-1]
            compose_calls.append(command)
            if verb == "config" and "--format" in command:
                return subprocess.CompletedProcess(command, 0, stdout=compose_config_json(root), stderr=b"")
            if verb == "config":
                return subprocess.CompletedProcess(command, 0, stdout=b"backend\nfrontend\npostgres\n", stderr=b"")
            if verb == "exec":
                return subprocess.CompletedProcess(command, 1, stdout=b"", stderr=b"")
            return subprocess.CompletedProcess(command, 1 if verb in failing else 0)

        def fake_subprocess_run(command, **kwargs):
            pg_calls.append(command)
            return subprocess.CompletedProcess(command, 1 if "pg_restore" in failing else 0)

        args = argparse.Namespace(root=root, archive=archive, env_file=None, compose_file=None, yes=True)
        output = io.StringIO()
        with patch.object(prism_backup, "run", fake_run), patch.object(
            prism_backup.subprocess, "run", fake_subprocess_run
        ), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            code = prism_backup.restore(args)
        return code, compose_calls, pg_calls, output.getvalue()

    def test_a_failed_stop_does_nothing_destructive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root, archive = self._deployment(tmp)
            code, compose_calls, pg_calls, output = self._restore(root, archive, failing={"stop"})

            self.assertEqual(code, 1)
            self.assertEqual(pg_calls, [], "pg_restore must not run after a failed stop")
            self.assertEqual((root / "data/projects/live.txt").read_text(encoding="utf-8"), "live")
            self.assertEqual((root / "data/ssh/id_ed25519").read_text(encoding="utf-8"), "live-key")
            self.assertFalse((root / "data/.projects.incoming").exists())
            self.assertNotIn("Restore complete", output)
            self.assertIn("Nothing was changed", output)
            self.assertFalse(any("--wait" in call for call in compose_calls), "no startup after an aborted restore")

    def test_a_failed_startup_is_a_failure_after_the_data_was_replaced(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root, archive = self._deployment(tmp)
            code, compose_calls, pg_calls, output = self._restore(root, archive, failing={"up"})

            self.assertEqual(code, 1)
            self.assertEqual(len(pg_calls), 1)
            self.assertEqual((root / "data/projects/restored.txt").read_text(encoding="utf-8"), "restored")
            self.assertFalse((root / "data/projects/live.txt").exists())
            self.assertNotIn("Restore complete", output)
            self.assertIn("did not start healthy", output)

    def test_database_restore_is_one_transaction_and_a_failure_leaves_files_alone(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root, archive = self._deployment(tmp)
            code, _, pg_calls, output = self._restore(root, archive, failing={"pg_restore"})

            self.assertEqual(code, 1)
            self.assertIn("--single-transaction", pg_calls[0])
            self.assertIn("--clean", pg_calls[0])
            self.assertEqual((root / "data/projects/live.txt").read_text(encoding="utf-8"), "live")
            self.assertFalse((root / "data/.projects.incoming").exists())
            self.assertIn("rolled back", output)
            self.assertNotIn("Restore complete", output)

    def test_a_failed_file_swap_reports_the_half_applied_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root, archive = self._deployment(tmp)
            real_replace = Path.replace

            def failing_replace(self_path, target):
                if self_path.name == ".ssh.incoming":
                    raise OSError("device busy")
                return real_replace(self_path, target)

            with patch.object(Path, "replace", failing_replace):
                code, _, pg_calls, output = self._restore(root, archive, failing=set())

            self.assertEqual(code, 1)
            self.assertEqual(len(pg_calls), 1)
            self.assertEqual((root / "data/projects/restored.txt").read_text(encoding="utf-8"), "restored")
            self.assertEqual((root / "data/ssh/id_ed25519").read_text(encoding="utf-8"), "live-key")
            self.assertTrue((root / "data/.ssh.incoming/restored.txt").is_file(), "staged copy retained")
            self.assertIn("data/ssh not replaced", output)
            self.assertNotIn("Restore complete", output)

    def test_a_clean_run_reports_completion(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root, archive = self._deployment(tmp)
            code, _, pg_calls, output = self._restore(root, archive, failing=set())

            self.assertEqual(code, 0)
            self.assertEqual(len(pg_calls), 1)
            self.assertIn("Restore complete", output)
            self.assertEqual((root / "data/ssh/restored.txt").read_text(encoding="utf-8"), "restored")


if __name__ == "__main__":
    unittest.main()
