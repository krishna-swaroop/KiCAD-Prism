---
title: Ops diagnostics
description: Let an administrator's assistant or script find out why a Prism job is stuck or a route is slow, and take a few bounded actions, without shell access.
sidebar:
  order: 5
---

Ops diagnostics let an administrator's AI assistant, or a script, look into a running Prism server: why a job is stuck, which route is slow, whether the workers are alive. A few bounded actions unstick things. Nothing here needs shell or database access.

## Turn it on

Ops diagnostics are off by default.

1. Set `PRISM_MCP_OPS_ENABLED=true`. See [Configuration](/KiCAD-Prism/admin/configuration/#automation-and-mcp).
2. Restart the backend.

While it is off, the ops tools aren't listed and every route under `/api/v1/ops` answers 404.

## Scopes

Ops adds two scopes:

| Scope | Allows |
| --- | --- |
| `ops:read` | the read tools and `capture_profile` |
| `ops:act` | the actions, and everything `ops:read` allows |

- Only administrators can hold them. If someone else's client asks for them, the consent page leaves them out and says so.
- `api:write` never grants either one. Ask for them on their own.
- A client connected before ops was turned on asks for the scope the first time it calls an ops tool.
- A [personal access token](/KiCAD-Prism/automate/api-and-tokens/#create-a-personal-access-token) can carry them, so a script can use the same checks. Only an administrator can create such a token.

## Read tools

These need `ops:read`.

| Tool | Returns |
| --- | --- |
| `get_job_timeline` | a job's status, queue wait, each worker claim and how long it held the job, per-stage durations, the resource slots and locks it holds, its redacted error, and a redacted log tail (50 lines by default, at most 200). Never the job's payload or result. |
| `get_bundle_build_profile` | how a design-data build spent its time: each KiCad step with its exit, elapsed time and peak memory, cache hits, failed or partial stages, and the slowest step |
| `get_pool_and_workers` | the database pool, each worker's heartbeat, resource slots in use and the job queue by kind |
| `get_cache_stats` | cache hit rates and the size of each cache table and directory |
| `get_event_and_webhook_health` | the event log's head and retention, each webhook's lag and its recent delivery failures |
| `capture_profile` | a sampled CPU profile of the API process (`api`) or a worker (`worker`), as collapsed stacks for a flame graph, most frequent first |
| `get_route_latency` | p50, p95 and p99 latency and 4xx and 5xx rates per route over a window of 1 minute to 7 days (default 60 minutes) |
| `list_recent_requests` | recent slow, failed and write requests, filtered by duration, status or route prefix |
| `trace_request` | one request id followed across the jobs, events and audit rows it created |
| `get_slow_queries` | the slowest database statements from `pg_stat_statements`, by total or mean time, or the reason they're unavailable |

## Actions

These need `ops:act`.

| Tool | Does |
| --- | --- |
| `cancel_job` | asks a job to cancel. A queued job is cancelled at once; a running one stops at its next checkpoint. It never deletes a job or its files. |
| `requeue_job` | queues a failed or retry-waiting job again, or a running one whose worker has died (its lease expired). A running job with a live worker, or one someone asked to cancel, is refused. |
| `rebuild_bundle` | drops one commit's design data (the project's head if no commit is given) and builds it again without reuse. It refuses while another design-data build of the project is running. |
| `set_debug_logging` | raises Prism's own loggers (`app` and below) to DEBUG for 1 to 30 minutes. Every process picks it up within about 15 seconds and reverts at the deadline, with no restart. `minutes: 0` clears it. |

## Safety limits

- There is no tool for SQL, shell commands or configuration changes.
- Results carry ids, timings, counts and sizes, never design content.
- Log lines, error messages, query text and URLs pass through a redactor that strips credentials and tokens.
- `capture_profile` samples for at most 10 seconds. One profile runs at a time, and at most 6 start in an hour, so take one while the problem is happening.
- `set_debug_logging` only touches Prism's own loggers, and always ends at its deadline.
- Every call is audited like any other MCP call, under **Settings → MCP** in **Audit**.

## Request ids and retention

Every HTTP response carries an `X-Request-Id` header. A client may send its own: 1 to 64 letters, digits, `.`, `_` or `-`. Jobs, events and audit rows a request creates record its id, which is what `trace_request` follows.

Prism logs every write, every failed request (5xx) and every request slower than 1 second. These rows are kept for 3 days. Per-route statistics are kept for 7 days.

## Use the routes from a script

Each tool is also an HTTP route under `/api/v1/ops`, for scripts and the [Python SDK](/KiCAD-Prism/automate/sdk-and-cli/):

| Tool | Route |
| --- | --- |
| `get_job_timeline` | `GET /api/v1/ops/jobs/{job_id}/timeline` |
| `get_bundle_build_profile` | `GET /api/v1/ops/projects/{project_id}/bundle-profile` |
| `get_pool_and_workers` | `GET /api/v1/ops/pool-and-workers` |
| `get_cache_stats` | `GET /api/v1/ops/caches` |
| `get_event_and_webhook_health` | `GET /api/v1/ops/event-health` |
| `capture_profile` | `POST /api/v1/ops/profiles`, then `GET /api/v1/ops/profiles/{profile_id}` |
| `get_route_latency` | `GET /api/v1/ops/route-latency` |
| `list_recent_requests` | `GET /api/v1/ops/requests` |
| `trace_request` | `GET /api/v1/ops/requests/{request_id}` |
| `get_slow_queries` | `GET /api/v1/ops/slow-queries` |
| `cancel_job` | `POST /api/v1/ops/jobs/{job_id}/cancel` |
| `requeue_job` | `POST /api/v1/ops/jobs/{job_id}/requeue` |
| `rebuild_bundle` | `POST /api/v1/ops/projects/{project_id}/rebuild-bundle` |
| `set_debug_logging` | `POST /api/v1/ops/debug-logging` to set, `DELETE /api/v1/ops/debug-logging` to clear, `GET /api/v1/ops/debug-logging` to read the window in force |

`GET /api/v1/ops/status` tells you whether ops is on and which ops scopes your token holds.

For example, to see the slowest routes over the last day:

```bash
curl -H "Authorization: Bearer $PRISM_TOKEN" "https://prism.example.com/api/v1/ops/route-latency?window_minutes=1440"
```
