from __future__ import annotations

import hashlib
import tarfile
import tempfile
import unittest
from pathlib import Path

from scripts.release_bundle import build_release_bundle, parse_release_tag


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = REPOSITORY_ROOT / "deploy" / "release"


class ReleaseMetadataTests(unittest.TestCase):
    def test_stable_release_updates_floating_stable_tags(self) -> None:
        metadata = parse_release_tag("v3.1.2")

        self.assertFalse(metadata.is_prerelease)
        self.assertEqual(metadata.version, "3.1.2")
        self.assertEqual(metadata.image_tags, ("3.1.2", "3.1", "3", "latest"))

    def test_prerelease_only_publishes_its_exact_version(self) -> None:
        metadata = parse_release_tag("v3.1.2-alpha.1")

        self.assertTrue(metadata.is_prerelease)
        self.assertEqual(metadata.image_tags, ("3.1.2-alpha.1",))

    def test_invalid_release_tags_are_rejected(self) -> None:
        invalid_tags = (
            "3.1.2",
            "v3.1",
            "v3.01.2",
            "v3.1.2-alpha.01",
            "v3.1.2+build.1",
            "v3.1.2-",
        )

        for tag in invalid_tags:
            with self.subTest(tag=tag):
                with self.assertRaises(ValueError):
                    parse_release_tag(tag)


class ReleaseBundleTests(unittest.TestCase):
    def test_bundle_contains_digest_pins_and_valid_checksums(self) -> None:
        backend_image = (
            "ghcr.io/krishna-swaroop/kicad-prism-backend@"
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        )
        frontend_image = (
            "ghcr.io/krishna-swaroop/kicad-prism-frontend@"
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        )

        with tempfile.TemporaryDirectory() as output:
            bundle_dir, archive, archive_checksum = build_release_bundle(
                template_dir=TEMPLATE_DIR,
                output_root=Path(output),
                tag="v3.1.2-alpha.1",
                backend_image=backend_image,
                frontend_image=frontend_image,
                revision="abc123",
                build_date="2026-07-27T00:00:00Z",
            )

            rendered_env = (bundle_dir / ".env.example").read_text(encoding="utf-8")
            self.assertIn(f"PRISM_BACKEND_IMAGE={backend_image}", rendered_env)
            self.assertIn(f"PRISM_FRONTEND_IMAGE={frontend_image}", rendered_env)
            self.assertNotIn("__PRISM_", rendered_env)
            self.assertNotIn("build:", (bundle_dir / "compose.yml").read_text())

            for line in (bundle_dir / "SHA256SUMS").read_text().splitlines():
                expected, relative_name = line.split("  ", maxsplit=1)
                actual = hashlib.sha256(
                    (bundle_dir / relative_name).read_bytes()
                ).hexdigest()
                self.assertEqual(actual, expected)

            with tarfile.open(archive, mode="r:gz") as packaged:
                packaged_names = set(packaged.getnames())
            archive_root = "kicad-prism-v3.1.2-alpha.1-linux-amd64"
            self.assertIn(f"{archive_root}/compose.yml", packaged_names)
            self.assertIn(f"{archive_root}/SHA256SUMS", packaged_names)

            expected_archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
            self.assertEqual(
                archive_checksum.read_text(encoding="utf-8"),
                f"{expected_archive_hash}  {archive.name}\n",
            )


if __name__ == "__main__":
    unittest.main()
