"""Ask for the supply snapshot of a release when it is published.

Called by Release Studio after a publish succeeded. It queues a worker job and returns: whatever goes wrong is recorded
against the release and never undoes or hides a release that already exists (see ``release_snapshot.py``).
"""

from __future__ import annotations

from app.services.supply import release_snapshot


def queue_snapshot(project_id: str, build_id: str, tag: str, commit_sha: str, actor: str) -> bool:
    return release_snapshot.queue(project_id, build_id, tag, commit_sha, actor)
