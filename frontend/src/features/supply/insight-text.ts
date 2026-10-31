import type { SupplyInsight } from "@/types/supply";
import { formatLeadTime } from "./supply-format";

const CONFIDENCE_LABEL: Record<SupplyInsight["confidence"], string> = {
  none: "No confidence yet",
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export function confidenceLabel(insight: SupplyInsight): string {
  return CONFIDENCE_LABEL[insight.confidence];
}

function inDays(days: number): string {
  return days === 1 ? "about 1 day" : `about ${days.toLocaleString()} days`;
}

/** What the readings are based on, so a projection can be judged. */
export function insightBasis(insight: SupplyInsight): string {
  const { points, span_days: span, points_in_run: run } = insight.inputs;
  const days = span === 1 ? "1 day" : `${span} days`;
  return `${points} daily readings over ${days}; ${run} since the last restock or change of listings.`;
}

/** The sentences that go with a projection. Empty when there is nothing honest to say. */
export function insightLines(insight: SupplyInsight): string[] {
  if (insight.confidence === "none") return [];
  const lines: string[] = [];
  if (insight.trend === "falling" && insight.decrease_per_day !== null) {
    const rate = Math.round(insight.decrease_per_day).toLocaleString();
    lines.push(`Observed net decrease: ${rate} a day.`);
    if (insight.beyond_year) lines.push("That is too slow to run out within a year.");
    else if (insight.days_to_zero !== null) lines.push(`At that rate it reaches zero in ${inDays(insight.days_to_zero)}.`);
    if (insight.pace === "accelerating" && insight.recent_decrease_per_day) {
      const recent = Math.round(insight.recent_decrease_per_day).toLocaleString();
      const to = insight.days_to_zero_recent ? ` At the recent pace it reaches zero in ${inDays(insight.days_to_zero_recent)}.` : "";
      lines.push(`It is falling faster lately: ${recent} a day over the later half of the readings.${to}`);
    } else if (insight.pace === "slowing") {
      lines.push("The fall is slowing.");
    }
    if (insight.days_to_threshold !== null) lines.push(`It reaches your threshold in ${inDays(insight.days_to_threshold)}.`);
  } else if (insight.trend === "rising") {
    lines.push("Stock is rising.");
  } else if (insight.trend === "steady") {
    lines.push("Stock is steady.");
  } else {
    lines.push("Too few readings since the last restock to say how fast stock is falling.");
  }
  if (insight.restocks > 0) {
    const times = insight.restocks === 1 ? "once" : `${insight.restocks} times`;
    let restock = `Restocked ${times} in this history`;
    if (insight.restock_interval_days !== null) restock += `, about every ${insight.restock_interval_days} days`;
    const next = insight.restock_expected_in_days;
    if (next !== null) restock += next >= 0 ? `. Next expected in ${inDays(next)}` : `. Expected ${Math.abs(next)} days ago, not seen yet`;
    lines.push(`${restock}.`);
  }
  return [...lines, ...behaviourLines(insight)];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** How the stock has behaved over the whole history, as plain sentences. */
function behaviourLines(insight: SupplyInsight): string[] {
  const lines: string[] = [];
  if (insight.lead_gap_days) lines.push(`At the observed rate it runs out ${insight.lead_gap_days} days before a new order could arrive.`);
  if (insight.zero_share) {
    const wait = insight.restock_latency_days ? `, and stayed there about ${insight.restock_latency_days} days before stock returned` : "";
    lines.push(`It was out of stock on ${Math.round(insight.zero_share * 100)}% of the days${wait}.`);
  }
  if (insight.volatility !== null && insight.volatility !== undefined && insight.volatility >= 0.5) lines.push("Its stock swings widely.");
  if (insight.sources_change) {
    const count = Math.abs(insight.sources_change);
    lines.push(`${count} ${count === 1 ? "distributor" : "distributors"} ${insight.sources_change < 0 ? "stopped" : "started"} holding it over this history.`);
  }
  if (insight.concentration !== null && insight.concentration !== undefined && insight.concentration >= 0.8) lines.push("Nearly all of the stock is at one distributor.");
  const trend = insight.lead_time_trend;
  if (trend) lines.push(`The quoted lead time went from ${formatLeadTime(trend.before)} to ${formatLeadTime(trend.after)} since ${trend.since}.`);
  for (const item of insight.anomalies ?? []) lines.push(`On ${item.day} stock fell from ${item.from.toLocaleString()} to ${item.to.toLocaleString()} in one step, which ordinary use does not do.`);
  const season = insight.seasonality;
  if (season) lines.push(`Over the year it runs highest in ${MONTHS[season.peak - 1]} and lowest in ${MONTHS[season.trough - 1]}.`);
  return lines;
}
