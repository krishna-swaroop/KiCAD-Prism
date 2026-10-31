import type { SupplyHeadlinePrice, SupplyListing, SupplyPartRow } from "@/types/supply";
import { formatPrice } from "./supply-format";

export function daysSince(day: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(`${day}T00:00:00Z`)) / 86_400_000));
}

/** The hover text: the range over distributors and what the price was before it was converted. */
export function priceDetail(price: SupplyHeadlinePrice): string {
  const lines: string[] = [];
  const range = price.price_range;
  if (range) lines.push(`${formatPrice(range.low, price.currency)} to ${formatPrice(range.high, price.currency)}, median ${formatPrice(range.median, price.currency)}, over ${range.sellers} distributors`);
  if (price.price_native) lines.push(`Converted from ${formatPrice(price.price_native.price, price.price_native.currency)}`);
  return lines.join(". ");
}

/** Why a row has no price: nothing read yet, no exchange rate, or nobody lists one. */
export function noPriceReason(part: Pick<SupplyPartRow, "stock" | "price_unrated">): string {
  if (part.stock === null) return "Not read yet";
  if (part.price_unrated && part.price_unrated.length > 0) return `No exchange rate for ${part.price_unrated.join(", ")}`;
  return "No distributor lists a price for it";
}

export interface PriceAt {
  id: string;
  /** The distributor, its colour key and the number it lists the part under. */
  vendor: string;
  provider: string;
  sku: string;
  name: string;
  price: string;
  currency: string;
  /** What must be ordered to get the wanted quantity. */
  quantity: number;
}

/** What each counted listing charges per piece for `wanted` pieces, from its price breaks as they stand now. */
export function pricesAt(listings: SupplyListing[], wanted: number): PriceAt[] {
  const found: PriceAt[] = [];
  for (const listing of listings) {
    const offer = listing.offer;
    if (!listing.counted || !offer || offer.marketplace || !offer.currency) continue;
    const multiple = Math.max(offer.order_multiple || 1, 1);
    const quantity = Math.ceil(Math.max(wanted, offer.moq || 1, 1) / multiple) * multiple;
    let price: string | null = null;
    for (const [from, each] of offer.price_breaks) if (from <= quantity) price = each;
    if (price !== null) found.push({ id: listing.id, vendor: listing.connector_name, provider: listing.provider ?? "", sku: listing.sku, name: `${listing.connector_name} ${listing.sku}`, price, currency: offer.currency, quantity });
  }
  return found;
}
