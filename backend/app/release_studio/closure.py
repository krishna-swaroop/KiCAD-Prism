"""Materialize and attest the complete input tree for a Release Studio build.

The comparison service has a deliberately narrow snapshot helper.  Release
Studio needs a different contract: the exact repository commit is materialized
into a private directory, gitlinks are expanded from their recorded commits,
and the only bytes allowed to differ from Git objects are hydrated Git LFS
objects already present in the source worktree.

This module is intentionally independent of the database and of the legacy
``design_compare_service._snapshot_commit`` helper.  It can therefore be used
by a worker before a candidate or build row exists, and it is safe to exercise
against small local Git repositories in tests.
"""

from __future__ import annotations

import hashlib
import os
import re
import stat
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from app.release_studio.canonical import sha256_canonical


_LFS_POINTER_VERSION = "version https://git-lfs.github.com/spec/v1"
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_RESOURCE_DIGEST_RE = _SHA256_RE
_VARIABLE_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
_URI_RE = re.compile(
    r"\(\s*uri\s+(?:\"((?:\\.|[^\"\\])*)\"|([^\s()]+))",
    re.IGNORECASE,
)
_QUOTED_RE = re.compile(r'"((?:\\.|[^"\\])*)"')
_PATH_INPUT_SUFFIXES = {
    ".kicad_jobset",
    ".kicad_pcb",
    ".kicad_pro",
    ".kicad_sch",
    ".kicad_wks",
    ".yaml",
    ".yml",
}


class ClosureError(RuntimeError):
    """Base class for fail-closed input closure errors."""


class GitTreeError(ClosureError):
    """The requested commit or a recursively referenced tree is unavailable."""


class LfsMaterializationError(ClosureError):
    """An LFS pointer is absent, still present, or has the wrong bytes."""


class ExternalPathError(ClosureError):
    """A project/library reference would read outside the closure/toolchain."""


@dataclass(frozen=True, slots=True)
class RepositoryInput:
    """One materialized leaf in the repository tree.

    ``type`` is semantic rather than just Git's object type: both a regular
    file and a symlink are Git blobs, but they are different inputs to KiCad.
    """

    path: str
    git_object_id: str
    mode: str
    type: str
    materialized_digest: str

    def to_dict(self) -> dict[str, str]:
        return {
            "path": self.path,
            "git_object_id": self.git_object_id,
            "mode": self.mode,
            "type": self.type,
            "materialized_digest": self.materialized_digest,
        }


@dataclass(frozen=True, slots=True)
class SubmoduleInput:
    """A gitlink plus the digest of the recursively materialized tree."""

    path: str
    gitlink_sha: str
    resolved_tree_digest: str
    recursive: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "gitlink_sha": self.gitlink_sha,
            "resolved_tree_digest": self.resolved_tree_digest,
            "recursive": self.recursive,
        }


@dataclass(frozen=True, slots=True)
class LfsInput:
    """The Git pointer identity and the hydrated bytes used by the build."""

    path: str
    pointer_blob_sha: str
    lfs_oid: str
    materialized_digest: str

    def to_dict(self) -> dict[str, str]:
        return {
            "path": self.path,
            "pointer_blob_sha": self.pointer_blob_sha,
            "lfs_oid": self.lfs_oid,
            "materialized_digest": self.materialized_digest,
        }


@dataclass(frozen=True, slots=True)
class PinnedToolchainResource:
    """A host path that is allowed only as an explicitly pinned resource.

    ``root`` is used at materialization time for containment checks.  Only the
    stable name and digest enter the closure record, so two workers with
    different host mount points produce the same input digest.
    """

    name: str
    root: Path
    digest: str


@dataclass(frozen=True, slots=True)
class ToolchainResource:
    """Stable toolchain identity recorded in a closure."""

    name: str
    digest: str

    def to_dict(self) -> dict[str, str]:
        return {"name": self.name, "digest": self.digest}


@dataclass(frozen=True, slots=True)
class EnvBinding:
    """A variable used by a resolved path and its canonical value."""

    name: str
    value: str

    def to_dict(self) -> dict[str, str]:
        return {"name": self.name, "value": self.value}


