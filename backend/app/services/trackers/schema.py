"""Tracker persistence table names and link-state values (TR-12, C2).

Identity is connector + remote container id + generation. ``owner`` / ``repo``
are never columns. Legacy ``comments.forge_*`` fields stay read projections.
"""

from __future__ import annotations

LINK_STATES = ("linked", "inaccessible", "deleted", "transferred")
IDENTITY_STATUSES = ("active", "revoked", "expired")

WORKSPACE_TABLES = (
    "tracker_connectors",
    "user_identities",
    "project_trackers",
    "destination_acks",
    "tracker_audit",
)
COMMENTS_TABLES = ("tracked_threads", "tracked_replies")
FORBIDDEN_COLUMNS = frozenset(
    {"owner", "repo", "owner_repo", "ownerrepo", "full_name", "fullname"}
)
