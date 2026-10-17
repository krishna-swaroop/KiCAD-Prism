"""The semantic index served from the design bundle (WP-C1, ADR §8 ``SEMANTIC_INDEX``).

With ``PRISM_DESIGN_SOURCE_SEMANTIC_INDEX=bundle``, ``semantic_index_service``
answers a commit request from the bundle member ``projections/semantic-index.json``
(``prism.semantic_index.a2``; native/contracts/prism/field-maps/semantic-index.md)
instead of building and storing its own index. This module holds that branch;
the service keeps resolving the commit and falls back to its legacy build on
``None``.

The bundle serves a commit, not the working tree: a request without one may
hold uncommitted changes and stays legacy. ``bundle_read`` answers ``None`` when
the switch is legacy, a member is not ready yet (it queues the build) or the
bundle failed; a final non-member (``not-applicable``, e.g. no root schematic)
is likewise left to today's code. A stored bundle is never rebuilt: a stage
only moves from ``pending`` to final (ADR §5), so ``generate(force=True)``
returns a ready member as is.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any, Self

if TYPE_CHECKING:  # annotations only; the consumer is imported lazily
    from app.services.design_bundle.consumer import BundleRead

MEMBER = "projections/semantic-index.json"


def enabled() -> bool:
    """Whether the switch is ``bundle``, checked before any repository lookup."""

    # Imported here: the bundle package pulls in the job runtime and store, and
    # the service is imported by that runtime's handlers.
    from app.services.design_bundle import consumer

    return consumer.source("SEMANTIC_INDEX") == "bundle"


def ready(project_id: str, resolved_commit: str) -> BundleRead | None:
    """The opened bundle when its member is ready, else ``None`` for the legacy index."""

    from app.services.design_bundle import consumer

    read = consumer.bundle_read("SEMANTIC_INDEX", project_id, resolved_commit, [MEMBER])
    if read is None or not read.ready(MEMBER):
        return None
    return read


class ArtifactFile(tuple):
    """``(path, revision_key)`` and the generator the identity route's ETag names (ADR G9).

    A tuple so callers keep unpacking ``path, revision_key``. ``generator`` is
    today's ``generator_cache_tag()`` for a legacy file and the bundle's
    generator digest for the member: one revision must not be named by two
    generators.
    """

    generator: str

    def __new__(cls, path: Path, revision_key: str, generator: str) -> Self:
        result = super().__new__(cls, (path, revision_key))
        result.generator = generator
        return result


def artifact(read: BundleRead) -> ArtifactFile:
    """The member's file in the verified unpacked cache, keyed by the design revision key."""

    opened = read.opened
    return ArtifactFile(read.extract([MEMBER]) / MEMBER, str(opened.revision_key), opened.generator_digest)


def status(read: BundleRead, project_id: str, generator: dict[str, Any]) -> dict[str, Any]:
    """The status route's answer for a ready member.

    ``sourceRevisionKey`` is the design revision key (field map D2), not today's
    32-hex semantic key. The member carries no generator record, so
    ``generator`` keeps today's fields (they name Prism's index generator and
    the runtime's kicad-monkey) except ``cacheTag``, the bundle's generator digest.
    """

    opened = read.opened
    return {
        "schema": "prism.semantic_index_status_a0",
        "projectId": project_id,
        "sourceRevisionKey": str(opened.revision_key),
        "commit": opened.commit,
        "available": True,
        "generator": {**generator, "cacheTag": opened.generator_digest},
    }