@dataclass(frozen=True, slots=True)
class ResolvedLibraryPath:
    """A project path reference and its closure/toolchain destination."""

    source_path: str
    reference: str
    resolved_path: str
    location: str

    def to_dict(self) -> dict[str, str]:
        return {
            "source_path": self.source_path,
            "reference": self.reference,
            "resolved_path": self.resolved_path,
            "location": self.location,
        }


@dataclass(frozen=True, slots=True)
class InputClosure:
    """The typed, hashed result of a Release Studio input materialization."""

    commit_sha: str
    repository_inputs: tuple[RepositoryInput, ...]
    submodule_inputs: tuple[SubmoduleInput, ...] = ()
    lfs_inputs: tuple[LfsInput, ...] = ()
    toolchain_resources: tuple[ToolchainResource, ...] = ()
    env_bindings: tuple[EnvBinding, ...] = ()
    library_references: tuple[ResolvedLibraryPath, ...] = ()
    repository_path: str = "."
    project_path: str = "."
    materialized_root: Path = field(default=Path("."), compare=False, repr=False)
    input_closure_digest: str = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "input_closure_digest", _digest_json(self.to_dict(False)))

    def to_dict(self, include_digest: bool = True) -> dict[str, Any]:
        """Return a stable JSON-shaped closure record."""

        payload: dict[str, Any] = {
            "commit_sha": self.commit_sha,
            "repository_path": self.repository_path,
            "project_path": self.project_path,
            "repository_inputs": _sorted_records(self.repository_inputs),
            "submodule_inputs": _sorted_records(self.submodule_inputs),
            "lfs_inputs": _sorted_records(self.lfs_inputs),
            "toolchain_resources": _sorted_records(self.toolchain_resources),
            "env_bindings": _sorted_records(self.env_bindings),
            "library_references": _sorted_records(self.library_references),
        }
        if include_digest:
            payload["input_closure_digest"] = self.input_closure_digest
        return payload

    @property
    def digest(self) -> str:
        """Compatibility spelling for consumers that call the record's digest."""

        return self.input_closure_digest


@dataclass(frozen=True, slots=True)
class _LfsPointer:
    oid: str
    size: int


@dataclass(frozen=True, slots=True)
class _TreeResult:
    repository_inputs: tuple[RepositoryInput, ...]
    submodule_inputs: tuple[SubmoduleInput, ...]
    lfs_inputs: tuple[LfsInput, ...]
    tree_digest: str


@dataclass(frozen=True, slots=True)
class _ToolchainSpec:
    name: str
    root: Path
    digest: str

    def record(self) -> ToolchainResource:
        return ToolchainResource(self.name, self.digest)


def materialize_input_closure(
    repo_path: str | Path,
    commit: str,
    destination: str | Path,
    *,
    relative_path: str | None = None,
    project_path: str | Path | None = None,
    source_checkout: str | Path | None = None,
    env: Mapping[str, str] | None = None,
    toolchain_resources: (
        Mapping[str, PinnedToolchainResource | Mapping[str, str] | str | Path]
        | Sequence[PinnedToolchainResource]
        | None
    ) = None,
) -> InputClosure:
    """Materialize the full repository tree for ``commit``.

    ``relative_path`` affects only ``KIPRJMOD`` resolution; the entire
    repository is always walked.  ``source_checkout`` is normally unnecessary
    because ``repo_path`` is the repository worktree, but is accepted to make
    the project/subproject distinction explicit for callers using
    ``design_compare_service._repo_paths``.

    The function never checks out, updates, stages, or writes to ``repo_path``.
    It reads Git objects and (only for detected LFS pointers) reads the
    corresponding worktree file to verify already-hydrated bytes.
    """

    repo = Path(repo_path)
    if not repo.is_dir():
        raise ClosureError(f"repository path is not a directory: {repo}")
    source = Path(source_checkout) if source_checkout is not None else repo
    if not source.is_dir():
        raise ClosureError(f"source checkout is not a directory: {source}")

    commit_sha = _resolve_commit(repo, commit)
    project_rel = _project_relative_path(repo, relative_path, project_path)
    output = Path(destination)
    _prepare_destination(output)

    # The source checkout is validated for clarity, but the root tree is read
    # from repo_path so a Type-2 project cannot accidentally become a subpath
    # archive.  LFS paths still resolve against the repository worktree.
    _assert_inside_repository(repo, source)
    result = _walk_tree(
        object_repo=repo,
        source_worktree=repo,
        treeish=commit_sha,
        destination=output,
        global_prefix="",
        local_prefix="",
    )

    specs = _coerce_toolchain_resources(toolchain_resources)
    references, bindings = _resolve_project_paths(
        output,
        result.repository_inputs,
        project_rel,
        env or {},
        specs,
    )
    return InputClosure(
        commit_sha=commit_sha,
        repository_inputs=result.repository_inputs,
        submodule_inputs=result.submodule_inputs,
        lfs_inputs=result.lfs_inputs,
        toolchain_resources=tuple(spec.record() for spec in specs),
        env_bindings=tuple(bindings),
        library_references=tuple(references),
        project_path=project_rel,
        materialized_root=output,
    )


