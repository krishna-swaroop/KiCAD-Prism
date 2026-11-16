"""Remember the branch chosen when a project was imported."""

from typing import Any


def migrate(conn: Any) -> None:
    conn.execute("ALTER TABLE ws_projects ADD COLUMN IF NOT EXISTS import_branch TEXT")
