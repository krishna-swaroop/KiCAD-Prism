import type { SupplyAlertKind } from "@/types/supply";

export const ALERT_KIND_LABEL: Record<SupplyAlertKind, string> = {
  out_of_stock: "Out of stock",
  below_threshold: "Below threshold",
  lifecycle: "End of life",
  part_lost: "Part lost",
  rupture_soon: "Running out",
  likely_out: "Likely out",
  price_up: "Price up",
  pcn: "Change notice",
  target_price_missed: "Target price missed",
  assessment_worse: "Assessment worse",
};