def materialize_project_input_closure(
    project_id: str,
    commit: str,
    destination: str | Path,
    *,
    env: Mapping[str, str] | None = None,
    toolchain_resources: (
        Mapping[str, PinnedToolchainResource | Mapping[str, str] | str | Path]
        | Sequence[PinnedToolchainResource]
        | None
    ) = None,
) -> InputClosure:
    """Resolve a Prism project/subproject and materialize its full repo tree."""

    # Keep this import local: the closure module is also used in isolated Git
    # fixture tests and must not import the stateful workspace service at module
    # import time.
    from app.services.design_compare_service import _repo_paths

    repo, relative_path, checkout = _repo_paths(project_id)
    return materialize_input_closure(
        repo,
        commit,
        destination,
        relative_path=relative_path,
        source_checkout=checkout,
        env=env,
        toolchain_resources=toolchain_resources,
    )


# The shorter name is useful at call sites and keeps the public seam easy to
# discover without duplicating implementation.
build_input_closure = materialize_input_closure


def _resolve_commit(repo: Path, commit: str) -> str:
    if not commit or not isinstance(commit, str):
        raise GitTreeError("a non-empty commit is required")
    resolved = _git(repo, "rev-parse", "--verify", f"{commit}^{{commit}}").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", resolved):
        raise GitTreeError(f"Git returned an invalid commit id for {commit!r}")
    return resolved.lower()


def _project_relative_path(
    repo: Path,
    relative_path: str | None,
    project_path: str | Path | None,
) -> str:
    raw: str
    if relative_path is not None:
        raw = os.fspath(relative_path)
    elif project_path is not None:
        candidate = Path(project_path)
        if candidate.is_absolute():
            try:
                raw = candidate.resolve().relative_to(repo.resolve()).as_posix()
            except ValueError as exc:
                raise ClosureError(
                    f"project path escapes repository: {project_path}"
                ) from exc
        else:
            raw = candidate.as_posix()
    else:
        return "."
    return _normalise_relative_path(raw, label="project path") or "."


def _normalise_relative_path(value: str, *, label: str) -> str:
    value = value.replace("\\", "/")
    if value in {"", "."}:
        return ""
    if value.startswith("/"):
        raise ClosureError(f"{label} must be repository-relative: {value!r}")
    parts = value.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise ClosureError(f"{label} contains an unsafe component: {value!r}")
    return "/".join(parts)


def _assert_inside_repository(repo: Path, source: Path) -> None:
    try:
        source.resolve().relative_to(repo.resolve())
    except ValueError as exc:
        raise ClosureError(f"source checkout escapes repository: {source}") from exc


def _prepare_destination(destination: Path) -> None:
    if destination.exists() or destination.is_symlink():
        if destination.is_symlink() or not destination.is_dir():
            raise ClosureError(f"materialization destination is not a directory: {destination}")
        try:
            next(destination.iterdir())
        except StopIteration:
            return
        raise ClosureError(f"materialization destination must be empty: {destination}")
    destination.mkdir(parents=True, exist_ok=False)


