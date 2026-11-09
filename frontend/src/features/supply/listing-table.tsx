import { Check, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SupplyListing } from "@/types/supply";
import { failureWords } from "./connector-status";
import { PackagingChip } from "./packaging-chip";
import { TestDataChip } from "./test-data-chip";
import { pinSupplyListing } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";
import { formatAgo, formatLeadTime, formatPrice, formatStock, matchLabel, tierLabel } from "./supply-format";

/** Every distributor listing of a part, and whether it counts toward stock. */
export interface FollowChoice {
  /** The listing followed at this distributor, when several are listed and one is picked. */
  followed: string | null;
  /** The viewer may follow another listing. */
  canFollow: boolean;
  onFollow: (listing: SupplyListing) => void;
}

export function ListingTable({
  listings, canDecide = false, onChanged, follow,
}: { listings: SupplyListing[]; canDecide?: boolean; onChanged?: () => void; follow?: FollowChoice }) {
  const { busy, error, run } = useConnectorSubmit();
  if (listings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No listings yet. Connectors search for new watches within a minute or two.
      </p>
    );
  }
  return (
    <div className="divide-y">
      {error ? <p role="alert" className="py-1 text-xs text-destructive">{error}</p> : null}
      {listings.map((listing) => {
        const offer = listing.offer;
        const firstBreak = offer?.price_breaks[0];
        return (
          <article key={listing.id} aria-label={`Listing ${listing.sku}`} className="py-2 text-sm first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {offer?.product_url || listing.page_url ? (
                  <a
                    href={offer?.product_url || listing.page_url} target="_blank" rel="noreferrer" className="font-medium hover:underline"
                    aria-label={`Open ${listing.connector_name} product page`} title={`Open ${listing.sku} at ${listing.connector_name}`}
                  >
                    {listing.sku}
                  </a>
                ) : <span className="font-medium">{listing.sku}</span>}
                <TestDataChip show={listing.test_data} />
                {listing.packaging && listing.packaging !== "unknown" ? <Badge variant="outline"><PackagingChip packaging={listing.packaging} reelSize={listing.reel_size} inferred={listing.packaging_inferred} /></Badge> : null}
                {follow?.followed === listing.id ? <Badge variant="default" role="img" aria-label="Followed" title="Followed"><Eye className="h-3 w-3" /></Badge> : null}
                {follow?.followed && follow.followed !== listing.id && listing.counted && follow.canFollow ? (
                  <Button size="icon" variant="secondary" className="h-6 w-6 text-muted-foreground hover:text-foreground" aria-label="Follow this instead" title="Follow this instead" onClick={() => follow.onFollow(listing)}><Eye className="h-3.5 w-3.5" /></Button>
                ) : null}
                {!listing.counted ? (
                  <Badge variant="warning">
                    {notCountedText(listing)}
                  </Badge>
                ) : null}
                {listing.match_state === "near" && canDecide ? (
                  <Button size="sm" className="h-6 gap-1 px-2 text-xs" disabled={busy} onClick={() => void run(async () => { await pinSupplyListing(listing.id); onChanged?.(); })}>
                    <Check className="h-3 w-3" />This is the same part
                  </Button>
                ) : null}
                {offer?.marketplace ? <Badge variant="outline">{listing.provider === "jlcpcb" ? "Assembly stock" : "Marketplace"}</Badge> : null}
                {offer?.discontinued ? <Badge variant="warning">Discontinued here</Badge> : null}
              </div>
            </div>
            {offer ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
                <Fact label="Stock" value={formatStock(offer.stock)} />
                <Fact label={`Price at ${firstBreak?.[0] ?? 1}`} value={firstBreak ? formatPrice(firstBreak[1], offer.currency) : "None"} />
                <Fact label="Order" value={`Min ${offer.moq.toLocaleString()}${offer.order_multiple > 1 ? `, multiples of ${offer.order_multiple.toLocaleString()}` : ""}`} />
                <Fact label="Lead time" value={offer.lead_time_days === null ? (offer.stock > 0 ? "In stock" : "Not given") : formatLeadTime(offer.lead_time_days)} />
                <Fact label="Read" value={formatAgo(offer.fetched_at)} />
                {offer.incoming.length > 0 ? (
                  <Fact label="On order" value={offer.incoming.map(([quantity, date]) => `${quantity.toLocaleString()}${date ? ` due ${date}` : ""}`).join(", ")} />
                ) : null}
              </dl>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Not read yet.</p>
            )}
            {listing.poll ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {tierLabel(listing.poll.tier)}.
                {listing.poll.error_streak > 0 ? ` Last read failed: ${failureWords(listing.poll.last_error_code, listing.connector_name)}.` : ""}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

/** Why a listing is not counted, in the words of what differs: the maker, or the number the distributor lists it under. */
function notCountedText(listing: SupplyListing): string {
  if (listing.match_state !== "near") return `${matchLabel(listing.match_state)}, not counted`;
  const reason = listing.match_reason ?? "";
  if (reason === "different part number") return "Different part number, not counted";
  if (reason === "longer number") return "Longer number, not counted";
  return listing.raw_manufacturer ? `Other maker: ${listing.raw_manufacturer}` : `${matchLabel(listing.match_state)}, not counted`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
