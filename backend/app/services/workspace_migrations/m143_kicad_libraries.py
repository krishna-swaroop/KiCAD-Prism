"""KiCad path libraries an administrator declares, and the variables boards use that none defines.

``ws_kicad_libraries``: one row per library, keyed by name. A library binds one
or more KiCad path variables (``${LSF_KICAD_LIB}``) to a folder: a git
repository Prism fetches (``kind = 'git'``) or a folder under the configured
mount root (``kind = 'path'``). ``update_policy`` says whether a moved ref is
fetched by itself (``follow``) or only shown (``pinned`` at ``pinned_commit``).
``state`` and the columns after it describe the fetch; what makes a library
resolve is the published version on disk, not these.

``ws_kicad_library_versions``: the last versions a git library published, for
the history list and rollback.

``ws_kicad_variable_usage``: per project, how many model references use a
variable the last time its models were built, so the console can list variables
nothing defines. A hint for the console; never an input to a rebuild.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_kicad_libraries (
            name TEXT PRIMARY KEY,
            kind TEXT NOT NULL CHECK (kind IN ('git', 'path')),
            variables JSONB NOT NULL,
            git_url TEXT,
            ref TEXT,
            subdir TEXT NOT NULL DEFAULT '',
            path TEXT,
            update_policy TEXT NOT NULL DEFAULT 'follow'
                CHECK (update_policy IN ('follow', 'pinned')),
            pinned_commit TEXT,
            fetched_commit TEXT,
            check_interval_seconds INTEGER NOT NULL DEFAULT 86400
                CHECK (check_interval_seconds >= 3600),
            last_checked_at TIMESTAMPTZ,
            last_check_error TEXT,
            remote_commit TEXT,
            generation INTEGER NOT NULL DEFAULT 1,
            state TEXT NOT NULL DEFAULT 'pending'
                CHECK (state IN ('pending', 'fetching', 'ready', 'failed')),
            error TEXT,
            progress INTEGER,
            size_bytes BIGINT,
            fetched_at TIMESTAMPTZ,
            row_version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by TEXT NOT NULL DEFAULT '',
            CHECK (
                (kind = 'git' AND git_url IS NOT NULL AND path IS NULL)
                OR (kind = 'path' AND path IS NOT NULL AND git_url IS NULL)
            )
        );
        CREATE TABLE IF NOT EXISTS ws_kicad_library_versions (
            name TEXT NOT NULL REFERENCES ws_kicad_libraries (name) ON DELETE CASCADE,
            commit TEXT NOT NULL,
            ref TEXT NOT NULL DEFAULT '',
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            requested_by TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (name, commit)
        );
        CREATE TABLE IF NOT EXISTS ws_kicad_variable_usage (
            project_id TEXT NOT NULL,
            variable TEXT NOT NULL,
            model_count INTEGER NOT NULL,
            sheet_refs INTEGER NOT NULL DEFAULT 0,
            revision_key TEXT NOT NULL DEFAULT '',
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (project_id, variable)
        );
        """
    )
