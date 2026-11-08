"""Keeping KiCad path libraries current: the scheduled check of each library's remote.

Libraries change on their own schedule, apart from the projects that use them.
A library either follows its ref (a moved ref is fetched by itself) or is
pinned (a moved ref is shown and nothing is fetched). The check is one
``git ls-remote``; a remote that has not moved costs no job, no job row and no
log folder, as with project auto-sync (``project_auto_sync_service``). Each scan
claims the libraries that are due in the database, so several workers never
check one library twice.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services import kicad_libraries, kicad_library_fetch as fetch, kicad_library_store as store

logger = logging.getLogger(__name__)

#: Most libraries one scan checks, so a scan stays short whatever is declared.
MAX_PER_SCAN = 4
SYSTEM_USER = "system:library-check"


def check_library(name: str) -> dict[str, Any]:
    """Ask the remote where a library's ref is now, and fetch it when the library follows and the ref moved.

    Returns ``{"remoteCommit", "moved", "queued", "error"}``. A failed check
    records its error and leaves what is served alone.
    """

    kicad_libraries.forget_rows()
    library = next((lib for lib in kicad_libraries.configured()[0] if lib.name == name), None)
    if library is None or not library.git:
        return {"remoteCommit": "", "moved": False, "queued": False, "error": None}
    try:
        remote = fetch.resolve_remote(library.git, library.ref)
    except fetch.FetchError as error:
        store.record_check(name, remote_commit=None, error=str(error)[:300])
        return {"remoteCommit": "", "moved": False, "queued": False, "error": str(error)[:300]}
    store.record_check(name, remote_commit=remote, error=None)
    served = library.published()
    current = served is not None and served.commit == remote and served.source == library.source
    queued = False
    if not current and library.update_policy == "follow":
        fetch.request_fetch(name, commit=remote, requested_by=SYSTEM_USER)
        queued = True
    return {"remoteCommit": remote, "moved": not current, "queued": queued, "error": None}


def check_due(limit: int = MAX_PER_SCAN) -> int:
    """Check every library whose interval has passed; returns how many fetches were queued."""

    queued = 0
    for row in store.claim_due(limit):
        try:
            if check_library(row["name"])["queued"]:
                queued += 1
        except Exception:
            logger.exception("Could not check the KiCad library %s", row["name"])
    return queued
