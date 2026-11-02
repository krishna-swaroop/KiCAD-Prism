# ADR: Scriptable Prism and the MCP server

- **Status:** Accepted (2026-10-26). §2 records the maintainer's decisions of 2026-10-25 and 2026-10-26; §3 was accepted as proposed on 2026-10-26, and §3.10 amended with D12 the same day. §10 adds the v5.2 slice (2026-10-26), implemented the same day. §11 adds the ops slice (2026-10-26).
- **Branch:** work happens on `feature/scripting-mcp`; every PR in this effort targets it. The maintainer holds the merge into `dev` until the v5.2 slice (§10) is complete as well.
- **Builds on:**
  - the caller policy table, `backend/app/core/policy.py`: one rule per action, naming roles, bearer scopes and provider refusals;
  - the error contract (`{detail, code}`) and guarded writes (`If-Match`, 412/428), `backend/app/core/errors.py` and `preconditions.py`;
  - jobs: `GET /api/jobs/{id}`, `/events?after=`, `/logs`, `/artifact`;
  - the design bundle ([`adr-native-design-bundle.md`](adr-native-design-bundle.md)), whose stated intent is that the MCP server reads designs through the bundle and `prism-kicad`;
  - the comment anchors and change feed ([`live-comments.md`](live-comments.md)).
- **Spec baseline:** Model Context Protocol revision 2026-07-28.

## 1. Context

Prism's theme for the next major (v6) is AI integration. Prism does not run a model; it gives the user's own agents (Claude, Cursor, Claude Code, a CI job) a safe, complete surface to work against. Two things stand in the way, both measured on `dev` at 16097ea0:

- **The API isn't a contract yet.**
  - 319 routes in 38 modules, of which 18 declare a `response_model`. OpenAPI is served, but a generated client or an MCP tool schema built from it would be mostly untyped.
  - No route has a stable `operation_id`, and there's no version prefix.
  - Meaning is computed in the frontend: the engineering BOM (`engineering-bom-table.tsx`) and comparison review grouping (`comparison-review-queue.ts`). A second client would compute them differently.
  - Most design data has no route. Only `projections/semantic-index.json` is served raw. `design.json`, placements, stackup, route metrics and the system interface are not reachable at all.
- **Scripts and agents have no way in.**
  - Bearer callers today:
    - service clients (admin-created, `client_credentials` at `/oauth/token`);
    - KiCad agent tokens (PKCE, loopback only, 30 days);
    - KiCad remote-provider tokens;
    - external JWT.
  - There are no user-owned tokens and no OAuth clients that a third-party MCP client can register as.
  - Scopes are just `api:read` and `api:write`, so a token that may comment may also approve a release (if its user may).
  - Audit records don't name the client or token: an agent's action reads as the user's own click.
  - Nothing announces events (new revision, bundle ready, comparison done), so CI and agents can't react.
  - Viewer state (selection, highlighted nets, insets, camera) isn't addressable, so an agent can't hand back a link to what it means. `services/trackers/deep_links.py` also builds `/projects/<id>`, which matches no route.

## 2. Decisions taken (2026-10-25)

| # | Decision |
| --- | --- |
| D1 | The MCP server runs **inside the backend at `/mcp`**, sharing auth, policy and services. No separate process. |
| D2 | The API is **versioned now**: every route is served under `/api/v1/...`. The unversioned paths stay as aliases for the browser and existing tokens until v6. The SDK, CLI and MCP use `/api/v1` only. |
| D3 | `api:write` is **split into area scopes**: `comments:write`, `design:write`, `catalog:write`, and the sensitive `release:approve`, `catalog:qa`, `admin`. `api:write` stays as an alias that implies all of them, so existing tokens keep working. |
| D4 | **MCP only, no in-app assistant.** Users bring their own clients and agents. Prism never calls a model. |
| D5 | Minor releases roughly monthly; not formalized. |
| D6 | **Only people resolve comments** (2026-10-26). An agent may reply to any comment it can read, but resolving or reopening a thread is a human action, whoever wrote it and whatever the agent was asked to do. |
| D7 | **Every MCP read is audited** (2026-10-26), with client, tool, project and revision; no sampling. |
| D8 | **The SDK is designed to be published** (2026-10-26): its own package, versioning and licence metadata from the start. Whether and where to publish is decided later. |
| D9 | **`render_view` ships in v5.1** (2026-10-26), not v5.2: PNG renders of a schematic region, PCB area or 3D view with highlights, for multimodal agents. Renders are kicad-cli plots (SVG for schematics and PCBs, with an SVG highlight overlay) rasterised with CairoSVG, not the browser viewer; 3D renders carry no highlights. |
| D10 | **One MCP endpoint per deployment** (2026-10-26). A deployment is one workspace; agents see projects through folder visibility and the admin allowlist (§3.11). Per-workspace endpoints are reconsidered only if Prism becomes multi-tenant. |
| D11 | **Not listed in the MCP Registry for now** (2026-10-26). Every Prism is self-hosted at its own URL, so v5.1 documents how to connect instead. Revisited once the server is stable. |
| D12 | **One live event socket, fed by the event log** (2026-10-26). The live socket of §3.10 is part of MCP-08 instead of per-feature sockets; polling remains the fallback. |

