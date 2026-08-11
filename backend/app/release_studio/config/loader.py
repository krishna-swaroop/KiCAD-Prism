"""Load release configurations from a checkout or an exact Git commit."""

from __future__ import annotations

import subprocess
from pathlib import Path, PurePosixPath
from typing import Any, Iterator, Mapping

import yaml

from .errors import ConfigLoadError, ConfigSchemaError
from .schema import (
    _normalize_repository_path,
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

    root = _checkout_root(checkout_root)
    directory = root / CONFIG_DIR
    resolved_directory = _resolve_checkout_path(
        root,
        CONFIG_DIR,
        kind="configuration directory",
        require_exists=False,
        require_file=False,
    )
    if resolved_directory is None or not directory.is_dir():
        return []

    keys: list[str] = []
    for path in directory.glob("*.yaml"):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        _resolve_checkout_path(
            root,
            rel,
            kind="configuration",
            require_exists=True,
            require_file=True,
        )
        keys.append(path.stem)
    return sorted(keys)


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

    root = _checkout_root(checkout_root)
    rel = configuration_relpath(config_key)
    path = _resolve_checkout_path(
        root,
        rel,
        kind="configuration",
        require_exists=False,
        require_file=True,
    )
    if path is None:
        raise ConfigLoadError(
            f"configuration {config_key!r} not found at {rel.as_posix()}"
        )
    text = path.read_text(encoding="utf-8")
    config = parse_configuration_yaml(text, source=rel.as_posix())
    _validate_referenced_checkout_paths(root, config)
    _load_referenced_policy_from_checkout(root, config, source=rel.as_posix())
    return config


def load_configuration_at_commit(
    repo_root: Path | str,
    commit: str,
    config_key: str,
) -> dict[str, Any]:
    """Load a configuration as it existed at *commit* via ``git show``."""

    root = _checkout_root(repo_root)
    rel = configuration_relpath(config_key)
    text = _git_show(root, commit, rel.as_posix())
    config = parse_configuration_yaml(text, source=f"{commit}:{rel.as_posix()}")
    _validate_referenced_commit_paths(root, commit, config)
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
    policy_file = _resolve_checkout_path(
        root,
        path,
        kind="policy",
        require_exists=True,
        require_file=True,
    )
    assert policy_file is not None
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


def _validate_referenced_checkout_paths(
    root: Path,
    config: Mapping[str, Any],
) -> None:
    """Require declared config references to be regular files in the checkout."""

    for field, path in _referenced_file_paths(config):
        _resolve_checkout_path(
            root,
            Path(str(path)),
            kind=field,
            require_exists=True,
            require_file=True,
        )


def _validate_referenced_commit_paths(
    root: Path,
    commit: str,
    config: Mapping[str, Any],
) -> None:
    """Require declared config references to resolve to tracked regular files."""

    for field, path in _referenced_file_paths(config):
        try:
            _resolve_git_file_path(root, commit, str(path))
        except ConfigLoadError as exc:
            raise ConfigLoadError(
                f"{field} path {path!r} is not a regular repository file at "
                f"{commit}: {exc}"
            ) from exc


def _referenced_file_paths(config: Mapping[str, Any]) -> Iterator[tuple[str, Any]]:
    for field in ("board", "schematic", "jobset"):
        yield field, config[field]
    if config.get("template") is not None:
        yield "template", config["template"]
    for index, path in enumerate(config.get("sheets", []) or []):
        yield f"schematic sheet {index}", path


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
    if not commit or commit.startswith("-") or any(ch.isspace() for ch in commit):
        raise ConfigLoadError(f"invalid commit ref: {commit!r}")
    safe_relpath = _normalize_repository_path(
        relpath,
        source=f"{commit}:{relpath}",
        kind="Git path",
    )
    resolved_relpath = _resolve_git_file_path(repo_root, commit, safe_relpath)
    result = subprocess.run(
        ["git", "-C", str(repo_root), "show", f"{commit}:{resolved_relpath}"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise ConfigLoadError(
            f"failed to read {safe_relpath!r} at {commit}: "
            f"{detail or 'git show failed'}"
        )
    return result.stdout


def _resolve_git_file_path(repo_root: Path, commit: str, relpath: str) -> str:
    """Resolve a tracked file, including only in-repository Git symlinks."""

    components = list(PurePosixPath(relpath).parts)
    treeish = commit
    prefix: list[str] = []
    seen_symlink_states: set[tuple[str, ...]] = set()

    for _ in range(64):
        if not components:
            raise ConfigLoadError(f"Git path {relpath!r} resolves to the repository root")
        entry = _git_tree_entry(repo_root, treeish, components[0])
        if entry is None:
            raise ConfigLoadError(f"Git path {relpath!r} not found at {commit}")
        mode, entry_type, object_id = entry
        name = components[0]

        if entry_type == "tree":
            if len(components) == 1:
                raise ConfigLoadError(f"Git path {relpath!r} is a directory at {commit}")
            prefix.append(name)
            components = components[1:]
            treeish = object_id
            continue

        if mode == "120000":
            state = tuple(prefix + components)
            if state in seen_symlink_states:
                raise ConfigLoadError(f"Git path {relpath!r} contains a symlink loop")
            seen_symlink_states.add(state)
            target = _git_blob_text(repo_root, object_id, relpath)
            components = _resolve_symlink_components(
                prefix,
                target,
                components[1:],
                relpath=relpath,
            )
            prefix = []
            treeish = commit
            continue

        if entry_type != "blob":
            raise ConfigLoadError(
                f"Git path {relpath!r} has unsupported object type {entry_type!r}"
            )
        if len(components) != 1:
            raise ConfigLoadError(
                f"Git path {relpath!r} traverses a non-directory at {commit}"
            )
        return "/".join(prefix + [name])

    raise ConfigLoadError(f"Git path {relpath!r} has too many symlink hops")


def _git_tree_entry(
    repo_root: Path,
    treeish: str,
    name: str,
) -> tuple[str, str, str] | None:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "ls-tree", "-z", treeish, "--", name],
        check=False,
        capture_output=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).decode("utf-8", errors="replace").strip()
        raise ConfigLoadError(
            f"failed to inspect Git tree {treeish!r}: {detail or 'git ls-tree failed'}"
        )
    for record in result.stdout.split(b"\0"):
        if not record:
            continue
        try:
            metadata, record_name = record.split(b"\t", 1)
            mode, entry_type, object_id = metadata.split()
            decoded_name = record_name.decode("utf-8")
        except (UnicodeDecodeError, ValueError) as exc:
            raise ConfigLoadError("Git tree contained an invalid path entry") from exc
        if decoded_name == name:
            return (
                mode.decode("ascii"),
                entry_type.decode("ascii"),
                object_id.decode("ascii"),
            )
    return None


def _git_blob_text(
    repo_root: Path,
    object_id: str,
    relpath: str,
) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "cat-file", "blob", object_id],
        check=False,
        capture_output=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).decode("utf-8", errors="replace").strip()
        raise ConfigLoadError(
            f"failed to read symlink target for Git path {relpath!r}: "
            f"{detail or 'git cat-file failed'}"
        )
    try:
        return result.stdout.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ConfigLoadError(
            f"Git symlink target for {relpath!r} is not valid UTF-8"
        ) from exc


