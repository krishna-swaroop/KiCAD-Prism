import { formatPrice, LIFECYCLE_LABEL } from "@/features/supply/supply-format";
import type { PanelSupplySummary } from "@/panel/lib/panel-api";

/** What a refresh did, in a sentence for the log. */
export function refreshText(result: { read: number; connectors: number; problems: Array<{ reason: string }> }): string {
  if (result.connectors === 0) return "No distributor lists this part yet.";
  const read = result.read === 1 ? "Read 1 listing." : `Read ${result.read} listings.`;
  return [read, ...result.problems.map((problem) => problem.reason)].join(" ");
}

/** 38200 becomes "38.2k". Exact counts below a thousand. */
export function compactCount(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10}k`;
}

/** A unit price as the app writes it (`formatPrice`); empty without a price or a currency. */
export function price(unit: string | null, currency: string): string {
  return unit === null || !currency ? "" : formatPrice(unit, currency);
}

/** "38.2k at 3 distributors, Active, from €0.30 × 100": a price with its quantity as the app writes one (`PriceAtQuantity`). */
export function summaryText(summary: PanelSupplySummary): string {
  if (summary.stock === null) return "Not read from distributors yet";
  const parts = [
    `${compactCount(summary.stock)} at ${summary.distributors} ${summary.distributors === 1 ? "distributor" : "distributors"}`,
  ];
  if (summary.lifecycle !== "unknown") parts.push(LIFECYCLE_LABEL[summary.lifecycle]);
  const from = price(summary.unit_price, summary.currency);
  if (from) parts.push(`from ${from} × ${summary.price_quantity.toLocaleString()}`);
  return parts.join(", ");
}
