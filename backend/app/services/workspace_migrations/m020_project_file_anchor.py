"""Workspace schema migration 20: project_file_anchor.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Record which project file inside a directory a project actually is.

    A project used to be identified by its directory alone. KiCad allows several
    projects in one directory -- a fixture's top and base plate, say -- and such
    a repository imported as a single project named after one board while the
    viewer rendered another. Recording the project's own file tells them apart.

    Every existing row predates this and is the only project in its directory,
    which is exactly what the empty default means, so nothing needs backfilling
    here; `infer_project_anchor` fills it in on the next refresh.
    """
    conn.execute(
        """
        ALTER TABLE ws_projects
            ADD COLUMN IF NOT EXISTS project_file_rel TEXT NOT NULL DEFAULT ''
        """
    )
    # `UNIQUE(repo_id, relative_path)` made the second project in a directory
    # impossible to register at all. Widening it to include the project file
    # only ever admits rows the old constraint rejected, so this cannot fail on
    # existing data. Guarded on `relative_path` because the release-studio
    # migration tests run this chain against a minimal `ws_projects`.
    conn.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_attribute
                WHERE attrelid = 'ws_projects'::regclass
                  AND attname = 'relative_path'
                  AND NOT attisdropped
            ) AND NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'ws_projects'::regclass
                  AND conname = 'ws_projects_repo_path_file_key'
            ) THEN
                ALTER TABLE ws_projects
                    DROP CONSTRAINT IF EXISTS ws_projects_repo_id_relative_path_key;
                ALTER TABLE ws_projects
                    ADD CONSTRAINT ws_projects_repo_path_file_key
                    UNIQUE (repo_id, relative_path, project_file_rel);
            END IF;
        END
        $$
        """
    )