## 3. Decisions proposed

### 3.1 Layering: one authority

```
services (projects, design bundle, compare, comments, catalog, release, jobs)
   │  policy.authorize(action, caller)       ← every caller, every path
   ├── typed HTTP API  /api/v1   ── web UI, Python SDK, `prism` CLI
   ├── tool registry             ── MCP server /mcp
   ├── event log                 ── webhooks (v5.2), MCP subscriptions
   └── deep links                ── /project/:id?…, prism:// URIs
```

- A tool calls the same service a route calls, under the same policy action. No tool reaches data the caller couldn't reach in the UI.
- Routes and tools are thin. Validation, meaning and side effects live in services.

### 3.2 Typed, versioned API

- **Mount.** Routes are written once, under `/api`. `ApiVersionMiddleware` (`app/core/api_version.py`) rewrites `/api/v1/...` to `/api/...` before routing, so there is one route table and one set of handlers. Only `/api/v1` paths appear in the published OpenAPI document (`/api/v1/openapi.json`), and nothing outside `/api` (Git smart HTTP is not part of it). The browser keeps calling `/api` until the frontend moves over in one change.
- **Operation ids.** An operation's id is its route function's name, unique across the API (`operation_id` in `app/core/api_version.py`), for example `list_projects` or `create_comment_reply`. Ids are stable: renaming a route function is a breaking change. A route gains a `summary` when it is typed.
- **Ratchet.** `backend/openapi/operations.v1.json` records every operation's id, method, path, and whether its success response is typed; `tests/test_api_contract.py` compares the live document with it. An operation that disappears or moves fails, a typed one may not become untyped, and a new one must be typed, so the untyped count only goes down. At MCP-01, 72 of 307 operations are typed. After a deliberate change, `python -m app.core.api_contract --write` rewrites the snapshot and its diff is reviewed with the change.
- **Target for v5.1:** every route a tool, the SDK or the CLI uses is typed, and at least 60% of all routes are.

### 3.3 Revision pinning

- Every design read takes `revision`: a full commit sha, a branch or a tag. The default is the project's default branch head.
- Every response states the resolved `commit` and, where a bundle exists, its `designKey`.
- A response for a full commit sha is immutable and is served with the pinned cache headers v5.0.2 added. Answers are reproducible, cacheable and citable.

### 3.4 Idempotent writes

- Every v1 write accepts an `Idempotency-Key` header; MCP write tools take it as an argument.
- The key is scoped to (caller, `operation_id`, key) and kept for 24 hours with the response status and body. A repeat returns the stored response and does nothing else. The same key with a different body answers 422 `idempotency-key-reused`.
- Guarded writes keep `If-Match`.

### 3.5 Scopes, actors and human-only actions

- **Scopes.** D3's area scopes go into `RULES` in `policy.py`; `IMPLIED_SCOPES` makes `api:write` imply them all, and each write scope implies `api:read`. One mapping per policy action:

  | Policy action | Scope |
  | --- | --- |
  | `read`, `catalog_browse`, `catalog_read` | `api:read` |
  | `comment` | `comments:write` |
  | `design` | `design:write` |
  | `catalog_write` | `catalog:write` |
  | `release` | `release:approve` |
  | `catalog_qa` | `catalog:qa` |
  | `admin`, `catalog_admin` | `admin` |

- **Human-only actions.** `release`, `catalog_qa`, `admin` and `catalog_admin` are refused to MCP callers in the policy table itself (`human_only` rules in `policy.py`), whatever scopes the token holds. Resolving or reopening a comment is refused to every token, MCP or not (D6; the resolve rule in `comment_permissions.py`). A tool that reaches one returns an input-required result in URL mode: a link to the Prism page where a person acts. Personal access tokens may hold the release, QA and admin scopes for scripts the user runs knowingly; MCP clients may not request them. No token resolves a comment: resolving needs a session.
- **Actor model.** Every write and audit record stores `user`, `auth_type`, `client_id`, `token_id` and an optional `agent_run_id` (passed by the client). Comments get `authorKind` (`person`, `agent`, `service`) and the client's name, so the UI can mark agent-authored comments.

### 3.6 Tokens and OAuth

- **Personal access tokens.**
  - Created by the user in Settings, with a name, scopes and an expiry (default 90 days, at most 1 year; admins can lower the maximum).
  - Shown once, stored hashed, with a recognisable prefix (`prism_pat_`) so secret scanners can find leaks.
  - Revocable. Settings lists each token's last use.
  - A token never holds more than its user's role allows; the role check still runs.
