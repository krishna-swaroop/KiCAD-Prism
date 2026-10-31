import type { RestockRecord } from "@/types/supply";

/** The distributors worth showing: one that has an open promise, has kept or broken one, or has run out. */
export function restockItems(record: readonly RestockRecord[]): RestockRecord[] {
  return record.filter((item) => item.open || item.resolved > 0 || item.stock_outs > 0);
}
