"""Tests for Release Studio configuration loading and digests."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from app.release_studio.config import (
    ConfigLoadError,
    ConfigSchemaError,
    SubstitutionError,
    canonical_json,
    load_configuration_at_commit,
    load_configuration_from_checkout,
    parse_configuration_yaml,
    parse_policy_yaml,
    sha256_canonical,
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


def _write_design_files(root: Path) -> None:
    for relative in ("board.kicad_pcb", "board.kicad_sch", "Outputs.kicad_jobset"):
        (root / relative).write_text("fixture\n", encoding="utf-8")


def _config_with_file_reference(field: str, relative: str) -> str:
    defaults = {
        "board": "board.kicad_pcb",
        "schematic": "board.kicad_sch",
        "jobset": "Outputs.kicad_jobset",
    }
    if field in defaults:
        return _MIN_CONFIG.replace(
            f"{field}: {defaults[field]}",
            f"{field}: {relative}",
        )
    if field == "template":
        return _MIN_CONFIG.replace(
            "policy: org:default@1",
            f"template: {relative}\npolicy: org:default@1",
        )
    if field == "sheets":
        return _MIN_CONFIG.replace(
            "policy: org:default@1",
            f"sheets:\n  - {relative}\npolicy: org:default@1",
        )
    raise AssertionError(f"unsupported file reference field: {field}")


def _commit_temp_repo(root: Path, message: str) -> str:
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
    subprocess.run(["git", "add", "."], cwd=root, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", message],
        cwd=root,
        check=True,
        capture_output=True,
    )
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        text=True,
    ).strip()


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

    def test_malformed_braces_are_rejected(self) -> None:
        context = {"fields": {"revision": "A", "value": "{{fields.revision}}"}}
        for text in (
            "{{fields.revision}}}",
            "{{{fields.revision}}",
            "{{fields.{revision}}}",
            "{{fields.revision + 1}}",
            "{fields.revision}",
        ):
            with self.subTest(text=text):
                with self.assertRaises(SubstitutionError):
                    substitute_string(text, context)

        # A replacement is not scanned again for tokens.
        self.assertEqual(
            substitute_string("{{fields.value}}", context),
            "{{fields.revision}}",
        )

    def test_local_policy_reference_is_a_repo_policy_yaml_path(self) -> None:
        invalid_references = (
            "/private/tmp/release-studio-r6-outside-policy.yaml",
            "../policies/local.yaml",
            ".prism/release-studio/configurations/local.yaml",
            ".prism/release-studio/policies/local.yml",
            ".prism/release-studio/policies/nested/local.yaml",
            "policies/local.yaml",
        )
        for reference in invalid_references:
            with self.subTest(reference=reference):
                with self.assertRaisesRegex(ConfigSchemaError, "policy path|policy"):
                    parse_configuration_yaml(
                        _MIN_CONFIG.replace(
                            "policy: org:default@1",
                            f"policy: {reference}",
                        ),
                        source="config.yaml",
                    )

    def test_config_file_references_reject_host_paths_and_wrong_extensions(self) -> None:
        invalid_references = (
            ("board", "/tmp/board.kicad_pcb"),
            ("board", "../board.kicad_pcb"),
            ("board", "board.kicad_sch"),
            ("schematic", "/tmp/board.kicad_sch"),
            ("schematic", "../board.kicad_sch"),
            ("schematic", "board.kicad_pcb"),
            ("jobset", "/tmp/Outputs.kicad_jobset"),
            ("jobset", "../Outputs.kicad_jobset"),
            ("jobset", "Outputs.yaml"),
            ("template", "/tmp/template.yaml"),
            ("template", "../template.yaml"),
        )
        for field, value in invalid_references:
            with self.subTest(field=field, value=value):
                if field == "template":
                    text = _MIN_CONFIG.replace(
                        "policy: org:default@1",
                        f"template: {value}\npolicy: org:default@1",
                    )
                else:
                    defaults = {
                        "board": "board.kicad_pcb",
                        "schematic": "board.kicad_sch",
                        "jobset": "Outputs.kicad_jobset",
                    }
                    text = _MIN_CONFIG.replace(
                        f"{field}: {defaults[field]}",
                        f"{field}: {value}",
                    )
                with self.assertRaises(ConfigSchemaError):
                    parse_configuration_yaml(text, source="config.yaml")

    def test_schema_reports_non_string_nested_keys_and_strict_versions(self) -> None:
        with self.assertRaisesRegex(ConfigSchemaError, "mapping key.*must be a string"):
            parse_configuration_yaml(
                _MIN_CONFIG + "\n1: unexpected\n",
                source="bad.yaml",
            )
        with self.assertRaisesRegex(ConfigSchemaError, "fields.*mapping key.*string"):
            parse_configuration_yaml(
                _MIN_CONFIG.replace(
                    "  project: Demo",
                    "  1: Demo",
                ),
                source="bad.yaml",
            )

        for version, message in (("true", "must be an integer"), ("0", "positive"), ("-1", "positive")):
            with self.subTest(version=version):
                with self.assertRaisesRegex(ConfigSchemaError, message):
                    parse_policy_yaml(
                        f"""