def _walk_tree(
    *,
    object_repo: Path,
    source_worktree: Path,
    treeish: str,
    destination: Path,
    global_prefix: str,
    local_prefix: str,
) -> _TreeResult:
    repository_inputs: list[RepositoryInput] = []
    submodule_inputs: list[SubmoduleInput] = []
    lfs_inputs: list[LfsInput] = []

    for mode, object_type, object_id, name in _list_tree(object_repo, treeish):
        global_path = _join_git_path(global_prefix, name)
        local_path = _join_git_path(local_prefix, name)
        target = _materialized_path(destination, global_path)

        if object_type == "tree":
            _make_directory(target)
            child = _walk_tree(
                object_repo=object_repo,
                source_worktree=source_worktree,
                treeish=object_id,
                destination=destination,
                global_prefix=global_path,
                local_prefix=local_path,
            )
            repository_inputs.extend(child.repository_inputs)
            submodule_inputs.extend(child.submodule_inputs)
            lfs_inputs.extend(child.lfs_inputs)
            continue

        if object_type == "commit" and mode == "160000":
            _make_directory(target)
            # ``global_path`` includes the parent submodule prefix, while the
            # current worktree is already rooted at this repository.  Use the
            # local path here so nested gitlinks resolve to
            # ``parent_worktree/nested`` rather than repeating the prefix.
            submodule_worktree = source_worktree / Path(*local_path.split("/"))
            if not submodule_worktree.is_dir() or submodule_worktree.is_symlink():
                raise GitTreeError(
                    f"submodule {global_path!r} is not materialized in the source checkout"
                )
            child = _walk_tree(
                object_repo=submodule_worktree,
                source_worktree=submodule_worktree,
                treeish=object_id,
                destination=destination,
                global_prefix=global_path,
                local_prefix="",
            )
            repository_inputs.extend(child.repository_inputs)
            submodule_inputs.extend(child.submodule_inputs)
            lfs_inputs.extend(child.lfs_inputs)
            submodule_inputs.append(
                SubmoduleInput(
                    path=global_path,
                    gitlink_sha=object_id,
                    resolved_tree_digest=child.tree_digest,
                )
            )
            repository_inputs.append(
                RepositoryInput(
                    path=global_path,
                    git_object_id=object_id,
                    mode=mode,
                    type="gitlink",
                    materialized_digest=child.tree_digest,
                )
            )
            continue

        if object_type != "blob":
            raise GitTreeError(
                f"unsupported Git tree entry {global_path!r}: {mode} {object_type}"
            )

        blob = _git(object_repo, "cat-file", "blob", object_id, raw=True)
        if mode == "120000":
            _write_symlink(target, blob, global_path)
            input_type = "symlink"
            materialized_digest = hashlib.sha256(blob).hexdigest()
        elif mode in {"100644", "100755"}:
            pointer = _parse_lfs_pointer(blob)
            if pointer is not None:
                materialized = _hydrate_lfs(
                    source_worktree / Path(*local_path.split("/")),
                    pointer,
                    global_path,
                )
                _write_file(target, materialized, mode, global_path)
                digest = hashlib.sha256(materialized).hexdigest()
                lfs_inputs.append(
                    LfsInput(
                        path=global_path,
                        pointer_blob_sha=object_id,
                        lfs_oid=f"sha256:{pointer.oid}",
                        materialized_digest=digest,
                    )
                )
                materialized_digest = digest
            else:
                _write_file(target, blob, mode, global_path)
                materialized_digest = hashlib.sha256(blob).hexdigest()
            input_type = "regular_file"
        else:
            raise GitTreeError(f"unsupported Git file mode {mode} at {global_path!r}")

        repository_inputs.append(
            RepositoryInput(
                path=global_path,
                git_object_id=object_id,
                mode=mode,
                type=input_type,
                materialized_digest=materialized_digest,
            )
        )

    tree_digest = _digest_json(
        {
            "tree_object_id": treeish,
            "repository_inputs": _sorted_records(repository_inputs),
            "submodule_inputs": _sorted_records(submodule_inputs),
            "lfs_inputs": _sorted_records(lfs_inputs),
        }
    )
    return _TreeResult(
        repository_inputs=tuple(repository_inputs),
        submodule_inputs=tuple(submodule_inputs),
        lfs_inputs=tuple(lfs_inputs),
        tree_digest=tree_digest,
    )


