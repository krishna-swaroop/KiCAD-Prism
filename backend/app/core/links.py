"""The one place backend code builds Prism URLs and resource URIs.

A link is a contract between the browser, tracker issues and (later) MCP tool
results, so it is assembled here rather than beside each caller. The browser
route is ``/project/<id>`` (``frontend/src/App.tsx``); ``prism://`` names a
resource inside one revision. Formatting is pure string assembly — no network
calls. The grammar the frontend reads is recorded in
``docs/architecture/addressing.md``.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
from urllib.parse import quote, unquote, urlencode

RESOURCE_KINDS = frozenset({
    "component",
    "net",
    "bom",
    "netlist",
    "stackup",
    "sheet",
    "comparison",
    "release",
    "render",
})

_PRISM_PROJECT_PREFIX = "prism://project/"
_COMMIT = re.compile(r"[0-9a-f]{40}")


class _RawQueryValue(str):
    """A query value assembled by the caller and appended without re-encoding.

    A list parameter is percent-encoded one item at a time and joined with a
    literal comma; ``urlencode`` would turn those separators into ``%2C`` (and
    the items' own escapes into ``%25``), so this value bypasses it.
    """


def normalize_public_base_url(base: str) -> str:
    return (base or "").strip().rstrip("/")


def project_url(
    public_base_url: str,
    project_id: str,
    **params: str | None,
) -> str:
    """A ``/project/<id>`` URL, keeping the parameters in the order given.

    ``None`` and empty parameters are dropped; a link with none has no ``?``.
    The project id is quoted as one path segment, so an id containing ``/``
    stays inside it.
    """

    base = normalize_public_base_url(public_base_url)
    if not base:
        raise ValueError("public_base_url is required")
    url = f"{base}/project/{quote(project_id, safe='')}"
    query = "&".join(
        f"{quote(key, safe='')}={value}"
        if isinstance(value, _RawQueryValue)
        else urlencode({key: value})
        for key, value in params.items()
        if value
    )
    return f"{url}?{query}" if query else url


def catalog_component_url(public_base_url: str, component_id: str) -> str:
    """The Library Manager page of one catalog component.

    The library is a workspace section, so the link is the workspace root with
    the component named (``componentWorkspacePath`` in the frontend's command
    palette builds the same URL).
    """

    base = normalize_public_base_url(public_base_url)
    if not base:
        raise ValueError("public_base_url is required")
    query = urlencode(
        {
            "section": "library-manager",
            "libraryView": "catalog",
            "component": component_id,
            "componentTab": "overview",
        }
    )
    return f"{base}/?{query}"


def _joined_query_value(values: Iterable[str]) -> _RawQueryValue | None:
    """Each item quoted on its own, joined by literal commas.

    The frontend (``lib/view-state-url.ts``) reads the parameter's decoded
    value, splits it on commas, then decodes each item again. So an item is
    quoted twice: once as a list item, once as part of the query value. A
    plain reference such as ``R1`` comes out unchanged.
    """

    if isinstance(values, str):
        values = (values,)
    items = [quote(quote(str(item), safe=""), safe="") for item in values if str(item)]
    return _RawQueryValue(",".join(items)) if items else None


def _compact_number(value: float) -> str:
    """A number without a trailing ``.0`` or trailing zeros."""

    text = format(Decimal(str(value)).normalize(), "f")
    return "0" if text in {"", "-0"} else text


def _bbox_query_value(bbox: Sequence[float] | None) -> _RawQueryValue | None:
    if not bbox:
        return None
    x, y, width, height = bbox
    return _RawQueryValue(
        ",".join(_compact_number(value) for value in (x, y, width, height))
    )


def view_url(
    public_base_url: str,
    project_id: str,
    *,
    tab: str | None = None,
    commit: str | None = None,
    sel: Iterable[str] = (),
    nets: Iterable[str] = (),
    page: str | None = None,
    bbox: Sequence[float] | None = None,
    insets: bool = False,
) -> str:
    """A project URL that opens the visualizer at one view state (ADR §10 D18).

    ``sel`` holds references or element uuids, ``nets`` net names, ``page`` a
    schematic sheet path, ``bbox`` ``(x, y, width, height)`` in mm and
    ``insets`` whether the inset panes are open. The parameters are always
    written in the same order, and list items are quoted one at a time so a
    comma inside a name is not read as a separator.
    """

    return project_url(
        public_base_url,
        project_id,
        section="visualizers",
        tab=tab,
        commit=commit,
        sel=_joined_query_value(sel),
        nets=_joined_query_value(nets),
        page=page,
        bbox=_bbox_query_value(bbox),
        insets="1" if insets else None,
    )


@dataclass(frozen=True)
class ResourceRef:
    """One resource of a project at a revision, as named by a ``prism://`` URI."""

    project_id: str
    commit: str
    kind: str
    key: Optional[str] = None


def _resource_commit(commit: str) -> str:
    value = (commit or "").strip().lower()
    if not _COMMIT.fullmatch(value):
        raise ValueError("commit must be a full 40-character hexadecimal sha")
    return value


def _resource_kind(kind: str) -> str:
    value = (kind or "").strip()
    if value not in RESOURCE_KINDS:
        raise ValueError(f"unknown resource kind: {kind!r}")
    return value


def resource_uri(
    project_id: str,
    commit: str,
    kind: str,
    key: str | None = None,
) -> str:
    """``prism://project/<id>/rev/<sha>/<kind>[/<key>]``.

    The commit is a full sha (lowercased), ``kind`` one of ``RESOURCE_KINDS``,
    and an empty key means the resource has none.
    """

    sha = _resource_commit(commit)
    resource_kind = _resource_kind(kind)
    uri = f"{_PRISM_PROJECT_PREFIX}{quote(project_id, safe='')}/rev/{sha}/{resource_kind}"
    return f"{uri}/{quote(key, safe='')}" if key else uri


def parse_resource_uri(uri: str) -> ResourceRef:
    """The inverse of :func:`resource_uri`; any other spelling raises ``ValueError``."""

    if not isinstance(uri, str) or not uri.startswith(_PRISM_PROJECT_PREFIX):
        raise ValueError("not a Prism resource URI")
    segments = uri[len(_PRISM_PROJECT_PREFIX):].split("/")
    if len(segments) not in {4, 5} or segments[1] != "rev" or not segments[0]:
        raise ValueError("not a Prism resource URI")
    key_segment = segments[4] if len(segments) == 5 else None
    if key_segment == "":
        raise ValueError("not a Prism resource URI")
    return ResourceRef(
        project_id=unquote(segments[0]),
        commit=_resource_commit(segments[2]),
        kind=_resource_kind(segments[3]),
        key=unquote(key_segment) if key_segment is not None else None,
    )


__all__ = [
    "RESOURCE_KINDS",
    "ResourceRef",
    "catalog_component_url",
    "normalize_public_base_url",
    "parse_resource_uri",
    "project_url",
    "resource_uri",
    "view_url",
]
