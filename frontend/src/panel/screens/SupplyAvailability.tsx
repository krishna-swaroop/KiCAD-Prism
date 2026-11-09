import { ExternalLink } from "lucide-react";

import type { PanelSupply, PanelSupplySummary } from "@/panel/lib/panel-api";
import { compactCount, price, summaryText } from "@/panel/lib/supply-summary";
import { STATUS_FILL as DOT } from "@/features/supply/supply-format";
import { vendorColor } from "@/features/supply/vendor-colors";
import { OutsideLink } from "@/panel/components/OutsideLink";

/** The status dot a search row shows for a component Prism tracks. */
export function SupplyDot({ summary }: { summary: PanelSupplySummary }) {
  return <span role="img" aria-label="Supply status" className={`h-2 w-2 shrink-0 rounded-full ${DOT[summary.status]}`} title={summaryText(summary)} />;
}

/** The Availability block for a tracked component: standing, what to watch, who has it. */
export function SupplyAvailability({ supply }: { supply: PanelSupply }) {
  const { summary } = supply;
  if (!summary) return null;
  const offers = supply.offers ?? [];
  return (
    <div className="flex flex-col gap-1.5" data-testid="supply-availability">
      <div className="flex items-start gap-2 rounded border border-border/50 px-2.5 py-2">
        <span role="img" aria-label="Supply status" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[summary.status]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">{summaryText(summary)}</p>
          {supply.outlook && supply.outlook !== "Not enough to say" ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">Outlook: {supply.outlook}</p>
          ) : null}
          {supply.forecast ? (
            <p className={`mt-0.5 text-[11px] leading-snug ${supply.forecast.tone === "warning" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{supply.forecast.text}</p>
          ) : null}
          {(supply.risks ?? []).map((risk) => (
            <p key={risk} className="mt-0.5 text-[11px] leading-snug text-amber-600 dark:text-amber-400">{risk}</p>
          ))}
        </div>
        {supply.links ? (
          // Opens in the panel: inside KiCad the web app shows this part alone, and closing it comes back here.
          <a href={supply.links.supply} aria-label="Open in Prism" title="Open in Prism" className="inline-flex shrink-0 text-muted-foreground hover:text-primary">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
      {offers.length > 0 ? (
        <ul className="overflow-hidden rounded border border-border/50 text-xs" aria-label="Distributors">
          {offers.map((offer) => (
            <li key={`${offer.connector}:${offer.sku}`} className="flex items-baseline gap-2 border-t border-border/30 px-2.5 py-1.5 first:border-t-0">
              <span className="min-w-0 flex-1 truncate">
                {vendorColor(offer.provider) ? (
                  <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: vendorColor(offer.provider) ?? undefined }} />
                ) : null}
                {offer.connector}
                {offer.marketplace ? <span className="ml-1 text-[10px] text-muted-foreground">marketplace</span> : null}
              </span>
              <span className="tabular-nums">{compactCount(offer.stock)}</span>
              <span className="w-16 text-right tabular-nums text-muted-foreground">{price(offer.unit_price, offer.currency)}</span>
              {offer.product_url ? (
                <OutsideLink href={offer.product_url} label={`Open ${offer.connector} product page`} className="text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-3 w-3" />
                </OutsideLink>
              ) : <span className="w-3" />}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
