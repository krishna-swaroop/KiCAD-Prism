import type { MarketBehaviour } from "@/types/supply";

/** What the history says about how distributors move together, as plain sentences. Empty when there is not enough yet. */
export function behaviourLines(found: MarketBehaviour | undefined): string[] {
  if (!found) return [];
  const lines: string[] = [];
  for (const [name, days] of Object.entries(found.repricing)) lines.push(`${name} changes its price about every ${days} days.`);
  const lead = found.leadership;
  if (lead) {
    lines.push(`Of ${lead.changes} price changes, ${Math.round(lead.followed_share * 100)}% were followed by another distributor within two weeks.`);
    if (lead.leader) lines.push(`${lead.leader} usually moves first.`);
  }
  for (const [name, fx] of Object.entries(found.exchange)) {
    if (Math.abs(fx.exchange_percent) >= 1) {
      lines.push(`${name} prices in ${fx.currency}: in the base currency the price is ${fx.in_base_percent > 0 ? "up" : "down"} ${Math.abs(fx.in_base_percent)}% since ${fx.from}, of which ${fx.exchange_percent > 0 ? "+" : ""}${fx.exchange_percent} points are the exchange rate.`);
    }
  }
  if (found.restock_order) lines.push(`${found.restock_order.first} usually restocks first (${found.restock_order.rounds} restocks compared).`);
  const arrivals = found.arrivals;
  if (arrivals && arrivals.on_time_share !== null) {
    lines.push(`${Math.round(arrivals.on_time_share * 100)}% of announced arrivals came within a week of the date given${arrivals.median_delay_days !== null ? `; typically ${arrivals.median_delay_days} days after it` : ""}.`);
  }
  return lines;
}
