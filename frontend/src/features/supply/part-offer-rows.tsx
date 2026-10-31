import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { SupplyPartRow, SupplyRowOffer } from "@/types/supply";
import { PackagingChip } from "./packaging-chip";
import { priceAt, PRICE_QUANTITIES } from "./parts-layout";
import { formatPrice, packagingName } from "./supply-format";
import { vendorColor } from "./vendor-colors";

const HEAD = "px-2 py-1 font-normal";
const REEL_NOTE = "A re-reeled length. Farnell gives it the cut tape's prices; re-reeling may add a charge that its data does not include.";

function OfferRow({ part, offer }: { part: SupplyPartRow; offer: SupplyRowOffer }) {
  return (
    <tr className="border-t border-dashed">
      <td className="px-2 py-1">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: vendorColor(offer.provider) ?? "#6b7280" }} />
          {offer.product_url ? (
            <a
              href={offer.product_url} target="_blank" rel="noopener noreferrer" className="hover:underline"
              aria-label={`Open ${part.mpn} at ${offer.name}`} title={`Open ${(offer.skus ?? [offer.sku]).join(", ")} at ${offer.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              {offer.name}
            </a>
          ) : offer.name}
        </span>
      </td>
      <td className={`px-2 py-1 text-right tabular-nums ${offer.stock > 0 ? "" : "text-muted-foreground"}`}>{offer.stock.toLocaleString()}</td>
      <td className="px-2 py-1 text-right tabular-nums">{offer.moq > 0 ? offer.moq.toLocaleString() : "–"}</td>
      <td className="px-2 py-1" title={offer.provider === "farnell" && offer.packaging === "custom_reel" ? REEL_NOTE : undefined}>
        <PackagingChip packaging={offer.packaging} reelSize={offer.reel_size} inferred={offer.packaging_inferred} also={offer.also_packaging} />
        {packagingName(offer.packaging) ? null : <span className="text-muted-foreground">–</span>}
      </td>
      {PRICE_QUANTITIES.map((quantity) => {
        // In the workspace currency like the row above it; the distributor's own price stays on hover.
        const base = offer.base_price_breaks && offer.base_currency && offer.base_currency !== offer.currency ? { breaks: offer.base_price_breaks, currency: offer.base_currency } : null;
        const converted = base !== null;
        const native = priceAt(offer.price_breaks, quantity);
        const price = base ? priceAt(base.breaks, quantity) : native;
        return (
          <td key={quantity} className="px-2 py-1 text-right tabular-nums" title={converted && native !== null ? `Converted from ${formatPrice(native, offer.currency)}` : undefined}>
            {price === null ? <span className="text-muted-foreground">–</span> : formatPrice(price, base?.currency ?? offer.currency)}
          </td>
        );
      })}
    </tr>
  );
}

/** The lines by distributor, in the order the server gives them: the followed one first. */
function byVendor(offers: readonly SupplyRowOffer[]): SupplyRowOffer[][] {
  const groups = new Map<string, SupplyRowOffer[]>();
  for (const offer of offers) groups.set(offer.connector_id, [...(groups.get(offer.connector_id) ?? []), offer]);
  return [...groups.values()];
}

/**
 * A part's vendors: stock, smallest order, packaging and the unit price at each quantity. Each vendor shows its first line, the
 * followed one; the others are one chevron away.
 */
export function PartOfferRows({ part }: { part: SupplyPartRow }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const offers = part.offers ?? [];
  if (offers.length === 0) return <p className="px-2 py-1 text-xs text-muted-foreground">No vendor has been read yet.</p>;
  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <table className="w-full text-xs" aria-label={`Vendors of ${part.mpn}`}>
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className={HEAD}>Vendor</th>
          <th className={`${HEAD} text-right`}>In stock</th>
          <th className={`${HEAD} text-right`}>Min order</th>
          <th className={HEAD}>Packaging</th>
          {PRICE_QUANTITIES.map((quantity) => <th key={quantity} className={`${HEAD} text-right`}>{quantity.toLocaleString()}</th>)}
        </tr>
      </thead>
      <tbody>
        {byVendor(offers).flatMap(([first, ...rest]) => {
          const expanded = open.has(first.connector_id);
          const key = (offer: SupplyRowOffer) => `${offer.connector_id}:${offer.sku}:${offer.packaging}`;
          return [
            <OfferRow key={key(first)} part={part} offer={first} />,
            ...(expanded ? rest.map((offer) => <OfferRow key={key(offer)} part={part} offer={offer} />) : []),
            ...(rest.length > 0 ? [(
              <tr key={`${first.connector_id}:more`}>
                <td colSpan={4 + PRICE_QUANTITIES.length} className="px-2 pb-1">
                  <button
                    type="button" aria-expanded={expanded} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    onClick={(event) => { event.stopPropagation(); toggle(first.connector_id); }}
                  >
                    <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
                    {expanded ? "Show less" : `Show ${rest.length} more`} <span className="sr-only">from {first.name}</span>
                  </button>
                </td>
              </tr>
            )] : []),
          ];
        })}
      </tbody>
    </table>
  );
}