def _resolve_symlink_components(
    prefix: list[str],
    target: str,
    remaining: list[str],
    *,
    relpath: str,
) -> list[str]:
    if not target or "\x00" in target or "\n" in target or "\r" in target:
        raise ConfigLoadError(f"Git symlink for {relpath!r} has an invalid target")
    if target.startswith(("/", "\\")) or "\\" in target:
        raise ConfigLoadError(
            f"Git symlink for {relpath!r} escapes the repository: {target!r}"
        )

    stack: list[str] = []
    for component in [*prefix, *target.split("/"), *remaining]:
        if component in {"", "."}:
            continue
        if component == "..":
            if not stack:
                raise ConfigLoadError(
                    f"Git symlink for {relpath!r} escapes the repository: {target!r}"
                )
            stack.pop()
            continue
        stack.append(component)
    if not stack:
        raise ConfigLoadError(f"Git symlink for {relpath!r} resolves to the repository root")
    return stack


def _checkout_root(checkout_root: Path | str) -> Path:
    root = Path(checkout_root)
    try:
        resolved = root.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ConfigLoadError(f"checkout root is not accessible: {root}") from exc
    if not resolved.is_dir():
        raise ConfigLoadError(f"checkout root is not a directory: {root}")
    return resolved


def _resolve_checkout_path(
    root: Path,
    relpath: Path,
    *,
    kind: str,
    require_exists: bool,
    require_file: bool,
) -> Path | None:
    candidate = root / relpath
    try:
        resolved = candidate.resolve(strict=False)
    except (OSError, RuntimeError) as exc:
        raise ConfigLoadError(
            f"{kind} path cannot be resolved inside checkout: {relpath.as_posix()}"
        ) from exc
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ConfigLoadError(
            f"{kind} path escapes checkout: {relpath.as_posix()}"
        ) from exc

    if not candidate.exists():
        if require_exists:
            raise ConfigLoadError(f"{kind} file not found: {relpath.as_posix()}")
        return None
    if require_file and not candidate.is_file():
        raise ConfigLoadError(f"{kind} path is not a regular file: {relpath.as_posix()}")
    return resolved


def _require_safe_key(key: str, *, kind: str) -> None:
    if not isinstance(key, str) or not key or any(ch in key for ch in "/\\"):
        raise ConfigLoadError(f"invalid {kind} key: {key!r}")
    if key in {".", ".."} or key.startswith("."):
        raise ConfigLoadError(f"invalid {kind} key: {key!r}")
