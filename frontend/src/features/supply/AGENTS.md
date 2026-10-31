# Supply UI

The screens for distributor stock, prices and lifecycle: the Supply section,
the project Supply tab, supply in the BOM, the catalog and Release Studio, and
the Connectors and Review pages in Library Manager. Read `AGENTS.md` at the
repository root first. Every figure here is worked out by the backend
(`backend/app/services/supply/AGENTS.md`); this directory shows it.

## Rules

- **The UI computes no supply figure.** Stock totals, status, boards
  buildable, cost per board, findings and forecasts come from the API as they
  are. A screen that needs a new figure gets it from the backend, so the
  Dashboard, the project tab, the BOM and the KiCad panel never disagree.
- **No prose.** No helper sentences or explaining hover hints; labels,
  numbers and states only. If a screen needs a paragraph, the screen is wrong.
- **One wording.** Status, lifecycle, problem and packaging labels come from
  `supply-format.ts` (`STATUS_LABEL`, `LIFECYCLE_LABEL`, `PROBLEM_LABEL`,
  `packagingName`); prices from `formatPrice` (with its quantity through
  `PriceAtQuantity`, "€0.31 × 1,000"), stock from `formatStock`, lead times from
  `formatLeadTime`, days from `formatDay`, times from `formatTime` and
  `clockTime`. Never spell a status or format a price, a date or a time in a
  component. The KiCad panel (`src/panel`) uses the same functions.