schema: prism.release-studio.policy/1
version: {version}
rules: []
""",
                        source="policy.yaml",
                    )

    def test_normalization_is_stable_for_default_forms_and_paths(self) -> None:
        base = parse_configuration_yaml(_MIN_CONFIG)
        equivalent = parse_configuration_yaml(
            _MIN_CONFIG.replace("board: board.kicad_pcb", "board: ./board.kicad_pcb")
            .replace("schematic: board.kicad_sch", "schematic: ./board.kicad_sch")
            .replace("jobset: Outputs.kicad_jobset", "jobset: ./Outputs.kicad_jobset")
        )
        self.assertEqual(base, equivalent)

        without_optional_defaults = """
schema: prism.release-studio.configuration/1
title: Demo
board: board.kicad_pcb
schematic: board.kicad_sch
jobset: Outputs.kicad_jobset
policy: org:default@1
"""
        with_null_optional_defaults = without_optional_defaults + """
default_variant: null
fields: null
notes: null
variants: null
"""
        self.assertEqual(
            parse_configuration_yaml(without_optional_defaults),
            parse_configuration_yaml(with_null_optional_defaults),
        )

    def test_checkout_rejects_symlinked_references_outside_checkout(self) -> None:
        workspace = Path(__file__).resolve().parents[2]
        fields = (
            ("board", "linked/board.kicad_pcb"),
            ("schematic", "linked/board.kicad_sch"),
            ("jobset", "linked/Outputs.kicad_jobset"),
            ("template", "linked/template.yaml"),
            ("sheets", "linked/sheet.kicad_sch"),
        )
        for field, relative in fields:
            with self.subTest(field=field):
                with tempfile.TemporaryDirectory(dir=workspace) as checkout_tmp:
                    with tempfile.TemporaryDirectory() as outside_tmp:
                        root = Path(checkout_tmp)
                        _write_design_files(root)
                        target = Path(outside_tmp) / Path(relative).name
                        target.write_text("outside", encoding="utf-8")
                        link = root / relative
                        link.parent.mkdir(parents=True, exist_ok=True)
                        os.symlink(target, link)
                        config = _config_with_file_reference(field, relative)
                        config_dir = root / ".prism" / "release-studio" / "configurations"
                        config_dir.mkdir(parents=True, exist_ok=True)
                        (config_dir / "default.yaml").write_text(
                            config,
                            encoding="utf-8",
                        )
                        with self.assertRaisesRegex(ConfigLoadError, "escapes checkout"):
                            load_configuration_from_checkout(root, "default")

    def test_checkout_rejects_external_local_policy_symlink(self) -> None:
        workspace = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(dir=workspace) as checkout_tmp:
            with tempfile.TemporaryDirectory() as outside_tmp:
                root = Path(checkout_tmp)
                _write_design_files(root)
                policy_dir = root / ".prism" / "release-studio" / "policies"
                config_dir = root / ".prism" / "release-studio" / "configurations"
                policy_dir.mkdir(parents=True)
                config_dir.mkdir(parents=True)
                outside_policy = Path(outside_tmp) / "local.yaml"
                outside_policy.write_text(
                    "schema: prism.release-studio.policy/1\nrules: []\n",
                    encoding="utf-8",
                )
                os.symlink(outside_policy, policy_dir / "local.yaml")
                (config_dir / "default.yaml").write_text(
                    _MIN_CONFIG.replace(
                        "policy: org:default@1",
                        "policy: .prism/release-studio/policies/local.yaml",
                    ),
                    encoding="utf-8",
                )
                with self.assertRaisesRegex(ConfigLoadError, "escapes checkout"):
                    load_configuration_from_checkout(root, "default")

    def test_missing_declared_file_is_rejected_by_checkout_and_commit(self) -> None:
        workspace = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(dir=workspace) as temporary:
            root = Path(temporary)
            config_dir = root / ".prism" / "release-studio" / "configurations"
            config_dir.mkdir(parents=True)
            (config_dir / "default.yaml").write_text(_MIN_CONFIG, encoding="utf-8")
            commit = _commit_temp_repo(root, "add incomplete config")

            with self.assertRaisesRegex(ConfigLoadError, "board.*not found"):
                load_configuration_from_checkout(root, "default")
            with self.assertRaisesRegex(ConfigLoadError, "board.*not found"):
                load_configuration_at_commit(root, commit, "default")

    def test_external_file_symlink_is_rejected_by_checkout_and_commit(self) -> None:
        workspace = Path(__file__).resolve().parents[2]
        fields = (
            ("board", "linked/board.kicad_pcb"),
            ("schematic", "linked/board.kicad_sch"),
            ("jobset", "linked/Outputs.kicad_jobset"),
            ("template", "linked/template.yaml"),
            ("sheets", "linked/sheet.kicad_sch"),
        )
        for field, relative in fields:
            with self.subTest(field=field):
                with tempfile.TemporaryDirectory(dir=workspace) as temporary:
                    with tempfile.TemporaryDirectory() as outside_tmp:
                        root = Path(temporary)
                        _write_design_files(root)
                        target = Path(outside_tmp) / Path(relative).name
                        target.write_text("outside", encoding="utf-8")
                        link = root / relative
                        if link.exists() or link.is_symlink():
                            link.unlink()
                        link.parent.mkdir(parents=True, exist_ok=True)
                        os.symlink(target, link)
                        config_dir = root / ".prism" / "release-studio" / "configurations"
                        config_dir.mkdir(parents=True)
                        (config_dir / "default.yaml").write_text(
                            _config_with_file_reference(field, relative),
                            encoding="utf-8",
                        )
                        commit = _commit_temp_repo(root, f"add external {field} link")

                        with self.assertRaisesRegex(ConfigLoadError, "escapes"):
                            load_configuration_from_checkout(root, "default")
                        with self.assertRaisesRegex(ConfigLoadError, "escapes"):
                            load_configuration_at_commit(root, commit, "default")

    def test_in_repo_file_symlink_is_resolved_by_checkout_and_commit(self) -> None:
        workspace = Path(__file__).resolve().parents[2]
        fields = (
            ("board", "board.kicad_pcb"),
            ("schematic", "board.kicad_sch"),
            ("jobset", "Outputs.kicad_jobset"),
            ("template", "linked/template.yaml"),
            ("sheets", "linked/sheet.kicad_sch"),
        )
        for field, relative in fields:
            with self.subTest(field=field):
                with tempfile.TemporaryDirectory(dir=workspace) as temporary:
                    root = Path(temporary)
                    _write_design_files(root)
                    source = root / "sources" / Path(relative).name
                    source.parent.mkdir(parents=True, exist_ok=True)
                    source.write_text("in repo fixture\n", encoding="utf-8")
                    link = root / relative
                    if link.exists() or link.is_symlink():
                        link.unlink()
                    link.parent.mkdir(parents=True, exist_ok=True)
                    os.symlink(os.path.relpath(source, link.parent), link)
                    config_dir = root / ".prism" / "release-studio" / "configurations"
                    config_dir.mkdir(parents=True)
                    (config_dir / "default.yaml").write_text(
                        _config_with_file_reference(field, relative),
                        encoding="utf-8",
                    )
                    commit = _commit_temp_repo(root, f"add in-repo {field} link")

                    self.assertEqual(
                        load_configuration_from_checkout(root, "default"),
                        load_configuration_at_commit(root, commit, "default"),
                    )

    def test_valid_local_policy_loads_from_checkout_and_commit(self) -> None:
        workspace = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(dir=workspace) as temporary:
            root = Path(temporary)
            _write_design_files(root)
            config_dir = root / ".prism" / "release-studio" / "configurations"
            policy_dir = root / ".prism" / "release-studio" / "policies"
            config_dir.mkdir(parents=True)
            policy_dir.mkdir(parents=True)
            config = _MIN_CONFIG.replace(
                "policy: org:default@1",
                "policy: .prism/release-studio/policies/local.yaml",
            )
            (config_dir / "default.yaml").write_text(config, encoding="utf-8")
            (policy_dir / "local.yaml").write_text(
                "schema: prism.release-studio.policy/1\nrules: []\n",
                encoding="utf-8",
            )
            commit = _commit_temp_repo(root, "add local policy")

            from_checkout = load_configuration_from_checkout(root, "default")
            from_commit = load_configuration_at_commit(root, commit, "default")
            self.assertEqual(from_checkout, from_commit)

    def test_in_repo_policy_symlink_resolves_to_same_commit_object(self) -> None:
        workspace = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(dir=workspace) as temporary:
            root = Path(temporary)
            _write_design_files(root)
            config_dir = root / ".prism" / "release-studio" / "configurations"
            policy_dir = root / ".prism" / "release-studio" / "policies"
            config_dir.mkdir(parents=True)
            policy_dir.mkdir(parents=True)
            (config_dir / "default.yaml").write_text(
                _MIN_CONFIG.replace(
                    "policy: org:default@1",
                    "policy: .prism/release-studio/policies/alias.yaml",
                ),
                encoding="utf-8",
            )
            (policy_dir / "base.yaml").write_text(
                "schema: prism.release-studio.policy/1\nrules: []\n",
                encoding="utf-8",
            )
            os.symlink("base.yaml", policy_dir / "alias.yaml")
            commit = _commit_temp_repo(root, "add in-repo policy symlink")

            self.assertEqual(
                load_configuration_from_checkout(root, "default"),
                load_configuration_at_commit(root, commit, "default"),
            )

    def test_local_policy_only_changes_do_not_change_technical_digest(self) -> None:
        base = parse_configuration_yaml(
            _MIN_CONFIG.replace(
                "policy: org:default@1",
                "policy: .prism/release-studio/policies/quality-v1.yaml",
            )
        )
        changed = parse_configuration_yaml(
            _MIN_CONFIG.replace(
                "policy: org:default@1",
                "policy: .prism/release-studio/policies/quality-v2.yaml",
            )
        )
        self.assertNotEqual(base["policy"], changed["policy"])
        self.assertEqual(technical_config_digest(base), technical_config_digest(changed))

    def test_unclassified_configuration_key_cannot_enter_technical_digest(self) -> None:
        config = parse_configuration_yaml(_MIN_CONFIG)
        config["future_key"] = "must be classified"
        with self.assertRaisesRegex(
            ConfigSchemaError,
            "unclassified release configuration key.*future_key",
        ):
            technical_config_digest(config)

    def test_canonical_json_rejects_nonfinite_numbers(self) -> None:
        for value in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    sha256_canonical({"value": value})

    def test_canonical_json_normalizes_unicode_and_rejects_key_collisions(self) -> None:
        composed = {"label": "Café", "é": "value"}
        decomposed = {"label": "Cafe\u0301", "e\u0301": "value"}
        self.assertEqual(canonical_json(composed), canonical_json(decomposed))
        self.assertEqual(sha256_canonical(composed), sha256_canonical(decomposed))

        with self.assertRaisesRegex(ValueError, "collision.*NFC"):
            canonical_json({"e\u0301": "first", "é": "second"})

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
            _write_design_files(root)
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
