import type { SupplyMarketHistory, SupplyMarketMetric } from "@/types/supply";
import { formatLeadTime } from "./supply-format";

export const MARKET_COLUMNS = [
  { key: "out_of_stock", label: "Out of stock", kind: "share" },
  { key: "lifecycle_risk", label: "Ending (reported)", kind: "share" },
  { key: "dropped", label: "Dropped by distributors", kind: "share" },
  { key: "median_lead_time_days", label: "Median lead time", kind: "days" },
  { key: "price_index", label: "Price index", kind: "index" },
] as const;

export type MarketColumn = (typeof MARKET_COLUMNS)[number];

/** A figure as a person reads it: 0.333 as "33%", 56 as "8 w". */
export function marketFigure(column: MarketColumn, metric: SupplyMarketMetric | undefined): string {
  if (!metric) return "";
  if (column.kind === "share") return `${Math.round(metric.value * 100)}%`;
  return column.kind === "index" ? metric.value.toFixed(1) : formatLeadTime(Math.round(metric.value));
}

/** How far a figure moved since the earlier snapshot, or an empty string when there is nothing to compare. */
export function marketChange(column: MarketColumn, metric: SupplyMarketMetric | undefined): string {
  if (!metric || metric.before === null) return "";
  const delta = column.kind === "share" ? Math.round((metric.value - metric.before) * 100) : Math.round(metric.value - metric.before);
  if (delta === 0) return "no change";
  const unit = column.kind === "days" ? " days" : " points";
  return `${delta > 0 ? "up" : "down"} ${Math.abs(delta)}${unit}`;
}

export type MarketMetricKey = (typeof MARKET_COLUMNS)[number]["key"];

/** One row per day with a value for each line, in the shape the chart reads: `{ day, s0, s1 }`. */
export function marketRows(series: SupplyMarketHistory["series"]): Array<Record<string, number | string | null>> {
  const days = [...new Set(series.flatMap((line) => line.points.map(([day]) => day)))].sort();
  return days.map((day) => {
    const row: Record<string, number | string | null> = { day };
    series.forEach((line, index) => {
      row[`s${index}`] = line.points.find(([pointDay]) => pointDay === day)?.[1] ?? null;
    });
    return row;
  });
}
