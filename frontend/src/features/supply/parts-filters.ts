import type { PartsFilter } from "@/types/supply";

export const FILTER_LABEL: Record<Exclude<PartsFilter, "" | `${string}:${string}`>, string> = {
  at_risk: "At risk",
  out_of_stock: "Out of stock",
  lifecycle: "End of life",
  runs_out_2w: "Runs out within 2 weeks",
  runs_out_8w: "Runs out in 2 to 8 weeks",
  runs_out_later: "Runs out later",
  steady: "Steady or rising",
  few_readings: "Too few readings",
  draining: "Draining",
  restock_late: "Restock overdue",
  often_out: "Often out of stock",
  one_distributor: "One distributor holds it",
  lead_up: "Lead time growing",
  unusual_drop: "Unusual drop",
  price_moving: "Price moving",
  likely_out_4w: "Likely out within 4 weeks",
  likely_out_8w: "Likely out within 8 weeks",
  lifecycle_active: "Active",
  lifecycle_nrnd: "Not recommended for new designs",
  lifecycle_last_time_buy: "Last time buy",
  lifecycle_obsolete: "Obsolete",
  lifecycle_unknown: "Lifecycle unknown",
  outlook_ended: "Outlook: ended",
  outlook_ending: "Outlook: ending",
  outlook_warning_signs: "Outlook: warning signs",
  outlook_no_signs: "Outlook: no signs of an end",
  outlook_unknown: "Outlook: unknown",
  lead_under_2w: "Lead time under 2 weeks",
  lead_2_to_8w: "Lead time 2 to 8 weeks",
  lead_8_to_16w: "Lead time 8 to 16 weeks",
  lead_16_to_26w: "Lead time 16 to 26 weeks",
  lead_over_26w: "Lead time over 26 weeks",
  lead_none: "No lead time quoted",
  rohs_compliant: "RoHS compliant",
  rohs_not_compliant: "RoHS not compliant",
  rohs_disputed: "RoHS disputed",
  rohs_not_applicable: "RoHS not applicable",
  rohs_unknown: "RoHS unknown",
  reach_compliant: "REACH unaffected",
  reach_affected: "REACH affected",
  reach_not_applicable: "REACH not applicable",
  reach_unknown: "REACH unknown",
  control_controlled: "Export controlled",
  control_disputed: "Export control disputed",
  control_none: "Not export controlled",
  control_unknown: "No export class given",
};

/** The lifecycle menu: any ending part first, then each state on its own. */
export const LIFECYCLE_FILTERS = ["lifecycle", "lifecycle_active", "lifecycle_nrnd", "lifecycle_last_time_buy", "lifecycle_obsolete", "lifecycle_unknown"] as const;
export const ANY = "any";

export const RISK_LIFECYCLE: Record<string, string> = {
  active: "Active", nrnd: "Not recommended for new designs", last_time_buy: "Last time buy", obsolete: "Obsolete", unknown: "Lifecycle unknown",
};
export const RISK_AVAILABILITY: Record<string, string> = { two_plus: "2+ distributors", one: "One distributor", out: "Out", not_read: "Not read" };

const VALUED_LABEL: Record<string, (value: string) => string> = {
  origin: (value) => (value === "Several" ? "Origin: several countries" : value === "Unknown" ? "Origin unknown" : `Made in ${value}`),
  listed: (value) => `Listed at ${value}`,
  stocked: (value) => `In stock at ${value}`,
  cheapest: (value) => `Cheapest at ${value}`,
  repricing: (value) => `${value} changes their price`,
  leader: (value) => `${value} moves price first`,
  restock_first: (value) => `${value} restocks first`,
  risk: (value) => {
    const [lifecycle, column] = value.split(".");
    return `${RISK_LIFECYCLE[lifecycle] ?? lifecycle} · ${RISK_AVAILABILITY[column] ?? column}`;
  },
};

/** A filter from the address, or none when it is not one Prism knows. */
export function filterFromParam(value: string | null): PartsFilter {
  if (!value) return "";
  const [kind, ...rest] = value.split(":");
  if (rest.length > 0 && kind in VALUED_LABEL && rest.join(":") !== "") return value as PartsFilter;
  return value in FILTER_LABEL ? (value as PartsFilter) : "";
}

/** The words for a filter: a fixed group, or a country or distributor chosen on a chart. */
export function filterLabel(only: Exclude<PartsFilter, "">): string {
  const [kind, ...rest] = only.split(":");
  return rest.length > 0 && kind in VALUED_LABEL ? VALUED_LABEL[kind](rest.join(":")) : FILTER_LABEL[only as keyof typeof FILTER_LABEL];
}
