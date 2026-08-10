"""Load release configurations from a checkout or an exact Git commit."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any, Mapping

import yaml

from .errors import ConfigLoadError, ConfigSchemaError
from .schema import (
    validate_configuration_mapping,
    validate_org_extends,
    validate_policy_mapping,
)

CONFIG_DIR = Path(".prism") / "release-studio" / "configurations"
POLICIES_DIR = Path(".prism") / "release-studio" / "policies"


def configuration_relpath(config_key: str) -> Path:
    """Return the repo-relative path for a configuration key."""

    _require_safe_key(config_key, kind="configuration")
    return CONFIG_DIR / f"{config_key}.yaml"


def policy_relpath(policy_key: str) -> Path:
    """Return the repo-relative path for a project policy overlay key."""

    _require_safe_key(policy_key, kind="policy")
    return POLICIES_DIR / f"{policy_key}.yaml"


def list_configuration_keys(checkout_root: Path | str) -> list[str]:
    """List configuration keys present under a checkout."""

    root = Path(checkout_root)
    directory = root / CONFIG_DIR
    if not directory.is_dir():
        return []
    keys = sorted(path.stem for path in directory.glob("*.yaml") if path.is_file())
    return keys


def parse_configuration_yaml(
    text: str,
    *,
    source: str = "<configuration>",
) -> dict[str, Any]:
    """Parse and validate a configuration YAML document."""

    data = _load_yaml_mapping(text, source=source)
    return validate_configuration_mapping(data, source=source)


def parse_policy_yaml(
    text: str,
    *,
    source: str = "<policy>",
) -> dict[str, Any]:
    """Parse and validate a project policy overlay YAML document."""

    data = _load_yaml_mapping(text, source=source)
    return validate_policy_mapping(data, source=source)


def load_policy_from_mapping(
    data: Mapping[str, Any],
    *,
    source: str = "<policy>",
) -> dict[str, Any]:
    """Validate an already-parsed policy mapping."""

    return validate_policy_mapping(data, source=source)


def load_configuration_from_checkout(
    checkout_root: Path | str,
    config_key: str,
) -> dict[str, Any]:
    """Load a configuration from files in a working tree / checkout."""

    root = Path(checkout_root)
    rel = configuration_relpath(config_key)
    path = root / rel
    if not path.is_file():
        raise ConfigLoadError(f"configuration {config_key!r} not found at {rel.as_posix()}")
    text = path.read_text(encoding="utf-8")
    config = parse_configuration_yaml(text, source=rel.as_posix())
    _load_referenced_policy_from_checkout(root, config, source=rel.as_posix())
    return config


def load_configuration_at_commit(
    repo_root: Path | str,
    commit: str,
    config_key: str,
) -> dict[str, Any]:
    """Load a configuration as it existed at *commit* via ``git show``."""

    root = Path(repo_root)
    rel = configuration_relpath(config_key)
    text = _git_show(root, commit, rel.as_posix())
    config = parse_configuration_yaml(text, source=f"{commit}:{rel.as_posix()}")
    _load_referenced_policy_at_commit(root, commit, config, source=rel.as_posix())
    return config


def _load_referenced_policy_from_checkout(
    root: Path,
    config: dict[str, Any],
    *,
    source: str,
) -> None:
    policy = config.get("policy")
    path = _policy_path_from_reference(policy)
    if path is None:
        # Inline org extends on the configuration itself were already validated.
        if isinstance(policy, str) and policy.startswith("org:"):
            validate_org_extends(policy, source=f"{source}.policy")
        elif isinstance(policy, Mapping) and "extends" in policy:
            validate_org_extends(policy["extends"], source=f"{source}.policy.extends")
        return
    policy_file = root / path
    if not policy_file.is_file():
        raise ConfigLoadError(f"policy file not found: {path.as_posix()}")
    parse_policy_yaml(
        policy_file.read_text(encoding="utf-8"),
        source=path.as_posix(),
    )


def _load_referenced_policy_at_commit(
    root: Path,
    commit: str,
    config: dict[str, Any],
    *,
    source: str,
) -> None:
    policy = config.get("policy")
    path = _policy_path_from_reference(policy)
    if path is None:
        if isinstance(policy, str) and policy.startswith("org:"):
            validate_org_extends(policy, source=f"{source}.policy")
        elif isinstance(policy, Mapping) and "extends" in policy:
            validate_org_extends(policy["extends"], source=f"{source}.policy.extends")
        return
    text = _git_show(root, commit, path.as_posix())
    parse_policy_yaml(text, source=f"{commit}:{path.as_posix()}")


def _policy_path_from_reference(policy: Any) -> Path | None:
    if isinstance(policy, str) and not policy.startswith("org:"):
        return Path(policy)
    if isinstance(policy, Mapping) and policy.get("path"):
        return Path(str(policy["path"]))
    return None


def _load_yaml_mapping(text: str, *, source: str) -> dict[str, Any]:
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ConfigLoadError(f"{source}: invalid YAML: {exc}") from exc
    if data is None:
        raise ConfigLoadError(f"{source}: document is empty")
    if not isinstance(data, dict):
        raise ConfigSchemaError(f"{source}: root must be a mapping")
    return data


def _git_show(repo_root: Path, commit: str, relpath: str) -> str:
    if not commit or any(ch.isspace() for ch in commit):
        raise ConfigLoadError(f"invalid commit ref: {commit!r}")
    result = subprocess.run(
        ["git", "-C", str(repo_root), "show", f"{commit}:{relpath}"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise ConfigLoadError(
            f"failed to read {relpath!r} at {commit}: {detail or 'git show failed'}"
        )
    return result.stdout


def _require_safe_key(key: str, *, kind: str) -> None:
    if not isinstance(key, str) or not key or any(ch in key for ch in "/\\"):
        raise ConfigLoadError(f"invalid {kind} key: {key!r}")
    if key in {".", ".."} or key.startswith("."):
        raise ConfigLoadError(f"invalid {kind} key: {key!r}")
