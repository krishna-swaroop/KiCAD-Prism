"""The one place a Wave 3 consumer opens its revision's design bundle.

A consumer calls :func:`bundle_read` with the member paths it needs. The answer
is a :class:`BundleRead` when every requested member has a final answer
(bundle-format.md §3.3). Otherwise the request does not fall back to a legacy
reader (R1 deleted them); it raises a typed answer the API renders the same way
for every route (ADR §8, §9.7 R1):

- a member is not ready yet (``pending`` or ``unavailable``): the
  ``design_bundle`` job is queued, deduplicated on the bundle key, and
  :class:`DesignDataPending` is raised (HTTP 202) -- unless the build ended
  in a failure no retry is answering, which raises :class:`DesignDataFailed`;
- a member failed, the project is absent at that revision, or the bundle could
  not be opened: :class:`DesignDataFailed` is raised (HTTP 422).

``skipped`` and ``not-applicable`` are final answers the consumer handles itself
(e.g. a project without a board); they do not fall back either.

A request without a ``commit`` reads the checkout's ``HEAD`` (``reader``
treats ``None`` as HEAD). If the checkout holds uncommitted changes in the
files the bundle reads, HEAD's bundle is still served and
:meth:`BundleRead.response_headers` says so; a bundle is never built from a
dirty working tree.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

from app.services.design_bundle import reader
from app.services.design_bundle.errors import (
    WORKING_TREE_DIRTY,
    WORKING_TREE_HEADER,
    DesignDataFailed,
    DesignDataPending,
)
from app.services.design_bundle.manifest import Readiness

logger = logging.getLogger(__name__)

#: ADR §8's consumers, for callers and tests that name one.
CONSUMERS = (
    "SEMANTIC_INDEX",
    "DESIGN_COMPARISON",
    "RELEASE_STUDIO",
    "PROJECT_METADATA",
    "CATALOG_IMPORT",
)


@dataclass
class BundleRead:
    """The opened revision and every requested member's final answer."""

    opened: reader.OpenedRevision
    states: Mapping[str, Readiness]

    def ready(self, path: str) -> bool:
        return self.states[path].state == "ready"

    def json(self, path: str) -> Any:
        """A ready member's parsed JSON (verified, bundle-format.md §9)."""

        return self.opened.read_json(path)

    def bytes(self, path: str) -> bytes:
        return self.opened.read(path)

    def size(self, path: str) -> int:
        """A ready member's size, from the verified manifest: nothing is inflated."""

        member = self.opened.archive.member(path) if self.opened.archive is not None else None
        if member is None:
            raise KeyError(path)
        return int(member["bytes"])

    def sha256(self, path: str) -> str:
        """A ready member's SHA-256, from the verified manifest: its content identity."""

        member = self.opened.archive.member(path) if self.opened.archive is not None else None
        if member is None:
            raise KeyError(path)
        return str(member["sha256"])

    def extract(self, paths: Iterable[str]) -> Path:
        """Ready members as files in the verified version directory (§8)."""

        return self.opened.extract(paths)

    def response_headers(self) -> dict[str, str]:
        """``X-Prism-Working-Tree: dirty`` when HEAD was served over a dirty checkout."""

        if self.opened.working_tree_dirty:
            return {WORKING_TREE_HEADER: WORKING_TREE_DIRTY}
        return {}


def _open(
    project_id: str, commit: str | None, paths: list[str], requested_by: str
) -> tuple[reader.OpenedRevision, dict[str, Readiness]]:
    try:
        opened = reader.open_revision(project_id, commit, queue=True, requested_by=requested_by)
    except LookupError:
        raise
    except Exception as error:  # noqa: BLE001 - any bundle-side fault is the typed failure
        logger.exception("design bundle: could not open %s@%s", project_id, commit)
        raise DesignDataFailed(paths, f"the design bundle could not be opened: {error}") from error
    if opened.absent:
        revision = str(getattr(opened, "commit", None) or commit or "HEAD")
        raise DesignDataFailed(paths, f"the project is not present at revision {revision[:12]}")
    return opened, opened.readiness(paths)


def bundle_read(
    consumer: str,
    project_id: str,
    commit: str | None,
    paths: Iterable[str],
    *,
    requested_by: str = "",
) -> BundleRead:
    """The bundle's answer for ``paths``, or a typed pending/failed answer.

    ``commit=None`` reads the project's default revision. The build is queued when a
    member is not ready, exactly as before, so a later retry reads the bundle.
    """

    wanted = list(paths)
    opened, states = _open(project_id, commit, wanted, requested_by)
    waiting = [path for path, answer in states.items() if answer.state in ("pending", "unavailable")]
    if waiting:
        # The reader records a failure only when the build ended and no job
        # (or retry) is under way: nothing will make these members ready.
        failure = getattr(opened, "failure", None)
        if failure:
            raise DesignDataFailed(waiting, failure)
        raise DesignDataPending(waiting, "building" if getattr(opened, "job_active", False) else "queued")
    failed = {path: answer.detail for path, answer in states.items() if answer.state == "failed"}
    if failed:
        detail = "; ".join(f"{path}: {reason}" for path, reason in failed.items())
        raise DesignDataFailed(list(failed), detail)
    return BundleRead(opened, states)


def bundle_read_if_ready(
    consumer: str,
    project_id: str,
    commit: str | None,
    paths: Iterable[str],
    *,
    requested_by: str = "",
) -> BundleRead | None:
    """The bundle when every member is ready, else ``None`` -- not a legacy fallback.

    Only Design Comparison's source-tree mode uses this (C2r §2 items 4-7): a
    side without a ready bundle is compared from its materialized source tree,
    which is that pipeline's final answer, while the build ``bundle_read``
    already queued finishes in the background.
    """

    try:
        return bundle_read(consumer, project_id, commit, paths, requested_by=requested_by)
    except (DesignDataPending, DesignDataFailed):
        return None
