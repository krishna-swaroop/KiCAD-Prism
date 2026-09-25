"""Workspace schema migration 14: release_studio_waiver_build_scope.

Frozen. Applied deployments recorded this body in ``ws_schema_migrations``;
edit nothing here, add a new migration instead.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    """Bind waivers to a build, and let an approval be withdrawn.

    M8 carries both in its CREATE TABLE for a fresh database, but M8 is already
    recorded wherever Release Studio has run, so an amendment there never
    reaches an existing workspace. R23 folds this back into M8 when the ladder
    is collapsed.

    Existing waiver rows keep the empty default and therefore stop applying to
    new builds. That is the point: an exception was accepted against one set of
    outputs, and the next release has to accept it again rather than inherit it.
    """

    statements = (
        """
        ALTER TABLE ws_release_waivers
        ADD COLUMN IF NOT EXISTS build_id TEXT NOT NULL DEFAULT ''
        """,
        """
        ALTER TABLE ws_release_approval_invalidations
        DROP CONSTRAINT IF EXISTS ws_release_approval_invalidations_stale_component_check
        """,
        """
        ALTER TABLE ws_release_approval_invalidations
        ADD CONSTRAINT ws_release_approval_invalidations_stale_component_check
        CHECK (stale_component IN ('technical', 'policy', 'both', 'withdrawn'))
        """,
    )
    for statement in statements:
        conn.execute(statement)
