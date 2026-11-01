"""A stand-in for the workspace's folder rules in supply tests that have no workspace.

Supply filters projects by who may see them now (``usage.visible_project_ids``, read from the workspace). Tests that store BOM usage
directly have no workspace rows, so they say who sees a project through the roles they store with it; this reads those back.
"""

from __future__ import annotations

from typing import Any
from unittest import mock


def by_stored_roles(store: Any) -> Any:
    """A patch of ``usage.visible_project_ids`` answering from ``supply_bom_usage_projects.visible_roles`` in ``store``. Start it in
    ``setUpClass`` and stop it in ``tearDownClass``. It reads on its own connection, so it sees what the test committed."""

    def visible(role: str | None) -> set[str] | None:
        if role is None:
            return None
        with store.connection() as conn:
            return {row["project_id"] for row in conn.execute(
                "SELECT project_id FROM supply_bom_usage_projects WHERE %s = ANY(visible_roles)", (role,),
            ).fetchall()}

    return mock.patch("app.services.supply.usage.visible_project_ids", side_effect=visible)