- **OAuth for MCP clients.**
  - `/mcp` is an OAuth protected resource, with RFC 9728 metadata pointing at Prism's authorization server: the existing one, extended.
  - Client registration uses Client ID Metadata Documents. Dynamic Client Registration is not offered.
  - The flow is authorization code with PKCE (S256), with `iss` in the authorization response (RFC 9207) and refresh tokens.
  - **Incremental consent:** a client starts with `api:read`. Its first write is answered with `WWW-Authenticate` naming the scope it needs, and the user consents to just that.
  - Settings lists connected clients, each revocable.
- **Every token carries an id** (`jti` for JWTs, the row id for PATs). That id is what the actor model records.

### 3.7 Tool registry and the MCP server

- **Registry.** A tool is declared beside its service as:
  - a name;
  - a Pydantic input model and output model;
  - the policy action it needs;
  - MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`).

  The registry is a plain module API, published early so the supply module can register its tools against it. Supply's `POST /api/supply/mcp` is replaced, not kept beside it.
- **Task-level tools, not one per route.** About 25 tools that match real workflows. Scripts use the SDK for everything else. The v5.1 read set:
  - `search_projects`, `get_project`, `list_revisions`;
  - `find_in_design`, `get_component`, `get_net`, `get_bom`;
  - `compare_revisions`, `get_changes`;
  - `list_comments`;
  - `search_catalog`, `get_catalog_component`;
  - `get_release_status`;
  - `render_view` (D9): a PNG of a schematic region, PCB area or 3D view at a revision, with given components or nets highlighted. Schematic and PCB views are kicad-cli SVG plots cropped to the region, with the highlight drawn as an SVG overlay above the artwork, then rasterised with CairoSVG. A 3D view is kicad-cli's own render and carries no highlight overlay.
- **Server.** Streamable HTTP, stateless. Cross-call state is always an explicit handle (job id, comparison id, commit sha), never a session.
- **Long work.** Comparisons and bundle builds run as Prism jobs, exposed through the tasks extension (`io.modelcontextprotocol/tasks`). The task handle is the job id.
- **Results.**
  - Every tool has an `outputSchema` from its output model, plus a compact text rendering.
  - Large payloads (a full BOM, netlist, comparison) come back as resource links, not inline text.
  - Lists have cursors and a deterministic order.
- **Errors.** Validation and policy failures are tool execution errors carrying the existing `{code, detail}`, so the model can act on them. They aren't protocol errors.
- **Untrusted content.** Comment bodies, field values, datasheet text and file contents are returned as data, marked with their source. No tool takes instructions from them: every write needs explicit arguments.
- **Out of scope:** Sampling (deprecated by the 2026-07-28 spec), and any server-initiated model call (D4).

### 3.8 Meaning moves server-side

The engineering BOM, comparison review grouping and queues, comment anchor resolution and net or component neighbourhoods move from the frontend into services, as part of typing the API. The UI becomes a client of them. Otherwise an agent and a person looking at the same revision disagree about what a BOM line or a review group is.

Design queries run in a **design-query service** over the revision's bundle projections and `design.json`, using `prism-kicad bundle extract` where that is cheaper. This keeps the design bundle ADR's intent inside D1.

### 3.9 Identity and addressability

- **Identity contract.** The contracts document which ids are stable across revisions: design key, `componentUid`, KIID path, change `semanticId`. A cross-revision test over the fixture corpus enforces them.
- **One URL grammar** for every element and view state: revision, tab, selection, highlighted nets, open insets, camera, comparison item. The UI, tools and tracker links all build URLs from one helper, which also fixes the plural `/projects/` bug in `deep_links.py`.
- **Resource URIs:** `prism://project/{id}/rev/{sha}/…` for components, nets, BOMs, netlists, stackups, sheets, comparisons and release dossiers.
- Every element in a tool result carries both `link` (HTTPS deep link) and `uri` (resource URI).

### 3.10 Event log

- An append-only event table records:
  - revision synced;
  - bundle built or failed;
  - job progress and completion;
  - comparison done;
  - comment changed;
  - release candidate built or approved.
- One log feeds every consumer: the polling route `GET /api/v1/events?after=`, the live socket below, MCP subscriptions, and the signed outbound webhooks with retries in v5.2.
- **Live socket** (D12). One socket per signed-in user at `/api/v1/events/live` replaces per-feature sockets and polling loops.
  - It follows `comment_live_broker.py`: the table is the record. Postgres `NOTIFY` is only a wake-up hint, because workers write events from other processes. A reconnecting client replays from its cursor.
  - Clients subscribe to topics such as `project:<id>` and `job:<id>`. The policy table and folder visibility are checked on subscribe and again for each event delivered.
  - A heartbeat keeps idle sockets under nginx's 300 s `proxy_read_timeout`. Fan-out runs off the event loop, so a burst of events can't stall requests.
  - `websockets` must be in `runtime.lock`, or live sockets answer 405 in production. `TestClient` hides this, so a deployment-level check covers it.
  - Polling stays as the fallback.
  - Screens that move onto it after MCP-08:
    - job progress (`server-state.ts`);
    - the design-data panel (its 5 s poll);
    - Release Studio;
    - Simulation Studio runs;
    - library imports;
    - a "new commit or bundle ready" notice on open pages.
  - Not in scope: viewer data and file reads, live co-editing, presence.

