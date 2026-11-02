"""The MCP server's tool registry, invocation, policy and audit (ADR §3.7, §3.11, §10).

``registry`` holds the tool declarations, ``tools`` registers the v5.1 read
set, ``tools_compare`` registers the two comparison tools, ``tools_writes``
registers the design, release and catalog write tools, ``tools_comments``
registers the comment write tools, ``tools_catalog_reads`` and
``tools_catalog_writes`` register the catalog authoring tools, and ``invoke`` runs one
tool through the same typed ``/api/v1`` route a browser or SDK calls, so policy,
folder visibility and response shapes are the API's. ``governance`` decides
which projects and tools an administrator has made reachable, and ``audit``
records every finished call. Write tools never approve, publish or perform
catalog QA; a step only a person may take is handed back as a URL.

``AGENTS.md`` here maps the modules; ``.agents/skills/prism-mcp-tool`` is the
procedure for adding a tool.
"""

from __future__ import annotations

__all__: list[str] = []
