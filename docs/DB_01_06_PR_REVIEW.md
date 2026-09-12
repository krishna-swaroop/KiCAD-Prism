# DB-01–DB-06 implementation review

Reviewed on 2026-09-12. Base: `dcd3e537525d83f3a207593a641b75fe8945cd02`.
Original DB-06 head: `34dab39c0e031676fab8d447a1b072457a19f4fa`.
Review fixes are carried by [PR #236](https://github.com/krishna-swaroop/KiCAD-Prism/pull/236).

## Findings fixed in #236

### P1: Re-importing an ambiguous CSV total could overwrite real stock with zero

`CatalogInventoryCsv.shape_export_rows` exports a blank quantity when CSV
locations have incompatible units. `prepare_upsert` interpreted that blank as
zero and upserted the empty-location row. For example, export a component with
2 pcs at the empty location and 3 g at another location, then re-import its row:
the 2 pcs entry was overwritten with zero and an empty unit.

The importer now reports a row error for missing or blank quantities and leaves
that inventory unchanged. Zero must be explicit. The legacy `stock_quantity`
column remains accepted when `quantity` is absent; a numeric zero no longer
falls through to a competing alias. NaN and infinity are rejected before they
can enter the database and break JSON responses.

Tests cover parse/render/re-import and actual database preservation through the
public catalog service, alongside explicit zero and the legacy alias.

### P2: Aggregation selected the wrong latest timestamp

`aggregate_source_locations` compared ISO timestamps as strings. For example,
`2026-01-02T01:00:00+02:00` sorted after `2026-01-02T00:00:00.5Z`, although it is
older. Different textual representations of the same instant were also flagged
as mixed freshness.

Aggregation now compares timezone-aware instants. Invalid, missing, or naive
timestamps cannot win the latest-update comparison. Mixed known/unknown times
remain flagged. `fetched_at` retains its meaning as the latest location update;
it does not certify the freshness of the whole quantity.

### P2: UI consumers hid partial failures and conflicting stock status

The remote detail card and stock indicators honored only `mixed_units`.
A source with 200 retained units and `fetch_status=error` still received a green
indicator. Mixed status was silently omitted, and mixed freshness appeared as
an ordinary "Updated just now" timestamp.

Catalog overview, category badges, finder dots, and remote detail now share
warning interpretation. Failed sync and mixed status receive neutral indicators.
Detail identifies retained stock as "Last known on hand", shows all applicable
warnings, and labels mixed freshness "Latest location update". Combined warnings
wrap within a narrow panel. Stock quantities remain available in the payload;
this does not impose a new expiry threshold or discard retained inventory.

### Coverage gap: policy helpers were not enough to prove DB-05/DB-06 integration

A new PostgreSQL regression inserts multiple locations and sources, including
mixed units, status, fetch outcomes, and timestamp offsets. It checks explicit
expected results and parity across full detail, batched lists, and the released
remote projection, then checks that ambiguous CSV re-import preserves inventory.

## Related PR assessment

| Ticket | PR | Review result |
| --- | --- | --- |
| DB-01 | [#231](https://github.com/krishna-swaroop/KiCAD-Prism/pull/231) | Default-representation slots drive availability in filters, summary/detail shaping, and remote placement eligibility. Availability parity and release fixtures passed. No additional blocking defect found in this change. |
| DB-02 | [#232](https://github.com/krishna-swaroop/KiCAD-Prism/pull/232) | Expected revision reaches uploads, auxiliary attachments, links, and the locked revision clone. Multi-selection retains the original revision. Conflict/legacy tests passed. **Partial ticket closure:** the API deliberately still accepts an omitted or empty precondition; only participating callers receive stale-editor protection. |
| DB-03 | [#233](https://github.com/krishna-swaroop/KiCAD-Prism/pull/233) | One instance-owned collaborator graph replaces class-level graphs and PostgreSQL reconstruction. Isolation and architecture tests passed. No additional blocking defect found in this change. |
| DB-04 | [#234](https://github.com/krishna-swaroop/KiCAD-Prism/pull/234) | Built-in descriptors feed normalization, CSV mapping, and symbol field ordering; explicit API/persistence contracts have completeness checks. Metadata and import suites passed. The documented project-import SAP label gap remains a separate behavior change. |
| DB-05 | [#235](https://github.com/krishna-swaroop/KiCAD-Prism/pull/235) | Full-list representations and inventory are loaded per page. One-versus-50 query-count and detail-parity tests passed, plus the new DB-06 mixed-data regression. Lightweight lists intentionally omit inventory. |
| DB-06 | [#236](https://github.com/krishna-swaroop/KiCAD-Prism/pull/236) | Fixes above address CSV round-trip safety, timestamp comparison, consumer handling, and cross-path coverage. |

DB-02 follow-up, if strict closure is desired: inventory external clients, version
the API contract, then require nonempty revision preconditions at the boundary.
Do not silently remove its explicitly documented legacy behavior in an inventory PR.

## Retained policy boundaries

- Source order remains InvenTree, CSV, then unknown names alphabetically. A failed
  preferred source is retained and flagged; it does not silently fall back to CSV.
- Blank units retain #236's unspecified-unit compatibility with one named unit.
  No unit conversion or new distributor adapters are introduced.
- Public inventory payloads derive from raw location JSON. Existing SQL projection
  stock hint columns still use legacy aggregates and must not be treated as the
  authority for a new inventory consumer. Re-aggregating already aggregated
  payloads would discard mixed-data flags; the helper documentation now excludes it.

## Validation

- Full local backend discovery: **1,209 tests, 90 environment-dependent skips**.
- Dedicated disposable PostgreSQL: catalog integration, compatibility, remote
  provider metadata, and bulk remediation: **31 tests, zero skips**.
- Full frontend: **72 files, 543 tests passed**; lint, React Doctor gate (zero
  warnings/errors), application build, and separate panel build passed with Node 22.
- Catalog architecture, agent guidance, compilation, and whitespace checks passed.
- Four new pure regression tests were also run against the original PR code;
  they failed there and pass with the fixes.
- Browser comparison of original/current detail screens used mocked inventory;
  combined warnings were inspected at a 320 px panel width. This was not a live
  InvenTree synchronization or a KiCad placement test.

GitHub checks must be evaluated against the pushed fix commit. Local results do
not substitute for the required CI gate. This review does not merge the PR.
