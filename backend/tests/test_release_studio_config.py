"""Tests for Release Studio configuration loading and digests."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from app.release_studio.config import (
    ConfigSchemaError,
    SubstitutionError,
    load_configuration_at_commit,
    load_configuration_from_checkout,
    parse_configuration_yaml,
    parse_policy_yaml,
    substitute_string,
    technical_config_digest,
    validate_org_extends,
)


_MIN_CONFIG = """
schema: prism.release-studio.configuration/1
title: Demo
board: board.kicad_pcb
schematic: board.kicad_sch
jobset: Outputs.kicad_jobset
default_variant: default
fields:
  project: Demo
  revision: A
notes:
  fab:
    - "Rev {{fields.revision}}"
policy: org:default@1
"""


class ReleaseStudioConfigTests(unittest.TestCase):
    def test_unknown_configuration_key_is_rejected_by_name(self) -> None:
        with self.assertRaisesRegex(ConfigSchemaError, "unknown key\\(s\\): 'extra'"):
            parse_configuration_yaml(
                _MIN_CONFIG + "\nextra: nope\n",
                source="bad.yaml",
            )

    def test_unpinned_org_extends_is_a_load_error(self) -> None:
        with self.assertRaisesRegex(ConfigSchemaError, "unpinned org reference"):
            validate_org_extends("org:default")
        with self.assertRaisesRegex(ConfigSchemaError, "unpinned org reference"):
            parse_policy_yaml(
                """
schema: prism.release-studio.policy/1
extends: org:default
rules: []
""",
                source="policy.yaml",
            )
        with self.assertRaisesRegex(ConfigSchemaError, "unpinned org reference"):
            parse_configuration_yaml(
                _MIN_CONFIG.replace("org:default@1", "org:default"),
                source="config.yaml",
            )

    def test_missing_substitution_key_raises(self) -> None:
        with self.assertRaisesRegex(SubstitutionError, "fields.missing"):
            substitute_string(
                "hello {{fields.missing}}",
                {"fields": {"revision": "A"}},
            )

    def test_technical_config_digest_ignores_policy_reference_only_changes(self) -> None:
        base = parse_configuration_yaml(_MIN_CONFIG)
        changed = parse_configuration_yaml(
            _MIN_CONFIG.replace("org:default@1", "org:default@2")
        )
        self.assertNotEqual(base["policy"], changed["policy"])
        self.assertEqual(
            technical_config_digest(base),
            technical_config_digest(changed),
        )
        board_changed = parse_configuration_yaml(
            _MIN_CONFIG.replace("board: board.kicad_pcb", "board: other.kicad_pcb")
        )
        self.assertNotEqual(
            technical_config_digest(base),
            technical_config_digest(board_changed),
        )

    def test_load_at_commit_matches_checkout(self) -> None:
        workspace = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(dir=workspace) as temporary:
            root = Path(temporary)
            subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
            subprocess.run(
                ["git", "config", "user.email", "r6@example.com"],
                cwd=root,
                check=True,
                capture_output=True,
            )
            subprocess.run(
                ["git", "config", "user.name", "R6"],
                cwd=root,
                check=True,
                capture_output=True,
            )
            config_dir = root / ".prism" / "release-studio" / "configurations"
            config_dir.mkdir(parents=True)
            (config_dir / "default.yaml").write_text(_MIN_CONFIG, encoding="utf-8")
            subprocess.run(["git", "add", "."], cwd=root, check=True, capture_output=True)
            subprocess.run(
                ["git", "commit", "-m", "add config"],
                cwd=root,
                check=True,
                capture_output=True,
            )
            commit = subprocess.check_output(
                ["git", "rev-parse", "HEAD"],
                cwd=root,
                text=True,
            ).strip()

            from_checkout = load_configuration_from_checkout(root, "default")
            from_commit = load_configuration_at_commit(root, commit, "default")
            self.assertEqual(from_checkout, from_commit)
            self.assertEqual(
                technical_config_digest(from_checkout),
                technical_config_digest(from_commit),
            )


if __name__ == "__main__":
    unittest.main()
