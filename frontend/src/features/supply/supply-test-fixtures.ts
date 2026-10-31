import type { SupplyAlert, SupplyConnector, SupplyDashboard, SupplyPartDetail, SupplyPartRow, SupplyProvider } from "@/types/supply";
import type {
  PartPrice, ProjectSupplyPart, SupplyReviewListing, SupplyReviewQueue, SupplyToApprove, ReleaseCheckLine, RowDistributor, SupplyBomBuy, SupplyBomLineResult, SupplyBomRollup, SupplyComponentStanding, SupplyHeadlinePrice, SupplyInsight, SupplyListing, SupplyRowOffer,
} from "@/types/supply.generated";

export function connectorFixture(overrides: Partial<SupplyConnector> = {}): SupplyConnector {
  return {
    id: "c1",
    provider: "demo",
    provider_label: "Demo distributor",
    provider_available: true,
    storefront: "",
    display_name: "Demo EU",
    currency: "EUR",
    enabled: true,
    paused_reason: "",
    daily_budget: 1000,
    retention_days: null,
    keep_days: null,
    limits_storage: false,
    keep_unused: false,
    catalogue: false,
    catalogue_available: false,
    interactive_reserve_pct: 10,
    metered: true,
    csv_fed: false,
    assembly_only: false,
    reset_time: "00:00",
    reset_tz: "UTC",
    rate_limits: {},
    rate_limits_at: null,
    reset_from_provider: false,
    reset_suggestion: null,
    cooldown_until: null,
    block_streak: 0,
    slow_until: null,
    csv_import: null,
    usage_today: { spent: 120, interactive_spent: 0 },
    credentials: { api_key: true },
    credentials_status: "ready",
    last_ok_at: null,
    last_error_code: "",
    last_error_at: null,
    created_by: "admin@example.com",
    created_at: "2026-03-01T10:00:00Z",
    updated_at: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

export function providerFixture(overrides: Partial<SupplyProvider> = {}): SupplyProvider {
  return {
    key: "demo",
    label: "Demo distributor",
    capabilities: ["search", "offers"],
    max_batch: 10,
    stock_pooling: "separate",
    credential_fields: [{ name: "api_key", label: "API key", secret: true }],
    storefronts: [],
    default_daily_budget: 1000,
    metered: true,
    csv_fed: false,
    ...overrides,
  };
}

export function partRowFixture(overrides: Partial<SupplyPartRow> = {}): SupplyPartRow {
  return {
    id: "p1",
    mpn: "LM358D",
    manufacturer: "Texas Instruments",
    watch: { threshold: null, pinned: false, owner: "ana@example.com", packaging: "any" },
    status: "ok",
    problem: null,
    stock: 12500,
    listings: 1,
    lifecycle: "active",
    dropped: false,
    unit_price: "0.52",
    price_quantity: 100,
    currency: "EUR",
    fetched_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    tier: "daily",
    used_in: 0,
    manufacturer_provisional: false,
    tracking: null,
    price_kind: "orderable",
    price_lead_days: null,
    price_range: null,
    price_native: null,
    price_seen_day: null,
    price_unrated: [],
    price_test_data: false,
    dated_by: "oldest",
    health: 10,
    changes_at: null,
    priced_with: "",
    jlc: null,
    project_names: [],
    distributors: [],
    offers: [],
    preferred_connector_id: null,
    price_change_percent: null,
    forecast: null,
    lead_days: null,
    flags: [],
    ...overrides,
  };
}

export function partDetailFixture(overrides: Partial<SupplyPartDetail> = {}): SupplyPartDetail {
  return {
    part: { id: "p1", mpn: "LM358D", manufacturer: "Texas Instruments", first_seen: null },
    tracking: null,
    packaging: { picks: {}, picked_by: {}, needs_pick: [] },
    preferred_connector_id: null,
    trade: { control: "unknown", eccn: [], stated: "", stated_eccn: [], mark: null },
    jlc: null,
    market_behaviour: { repricing: {}, leadership: null, exchange: {}, restock_order: null, arrivals: null },
    restock_record: [],
    distributor_history: {
      days: 90, currency: "EUR", total: [["2026-03-01", 12500]], events: [],
      connectors: [{ connector_id: "c1", name: "Mouser EU", provider: "mouser", last_read: "2026-03-01T00:00:00Z", stale: false, stock: [["2026-03-01", 12500]], price: [] }],
    },
    watch: { threshold: 500, pinned: false, owner: "ana@example.com", packaging: "any" },
    status: "ok",
    problem: null,
    problem_text: "",
    stock: 12500,
    stock_by_connector: [{ connector_id: "c1", connector_name: "Mouser EU", provider: "mouser", stock: 12500 }],
    fetched_at: null,
    lifecycle: "active",
    listings: [
      listingFixture({
        id: "l1", sku: "595-LM358D", packaging: "cut_tape", match_state: "exact", counted: true,
        offer: {
          fetched_at: new Date(Date.now() - 3600 * 1000).toISOString(), stock: 12500, incoming: [[5000, "2026-04-01"]],
          moq: 1, order_multiple: 1, price_breaks: [[1, "0.52"], [100, "0.31"]], currency: "EUR", lead_time_days: null,
          lifecycle: "active", discontinued: false, rohs: true, reach_affected: null, marketplace: false, product_url: "https://example.invalid/p",
        },
        poll: { tier: "daily", next_poll_at: null, last_polled_at: null, error_streak: 0, last_error_code: "" },
      }),
      listingFixture({ id: "l2", sku: "595-LM358DR", packaging: "tape_reel", match_state: "near" }),
    ],
    used_in: [],
    price: priceFixture(),
    parameters: [],
    outlook: { band: "no_signs", label: "No signs of an end", method: "rule-based", signals: [] },
    insight: insightFixture({ inputs: { points: 3, span_days: 2, points_in_run: 3, current: 12500 } }),
    history: [
      { day: "2026-02-27", stock: 9000, listings: 1 }, { day: "2026-02-28", stock: 11000, listings: 1 },
      { day: "2026-03-01", stock: 12500, listings: 1 },
    ],
    ...overrides,
  };
}

export function listingFixture(overrides: Partial<SupplyListing> = {}): SupplyListing {
  return {
    id: "l1", connector_id: "c1", connector_name: "Mouser EU", provider: "mouser", test_data: false, sku: "595-LM358D", packaging: "cut_tape",
    reel_size: null, packaging_inferred: false, match_state: "exact", raw_mpn: "", raw_manufacturer: "", match_reason: "", page_url: "",
    counted: false, offer: null, poll: null, ...overrides,
  };
}

export function headlineFixture(overrides: Partial<SupplyHeadlinePrice> = {}): SupplyHeadlinePrice {
  return {
    unit_price: null, currency: "EUR", price_quantity: 100, price_kind: null, price_lead_days: null, price_range: null, price_native: null,
    price_seen_day: null, price_unrated: [], price_test_data: false, ...overrides,
  };
}

export function priceFixture(overrides: Partial<PartPrice> = {}): PartPrice {
  return {
    currency: "", history: [], trend: null, quantity: 100, default: 100, own: false, headline: headlineFixture(), ...overrides,
  };
}

export function insightFixture(overrides: Partial<SupplyInsight> = {}): SupplyInsight {
  return {
    confidence: "none", trend: null, decrease_per_day: null, days_to_zero: null, days_to_threshold: null, pace: null, recent_decrease_per_day: null,
    days_to_zero_recent: null, beyond_year: false, restocks: 0, restock_interval_days: null, restock_expected_in_days: null, zero_share: null,
    restock_latency_days: null, volatility: null, sources_change: null, concentration: null, anomalies: [], seasonality: null,
    inputs: { points: 0, span_days: 0, points_in_run: 0, current: null }, lead_gap_days: null, lead_time_trend: null, ...overrides,
  };
}

export function rowOfferFixture(overrides: Partial<SupplyRowOffer> = {}): SupplyRowOffer {
  return {
    connector_id: "c1", provider: "mouser", name: "Mouser EU", sku: "595-LM358D", skus: ["595-LM358D"], also_packaging: [], followed: false,
    stock: 0, moq: 1, packaging: "cut_tape", reel_size: null, packaging_inferred: false, product_url: "", currency: "EUR", price_breaks: [],
    base_currency: "EUR", base_price_breaks: null, ...overrides,
  };
}

export function distributorFixture(overrides: Partial<RowDistributor> = {}): RowDistributor {
  return { connector_id: "c1", provider: "mouser", name: "Mouser EU", stock: 0, price: null, currency: "", ...overrides };
}

export function alertFixture(overrides: Partial<SupplyAlert> = {}): SupplyAlert {
  return {
    id: 1,
    part_id: "p1",
    mpn: "LM358D",
    manufacturer: "Texas Instruments",
    kind: "below_threshold",
    severity: "warning",
    state: "open",
    detail: { stock: 40, threshold: 100 },
    opened_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    last_event_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    acknowledged_by: "",
    snoozed_until: null,
    resolved_at: null,
    ...overrides,
  };
}

export function dashboardFixture(overrides: Partial<SupplyDashboard> = {}): SupplyDashboard {
  return {
    figures: { watched: 4, at_risk: 2, out_of_stock: 1, lifecycle: 1, open_alerts: 2, waiting: 3 },
    ending_components: 0,
    forecast: { likely_out_4w: 0, state: { state: "learning", checks: 0, needs: 30, reason: "" }, coming_up: [], part_ids_likely_out_4w: [] },
    connectors: 1,
    no_data: 0,
    recent_changes: [],
    figure_history: { at_risk: [1, 1, 2], watched: [4, 4, 4] },
    statuses: [{ status: "ok", count: 2 }, { status: "warning", count: 1 }, { status: "error", count: 1 }, { status: "fatal", count: 0 }, { status: "unknown", count: 0 }],
    runway: { out_now: 1, runs_out_2w: 1, runs_out_8w: 0, runs_out_later: 1, steady: 1, few_readings: 0 },
    holders: { none: 1, one: 2, two: 1, three_plus: 0, unknown: 0 },
    alerts_by_day: [],
    project_costs: [],
    insights_ready: 4,
    failing_feeds: [],
    risk_grid: [
      { lifecycle: "active", two_plus: 1, one: 1, out: 0, not_read: 0 },
      { lifecycle: "nrnd", two_plus: 0, one: 1, out: 1, not_read: 0 },
      { lifecycle: "last_time_buy", two_plus: 0, one: 0, out: 0, not_read: 0 },
      { lifecycle: "obsolete", two_plus: 0, one: 0, out: 0, not_read: 0 },
      { lifecycle: "unknown", two_plus: 0, one: 0, out: 0, not_read: 0 },
    ],
    deadlines: [],
    projects: [],
    ...overrides,
  };
}

export function bomLineFixture(overrides: Partial<SupplyBomLineResult> = {}): SupplyBomLineResult {
  return { state: "tracked", part_id: "p1", manufacturer_match: "exact", in_library: true, need: 1, stores: null, ...overrides };
}

export function bomBuyFixture(overrides: Partial<SupplyBomBuy> = {}): SupplyBomBuy {
  return {
    quantity: 1, unit_price: "1", currency: "EUR", extended: "1", in_base: "1", covers: true, connector_name: "Mouser", provider: "mouser",
    test_data: false, sku: "SKU-1", product_url: "", waste: 0, waste_cost: "0", next_break: null, part_id: "p1", ...overrides,
  };
}

export function bomRollupFixture(overrides: Partial<SupplyBomRollup> = {}): SupplyBomRollup {
  return {
    lines: 0, tracked: 0, not_tracked: 0, watched: 0, at_risk: 0, needs_a_look: 0, short: 0, priced: 0, lines_priced: 0, currency: null,
    converted: false, test_data: false, rates_day: null, cost_build: null, original_costs: {}, waste_cost: null, cost_per_board: null,
    can_build: null, limited_by: null, without_stock_data: 0, parts: 0, health: null, health_status: "unknown", ...overrides,
  };
}

export function standingFixture(overrides: Partial<SupplyComponentStanding> = {}): SupplyComponentStanding {
  return { status: "unknown", stock: null, watched: false, unit_price: null, currency: "", restriction: null, ...overrides };
}

export function projectLineFixture(overrides: Partial<ProjectSupplyPart> = {}): ProjectSupplyPart {
  return {
    key: "k1", manufacturer: "Acme", mpn: "MPN-1", quantity: 1, references: "R1", part_id: "p1", state: "tracked", status: "ok", stock: 0,
    lifecycle: "active", short: false, unit_price: null, unit_currency: null, unit_price_in_total: null, buy_quantity: null, test_data: false,
    notes: 0, need: 1, line_cost: null, alerts: 0, prism_id: "", in_library: true, alternates: [], status_from: null, stores: null, ...overrides,
  };
}

export function releaseLineFixture(overrides: Partial<ReleaseCheckLine> = {}): ReleaseCheckLine {
  return {
    manufacturer: "Acme", mpn: "MPN-1", quantity: 1, state: "tracked", part_id: "p1", health: 10, status: "ok", findings: [], waived: 0,
    alternates: [], status_from: null, ...overrides,
  };
}

export function toApproveFixture(overrides: Partial<SupplyToApprove> = {}): SupplyToApprove {
  return { waivers: [], alternates: [], dismissals: [], mutes: [], ...overrides };
}

export function reviewListingFixture(overrides: Partial<SupplyReviewListing> = {}): SupplyReviewListing {
  return {
    id: "l1", connector_id: "c1", connector_name: "Mouser", provider: "mouser", sku: "SKU-1", raw_mpn: "MPN-1", raw_manufacturer: "Acme",
    match_state: "manufacturer_unresolved", match_reason: "", packaging: "cut_tape", reel_size: null, packaging_inferred: false,
    first_seen_at: "2026-01-01T00:00:00Z", part: null, ...overrides,
  };
}

export function reviewQueueFixture(overrides: Partial<SupplyReviewQueue> = {}): SupplyReviewQueue {
  return {
    aliases: [], listings: [], other_numbers: [], choices: [], matched: { aliases: [], parts: [] }, to_approve: toApproveFixture(),
    counts: { aliases: 0, unresolved: 0, near: 0 }, manufacturers: [], ...overrides,
  };
}