def _list_tree(repo: Path, treeish: str) -> list[tuple[str, str, str, str]]:
    output = _git(repo, "ls-tree", "-z", treeish, raw=True)
    entries: list[tuple[str, str, str, str]] = []
    for record in output.split(b"\0"):
        if not record:
            continue
        try:
            header, raw_name = record.split(b"\t", 1)
            mode, object_type, object_id = header.decode("ascii").split(" ")
            name = raw_name.decode("utf-8", errors="surrogateescape")
        except (ValueError, UnicodeError) as exc:
            raise GitTreeError(f"could not parse Git tree entry in {treeish}") from exc
        entries.append((mode, object_type, object_id, name))
    return entries


def _join_git_path(prefix: str, name: str) -> str:
    if not name or name in {".", ".."} or "/" in name or "\0" in name:
        raise GitTreeError(f"unsafe Git tree name: {name!r}")
    path = f"{prefix}/{name}" if prefix else name
    parts = path.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise GitTreeError(f"unsafe Git tree path: {path!r}")
    return path


def _materialized_path(destination: Path, relative_path: str) -> Path:
    target = destination.joinpath(*relative_path.split("/"))
    try:
        target.parent.resolve().relative_to(destination.resolve())
    except ValueError as exc:
        raise ClosureError(f"materialized path escapes destination: {relative_path}") from exc
    return target


def _make_directory(path: Path) -> None:
    if path.exists() or path.is_symlink():
        if path.is_symlink() or not path.is_dir():
            raise ClosureError(f"materialized path is not a directory: {path}")
        return
    parent = path.parent
    if parent != path:
        _make_directory(parent)
    path.mkdir()


def _write_file(path: Path, content: bytes, mode: str, relative_path: str) -> None:
    _make_directory(path.parent)
    try:
        with path.open("xb") as handle:
            handle.write(content)
        os.chmod(path, 0o755 if mode == "100755" else 0o644)
    except FileExistsError as exc:
        raise ClosureError(f"duplicate materialized path: {relative_path}") from exc


def _write_symlink(path: Path, content: bytes, relative_path: str) -> None:
    _make_directory(path.parent)
    try:
        os.symlink(os.fsdecode(content), path)
    except FileExistsError as exc:
        raise ClosureError(f"duplicate materialized path: {relative_path}") from exc


def _parse_lfs_pointer(content: bytes) -> _LfsPointer | None:
    if not content.startswith(_LFS_POINTER_VERSION.encode("ascii")):
        return None
    try:
        lines = content.decode("ascii").splitlines()
    except UnicodeDecodeError as exc:
        raise LfsMaterializationError("malformed Git LFS pointer is not ASCII") from exc
    if not lines or lines[0] != _LFS_POINTER_VERSION:
        raise LfsMaterializationError("malformed Git LFS pointer version")
    values: dict[str, str] = {}
    for line in lines[1:]:
        key, separator, value = line.partition(" ")
        if separator:
            values[key] = value
    oid = values.get("oid", "")
    if not oid.startswith("sha256:") or not _SHA256_RE.fullmatch(oid[7:]):
        raise LfsMaterializationError("malformed Git LFS pointer oid")
    try:
        size = int(values["size"])
    except (KeyError, ValueError) as exc:
        raise LfsMaterializationError("malformed Git LFS pointer size") from exc
    if size < 0:
        raise LfsMaterializationError("malformed Git LFS pointer has negative size")
    return _LfsPointer(oid=oid[7:], size=size)


def _hydrate_lfs(source_path: Path, pointer: _LfsPointer, relative_path: str) -> bytes:
    try:
        source_stat = source_path.lstat()
    except FileNotFoundError as exc:
        raise LfsMaterializationError(
            f"LFS content is not materialized for {relative_path!r}"
        ) from exc
    if not stat.S_ISREG(source_stat.st_mode):
        raise LfsMaterializationError(
            f"LFS content is not a regular materialized file for {relative_path!r}"
        )
    materialized = source_path.read_bytes()
    if _parse_lfs_pointer(materialized) is not None:
        raise LfsMaterializationError(
            f"LFS pointer remains unmaterialized for {relative_path!r}"
        )
    if len(materialized) != pointer.size:
        raise LfsMaterializationError(
            f"LFS size mismatch for {relative_path!r}: expected {pointer.size}, "
            f"got {len(materialized)}"
        )
    digest = hashlib.sha256(materialized).hexdigest()
    if digest != pointer.oid:
        raise LfsMaterializationError(
            f"LFS sha256 mismatch for {relative_path!r}: expected {pointer.oid}, "
            f"got {digest}"
        )
    return materialized


