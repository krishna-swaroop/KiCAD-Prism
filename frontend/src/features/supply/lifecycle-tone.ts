import type { SupplyLifecycle } from "@/types/supply";

/** The lifecycle tag's colour: green when active, amber when ending, red when obsolete, plain when unknown. */
export const LIFECYCLE_BADGE: Record<SupplyLifecycle, "success" | "warning" | "destructive" | "outline"> = {
  active: "success", nrnd: "warning", last_time_buy: "warning", obsolete: "destructive", unknown: "outline",
};
