# Supply Data Integration Spec — Stock & Pricing from Distributors

Status: Draft (pre-implementation) · Date: 2026-08-22 · Origin: [issue #167](https://github.com/krishna-swaroop/KiCAD-Prism/issues/167)

Companion research: [`distributor-api-research.md`](./distributor-api-research.md) (primary-source citations for every external-API claim made here).

This spec closes the loop on the Remote Symbol Panel revamp: automated stock, pricing, and
lifecycle data for catalog components, refreshed into PostgreSQL on a cadence and displayed in
the Remote Symbol Panel and Library Manager. Integration is **direct** — no intermediary
service, no vendored proxy. Prism owns three acquisition paths against distributor APIs and a
community catalog snapshot.

---

## 1. Goals and Non-Goals

**Goals**

1. Per-component stock quantity/status, tiered price breaks, currency, lifecycle status,
   datasheet URL, product URL, and supplier part number stored in the catalog schema.
2. Three acquisition paths:
   - **jlcparts catalog snapshot** (SQLite dump, ~450k parts, rebuilt 3×/day) → LCSC + JLCPCB coverage, quota-free.
   - **DigiKey Product Information V4 API** (official, OAuth2).
   - **Mouser Search API V1** (official, API key).
3. Tiered background refresh within documented vendor quotas; initial hydration of a ~20k MPN
   catalog without exhausting limits.
4. CSV seed/export round-trip for offline populations.
5. Vendor sources rendered in Remote Symbol Panel detail view (price-break grid, datasheet and
   product links, lifecycle badge) and lifecycle visible in Library Manager.
6. Credentials supplied once in Prism's root `.env`; providers activate when their credentials
   are present.

**Non-Goals**

- InvenTree integration (separate effort, tracked separately on issue #167 thread).
- Ordering, cart, or quoting APIs of any vendor.
- PLM features: locations, incoming inspection, lifecycle *workflows*, obsolescence pipelines.
  Lifecycle status is stored and displayed passively only.
- Synchronous vendor lookups inside KiCad payload paths (no just-in-time fetching).
- Live LCSC/JLCPCB adapters in v1 (unofficial endpoints are fragile; official APIs are
  approval-gated). Snapshot covers both.
- Nexar/Octopart (candidate future provider adapter).
- Multi-currency display logic.

## 2. Acquisition Strategy and Hydration Math

| Path | Covers | Quota cost | Initial 20k-MPN hydration |
| --- | --- | --- | --- |
| jlcparts snapshot import | LCSC, JLCPCB | zero vendor quota (GitHub Pages download) | minutes |
| DigiKey keyword search (paced) | DigiKey | 120/min, 1000/day | ~20 days |
| DigiKey BatchProductDetails (if account-enabled) | DigiKey | 50 MPNs/call | ~1 day |
| Mouser partnumber search, 10-PN pipe batches | Mouser | 30/min, 1000/day | ~2 days |

Steady-state refresh after hydration stays far below quota: only components past their tier's
cadence are re-queried, within configurable daily budgets (§7).

## 3. Database Schema

### 3.1 New table `catalog.supply_quotes`

Vendor quotes live apart from local stock (`inventory_levels` is unchanged and remains
local-only: csv/inventree). This mirrors the existing `SUPPLY_KIND_VENDOR`/`SUPPLY_KIND_LOCAL`
split in `component_catalog_domain.py`.

```sql
CREATE TABLE IF NOT EXISTS supply_quotes (
    source            TEXT NOT NULL,        -- 'digikey' | 'mouser' | 'lcsc' | 'jlcpcb'
    component_id      TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    location_key      TEXT NOT NULL DEFAULT '',
    source_record_id  TEXT NOT NULL DEFAULT '',   -- supplier part number ('595-NE555P', 'C21190')
    provenance        TEXT NOT NULL DEFAULT 'api',-- 'api' | 'snapshot' | 'csv'
    quantity          DOUBLE PRECISION NOT NULL DEFAULT 0,
    uom               TEXT NOT NULL DEFAULT '',
    inventory_status  TEXT NOT NULL DEFAULT '',
    currency          TEXT NOT NULL DEFAULT 'USD',
    price_breaks      TEXT NOT NULL DEFAULT '[]', -- JSON [{"qty": int, "unit_price": float}, ...] ascending qty
    lifecycle_status  TEXT NOT NULL DEFAULT '',
    datasheet_url     TEXT NOT NULL DEFAULT '',
    product_url       TEXT NOT NULL DEFAULT '',
    fetch_status      TEXT NOT NULL DEFAULT 'ok', -- 'ok' | 'stale' | 'not_found' | 'error'
    last_error        TEXT NOT NULL DEFAULT '',
    fetched_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    PRIMARY KEY(source, component_id, location_key)
);
CREATE INDEX IF NOT EXISTS idx_supply_quotes_component ON supply_quotes(component_id);
CREATE INDEX IF NOT EXISTS idx_supply_quotes_sweep ON supply_quotes(source, fetch_status, fetched_at);
```

Notes:

- `fetch_status` is an app-enforced four-value vocabulary (no CHECK constraint, consistent
  with house style):
  - `ok` — data present and within its cadence target.
  - `stale` — present but older than its tier's cadence target (displayed greyed).
  - `not_found` — vendor returned no confident match for the normalized MPN. The row persists
    so sweeps skip it until component metadata changes or a forced refresh is requested.
  - `error` — upstream failure; `last_error` carries the reason; retried with backoff.
- A `not_found` row has `source_record_id=''`, zero quantity, empty breaks.
- Price breaks are stored in the vendor-native currency received; `currency` records which.
  The workspace requests its preferred currency upstream where the API supports it (§9).

### 3.2 Migration and projection bumps

- Add one run-once entry to `MIGRATIONS` in `catalog_schema_migrations.py` creating
  `supply_quotes`.
- Bump projection markers: `POSTGRES_HEAD_PROJECTION_VERSION` → `catalog-component-heads-v6`,
  `POSTGRES_REMOTE_HEAD_PROJECTION_VERSION` → `catalog-remote-heads-v5`. Both refresh
  functions extend their `inventory_sources` aggregation to UNION `inventory_levels`
  (kind=local) with `supply_quotes` rows (kind=vendor), keeping deterministic ordering:
  `inventree → csv → digikey → mouser → lcsc → jlcpcb → other`. Existing trigger wiring gains
  `supply_quotes` so any quote write re-projects heads.
- Fill `SUPPLY_VENDOR_SOURCE_NAMES = {"digikey": "DigiKey", "mouser": "Mouser",
  "lcsc": "LCSC", "jlcpcb": "JLCPCB"}` in `component_catalog_domain.py`.

## 4. Payload Contract Changes (`supply.sources[]`)

Vendor entries extend the existing per-source object; local entries unchanged:

```json
{
  "kind": "vendor",
  "id": "mouser",
  "display_name": "Mouser",
  "stock": 4891,
  "uom": "",
  "stock_status": "in_stock",
  "fetch_status": "ok",
  "fetched_at": "2026-08-22T04:17:00+00:00",
  "provenance": "api",
  "currency": "USD",
  "unit_price": 0.42,
  "price_breaks": [{"qty": 10, "unit_price": 0.31}, {"qty": 100, "unit_price": 0.22}],
  "lifecycle_status": "Active",
  "datasheet_url": "https://...",
  "product_url": "https://..."
}
```

- `unit_price` is derived in `_supply_source_payload()` as the unit price of the smallest-qty
  break (the PartDetail availability card's headline stat).
- Local entries gain `"provenance"` too (always `"csv"`/`"local"` today) so consumers can
  treat the array uniformly.
- Version the panel-facing contract as `parts_v1` additive extension; document in
  `REMOTE_SYMBOL_PROVIDER.md`.

## 5. Provider Layer (`backend/app/services/supply/`)

Direct integrations, written from the official specs. House rules: sync `requests` (matches
existing backend), adapters never raise (return empty/None like the interface below), all
parsing covered by fixture-driven unit tests.

```
app/services/supply/
  __init__.py
  models.py       # SupplierPartInfo dataclass, PriceBreak, StockStatus normalization
  base.py         # SupplierInterface ABC + create_supplier registry factory
  digikey.py
  mouser.py
```

```python
class SupplierInterface(ABC):
    supplier_type: str                      # 'digikey' | 'mouser'
    def search_by_mpn(self, mpn: str) -> SupplierPartInfo | None: ...
    def search_by_mpn_batch(self, mpns: Sequence[str]) -> list[SupplierPartInfo]: ...
```

### 5.1 DigiKey (`digikey.py`)

- Auth: two-legged client credentials, `POST https://api.digikey.com/v1/oauth2/token`;
  headers `X-DIGIKEY-Client-Id`, `X-DIGIKEY-Locale-Site/Language/Currency`
  (currency = `SUPPLY_CURRENCY`). Sandbox host supported via env override for tests.
- **Token persistence**: catalog jobs run as short-lived subprocesses
  (`python -m app.job_runner`), so the token cache must live in the database
  (`catalog_meta` key `supply_digikey_token`, value = JSON `{token, expires_at}`), refreshed
  when within 60 s of expiry.
- Pacing ≥ 0.2 s between calls; honor 429 via `Retry-After`, else exponential backoff
  (1→2→4 s, max 3 retries); read remaining quota from `X-RateLimit-*`/`X-BurstLimit-*`
  headers and report it to the sweep loop.
- Field mapping (per official OAS): stock ← `Products[].QuantityAvailable`
  (+ per-variation `QuantityAvailableforPackageType`); lifecycle ← `ProductStatus.Status`
  plus `Discontinued`/`EndOfLife` booleans; datasheet ← `DatasheetUrl`;
  **price breaks ← `Products[].ProductVariations[].StandardPricing[]`
  (`BreakQuantity`, `UnitPrice`) — the full ladder, one break per packaging variation's best
  fit.** Do not repeat upstream implementations' mistake of collapsing to a single break.
- Batch: use BatchProductDetails (≤50 MPNs/call) when the account has it enabled;
  detect absence (403/product-not-enabled) once, set a runtime flag, fall back to paced
  single-MPN keyword searches. Batch enablement documented as optional-but-recommended.
- Note the `X-DIGIKEY-Customer-Id` → `X-DIGIKEY-Account-ID` sunset on pricing endpoints; ship
  with the new header.

### 5.2 Mouser (`mouser.py`)

- Auth: `MOUSER_API_KEY` as query parameter. Missing key → provider disabled (not an error).
- Pacing for 30/min; batching via `/api/v1/search/partnumber` accepting up to **10
  pipe-delimited part numbers per call** (each 3–40 chars); chunk MPN lists accordingly.
- Field mapping: `PriceBreaks[]` (`Quantity`, `Price` — string-typed, strip `$`/commas,
  `Currency`), prose `Availability` parsed by regex then normalized through shared
  stock-status logic, `LifecycleStatus`, `DataSheetUrl`, `LeadTime` → `extra_data`,
  `MouserPartNumber` → `source_record_id`, `InfoUrl`/product link → `product_url`.
- Exact-match filter after batch results, same as single search semantics.

### 5.3 Registry

`create_supplier(source)` returns None for unconfigured providers. Enabled-provider detection
is derived purely from credential presence in settings; `/api/catalog/admin` surfaces which
providers are active. No scrapers, no unofficial endpoints, no LLM fallbacks anywhere.

## 6. Matching Policy

- Enrollment: automatic. Any component with non-empty manufacturer and MPN enters the pool.
  Normalization function (shared by matcher and CSV import): casefold, collapse internal
  whitespace, strip packaging suffixes (e.g. `-ND` DigiKey suffixes are output-side only,
  never input-side), unify common confusables — exact rule set lives in
  `supply/matching.py` with its own tests.
- Best match writes `source_record_id` plus quote fields; ambiguous/absent match writes the
  `not_found` row.
- `not_found` rows leave retry churn until the component's metadata changes (`updated_at`)
  or an admin forces refresh.

## 7. Jobs and Scheduling (catalog worker pool)

Three new handler types registered in `catalog_worker_tasks.py`, running under the existing
lease/fence/checkpoint machinery:

### 7.1 `supply_refresh` — daily sweep

- Enqueued once per UTC day by extending `schedule_catalog_maintenance()` with idempotency
  key `supply-refresh:{date}`, following the `artifact_maintenance` pattern.
- Candidate selection per source (only configured ones), ordered by tier:
  1. **Active** — component linked to ≥1 project in the workspace; due every
     `SUPPLY_REFRESH_ACTIVE_DAYS` (default 7).
  2. **Default** — matched, not project-linked; due every `SUPPLY_REFRESH_DEFAULT_DAYS`
     (30).
  3. **Not-found re-check** — due every `SUPPLY_RETRY_NOT_FOUND_DAYS` (90).
- Budget guard: stop issuing upstream calls for a source once
  `SUPPLY_REFRESH_{SOURCE}_DAILY_BUDGET` is spent (defaults: digikey 500, mouser 300);
  persist spend counters in `catalog_meta` keyed by date. Sweep checkpoints via
  `catalog_checkpoint` and resumes next day; never blows through a vendor's daily quota.
- Writes: upsert quotes, flip `stale` markers by comparing `fetched_at` to tier targets,
  record `error` + `last_error` on failures (`RetryableJobError` for transient transport
  errors).

### 7.2 `supply_snapshot_import` — jlcparts snapshot

- Downloads the current jlcparts split-zip release from GitHub Pages
  (`SUPPLY_SNAPSHOT_BASE_URL`), reassembles, opens the SQLite dump read-only, maps rows to
  `supply_quotes` with `source ∈ {lcsc, jlcpcb}`, `provenance='snapshot'`,
  `fetched_at=<dump build date>`.
- Weekly idempotent schedule (`supply-snapshot:{iso-week}`) plus an admin button for manual
  runs. Idempotent re-import (upsert on natural key); snapshot rows never overwrite fresher
  `provenance='api'` rows unless the API row is itself stale.
- Pre-ship task: verify jlcparts' license/redistribution terms and pin schema-version
  handling (their dump schema may evolve; fail loudly on unknown schema).

### 7.3 Manual refresh

- `POST /api/catalog/components/{id}/refresh-supply` (admin RBAC) enqueues a targeted
  `supply_refresh` scoped to one component, bypassing budgets but not pacing.
- Bulk trigger endpoint for snapshot import and for "hydrate everything now" (admin,
  warns about multi-day quota consumption when Batch is unavailable).

## 8. CSV Seed / Export

Long format, one row per vendor-part, wide fixed 10 price-break slots (Excel-friendly,
mirrors distributor list exports):

```
vendor,manufacturer,mpn,supplier_part_number,currency,stock,uom,lifecycle_status,
datasheet_url,product_url,qty_1,price_1,...,qty_10,price_10
```

- Import: `POST /api/catalog/supply/import-csv` — upserts `supply_quotes`
  (`provenance='csv'`, `fetch_status='ok'`, `fetched_at=now`). Rows matched to components by
  the §6 normalizer; unmatched rows are reported, not silently dropped. Later API refreshes
  overwrite CSV rows freely.
- Export: `GET /api/catalog/supply/export-csv` round-trips the same schema for offline
  editing.
- Template download served alongside the import UI.

## 9. Currency

Workspace-wide `SUPPLY_CURRENCY` (default `USD`). Sent to DigiKey via
`X-DIGIKEY-Locale-Currency`; Mouser v1 returns USD for US keys — stored as returned, recorded
in `currency`. Panel displays values as-is; mixed currencies are tolerated and labeled. No
conversion in v1.

## 10. Environment Surface (root `.env.example` addition)

```
# --- Supply Data (Stock/Pricing) ---
DIGIKEY_CLIENT_ID=
DIGIKEY_CLIENT_SECRET=
MOUSER_API_KEY=
SUPPLY_CURRENCY=USD
SUPPLY_REFRESH_ACTIVE_DAYS=7
SUPPLY_REFRESH_DEFAULT_DAYS=30
SUPPLY_RETRY_NOT_FOUND_DAYS=90
SUPPLY_REFRESH_DIGIKEY_DAILY_BUDGET=500
SUPPLY_REFRESH_MOUSER_DAILY_BUDGET=300
SUPPLY_SNAPSHOT_BASE_URL=
SUPPLY_SNAPSHOT_IMPORT_ENABLED=true
DIGIKEY_BASE_URL=              # optional; sandbox-api.digikey.com for testing
```

Providers activate solely on credential presence. Compose passes these to backend + worker
containers. Document each variable in `.env.example` comments and `docs/CONFIGURATION.md`.

## 11. UI Surface

**Remote Symbol Panel** (detail view only; list/search rows stay stock-focused):

- Availability section gains vendor cards rendering: stock-state dot, soft badge, on-hand
  figure, unit-price stat, 2-col price-break grid (all shipped in the revamp — this feature
  feeds them), datasheet and product-page links, lifecycle badge, `fetch_status` mapping
  (`stale` greyed badge; `not_found` subtle "no match"; `error` amber with tooltip from
  `last_error`).
- Empty state when a vendor hasn't been fetched yet: "Vendor data pending" — never a blocking
  spinner.

**Library Manager** (admin UI):

- Lifecycle badge on component detail header; lifecycle column/filter in list view.
- Supply sources block in admin detail: per-source rows with provenance, fetched_at,
  fetch_status, last_error; per-component "Refresh supply data" action; bulk actions for
  snapshot import and full hydration.

## 12. Failure Modes

| Failure | Behavior |
| --- | --- |
| Vendor 429/quota exhausted mid-job | checkpoint; resume tomorrow; counters persisted |
| Vendor 5xx/network | `RetryableJobError` → job retry with backoff; then `fetch_status='error'` + `last_error` |
| Provider unconfigured | skipped silently; absent from payload |
| Snapshot URL unreachable/schema drift | loud job failure + admin-visible event; existing data untouched |
| Bad MPN metadata | `not_found` row; excluded from churn; heals on metadata change |
| Token refresh failure (DigiKey) | clear config error surfaced once; sweep continues with other sources |

## 13. Security and Legal Notes

- Credentials live only in root `.env`; never logged, never echoed in API responses; masked
  in admin provider-status output.
- **Mouser ToS**: the Search API terms prohibit caching/storing Content and bulk downloads.
  Prism's hydrate-and-cache model conflicts with the letter of this clause. Decision
  (2026-08-22): implement storage; users accept the trade-off implicitly by supplying their
  own `MOUSER_API_KEY`. The conflict is documented in `.env.example` comments and here;
  seeking written allowance from Mouser is a recommended follow-up.
- jlcparts snapshot: community-built from official-key holdings; verify redistribution terms
  and repo license before the importer ships.
- DigiKey/Mouser usage otherwise within documented rate limits and attribution norms.

## 14. Testing Plan

- Unit (offline): provider parsers against captured fixture payloads (redacted real
  responses) — DigiKey nested `StandardPricing` extraction, batch fallback flag, Mouser
  string-price/Availability parsing, 10-PN chunking; matching normalization table; tier
  selection + budget accounting; payload shaping (extend `test_supply_source_payload.py`);
  CSV round-trip; snapshot importer against a fixture SQLite dump; token cache read/write.
- Integration (`TEST_POSTGRES_URL`-gated): schema migration, projection UNION correctness,
  trigger-driven head refresh on quote writes, sweep upserts and stale flipping.
- Frontend: vendor-card rendering states incl. stale/not_found/error badges; lifecycle badge;
  pending empty state.
- Optional live smoke behind credential presence, never in CI.

## 15. Rollout Phases (each independently shippable)

1. **Schema + projections + payload** — `supply_quotes`, migration, projection v6/v5 bumps,
   vendor payload shaping, panel renders vendor cards from existing UI work.
2. **DigiKey live path** — adapter, token persistence, `supply_refresh` sweep with tiers and
   budgets, manual refresh endpoint, Library Manager supply block.
3. **Snapshot import** — jlcparts importer job, weekly cadence, license sign-off.
4. **Mouser + CSV** — adapter with batching, CSV seed/export endpoints + UI, documentation
   pass (`REMOTE_SYMBOL_PROVIDER.md`, `CONFIGURATION.md`, `.env.example`).

## 16. Follow-ups (explicitly out of this spec)

JLCPCB/LCSC official live APIs (post-approval) · Nexar adapter · InvenTree integration
(separate effort) · popularity weighting beyond binary project linkage · multi-currency
display · Mouser written allowance · HEAD support on remote-provider asset routes
(pre-existing gap).