def _coerce_toolchain_resources(
    resources: (
        Mapping[str, PinnedToolchainResource | Mapping[str, str] | str | Path]
        | Sequence[PinnedToolchainResource]
        | None
    ),
) -> tuple[_ToolchainSpec, ...]:
    if resources is None:
        return ()
    if isinstance(resources, Mapping):
        items: Iterable[tuple[str, Any]] = resources.items()
    else:
        items = ((resource.name, resource) for resource in resources)

    specs: dict[str, _ToolchainSpec] = {}
    for name, value in items:
        if not name or not isinstance(name, str):
            raise ClosureError("toolchain resource names must be non-empty strings")
        if isinstance(value, PinnedToolchainResource):
            root = Path(value.root)
            digest = _verify_resource_digest(name, root, value.digest)
            resource_name = value.name or name
        elif isinstance(value, Mapping):
            raw_root = value.get("root") or value.get("path")
            supplied_digest = value.get("digest")
            if not raw_root:
                raise ClosureError(f"toolchain resource {name!r} has no root")
            if supplied_digest is None:
                raise ClosureError(f"toolchain resource {name!r} has no pinned digest")
            root = Path(os.fspath(raw_root))
            digest = _verify_resource_digest(name, root, supplied_digest)
            resource_name = name
        else:
            root = Path(os.fspath(value))
            resource_name = name
            digest = resource_root_digest(root)
        specs[resource_name] = _ToolchainSpec(
            name=resource_name,
            root=root.resolve(strict=False),
            digest=digest,
        )
    return tuple(specs[name] for name in sorted(specs))


def _digest_path(path: Path) -> str:
    """Hash a resource tree without embedding its host path."""

    if not path.exists() or not path.is_dir():
        raise ClosureError(f"toolchain resource root is not a directory: {path}")
    entries: list[dict[str, str]] = []
    for item in sorted(path.rglob("*"), key=lambda value: value.as_posix()):
        relative = item.relative_to(path).as_posix()
        item_stat = item.lstat()
        if stat.S_ISDIR(item_stat.st_mode):
            continue
        if stat.S_ISLNK(item_stat.st_mode):
            content = os.fsencode(os.readlink(item))
            item_type = "symlink"
        elif stat.S_ISREG(item_stat.st_mode):
            content = item.read_bytes()
            item_type = "regular_file"
        else:
            raise ClosureError(f"unsupported toolchain resource entry: {item}")
        entries.append(
            {
                "path": relative,
                "mode": stat.S_IMODE(item_stat.st_mode).__format__("04o"),
                "type": item_type,
                "digest": hashlib.sha256(content).hexdigest(),
            }
        )
    return _digest_json(entries)


def resource_root_digest(path: str | Path) -> str:
    """Return the canonical content/tree digest for a pinned resource root."""

    return _digest_path(Path(path).resolve(strict=False))


def _verify_resource_digest(name: str, root: Path, supplied: object) -> str:
    digest = str(supplied).strip()
    if not digest:
        raise ClosureError(f"toolchain resource {name!r} has no pinned digest")
    if not _RESOURCE_DIGEST_RE.fullmatch(digest):
        raise ClosureError(
            f"toolchain resource {name!r} digest must be canonical lowercase "
            "64-hex SHA-256"
        )
    actual = resource_root_digest(root)
    if digest != actual:
        raise ClosureError(
            f"toolchain resource {name!r} digest mismatch: supplied {digest}, "
            f"resolved root has {actual}"
        )
    return digest


