"""Tests for the backup tool's pure logic.

Everything Docker-facing is left to the runbook's restore rehearsal; what is
covered here is the part that decides *what* goes into an archive and whether
one is safe to restore, which is where a silent mistake costs data.
"""

from __future__ import annotations

import json
import tarfile
import tempfile
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
