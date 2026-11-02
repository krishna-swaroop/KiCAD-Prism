# MCP server

Prism's MCP server (`/mcp`, `backend/app/api/mcp.py`) exposes tools: small,
generic tasks over the same typed `/api/v1` routes a browser or script calls,
with the caller's own token. Agentic workflows (generators, intermediate specs,
authoring skills) live outside Prism; a tool here stays one task. Decisions are
in `docs/architecture/adr-scripting-and-mcp.md`. To add or change a tool, follow
`.agents/skills/prism-mcp-tool/SKILL.md`.

## Modules

| Module | Holds |
| --- | --- |
| `registry.py` | `Tool`, `register`, `presenter`, `tools()`, tool definitions and output schemas |
| `invoke.py` | `call_tool`: argument validation, the in-process route call, result and error shapes (`route_error`, `error_result`, `success_result`, `handoff`) |
| `tools.py` | the core read tools; importing it registers every tool module |
| `tools_render.py`, `tools_compare.py` | multi-step reads (render, start and page a comparison) |
| `tools_catalog_reads.py`, `tools_catalog_writes.py` | catalog authoring (ADR §12) |
| `tools_supply.py` | supply: a project's and a component's supply, alternatives, watching and one fresh read (ADR §13) |
| `tools_writes.py`, `tools_comments.py` | design, release and comment writes (ADR §10) |
| `tools_ops_*.py` | admin diagnostics, listed only while ops is on (ADR §11) |
| `governance.py`, `audit.py` | admin tool and project limits; the audit of every call |

## Rules the code relies on

- **Order.** `tools()` lists every read, then every write, then ops tools. A
  tool's `group` comes from what it declares: an `action` without
  `readOnlyHint` makes it a write, an ops action makes it ops. Within a group,
  order is registration order (the import list at the end of `tools.py`).
  `TOOL_ORDER` in `backend/tests/test_mcp_server.py` is the one written-down
  order, because clients see it.
- **Policy.** A write declares the policy action its route needs (`action=`),
  so `/mcp` can ask the client for the scope before calling. The route still
  enforces it. Human-only actions (release approval, catalog QA, admin,
  resolving a comment) are never tools; a tool that reaches one calls
  `invoke.handoff(url, message)` (D15).
- **Results.** Route results come back as the route's JSON. Shaping (filters,
  `link`/`uri` citations) belongs in the tool's `present` hook, bound with
  `@presenter("tool_name")`; it sees error results too. A tool whose result
  differs from its route's `200` schema declares `output_schema`.
- **Multi-step tools** set `execute=` and call routes through the
  `RouteRequest` they are given, never services directly. Bodies are JSON;
  files travel through upload slots (D30). Guarded writes pass `if_match=`.
- **Documentation.** Every tool is named in a page under
  `website/src/content/docs/automate/` and in the ADR;
  `test_every_tool_is_documented` fails otherwise.
