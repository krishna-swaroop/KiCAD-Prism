# Release Studio R2b — input closure

R2b adds the technical input closure used before a Release Studio build.  Its
entry point is `app.release_studio.closure.materialize_input_closure`; the
project-aware wrapper, `materialize_project_input_closure`, resolves a
monorepo project through `design_compare_service._repo_paths`.

## Materialization contract

Given a repository worktree, an exact commit, and an empty destination, R2b:

- walks the entire commit tree, regardless of the project subpath;
- preserves regular-file modes and symlinks and includes
  `.prism/release-studio/**/*.yaml`;
- expands each gitlink at its recorded commit, recursively, and writes the
  submodule files into the destination;
- treats a Git LFS pointer as a binding to the pointer blob plus the hydrated
  worktree bytes.  A missing, pointer-shaped, wrong-sized, or wrong-sha256
  worktree file raises `LfsMaterializationError`;
- resolves `fp-lib-table`, `sym-lib-table`, and path-bearing `${VAR}`
  references.  A reference must resolve inside the materialized closure or a
  caller-supplied `PinnedToolchainResource`; host, home-relative, network, and
  unbound paths are rejected; and
- writes only to the destination.  It never checks out, updates, stages, or
  modifies the source repository.

`relative_path` controls only the canonical `KIPRJMOD` binding.  It does not
turn the materialization into a subpath snapshot, so a table such as
`${KIPRJMOD}/../../common/footprints` works for a monorepo project.

## Closure record and digest

`InputClosure.to_dict()` exposes the typed record:

```text
repository_inputs[]  { path, git_object_id, mode, type, materialized_digest }
submodule_inputs[]   { path, gitlink_sha, resolved_tree_digest, recursive }
lfs_inputs[]         { path, pointer_blob_sha, lfs_oid, materialized_digest }
toolchain_resources  { name, digest }  # verified resource-root digest
env_bindings[]       { name, value }
library_references[] { source_path, reference, resolved_path, location }
```

The record also binds the resolved commit and project path.  All paths are
repository-relative; host checkout and destination paths are deliberately
excluded.  Records are sorted before hashing, and
`input_closure_digest` is produced with the shared R4
`app.release_studio.canonical.sha256_canonical` boundary.  Consequently two
independent materializations of the same commit and pinned resources have the
same digest, while a regular file and a symlink differ through their mode/type
record even when they point at equivalent content.  `digest` for a supplied
`PinnedToolchainResource` or `{root, digest}` mapping must be a canonical
lowercase 64-hex SHA-256.  R2b recomputes that digest from the resolved
resource-root tree (relative paths, modes/types, and file or symlink content)
and fails closed on a mismatch.  A bare resource path derives the same digest
automatically.  Only the stable digest enters the record, never the host path,
so identical trees at different mount points remain path-independent.

This verified resource-bundle digest is separate from the later
`toolchain_digest` identity: R00/R00a bind the executor to the pinned OCI image
digest, while R2b verifies the mounted project/toolchain resource root.  R2b
does not redesign the executor/toolchain identity composition.

The dynamic tests in `backend/tests/test_release_studio_closure.py` build small
local repositories with nested submodules and LFS pointer blobs.  They do not
download dependencies or commit binary fixtures.