def _resolve_project_paths(
    destination: Path,
    repository_inputs: Sequence[RepositoryInput],
    project_rel: str,
    env: Mapping[str, str],
    toolchain_specs: Sequence[_ToolchainSpec],
) -> tuple[list[ResolvedLibraryPath], list[EnvBinding]]:
    resolver = _PathResolver(destination, project_rel, env, toolchain_specs)
    references: list[tuple[str, str, str]] = []
    for item in repository_inputs:
        if item.type != "regular_file":
            continue
        if item.path.rsplit("/", 1)[-1].casefold() in {"fp-lib-table", "sym-lib-table"}:
            text = _read_materialized_text(destination, item.path)
            for match in _URI_RE.finditer(text):
                reference = _decode_kicad_string(match.group(1) or match.group(2) or "")
                references.append((item.path, reference, "library_table"))
            # A table may use a path-bearing quoted value without an uri field
            # in a legacy hand-written fixture; variable references are still
            # resolved below.
            for value in _quoted_values(text):
                if _is_path_reference(value):
                    references.append((item.path, value, "library_table"))
        elif _is_path_input(item.path):
            text = _read_materialized_text(destination, item.path)
            for value in _quoted_values(text):
                if _is_path_reference(value):
                    references.append((item.path, value, "project_path"))
            for match in _VARIABLE_RE.finditer(text):
                value = _unquoted_reference(text, match.start(), match.end())
                if _is_path_reference(value):
                    references.append((item.path, value, "project_path"))

    deduped = sorted(set(references), key=lambda item: item)
    resolved = [resolver.resolve(source, reference, kind) for source, reference, kind in deduped]
    return resolved, sorted(resolver.bindings.values(), key=lambda binding: binding.name)


class _PathResolver:
    def __init__(
        self,
        destination: Path,
        project_rel: str,
        env: Mapping[str, str],
        toolchain_specs: Sequence[_ToolchainSpec],
    ) -> None:
        self.destination = destination
        self.destination_root = destination.resolve()
        self.project_rel = project_rel
        self.project_root = destination / Path(*project_rel.split("/")) if project_rel != "." else destination
        self.env = dict(env)
        self.toolchain_specs = {spec.name: spec for spec in toolchain_specs}
        self.bindings: dict[str, EnvBinding] = {}

    def resolve(self, source_path: str, reference: str, kind: str) -> ResolvedLibraryPath:
        if not reference:
            raise ClosureError(f"empty path reference in {source_path}")
        expanded = self._expand(reference)
        if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", expanded):
            raise ExternalPathError(
                f"network or unsupported URI in {source_path}: {reference!r}"
            )
        if expanded == "~" or expanded.startswith("~/"):
            raise ExternalPathError(
                f"home-relative path is not allowed in closure paths: {reference!r}"
            )
        candidate = Path(expanded)
        if not candidate.is_absolute():
            candidate = self.project_root / candidate
        resolved = candidate.resolve(strict=False)
        try:
            relative = resolved.relative_to(self.destination_root).as_posix()
        except ValueError:
            for spec in self.toolchain_specs.values():
                try:
                    toolchain_relative = resolved.relative_to(spec.root).as_posix()
                except ValueError:
                    continue
                if not resolved.exists():
                    raise ClosureError(
                        f"path reference does not exist in the closure/toolchain: "
                        f"{source_path}: {reference!r} -> {resolved}"
                    )
                return ResolvedLibraryPath(
                    source_path=source_path,
                    reference=reference,
                    resolved_path=f"toolchain:{spec.name}/{toolchain_relative}",
                    location="toolchain",
                )
            raise ExternalPathError(
                f"path reference escapes the release closure: "
                f"{source_path}: {reference!r} -> {resolved}"
            )
        if not resolved.exists():
            raise ClosureError(
                f"path reference does not exist in the closure/toolchain: "
                f"{source_path}: {reference!r} -> {resolved}"
            )
        return ResolvedLibraryPath(
            source_path=source_path,
            reference=reference,
            resolved_path=relative or ".",
            location="closure",
        )

    def _expand(self, reference: str) -> str:
        expanded = reference
        for _ in range(8):
            match = _VARIABLE_RE.search(expanded)
            if match is None:
                return expanded
            name = match.group(1)
            replacement = self._value(name)
            expanded = expanded[: match.start()] + replacement + expanded[match.end() :]
        raise ClosureError(f"environment variable expansion is recursive: {reference!r}")

    def _value(self, name: str) -> str:
        if name == "KIPRJMOD":
            value = self.project_rel
            self.bindings[name] = EnvBinding(name, value)
            return os.fspath(self.project_root)
        spec = self.toolchain_specs.get(name)
        if spec is not None:
            self.bindings[name] = EnvBinding(name, f"toolchain:{spec.name}")
            return os.fspath(spec.root)
        if name not in self.env:
            raise ExternalPathError(f"unbound environment variable in closure path: {name}")
        value = str(self.env[name])
        if not value:
            raise ExternalPathError(f"empty environment binding in closure path: {name}")
        if value == "~" or value.startswith("~/"):
            raise ExternalPathError(
                f"home-relative environment binding is not allowed: {name}"
            )
        candidate = Path(value)
        if candidate.is_absolute():
            resolved = candidate.resolve(strict=False)
            try:
                canonical = resolved.relative_to(self.destination_root).as_posix()
                self.bindings[name] = EnvBinding(name, f"closure:{canonical or '.'}")
                return os.fspath(resolved)
            except ValueError:
                for spec in self.toolchain_specs.values():
                    try:
                        resource_relative = resolved.relative_to(spec.root).as_posix()
                    except ValueError:
                        continue
                    stable = f"toolchain:{spec.name}"
                    if resource_relative:
                        stable += f"/{resource_relative}"
                    self.bindings[name] = EnvBinding(name, stable)
                    return os.fspath(resolved)
                raise ExternalPathError(
                    f"host environment binding escapes closure/toolchain: {name}={value!r}"
                )
        stable = f"project:{self.project_rel}/{value}" if self.project_rel != "." else f"project:{value}"
        self.bindings[name] = EnvBinding(name, stable)
        return os.fspath(self.project_root / candidate)


