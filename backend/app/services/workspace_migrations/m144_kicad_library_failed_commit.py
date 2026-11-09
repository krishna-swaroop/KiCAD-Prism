"""The commit a KiCad library's fetch failed at for good (round-3 implicit-states A3).

``failed_commit`` is set when a fetch fails permanently (too large, no such
folder, a refused redirect) and cleared when a fetch starts or a version is
published. The scheduled check does not fetch that commit again; a moved ref,
a changed declaration, **Fetch again** or a restart tries again. A failure the
server must fix (git-lfs missing) records none. ``''`` means the ref itself
could not be resolved.
"""

from __future__ import annotations

from typing import Any


def migrate(conn: Any) -> None:
    conn.execute("ALTER TABLE ws_kicad_libraries ADD COLUMN IF NOT EXISTS failed_commit TEXT")
