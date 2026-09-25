"""Workspace schema migration 2: workspace_read_versions.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Maintain one cheap monotonic version for role-filtered bootstrap ETags."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ws_workspace_state (
            id SMALLINT PRIMARY KEY CHECK (id = 1),
            version BIGINT NOT NULL DEFAULT 1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        INSERT INTO ws_workspace_state(id, version)
        VALUES (1, 1)
        ON CONFLICT (id) DO NOTHING
        """
    )
    conn.execute(
        """
        CREATE OR REPLACE FUNCTION ws_bump_workspace_version()
        RETURNS TRIGGER AS $$
        BEGIN
            UPDATE ws_workspace_state
            SET version = version + 1, updated_at = NOW()
            WHERE id = 1;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    for table in (
        "ws_repositories",
        "ws_projects",
        "ws_folders",
        "ws_project_portfolio",
    ):
        trigger = f"trg_{table}_workspace_version"
        conn.execute(f"DROP TRIGGER IF EXISTS {trigger} ON {table}")
        conn.execute(
            f"""
            CREATE TRIGGER {trigger}
            AFTER INSERT OR UPDATE OR DELETE ON {table}
            FOR EACH STATEMENT
            EXECUTE FUNCTION ws_bump_workspace_version()
            """
        )