def _is_path_input(path: str) -> bool:
    suffix = Path(path).suffix.casefold()
    return suffix in _PATH_INPUT_SUFFIXES or Path(path).name.casefold() in {
        "fp-lib-table",
        "sym-lib-table",
    }


def _is_path_reference(value: str) -> bool:
    return bool(_VARIABLE_RE.search(value)) and (
        "/" in value or "\\" in value or value.startswith("${")
    )


def _read_materialized_text(destination: Path, relative_path: str) -> str:
    path = _materialized_path(destination, relative_path)
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        # Binary inputs cannot contain a meaningful KiCad path reference.
        return ""


def _quoted_values(text: str) -> list[str]:
    return [_decode_kicad_string(match.group(1)) for match in _QUOTED_RE.finditer(text)]


def _decode_kicad_string(value: str) -> str:
    return value.replace(r"\"", '"').replace(r"\\", "\\")


def _unquoted_reference(text: str, start: int, end: int) -> str:
    while start > 0 and text[start - 1] not in "\"' (\n\r\t":
        start -= 1
    while end < len(text) and text[end] not in "\"' )\n\r\t,":
        end += 1
    return _decode_kicad_string(text[start:end])


def _sorted_records(records: Iterable[Any]) -> list[dict[str, Any]]:
    values = [record.to_dict() for record in records]
    return sorted(values, key=lambda value: tuple(str(item) for item in value.values()))


def _digest_json(value: Any) -> str:
    """Use the shared R4 canonical JSON/hash boundary for closure records."""

    return sha256_canonical(value)


def _git(repo: Path, *args: str, raw: bool = False) -> str | bytes:
    command = ["git", "-C", os.fspath(repo), *args]
    process = subprocess.run(
        command,
        check=False,
        capture_output=True,
        shell=False,
    )
    if process.returncode != 0:
        detail = process.stderr.decode("utf-8", errors="replace").strip()
        raise GitTreeError(
            f"Git command failed ({' '.join(command[1:])}): {detail or 'unknown error'}"
        )
    return process.stdout if raw else process.stdout.decode("utf-8", errors="replace").strip()


__all__ = [
    "ClosureError",
    "EnvBinding",
    "ExternalPathError",
    "GitTreeError",
    "InputClosure",
    "LfsInput",
    "LfsMaterializationError",
    "PinnedToolchainResource",
    "RepositoryInput",
    "ResolvedLibraryPath",
    "SubmoduleInput",
    "ToolchainResource",
    "build_input_closure",
    "materialize_input_closure",
    "materialize_project_input_closure",
    "resource_root_digest",
]
