import type { SupplyComponentStanding } from "@/types/supply";

export type CatalogSupplyFilter = "" | "watched" | "at_risk" | "local_stock";

// At risk is error or fatal, as everywhere in Supply; a warning only needs a look.
const RISKY = new Set(["error", "fatal"]);

/** Whether a component passes the filter, given where it stands. A component Prism does not track has no standing. */
export function passesSupplyFilter(filter: CatalogSupplyFilter, standing: SupplyComponentStanding | undefined): boolean {
  if (filter === "") return true;
  if (!standing) return false;
  if (filter === "local_stock") return (standing.local_available ?? 0) > 0;
  return filter === "watched" ? standing.watched : RISKY.has(standing.status);
}

/** The filter named in the address, or none. */
export function supplyFilterFrom(value: string | null): CatalogSupplyFilter {
  return value === "watched" || value === "at_risk" || value === "local_stock" ? value : "";
}