### 3.11 Governance

- **Off by default.** `PRISM_MCP_ENABLED` (default `false`), like Simulation Studio's flag: while unset, `/mcp` and its metadata answer 404.
- **Scoping.** Admins can limit MCP to chosen projects and tools.
- **Read audit** (D7). Every MCP read is logged with client, tool, project and revision, so admins can answer "which client read which design". Proprietary designs will flow to third-party model providers through users' own clients, and admins need control and evidence.

### 3.12 SDK and CLI

- A Python client generated from the `/api/v1` OpenAPI document, with a thin hand-written layer for auth (PAT or device flow), pagination and job waiting.
- A `prism` CLI on top, for example:
  - `prism projects list`;
  - `prism compare <base> <head> --wait`;
  - `prism bom <project> --revision <rev> --csv`;
  - `prism comment …`.
- Both live in this repo, in one package (`sdk/python`, distribution name `kicad-prism`, import name `prism`), versioned with the API. CI regenerates the client and fails on drift.
- Designed to publish (D8): Apache-2.0 metadata, semantic versions that follow the release tag, no imports from `backend/`, and its own tests. Until a publishing decision, it ships as a wheel in the release archive.

## 4. What this does not do

- No in-app assistant, no model calls, no Sampling (D4).
- No tool per route.
- No MCP writes in v5.1. Write tools come in v5.2, each behind its area scope, after the actor model and idempotency keys are in.
- No release approval, publishing, catalog QA or admin action through MCP, ever (§3.5).
- No comment resolved or reopened by any token or agent (D6).
- No change to session auth in the browser. Session callers carry no scopes, as today.

## 5. Consequences

- **Two prefixes until v6.** `/api` and `/api/v1` both reach the same routes through one rewrite, not a second route table. OpenAPI publishes `/api/v1` only, and v6 removes the alias for bearer callers.
- **Typing touches every API module**, a large but mechanical change. The ratchet lets it land incrementally.
- **Frontend code moves to services** (§3.8), so the frontend will need fixture updates where it computed BOM and review groups itself.
- **Schema changes:** migrations for personal access tokens, OAuth clients and grants, idempotency keys, events, and the actor columns.
- **The existing scope check gets finer.** A token holding only `api:write` keeps working because of the alias. New tokens and clients request less.

## 6. Security notes

- The bearer path, not MCP, is the trust boundary: MCP adds no permission the policy table doesn't grant.
- `render_view` runs on the worker, never in the request process, under the same memory budget as other worker jobs. It plots with kicad-cli and rasterises with CairoSVG; the browser viewer is not involved.
- PATs and refresh tokens are stored hashed; access tokens are short-lived JWTs (proposed: 1 hour).
- `/mcp` validates `Origin` and the token's audience (the resource indicator) on every request. A token minted for another resource is refused.
- Rate limits per client and per token, configured by admins (v5.3), with defaults from v5.1.

## 7. Work packages for v5.1

Each package is one PR into `feature/scripting-mcp`, in this order. Packages on the same line can run in parallel.

| # | Package | Depends on |
| --- | --- | --- |
| MCP-00 | This ADR | — |
| MCP-01 | `/api/v1` mount, `operation_id` convention, untyped-route ratchet in CI | 00 |
| MCP-02 | Area scopes and human-only actions in `policy.py` | 00 |
| MCP-02b | Actor columns (`editor_*`, `author_client_id`) and `authorKind` | 02 |
| MCP-03 | Personal access tokens (model, routes, Settings UI) | 02 |
| MCP-04 | Idempotency keys on v1 | 01 |
| MCP-05a | Server-side BOM (`design_query/bom.py`), with a parity fixture | 01 |
| MCP-05b | Review grouping on the server (`/design-compare/{job_id}/review`), with a parity fixture | 01 |
| MCP-05c | The design-query index: search, component and net routes, and revision pinning | 01 |
| MCP-06a–f | Typing pass, in six route slices: project reads (a); comments, comparison, auth and settings (b); catalog reads (c); Release Studio and remote provider (d); catalog writes (e); project writes (f) | 01, 05 |
| MCP-07 | Identity contract test; URL grammar helper; `deep_links.py` fix | 00 |
| MCP-08a | Event log and `GET /api/v1/events` | 01 |
| MCP-08b | The live socket `/api/v1/events/live` (§3.10, D12) | 08a |
| MCP-08c | Event producers: jobs, comparisons, comments, revisions, bundles and releases append to the log | 08a |
| MCP-09 | OAuth for MCP clients (CIMD, RFC 9728, RFC 9207, refresh, incremental consent) | 02, 03 |
| MCP-10 | Tool registry and the read-only MCP server at `/mcp`, with tasks and resource links | 05, 06, 09 |
| MCP-10b | Comparison tools (`compare_revisions`, `get_changes`, `get_comparison_review`, `get_job`) and the tasks extension | 10 |
| MCP-11 | Governance switches and read audit | 10 |
| MCP-12 | Python SDK and `prism` CLI | 06 |
| MCP-13 | `render_view`: headless renders from the bundle, as a route and a tool (D9) | 05, 07, 10 |
| MCP-14 | Docs: "Automating Prism" (SDK, CLI, MCP client setup) | 10, 12 |

