import type { SupplyAlert, SupplyLifecycle, SupplyProblem } from "@/types/supply";
import { LIFECYCLE_LABEL, PROBLEM_LABEL } from "./supply-format";

/** One line saying what crossed the line. */
export function alertTitle(alert: SupplyAlert): string {
  const { detail } = alert;
  switch (alert.kind) {
    case "out_of_stock":
      return "Out of stock";
    case "below_threshold":
      return `${(detail.stock ?? 0).toLocaleString()} in stock, at or below the ${(detail.threshold ?? 0).toLocaleString()} you set`;
    case "lifecycle":
      if (detail.dropped) return "Dropped by every distributor that lists it";
      return detail.lifecycle === "obsolete"
        ? "Marked obsolete"
        : `Now ${LIFECYCLE_LABEL[(detail.lifecycle ?? "unknown") as SupplyLifecycle].toLowerCase()}`;
    case "part_lost":
      return PROBLEM_LABEL[(detail.problem ?? "gone") as SupplyProblem];
    case "rupture_soon":
      return `Could run out in about ${detail.days_to_zero ?? 0} days at the recent rate (${confidenceWord(detail.confidence ?? undefined)} confidence)`;
    case "likely_out":
      return `Likely out of stock everywhere within ${detail.weeks ?? 4} weeks (${Math.round((Number(detail.chance) || 0) * 100)}%)`;
    case "pcn":
      if (detail.new) {
        const more = detail.new > 1 ? ` (${detail.new} new notices)` : "";
        return `New change notice: ${detail.title ?? ""}${detail.description ? `, ${detail.description}` : ""}${more}`;
      }
      return `${detail.kind_label ?? "Notice"}: ${detail.title ?? ""}${detail.last_time_buy ? `, last time buy ${detail.last_time_buy}` : ""}`;
    case "target_price_missed":
      return `Price ${detail.price ?? "?"} ${detail.currency ?? ""} is over your target of ${detail.target ?? "?"}`.trim();
    case "assessment_worse":
      return `Assessment went from ${detail.was ?? "?"} to ${detail.now ?? "?"}`;
    case "price_up":
      return `Cheapest price up ${detail.change_percent ?? 0}% in ${detail.days ?? 0} days, from ${detail.was ?? "?"} to ${detail.now ?? "?"} ${detail.currency ?? ""}`.trim();
  }
}

function confidenceWord(value: string | undefined): string {
  return value === "high" || value === "medium" || value === "low" ? value : "unknown";
}

export const SNOOZE_CHOICES: ReadonlyArray<{ hours: number; label: string }> = [
  { hours: 4, label: "4 hours" },
  { hours: 24, label: "1 day" },
  { hours: 24 * 7, label: "1 week" },
];

export const ALERT_STATE_LABEL: Record<SupplyAlert["state"], string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  snoozed: "Snoozed",
  resolved: "Cleared",
};
