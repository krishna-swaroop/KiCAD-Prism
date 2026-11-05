import { ChevronRight, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SupplyListing, SupplyPartDetail } from "@/types/supply";
import { ListingTable } from "./listing-table";
import { OnePerDistributor } from "./one-per-distributor";
import { pickPackaging } from "./packaging-api";
import { clearPreferredDistributor, setPreferredDistributor } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";
import { VendorName } from "./vendor-name";

interface Group {
  connectorId: string;
  name: string;
  provider: string;
  listings: SupplyListing[];
}

function firstPrice(listing: SupplyListing): number {
  const price = listing.offer?.price_breaks[0]?.[1];
  return price === undefined ? Number.POSITIVE_INFINITY : Number(price);
}

/** A distributor's listings: the followed one first, then the smallest order, then the lowest price at it. */
function inOrder(listings: SupplyListing[], followed: string | null | undefined): SupplyListing[] {
  return [...listings].sort((a, b) => (
    Number(b.id === followed) - Number(a.id === followed)
    || (a.offer?.moq ?? Number.POSITIVE_INFINITY) - (b.offer?.moq ?? Number.POSITIVE_INFINITY)
    || firstPrice(a) - firstPrice(b)
    || a.sku.localeCompare(b.sku)
  ));
}

/** Listings by distributor: the preferred one first, then by name. */
function groupsOf(listings: SupplyListing[], preferred: string | null | undefined): Group[] {
  const byConnector = new Map<string, Group>();
  for (const listing of listings) {
    const group = byConnector.get(listing.connector_id) ?? { connectorId: listing.connector_id, name: listing.connector_name, provider: listing.provider ?? "", listings: [] };
    group.listings.push(listing);
    byConnector.set(listing.connector_id, group);
  }
  return [...byConnector.values()].sort((a, b) => Number(b.connectorId === preferred) - Number(a.connectorId === preferred) || a.name.localeCompare(b.name));
}

/** The part's listings grouped by distributor. Each group can be made the preferred one; one with several listings says which is followed. */
export function ListingGroups({
  detail, canDecide, canTrack, onChanged, wide = false,
}: { detail: SupplyPartDetail; canDecide: boolean; canTrack: boolean; onChanged: () => Promise<void> | void; wide?: boolean }) {
  const { busy, error, run } = useConnectorSubmit();
  const [asking, setAsking] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleMore = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const groups = useMemo(() => groupsOf(detail.listings, detail.preferred_connector_id), [detail.listings, detail.preferred_connector_id]);
  const partId = detail.part.id;
  const preferred = detail.preferred_connector_id ?? null;
  const toggle = (group: Group) =>
    void run(async () => {
      if (group.connectorId === preferred) await clearPreferredDistributor(partId); else await setPreferredDistributor(partId, group.connectorId);
      await onChanged();
    });
  const follow = (group: Group, listing: SupplyListing) =>
    void run(async () => { await pickPackaging(partId, group.connectorId, listing.id); await onChanged(); });
  if (groups.length === 0) return <ListingTable listings={[]} />;
  return (
    <div className="space-y-2">
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      {canTrack && (detail.packaging?.needs_pick.length ?? 0) > 0 ? (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setAsking(true)}>One per distributor</Button>
        </div>
      ) : null}
      <div className={wide ? "grid items-start gap-2 md:grid-cols-2" : "space-y-2"}>
      {groups.map((group) => {
        const isPreferred = group.connectorId === preferred;
        const followedId = detail.packaging?.picks[group.connectorId] ?? null;
        const [first, ...rest] = inOrder(group.listings, followedId);
        const more = expanded.has(group.connectorId);
        const shown = more ? [first, ...rest] : [first];
        return (
          <section key={group.connectorId} aria-label={`${group.name} listings`} className={`space-y-2 border p-3 ${isPreferred ? "bg-primary/5" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              {canTrack ? (
                <Button
                  type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={busy} aria-pressed={isPreferred}
                  aria-label={isPreferred ? `Stop preferring ${group.name}` : `Prefer ${group.name}`} title={isPreferred ? "Preferred distributor" : "Make this the preferred distributor"}
                  onClick={() => toggle(group)}
                >
                  <Star className={`h-3.5 w-3.5 ${isPreferred ? "fill-current text-primary" : ""}`} />
                </Button>
              ) : isPreferred ? <Star className="h-3.5 w-3.5 fill-current text-primary" aria-hidden /> : null}
              <VendorName provider={group.provider} name={group.name} className="text-sm font-semibold" />
              {isPreferred ? <Badge variant="secondary">Preferred</Badge> : null}
            </div>
            <ListingTable
              listings={shown} canDecide={canDecide} onChanged={() => void onChanged()}
              follow={{ followed: followedId, canFollow: canTrack, onFollow: (listing) => follow(group, listing) }}
            />
            {rest.length > 0 ? (
              <button
                type="button" aria-expanded={more} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => toggleMore(group.connectorId)}
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-90" : ""}`} />
                {more ? "Show less" : `Show ${rest.length} more`}<span className="sr-only"> from {group.name}</span>
              </button>
            ) : null}
          </section>
        );
      })}
      </div>
      {asking ? <OnePerDistributor partId={partId} onClose={() => setAsking(false)} onDone={onChanged} /> : null}
    </div>
  );
}
