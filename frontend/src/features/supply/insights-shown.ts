import type { ForecastInsights, PartsFilter, SupplyInsightsPage, SupplyMarket } from "@/types/supply";
import { MARKET_COLUMNS, type MarketColumn } from "./market-model";

/** The findings of the Stock risk section, each a list of parts. */
export const RUNWAY_KINDS: Array<{ key: Exclude<PartsFilter, "">; label: string }> = [
  { key: "draining", label: "Draining" },
  { key: "restock_late", label: "Restock overdue" },
  { key: "lead_up", label: "Lead time up" },
  { key: "often_out", label: "Often out" },
  { key: "unusual_drop", label: "Unusual drop" },
];

/**
 * The market figures worth a column: those some group has a value for. The price index starts at 100 on the first
 * snapshot, so it says nothing until there is an older one to compare with.
 */
export function marketColumns(market: SupplyMarket): MarketColumn[] {
  return MARKET_COLUMNS.filter((column) => {
    if (column.kind === "index" && !market.compared_with) return false;
    return market.scopes.some((scope) => scope.metrics[column.key] !== undefined);
  });
}

/** Which Insights panels have something to show. A panel without data is left out, and a section without panels too. */
export function insightsShown(page: SupplyInsightsPage, forecasts: ForecastInsights | null) {
  const { origins, control } = page.trade;
  const { rohs, reach } = page.lifecycle.compliance;
  const panels = {
    coverage: page.sourcing.coverage.length > 0,
    leadTimes: page.lead_times.some((item) => item.bucket !== "none" && item.parts > 0),
    pricesUp: page.price_movers.up.length > 0,
    pricesDown: page.price_movers.down.length > 0,
    scatter: page.scatter.length > 0,
    findings: RUNWAY_KINDS.some((item) => (page.counts[item.key] ?? 0) > 0),
    market: marketColumns(page.market).length > 0,
    origins: origins.some((item) => item.country !== "Unknown" && item.parts > 0),
    control: control.controlled + control.disputed + control.none > 0,
    compliance: rohs.compliant + rohs.not_compliant + rohs.not_applicable + reach.compliant + reach.affected + reach.not_applicable > 0,
    forecasts: (forecasts?.track_record.models ?? []).some((model) => model.state === "shown"),
  };
  return {
    panels,
    sections: {
      signals: (page.market.signals ?? []).length > 0,
      sourcing: true,
      "lead-times": panels.leadTimes || panels.pricesUp || panels.pricesDown,
      runway: panels.scatter || panels.findings,
      market: panels.market,
      forecasts: panels.forecasts,
      trade: panels.origins || panels.control,
      lifecycle: true,
    } as Record<string, boolean>,
  };
}

export type InsightsPanels = ReturnType<typeof insightsShown>["panels"];