Packages were split where one PR would have mixed unrelated reviews: the BOM, review-grouping and index ports each carry their own parity fixture, and the typing pass is sliced by route area so slices can run in parallel. Revision pinning moved from MCP-04 to MCP-05c, where the index that needs it lives. A response-model safety net (#879) landed with the typing pass: a response that does not match its model is served unvalidated and logged in production, and fails tests (`PRISM_STRICT_RESPONSE_MODELS=1`).

The branch merges into `dev` when MCP-01 to MCP-14 are in and the full suites pass on it. The automated upgrade and rollback check from the release plan is separate, not part of this branch.

## 8. Alternatives considered

- **A separate MCP process calling the HTTP API.** It would need its own auth bridge and would duplicate the policy checks. Rejected by D1.
- **Generate one tool per OpenAPI operation.** Cheap to build, but 319 tools swamp any model, and route boundaries don't match tasks. Rejected.
- **Keep unversioned paths as the contract.** No room to change shapes without breaking scripts. Rejected by D2.
- **Dynamic Client Registration for MCP clients.** Deprecated by the 2026-07-28 spec in favour of Client ID Metadata Documents.

## 9. Open questions

None. The questions raised in review are settled as D6–D11.

## 10. v5.2: write tools, handoff, webhooks, addressable views

Supply and stock tracking is not part of this slice; it is reworked separately before it merges.

### 10.1 Decisions

| # | Decision |
| --- | --- |
| D13 | **Write tools declare their scope.** A registry `Tool` carries `write=True` and the policy action it needs. Write tools get `readOnlyHint: false`, an honest `destructiveHint` and `idempotentHint`, and an optional `idempotencyKey` argument that invoke forwards as the `Idempotency-Key` header. Invoke returns response headers as well as status and body. |
| D14 | **Incremental consent over HTTP.** When a write route refuses an MCP OAuth caller for a missing scope, `/mcp` answers that `tools/call` with HTTP 403 and the route's `WWW-Authenticate: Bearer error="insufficient_scope", scope=...` challenge, so the client can ask the user for that scope and retry. PATs and other bearer callers get an ordinary tool error with code `insufficient-scope`. |
| D15 | **Human-only handoff by URL.** A tool that reaches a human-only action (release approval or publishing, catalog QA, admin, resolving a comment) answers with JSON-RPC error `-32042` (URL elicitation required). Its `data.elicitations` holds one `{mode: "url", elicitationId, url, message}` pointing at the Prism page where a person acts. Handoff tools exist only where an agent plausibly needs them: `resolve_comment` and `request_release_approval`. They never change state. |
| D16 | **Comment anchors from design identity.** `add_comment` anchors by component reference, net name, schematic sheet or comparison change id, resolved on the server from the revision's bundle (the geometry `render_view` already uses). Agents never send coordinates. Comments from MCP callers keep `authorKind: agent` and the client name, and the UI shows them with an agent badge. |
| D17 | **Outbound webhooks are admin-owned.** An admin registers endpoints (HTTPS URL, event kinds, optional project list). Delivery reads the event log from a per-endpoint cursor on the worker, signs per the Standard Webhooks scheme (`webhook-id`, `webhook-timestamp`, `webhook-signature`, HMAC-SHA256 over `id.timestamp.body`), and retries with exponential backoff for up to 24 hours before marking the endpoint failing. Private and loopback addresses are refused unless `PRISM_WEBHOOK_ALLOW_PRIVATE=true`. Secrets are shown once. |
| D18 | **One URL grammar for view state.** The project page reads `sel` (references or element uuids, comma separated, each item percent-encoded before joining), `nets` (net names), `page` (schematic sheet path), `bbox` (`x,y,w,h` in mm, framed with `focusBBox`) and `insets=1`, alongside the existing `section`, `commit` and `tab`. `core/links.py` builds them; component, net and comment results link with them. `window.prism` (`version: "v1"`) exposes `getState()`, `open(state)` and `link(state)` over the same grammar while a project page is mounted, in the shape of `prismSimStudio`. |
| D19 | **Token activity audit.** Every non-GET request made with a bearer token (PAT, MCP, agent, service client) is recorded in the existing audit table with method `http`, the route template and the outcome. The audit view filters by token, client, user, project and read or write. |

### 10.2 Work packages for v5.2

| # | Package | Depends on |
| --- | --- | --- |
| MCP-15 | This section | — |
| MCP-16 | Write-tool seam: `Tool.write` and policy action, write annotations, `idempotencyKey`, response headers from invoke, D14 challenge, D15 handoff error | 15 |
| MCP-17 | Comment tools `add_comment`, `reply_to_comment`, `resolve_comment` (handoff), with D16 anchors | 16 |
| MCP-18 | Design, release and catalog tools: `sync_project`, `start_release_build`, `request_release_approval` (handoff), `create_catalog_draft`, `update_import_proposal` | 16 |
| MCP-19 | Agent badge on comments and replies (frontend) | 15 |
| MCP-20 | Outbound webhooks: tables, delivery worker, signing, retries, admin routes | 15 |
| MCP-20b | Webhooks tab in Settings | 20 |
| MCP-21 | View-state URL grammar on the project page and `window.prism` (frontend) | 15 |
| MCP-21b | `links.py` view-state params; component, net and comment results link with them | 16 |
| MCP-22 | Token activity audit and the audit view filters (D19) | 16 |
| MCP-23 | SDK regeneration, `prism comment`, `prism sync`, `prism release build`; CI templates for GitHub Actions and GitLab CI | 17, 18, 20 |
| MCP-24 | Docs: write tools, webhooks, view links, CI templates in "Automating Prism" | 17–23 |

Two follow-ups from v5.1 landed with this slice: lease recovery now appends `job.finished` for the jobs it ends (webhooks would otherwise miss them), and CI runs the SDK's own tests.

The branch merges into `dev` when MCP-15 to MCP-24 are in and the full suites pass on it.

## 11. Ops: diagnostics for deployed instances

On a team's server the people debugging Prism usually can't reach a shell. Narrow, audited diagnostics over MCP let an agent answer "why is the BOM tab slow on this project?" without one. Locally they add little: `docker exec`, `psql` and the logs are already there.

### 11.1 Decisions

| # | Decision |
| --- | --- |
| D20 | **Ops is a separate capability, off by default.** `PRISM_MCP_OPS_ENABLED` (default `false`) gates the ops routes, tools and scopes. Two new scopes and policy actions: `ops:read` (`ops_read`) and `ops:act` (`ops_act`). Both are admin-role only. Neither is implied by `api:write`, and `ops:act` implies `ops:read`. PATs may hold them. MCP clients may request them, but the consent page grants them only to an admin; for anyone else they are dropped from the grant and the page says so. While the flag is off, the routes answer 404, the tools are not listed and the scopes are not advertised. |
| D21 | **Diagnostics are admin reads, not sign-offs.** This amends §3.5: `admin` and `catalog_admin` stay human-only, but `ops_read` and `ops_act` are new actions outside that list. The actions are fixed and small: cancel a job, requeue a failed or stuck job, rebuild one design bundle, and raise logging to debug for at most 30 minutes. Arbitrary SQL, shell access and configuration changes are never tools. |
| D22 | **Output limits.** Ops results carry identifiers, timings, counts and sizes, never design content: no comment text, field values or file contents. Every string that can hold a secret (log lines, error messages, query text, URLs) passes through one redactor (`app/core/redaction.py`), which strips URL credentials, bearer and `prism_pat_`/`whsec_` tokens, authorization headers and `key=value` secrets. Log tails are capped at 200 lines. |
| D23 | **Route and counter statistics are flushed per minute.** Each process keeps per-minute aggregates in memory: for each route template, a request count, 4xx and 5xx counts and a log-scale duration histogram, plus named counters such as cache hits and misses. A background thread flushes them every 60 s to `ws_ops_route_stats` and `ws_ops_counters`. Percentiles come from the merged histograms across processes. Rows are kept 7 days. |
| D24 | **Request ids.** A middleware gives every request an id, taking an inbound `X-Request-Id` when it is 1–64 characters of `[A-Za-z0-9._-]`. It returns the id in the response header and stores it on the jobs, events and audit rows the request creates. Every non-GET request, every request slower than 1 s and every 5xx gets a row in `ws_ops_requests`: route, status, duration, time spent holding a database connection, caller kind. Rows are kept 3 days. `trace_request` joins these. |
| D25 | **Slow queries from `pg_stat_statements` when it is loaded.** Local and release compose start Postgres with `shared_preload_libraries=pg_stat_statements`, and a migration creates the extension when it can. Where it isn't loaded, `get_slow_queries` answers `available: false` with the reason, rather than failing. Query text is Postgres's normalised form, redacted and cut to 2 kB. |
| D26 | **Sampling profiles in-process, bounded.** `capture_profile` samples stacks with the standard library (`sys._current_frames`, 100 Hz) for at most 10 s, and returns collapsed stacks (flame-graph input, top 500, paths shortened to modules). Its target is either the API process that answers the call or a prism worker's supervisor, which polls a request row. One profile runs at a time across the deployment (advisory lock), and at most 6 per hour. |
| D27 | **Live worker state is published.** Each prism worker upserts a heartbeat row in `ws_ops_workers` every 15 s: id, pool, host, pid, start time, concurrency, memory budget, running jobs. Rows not seen for 2 minutes are reported stale. The API reports its own pool statistics for the process that answers. |
| D28 | **Debug logging is time-boxed.** `ops:act` can set Prism's loggers to DEBUG until a deadline of at most 30 minutes, stored in `ws_ops_settings`. Every process checks the setting every 15 s and reverts at the deadline, with no restart. |

### 11.2 Tools

| Tool | Scope | Source |
| --- | --- | --- |
| `get_job_timeline` | `ops:read` | `ws_jobs`, `ws_job_events`, resource slots and locks, a redacted log tail, the request id |
| `get_bundle_build_profile` | `ops:read` | the bundle job's `result_metadata`: per-invocation and per-KiCad-step elapsed time and peak RSS, cache hits |
| `get_route_latency` | `ops:read` | `ws_ops_route_stats` over a window: p50/p95/p99, 4xx and 5xx rates per route template |
| `get_slow_queries` | `ops:read` | `pg_stat_statements` by total and by mean time |
| `get_pool_and_workers` | `ops:read` | this process's DB pool, `ws_ops_workers`, resource slots in use, queue depth by kind and status |
| `get_cache_stats` | `ops:read` | cache hit and miss counters, cache table sizes and on-disk cache sizes (measured at most every 5 minutes) |
| `list_recent_requests`, `trace_request` | `ops:read` | `ws_ops_requests` newest first, and one request id joined with the jobs, events and audit rows carrying it |
| `capture_profile` | `ops:read` | D26 |
| `get_event_and_webhook_health` | `ops:read` | event-log head and retention, each webhook's cursor lag, failing endpoints, delivery error rates |
| `cancel_job`, `requeue_job` | `ops:act` | the job service: cancel is the existing request; requeue resets a failed, retry-waiting or lease-expired running job to `queued`, never one with a cancel requested |
| `rebuild_bundle` | `ops:act` | the existing design-bundle regenerate path |
| `set_debug_logging` | `ops:act` | D28; only `app` and its child loggers, since third-party loggers can log URLs and query arguments |

Every ops tool call is audited like any other MCP call, and the HTTP routes behind them are audited by D19.

### 11.3 Work packages

| # | Package | Depends on |
| --- | --- | --- |
| OPS-00 | This section | — |
| OPS-01 | Seam: flag, scopes, policy actions, consent rule, `core/redaction.py`, the `/api/v1/ops` router and conditional tool registration | 00 |
| OPS-02 | Instrumentation: request-id middleware, `ws_ops_requests`, route statistics, counters and the flusher (migration 139) | 01 |
| OPS-03 | Worker heartbeats and time-boxed debug logging (migration 140) | 01 |
| OPS-04a | `get_job_timeline`, `get_bundle_build_profile` | 01 |
| OPS-04b | `get_route_latency`, `trace_request`, `get_slow_queries` and `pg_stat_statements` (migration 141) | 02 |
| OPS-04c | `get_pool_and_workers`, `get_cache_stats`, `get_event_and_webhook_health` | 02, 03 |
| OPS-05 | `capture_profile` (migration 142) | 01 |
| OPS-06 | Actions: `cancel_job`, `requeue_job`, `rebuild_bundle`, `set_debug_logging` | 03 |
| OPS-07 | Docs and a live check through a real client | all |

## 12. Catalog authoring: taking a component to QA Review

Making a library part is the slowest routine job in a hardware team: read the datasheet, fill in the fields, draw the symbol and footprint, find the 3D model, check it all against the library conventions, and send it for review. An agent on the engineer's machine can do most of it, but until now it could only create the empty record (`create_catalog_draft`). This section adds the rest, up to the point where a reviewer takes over.

### 12.1 Decisions

| # | Decision |
| --- | --- |
| D29 | **Prism accepts files; it does not make them.** How a symbol, footprint or 3D model is produced (by hand, a generator, a model, KiCad's own editors) is the client's business. Prism checks what it receives and stores it through the same imports the Library Manager's upload buttons use. Generators, intermediate representations and authoring skills are a separate offering, outside this repository. |
| D30 | **Files reach Prism by upload slot or inline text.** A client that cannot post multipart forms asks for a slot (`POST /catalog/uploads`), `PUT`s the bytes to the signed URL it gets back, and names the file by `upload_id` afterwards. The signature is the `PUT`'s only credential; the slot belongs to the person who opened it, takes one write, holds at most 64 MiB (the largest model Prism embeds) and expires after 15 minutes. Symbols and footprints may instead travel inline as `content`. Bytes never travel inside a tool call's arguments as base64. |
| D31 | **A draft can be checked without becoming a revision.** `POST /catalog/drafts/check` runs the same `kicad-cli` read, render and KLC checker a stored asset goes through and returns KiCad's own error text, the findings and a PNG of each unit, storing nothing. A truncated S-expression is refused before `kicad-cli` runs, because KiCad 10.0's `fp upgrade` loops until its timeout on one. |
| D32 | **Agents stop at QA Review.** Moving a component's stage now needs `catalog:write` from a token, and a move to `done` or `released` needs `catalog:qa`, which is human-only (§3.5): an MCP client is refused it whatever it holds. Before this, the stage route checked only `api:read` and the role. The role rule stays in `workflow_policy.can_transition`; `workflow_policy.transition_action` names the scope. `request_catalog_approval` hands back the component's page and never calls a route (D15). |
| D33 | **Edits are guarded.** Tools that change an existing component send its revision as `If-Match`: the one the agent read, or the latest when it gives none. A component someone changed meanwhile answers 412, as it does in the browser. |

### 12.2 Tools

| Tool | Kind | Route |
| --- | --- | --- |
| `list_catalog_fields` | read | `GET /catalog/metadata/fields` |
| `search_catalog_assets` | read | `GET /catalog/assets/search` |
| `check_catalog_asset` | read, `catalog:write` | `POST /catalog/drafts/check` (D31) |
| `update_catalog_component` | write | `PATCH /catalog/components/{id}` |
| `create_asset_upload` | write | `POST /catalog/uploads` (D30) |
| `attach_catalog_asset` | write | `POST /catalog/components/{id}/assets/{type}/attach` |
| `reuse_catalog_asset` | write | `POST /catalog/components/{id}/assets/{type}/reuse`: links an asset the catalog already stores, so a standard footprint is shared, not copied |
| `validate_catalog_component` | write | `POST /catalog/components/{id}/validate`, waits for the job, then `GET .../validation` |
| `update_catalog_representation` | write | `PATCH /catalog/components/{id}/representations/{rep}` |
| `remove_catalog_representation` | write | `DELETE /catalog/components/{id}/representations/{rep}`, then `DELETE .../assets/id/{asset}` for each of its assets no other representation uses |
| `move_catalog_component` | write | `POST /catalog/components/{id}/release`, to `in_progress` or `qa_review` only |
| `request_catalog_approval` | handoff | none (D15, D32) |

The new routes live in `backend/app/api/catalog_drafting.py`; uploads and draft checks in `backend/app/services/catalog/staged_uploads.py` and `draft_checks.py`. KiCad's IPC API gains symbol- and footprint-editor handlers after 10.0; when Prism's worker runs a KiCad with them, a client may drive the editors itself, and nothing here changes.

## 13. Supply: can we build it, and how does a component stand

Supply joins the registry instead of keeping its own MCP endpoint: `POST /api/supply/mcp` (three part-number reads from PR #894) is removed. The supply data model is component-first (a component's main part plus the alternates QA approved), so the tools take a project or a component, never a loose part number.

### 13.1 Decisions

| # | Decision |
| --- | --- |
| D34 | **Reads plus two writes.** Agents read a project's supply and a component's supply, and look for alternatives. They may watch a component's part and ask for one fresh distributor read. Connectors, settings, waivers, tiers and alternate approvals stay with people. Proposing an alternate is a designer's step in Prism. |
| D35 | **Reads never call a distributor.** They answer from what Prism stored. `refresh_component_supply` is the one tool that reaches a distributor, through the same interactive reserve and per-person limit the Refresh button uses. |

### 13.2 Tools

| Tool | Kind | Route |
| --- | --- | --- |
| `get_project_supply` | read | `GET /supply/projects/{id}/supply`, shaped to the rollup and the lines that need a look |
| `get_component_supply` | read | `GET /supply/components/{id}/parts`, then `GET /supply/parts/{part}` for each approved part, `.../local-stock` and `.../watch` |
| `find_part_alternatives` | read | `GET /supply/components/{id}/parts`, then `GET /supply/parts/{main}/cross-reference` |
| `watch_component` | write, `supply_follow` | `PUT /supply/tracking/components/{id}` |
| `refresh_component_supply` | write, `supply_write` | `GET /supply/components/{id}/parts`, then `POST /supply/parts/{main}/refresh` (D35) |

The tools live in `backend/app/services/mcp/tools_supply.py`.
