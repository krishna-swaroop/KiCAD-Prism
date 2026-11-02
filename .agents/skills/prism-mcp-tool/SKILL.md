---
name: prism-mcp-tool
description: Add or change a KiCAD Prism MCP tool (read, write, multi-step or human handoff), its result shaping, tests and docs. Use for changes under backend/app/services/mcp/.
---

# Add or change a Prism MCP tool

Read `backend/app/services/mcp/AGENTS.md` first. A tool is one small task an
agent asks for, answered by a typed `/api/v1` route that already exists or that
you add first (`.agents/skills/prism-api-endpoint/SKILL.md`). Workflows built
from many tools (component authoring, review loops) are skills and scripts
outside Prism, not tools.

## Decide first

- **Is it a tool?** It must map to a route a person or script could call with
  the same token. If it needs Prism to run a model, fetch the internet, or make
  design files, it is not a Prism tool.
- **Is it a person's step?** Approving or publishing a release, catalog QA
  (moving a component to `done` or `released`), admin changes and resolving a
  comment are human-only (`human_only` rules in `backend/app/core/policy.py`).
  Offer a handoff tool only where an agent plausibly gets stuck (D15).
- **Does it need an ADR decision?** Yes when it adds a scope or policy action,
  changes what is human-only, adds a new way data or files reach Prism, or
  changes what results may contain. Add it to
  `docs/architecture/adr-scripting-and-mcp.md` in the section the tool belongs
  to; a plain read over an existing route needs none.

## Declare it

Put it in the module for its area (see the AGENTS.md table), with
`register(Tool(...))`:

- `name`: verb_noun, as an agent would say the task. `title`, and a
  `description` written for the model: what it returns, what it never does,
  and which tool comes next.
- `input_schema`: `additionalProperties: false`, every property described,
  `required` minimal. A write gets `idempotencyKey` automatically.
- `route` and `args`: `args(arguments)` returns `(path_params, query)` or, for
  a body, `(path_params, query, body)`. `None` values are dropped.
- Read: `annotations=dict(READ_ONLY_ANNOTATIONS)`. A read that runs work for a
  writer (like `check_catalog_asset`) also sets `action=` for the scope check.
- Write: `annotations=write_annotations(idempotent=...)` and `action=` the
  route's policy action (`comment`, `design`, `catalog_write`, ...).
- Ops: an `ops_read`/`ops_act` action; it is listed only while ops is on.

## Multi-step tools

Set `execute=async (app, arguments, authorization, request) -> result`:

- Call routes only through `request(app, method, path, query, authorization,
  body, if_match=...)`; check `200 <= status < 300` and return
  `invoke.route_error(status, raw)` otherwise.
- Build results with `invoke.success_result`, or your own content blocks
  (images: see `backend/app/services/mcp/tools_render.py` and
  `backend/app/services/mcp/tools_catalog_reads.py`) with
  `invoke.UNTRUSTED_META`.
- Your own refusals: `invoke.error_result(code, detail)`. A person's step:
  `invoke.handoff(url, message)`.
- Poll with a bounded deadline and hand back a job handle when it runs out
  (`validate_catalog_component`, `render_view`).
- Guarded writes send `if_match=f'"<kind>:<id>:<version>"'`, taking the
  version from the agent's argument or the resource read just before.
- When the result is not the route's `200` body, set `output_schema`.

## Shape results

Filters and citation links go in a `present` hook beside the tool:

```python
@presenter("get_widget")
def _present_widget(arguments: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    ...
    return result
```

It runs after every call, errors included. Build links with
`app.core.links`, never by hand.

## Test and document

- Behaviour: drive `invoke.call_tool` against a stub ASGI app that records
  requests (`backend/tests/test_mcp_catalog.py`, `backend/tests/test_mcp_writes.py`).
  Assert the route, body, headers and the shaped result.
- Policy: a role or scope that may not use the tool is refused
  (`backend/tests/test_mcp_server.py` drives the real app with a token).
- Add the tool to `TOOL_ORDER` in `backend/tests/test_mcp_server.py` at its
  place in its group. Every write tool is then checked for write annotations
  and an `idempotencyKey` (`backend/tests/test_mcp_writes.py`); there is no
  other list to update.
- Name it in the matching page under `website/src/content/docs/automate/` and in
  the ADR's tool list.
- If a route changed: regenerate `sdk/python/openapi.json` and
  `sdk/python/prism/_generated.py` (`sdk/python/README.md`) and
  `backend/openapi/operations.v1.json` (`python -m app.core.api_contract --write`).
- Run the MCP tests, then the backend suite (`.agents/skills/prism-quality-gate/SKILL.md`).
