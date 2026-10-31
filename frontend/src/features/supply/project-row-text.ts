import type { SupplyPartGroup } from "@/types/supply";

/** "42 parts · 3 at risk · 1 out": only the counts that are not zero. */
export function counts(group: SupplyPartGroup): string {
  const stats = group.stats;
  const parts = [`${group.count.toLocaleString()} ${group.count === 1 ? "part" : "parts"}`];
  if (stats) {
    const add = (n: number, text: string) => { if (n > 0) parts.push(`${n} ${text}`); };
    add(stats.at_risk, "at risk");
    add(stats.out, "out");
    add(stats.end_of_life, "end of life");
    add(stats.one_distributor, "one distributor");
    add(stats.runs_out_soon, "run out < 2 w");
  }
  return parts.join(" · ");
}
