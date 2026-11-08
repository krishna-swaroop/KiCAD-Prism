"""Persistence for the KiCad path libraries an administrator declares (``ws_kicad_libraries``).

The row is the declaration (name, variables, source, update policy) and the
fetch and check's reported state. Whether a library resolves is decided by the
published version on disk, not by ``state``, so a stale row never binds a
variable to a missing folder. Every write bumps ``row_version`` (the ETag the
console sends back as ``If-Match``) and forgets the resolver's cached rows in
this process; the others pick it up within its TTL.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterable, Iterator

from psycopg.types.json import Jsonb

from app.core import preconditions
from app.core.errors import Conflict, Invalid, NotFound, StaleVersion
from app.services import kicad_libraries
from app.services.postgres_database import database

ETAG_KIND = "kicad-library"
STATES = ("pending", "fetching", "ready", "failed")
#: ``record_*``'s "leave this column alone" marker.
UNSET = object()
#: Published versions kept in the history per library.
KEPT_VERSIONS = 10

_COLUMNS = (
    "name, kind, variables, git_url, ref, subdir, path, update_policy, pinned_commit, fetched_commit, "
    "check_interval_seconds, last_checked_at, last_check_error, remote_commit, generation, state, error, "
    "progress, size_bytes, fetched_at, row_version, created_at, updated_at, updated_by"
)


@contextmanager
def connect() -> Iterator[Any]:
    with database.connection() as conn:
        conn.execute("SET search_path TO workspace, public")
        yield conn


def etag_of(row: dict[str, Any]) -> str:
    return preconditions.etag(ETAG_KIND, row["name"], row["row_version"])


def _entry(row: dict[str, Any]) -> dict[str, Any]:
    """A row in the form :func:`kicad_libraries.validate_entry` takes."""

    return {
        "name": row["name"],
        "variables": row["variables"],
        "git": row["git_url"],
        "ref": row["ref"],
        "subdir": row["subdir"],
        "path": row["path"],
        "update_policy": row["update_policy"],
        "pinned_commit": row["pinned_commit"],
        "check_interval_seconds": row["check_interval_seconds"],
        "generation": row["generation"],
    }


def declared() -> list[dict[str, Any]]:
    """Every row, in the form :func:`kicad_libraries.validate_entry` takes."""

    with connect() as conn:
        rows = conn.execute(f"SELECT {_COLUMNS} FROM ws_kicad_libraries ORDER BY name").fetchall()
    return [_entry(row) for row in rows]


def list_all() -> list[dict[str, Any]]:
    with connect() as conn:
        return [_view(row) for row in conn.execute(f"SELECT {_COLUMNS} FROM ws_kicad_libraries ORDER BY name").fetchall()]


def get(name: str) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute(f"SELECT {_COLUMNS} FROM ws_kicad_libraries WHERE name = %s", (name,)).fetchone()
    if row is None:
        raise NotFound(f"There is no library named {name}")
    return _view(row)


def versions(name: str) -> list[dict[str, Any]]:
    """The versions a library published, newest first."""

    with connect() as conn:
        rows = conn.execute(
            "SELECT commit, ref, fetched_at, requested_by FROM ws_kicad_library_versions "
            "WHERE name = %s ORDER BY fetched_at DESC",
            (name,),
        ).fetchall()
    return [
        {"commit": r["commit"], "ref": r["ref"], "fetchedAt": r["fetched_at"], "requestedBy": r["requested_by"]}
        for r in rows
    ]


def create(fields: dict[str, Any], *, updated_by: str) -> dict[str, Any]:
    """Declare a library; it is fetched afterwards. Raises ``Invalid`` or ``Conflict``."""

    library = _checked(fields)
    with connect() as conn:
        _require_free(library, _taken_variables(conn, exclude=None))
        try:
            row = conn.execute(
                f"""
                INSERT INTO ws_kicad_libraries
                    (name, kind, variables, git_url, ref, subdir, path, update_policy, pinned_commit,
                     check_interval_seconds, updated_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING {_COLUMNS}
                """,
                (
                    library.name,
                    "path" if library.path else "git",
                    Jsonb(list(library.variables)),
                    library.git or None,
                    library.ref or None,
                    library.subdir,
                    library.path or None,
                    library.update_policy,
                    library.pinned_commit or None,
                    library.check_interval_seconds,
                    updated_by,
                ),
            ).fetchone()
        except Exception as error:
            if getattr(error, "sqlstate", "") == "23505":
                raise Conflict(f"A library named {library.name} already exists") from error
            raise
    kicad_libraries.forget_rows()
    return _view(row)


def update(name: str, fields: dict[str, Any], *, expected_version: int | None, updated_by: str) -> dict[str, Any]:
    """Change a declaration. A new source, ref or subfolder marks the fetch ``pending``.

    The published version keeps serving until a fetch replaces it. Pinning
    without a commit pins what is served now; following clears the pin; a new
    ref clears the pin, so the next fetch resolves it.
    """

    with connect() as conn:
        current = conn.execute(f"SELECT {_COLUMNS} FROM ws_kicad_libraries WHERE name = %s FOR UPDATE", (name,)).fetchone()
        if current is None:
            raise NotFound(f"There is no library named {name}")
        if expected_version is not None and expected_version != current["row_version"]:
            raise StaleVersion("The library changed; reload it", headers={"ETag": etag_of(current)})
        merged = {**_entry(current), **fields, "name": name}
        source_changed = any(
            merged.get(k) != _entry(current).get(k) for k in ("git", "ref", "subdir", "path")
        )
        if source_changed and "pinned_commit" not in fields:
            merged["pinned_commit"] = ""
        if merged["update_policy"] == "pinned" and not merged.get("pinned_commit") and not source_changed:
            merged["pinned_commit"] = current["fetched_commit"] or ""
        if merged["update_policy"] == "follow" and "pinned_commit" not in fields:
            merged["pinned_commit"] = ""
        library = _checked(merged)
        _require_free(library, _taken_variables(conn, exclude=name))
        row = conn.execute(
            f"""
            UPDATE ws_kicad_libraries
               SET variables = %s, git_url = %s, ref = %s, subdir = %s, path = %s,
                   update_policy = %s, pinned_commit = %s, check_interval_seconds = %s,
                   state = CASE WHEN %s THEN 'pending' ELSE state END,
                   error = CASE WHEN %s THEN NULL ELSE error END,
                   row_version = row_version + 1, updated_at = now(), updated_by = %s
             WHERE name = %s
            RETURNING {_COLUMNS}
            """,
            (
                Jsonb(list(library.variables)),
                library.git or None,
                library.ref or None,
                library.subdir,
                library.path or None,
                library.update_policy,
                library.pinned_commit or None,
                library.check_interval_seconds,
                source_changed,
                source_changed,
                updated_by,
                name,
            ),
        ).fetchone()
    kicad_libraries.forget_rows()
    return _view(row)


def refresh_path(name: str, *, expected_version: int | None, updated_by: str) -> dict[str, Any]:
    """Bump a path library's generation: its folder's content is read again, and bundles using it refresh."""

    with connect() as conn:
        current = conn.execute(f"SELECT {_COLUMNS} FROM ws_kicad_libraries WHERE name = %s FOR UPDATE", (name,)).fetchone()
        if current is None:
            raise NotFound(f"There is no library named {name}")
        if current["kind"] != "path":
            raise Invalid("Only a path library is refreshed; fetch a git library instead")
        if expected_version is not None and expected_version != current["row_version"]:
            raise StaleVersion("The library changed; reload it", headers={"ETag": etag_of(current)})
        row = conn.execute(
            f"UPDATE ws_kicad_libraries SET generation = generation + 1, row_version = row_version + 1, "
            f"updated_at = now(), updated_by = %s WHERE name = %s RETURNING {_COLUMNS}",
            (updated_by, name),
        ).fetchone()
    kicad_libraries.forget_rows()
    return _view(row)


def delete(name: str, *, expected_version: int | None) -> dict[str, Any]:
    """Forget a library; returns its last view."""

    with connect() as conn:
        current = conn.execute(f"SELECT {_COLUMNS} FROM ws_kicad_libraries WHERE name = %s FOR UPDATE", (name,)).fetchone()
        if current is None:
            raise NotFound(f"There is no library named {name}")
        if expected_version is not None and expected_version != current["row_version"]:
            raise StaleVersion("The library changed; reload it", headers={"ETag": etag_of(current)})
        conn.execute("DELETE FROM ws_kicad_libraries WHERE name = %s", (name,))
    kicad_libraries.forget_rows()
    return _view(current)


def record_fetch(
    name: str,
    *,
    state: str,
    error: str | None | object = UNSET,
    progress: int | None | object = UNSET,
    size_bytes: int | None | object = UNSET,
) -> None:
    """The fetch's progress, as the console shows it; a deleted library is not an error."""

    if state not in STATES:
        raise Invalid(f"Unknown fetch state {state!r}")
    sets, values = ["state = %s", "updated_at = now()"], [state]
    for column, value in (("error", error), ("progress", progress), ("size_bytes", size_bytes)):
        if value is not UNSET:
            sets.append(f"{column} = %s")
            values.append(value)
    with connect() as conn:
        conn.execute(f"UPDATE ws_kicad_libraries SET {', '.join(sets)} WHERE name = %s", (*values, name))


def record_published(name: str, *, commit: str, ref: str, size_bytes: int | None, requested_by: str) -> None:
    """A version is now served: the row says so, and the history keeps it."""

    with connect() as conn:
        conn.execute(
            "UPDATE ws_kicad_libraries SET state = 'ready', progress = 100, error = NULL, fetched_commit = %s, "
            "size_bytes = COALESCE(%s, size_bytes), fetched_at = %s, updated_at = now(), "
            "pinned_commit = CASE WHEN update_policy = 'pinned' AND pinned_commit IS NULL THEN %s ELSE pinned_commit END "
            "WHERE name = %s",
            (commit, size_bytes, datetime.now(timezone.utc), commit, name),
        )
        conn.execute(
            "INSERT INTO ws_kicad_library_versions (name, commit, ref, requested_by) "
            "SELECT %s, %s, %s, %s WHERE EXISTS (SELECT 1 FROM ws_kicad_libraries WHERE name = %s) "
            "ON CONFLICT (name, commit) DO UPDATE SET fetched_at = now(), ref = EXCLUDED.ref",
            (name, commit, ref, requested_by, name),
        )
        conn.execute(
            "DELETE FROM ws_kicad_library_versions WHERE name = %s AND commit NOT IN ("
            "SELECT commit FROM ws_kicad_library_versions WHERE name = %s ORDER BY fetched_at DESC LIMIT %s)",
            (name, name, KEPT_VERSIONS),
        )


def record_check(name: str, *, remote_commit: str | None, error: str | None) -> None:
    """What a check of the remote found; a failed check keeps the last commit it saw."""

    with connect() as conn:
        conn.execute(
            "UPDATE ws_kicad_libraries SET last_checked_at = now(), last_check_error = %s, "
            "remote_commit = COALESCE(%s, remote_commit) WHERE name = %s",
            (error, remote_commit, name),
        )


def claim_due(limit: int) -> list[dict[str, Any]]:
    """Mark the git libraries whose check interval has passed as checked now, and return them.

    Atomic: two workers scanning at once never claim the same library.
    """

    with connect() as conn:
        rows = conn.execute(
            f"""
            UPDATE ws_kicad_libraries SET last_checked_at = now()
             WHERE name IN (
                   SELECT name FROM ws_kicad_libraries
                    WHERE kind = 'git'
                      AND (last_checked_at IS NULL
                           OR last_checked_at < now() - make_interval(secs => check_interval_seconds))
                    ORDER BY last_checked_at NULLS FIRST
                    LIMIT %s
                      FOR UPDATE SKIP LOCKED)
            RETURNING {_COLUMNS}
            """,
            (limit,),
        ).fetchall()
    return [_view(row) for row in rows]


def replace_usage(project_id: str, revision_key: str, models: dict[str, int], sheets: dict[str, int]) -> None:
    """The variables a project's latest models build found: how many models and sheets use each."""

    names = sorted(set(models) | set(sheets))
    with connect() as conn:
        conn.execute("DELETE FROM ws_kicad_variable_usage WHERE project_id = %s", (project_id,))
        for variable in names:
            conn.execute(
                "INSERT INTO ws_kicad_variable_usage (project_id, variable, model_count, sheet_refs, revision_key) "
                "VALUES (%s, %s, %s, %s, %s)",
                (project_id, variable, models.get(variable, 0), sheets.get(variable, 0), revision_key),
            )


def usage() -> list[dict[str, Any]]:
    """Per variable, how many projects and models use it (for projects that still exist)."""

    with connect() as conn:
        rows = conn.execute(
            "SELECT u.variable, COUNT(*) AS projects, SUM(u.model_count) AS models, SUM(u.sheet_refs) AS sheets "
            "FROM ws_kicad_variable_usage u JOIN ws_projects p ON p.id = u.project_id "
            "GROUP BY u.variable ORDER BY u.variable"
        ).fetchall()
    return [
        {"variable": r["variable"], "projects": int(r["projects"]), "models": int(r["models"]), "sheets": int(r["sheets"])}
        for r in rows
    ]


def projects_using(variables: Iterable[str]) -> int:
    """How many projects use any of ``variables``: what a change to their library touches."""

    names = list(variables)
    if not names:
        return 0
    with connect() as conn:
        row = conn.execute(
            "SELECT COUNT(DISTINCT u.project_id) AS n FROM ws_kicad_variable_usage u "
            "JOIN ws_projects p ON p.id = u.project_id WHERE u.variable = ANY(%s)",
            (names,),
        ).fetchone()
    return int(row["n"])


def _checked(fields: dict[str, Any]) -> kicad_libraries.Library:
    try:
        return kicad_libraries.validate_entry(fields)
    except ValueError as error:
        raise Invalid(str(error)) from error


def _taken_variables(conn: Any, *, exclude: str | None) -> dict[str, str]:
    """Variable to the library that binds it."""

    taken: dict[str, str] = {}
    for row in conn.execute("SELECT name, variables FROM ws_kicad_libraries").fetchall():
        if row["name"] != exclude:
            taken.update({variable: row["name"] for variable in row["variables"]})
    return taken


def _require_free(library: kicad_libraries.Library, taken: dict[str, str]) -> None:
    for variable in library.variables:
        if variable in taken:
            raise Conflict(f"{variable} is already bound by the library {taken[variable]}")


def _view(row: dict[str, Any]) -> dict[str, Any]:
    """A row as the console shows it, with what the disk says is served."""

    library, problem = None, None
    try:
        library = kicad_libraries.validate_entry(_entry(row))
    except ValueError as error:
        # Valid when declared, not now (a host the server stopped allowing): it binds nothing until fixed.
        problem = str(error)
    published = library.published() if library is not None else None
    taken = kicad_libraries.snapshot().overridden if library is not None and library.ready else {}
    overridden = [v for v in row["variables"] if taken.get(v) == row["name"]]
    return {
        "name": row["name"],
        "kind": row["kind"],
        "variables": list(row["variables"]),
        "git": row["git_url"] or "",
        "ref": row["ref"] or "",
        "subdir": row["subdir"] or "",
        "path": row["path"] or "",
        "updatePolicy": row["update_policy"],
        "pinnedCommit": row["pinned_commit"] or "",
        "checkIntervalSeconds": row["check_interval_seconds"],
        "lastCheckedAt": row["last_checked_at"],
        "lastCheckError": row["last_check_error"],
        "remoteCommit": row["remote_commit"] or "",
        "fetchedCommit": row["fetched_commit"] or "",
        "servedCommit": published.commit if published else "",
        "state": row["state"],
        "error": row["error"],
        "progress": row["progress"],
        "sizeBytes": row["size_bytes"],
        "fetchedAt": row["fetched_at"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "updatedBy": row["updated_by"],
        "ready": bool(library and library.ready),
        "problem": problem,
        "overriddenVariables": overridden,
        "etag": etag_of(row),
        "rowVersion": row["row_version"],
    }