- **Long tables window their rows.** A table that can pass a few hundred rows
  (the Tracking list as it loads, a large board's BOM) renders through
  `useWindowedRows` (`@/lib/use-windowed-rows`): rows carry `data-row`, and a
  spacer stands in for the rest. Every scrolling area carries `themed-scrollbar`.
- **Roles gate on the client and the server.** `canOpenSupply` (`@/lib/roles`)
  decides whether supply shows at all; the server still checks every call, so
  a hidden button is a courtesy, not the control.
- **The URL holds the place.** `section=supply` with `supplyView` (the tab),
  `part` (the open part sheet), `partsScope`, `partsQ`, `partsOnly` and
  `partsSort` on Tracking. `supply-views.ts` maps old addresses (`parts`,
  `overview`, `market`, `connectors`, `review`) to where they live now; keep
  old addresses working when a place moves.

## Module groups

**Section and navigation** — `supply-workspace.tsx` (the six tabs:
Dashboard, Tracking, Projects, Insights, Review, Sources, each lazy-loaded), `supply-views.ts`
(`resolvePlace`, `partHref`, the Library Manager places),
`use-supply-navigation.ts`, `open-part-sheet.tsx`. Mounted by
`frontend/src/components/workspace.tsx`.

**API and loading** — `supply-api.ts` is the typed client for `/api/supply`
(errors are `ApiHttpError`); `tracking-api.ts`, `inventory-api.ts`,
`ending-api.ts`, `fill-api.ts`, `packaging-api.ts`, `release-check-api.ts`,
`catalog-supply-api.ts` and `component-supply-api.ts` cover their areas.
A typed route's types are generated: its router declares a `response_model`
(models in a sibling `backend/app/api/supply_*_models.py`, shared ones in
`backend/app/api/supply_models.py`, every list `Items[...]`), and `scripts/export_supply_types.py`
writes them to `frontend/src/types/supply.generated.ts` after
`sdk/python/openapi.json` is regenerated (`backend/tests/test_supply_types.py`
fails on drift). The API module imports them from there; work items are typed.
Routes not typed yet keep their hand-written types in `frontend/src/types/supply.ts`,
which shrinks as each area moves over. Every read goes through `useLoaded` (`use-loaded.ts`), on
the app's server state (`@/lib/server-state`): a key names one resource
(`connectors`, `parts/<id>/notices`, `projects/<id>/tracking`), so screens that
show it share one answer and one request, and a return to a page starts from
what it showed. Never fetch in a raw `useEffect`. Polling is `refreshEvery`
with `refreshWhile` (`isRunning` for a job's progress, the backend's one
`JobProgress` shape). Writes in the `*-api.ts` modules are wrapped in
`changesSupply` (`supply-writes.ts`), which reads again every supply resource
on screen; a test that mocks an API module sets what the next read returns.
Only the shown Supply tab is mounted. `frontend/src/test/setup.ts` forgets the
store between tests; a test that renders twice calls `forgetServerState([])`
between.

**Dashboard** — `dashboard-view.tsx` with `dashboard-tiles.tsx`,
`dashboard-charts.tsx`, `dashboard-risk-cards.tsx`, `dashboard-forecast.tsx`,
`dashboard-alerts.tsx`, `ending-notifications.tsx`,
`recent-changes.tsx`.

**Tracking and the part sheet** — `parts-view.tsx`, `parts-table.tsx`,
`parts-filters.ts`, `parts-sort.ts`, `parts-layout.ts`; the sheet is
`part-sheet.tsx` with `part-detail-sections.tsx`, `part-history*.ts(x)`,
`part-offer-rows.tsx`, `listing-*.tsx`, `outlook-section.tsx`,
`forecast-section.tsx`, `notices-section.tsx`, `compliance-section.tsx`,
`alert-rules-section.tsx`. Inside KiCad's Remote Symbols webview the app shows only
`kicad-part-page.tsx` (the part the panel's Open in Prism names; closing returns to the panel). Tracking a part: `watch-part-dialog.tsx`,
`watch-popover.tsx`, `tracking-control.tsx` (tiers). The BOM file check is
`bom-file-*.ts(x)`.

**Projects** — `projects-view.tsx` and `project-groups.tsx` (every tracked
project); the project's own tab is `project-supply-tab.tsx`, mounted by
`frontend/src/pages/ProjectDetailPage.tsx`, with `project-headline.tsx`,
`project-cost-*.tsx`, `project-parts-list.tsx`, `project-read-now.tsx`.
Tracking a project is the `track-*.tsx` dialog steps and
`use-track-project.ts`.

**Insights** — `insights-view.tsx`, `insights-sections.tsx`,
`insights-shown.ts` (which sections have data), `runway-*.tsx`,
`market-*.ts(x)`, `sourcing-panel.tsx`, `scorecard-table.tsx`,
`forecast-insights.tsx`.

**Sources and Review** — `sources-view.tsx` and
`connectors-view.tsx` (connector cards, `create-connector-dialog.tsx`,
`edit-connector-dialog.tsx`, `connector-signin.tsx`, `csv-upload-dialog.tsx`,
`budget-view.tsx`), `inventory-sources.tsx` and `inventory-source-dialogs.tsx`
(InvenTree-compatible stores and push sources), `push-token-dialog.tsx` and
`push-api.ts` (a connector's or source's push token), `settings-view.tsx` and `settings-*.tsx`
(Supply settings), `review-page.tsx` and `review-view.tsx` (Review), with
`work-items-section.tsx` (Review's work items), `work-item-dialog.tsx` (the
button that opens one) and `work-items-api.ts`.
Library Manager's old `libraryView=connectors|review` addresses lead to these two tabs.
Each form mounts only while its dialog is open, so it resets without effects;
connector form rules live in `connector-form-model.ts`, not in components.

**Supply elsewhere** — BOM columns and the row drawer (`bom-supply*.ts(x)`,
`use-bom-supply.ts`, `use-bom-row-detail.tsx`, used by
`frontend/src/components/engineering-bom-table.tsx`), the catalog column and
filter (`catalog-supply-*.ts(x)`, `use-catalog-supply.ts`), a component's
Supply tab (`component-parts-section.tsx`, `component-watch.tsx`,
`local-stock-section.tsx`), the viewer's selection row
(`selection-supply-row.tsx`) and Release Studio (`release-supply-*.tsx`,
`release-snapshot-card.tsx`). The KiCad panel takes only `vendor-colors.ts`.

**Shared pieces** — `status-dot.tsx`, `vendor-name.tsx`, `vendor-colors.ts`,
`supply-icons.tsx` (use these icons in lists, tables, bars and cards),
`sparkline.tsx`, `chart-card.tsx`, `chart-format.ts`, `fold-section.tsx`,
`collapsible-section.tsx`, `hover-details.tsx`.

## Tests

Tests are `*.test.ts(x)` beside the code and run with the frontend suite.
Build test data with `supply-test-fixtures.ts` and `forecast-test-fixtures.ts`
rather than literal objects, so a type change breaks one place. Before
pushing, run `npx tsc -b` and `npm run scan:gate` in `frontend/`.
