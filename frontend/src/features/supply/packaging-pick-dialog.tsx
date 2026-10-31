import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PackagingListing, PackagingOptions, PackagingSimilar } from "@/types/supply";
import { PackagingChip } from "./packaging-chip";
import { applySimilarPicks, clearPackagingPick, getPackagingOptions, pickPackaging } from "./packaging-api";
import { PriceAtQuantity } from "./price-at-quantity";
import { formatLeadTime } from "./supply-format";
import { invalidateSupply, useLoaded } from "./use-loaded";

const money = (item: PackagingListing, quantity: string) => (item.prices[quantity] ? `${item.prices[quantity]} ${item.currency}` : "");

function Chip({ children, tone }: { children: ReactNode; tone?: "warning" }) {
  return <span className={tone === "warning" ? "bg-warning/15 px-2 py-0.5 text-warning" : "bg-secondary px-2 py-0.5"}>{children}</span>;
}

/** Listings of one part at one distributor, side by side, values that differ marked. Pick the one to follow. */
export function PackagingPickDialog({
  partId, connectorId, onClose, onChanged,
}: { partId: string; connectorId: string; onClose: () => void; onChanged: () => void }) {
  const fetcher = useCallback((signal: AbortSignal) => getPackagingOptions(partId, connectorId, signal), [partId, connectorId]);
  const loaded = useLoaded<PackagingOptions>(`parts/${partId}/packaging/${connectorId}`, fetcher, "Could not load the listings");
  const options = loaded.data;
  const [similar, setSimilar] = useState<{ packaging: string; items: PackagingSimilar[] } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [failed, setError] = useState("");
  const error = failed || (loaded.status === "error" ? loaded.error : "");
  // The listing ticked to be followed; the one picked now until a person ticks another.
  const [touched, setTicked] = useState<string | null | undefined>(undefined);
  const ticked = touched === undefined ? options?.picked ?? null : touched;

  const pick = (listing: PackagingListing) => {
    pickPackaging(partId, connectorId, listing.id)
      .then((result) => {
        onChanged();
        if (result.similar.length === 0) { toast.success("Packaging picked"); onClose(); return; }
        setSimilar({ packaging: result.packaging, items: result.similar });
        setChosen(new Set(result.similar.map((item) => item.part_id)));
        void invalidateSupply(`parts/${partId}`);
      })
      .catch((caught: Error) => setError(caught.message));
  };
  const save = () => {
    const listing = options?.listings.find((item) => item.id === ticked);
    if (listing) pick(listing); else clear();
  };
  const clear = () => {
    clearPackagingPick(partId, connectorId).then(() => { onChanged(); onClose(); }).catch((caught: Error) => setError(caught.message));
  };
  const apply = () => {
    if (!similar) return;
    applySimilarPicks(connectorId, similar.packaging, [...chosen])
      .then((result) => { toast.success(`Picked for ${result.picked} more parts`); onChanged(); onClose(); })
      .catch((caught: Error) => setError(caught.message));
  };
  const toggle = (id: string, on: boolean) => setChosen((current) => {
    const next = new Set(current);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[min(95vw,64rem)] sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{similar ? "Same for Similar Parts?" : "Pick a Packaging"}</DialogTitle>
          <DialogDescription>
            {similar
              ? `These parts at this distributor offer the same packagings. Pick ${similar.packaging.replace("_", " ")} for the ones you tick.`
              : "Only the listing you pick is read, and only its stock counts."}
          </DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {!similar && options ? (
          <div className="space-y-2">
            {options.picked && options.picked_by === "auto" ? <p className="text-xs text-muted-foreground">Picked by Prism{options.note ? `: ${options.note}` : ""}.</p> : null}
            {options.saves_calls_a_day > 0 ? <p className="text-xs text-muted-foreground">Picking saves {options.saves_calls_a_day.toFixed(2)} calls a day here.</p> : null}
            <ul className="max-h-[60vh] divide-y themed-scrollbar overflow-y-auto border" aria-label="Listings">
              {options.listings.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/30">
                  <Checkbox
                    checked={ticked === item.id} aria-label={`Follow ${item.sku}`}
                    onCheckedChange={(on) => setTicked(on === true ? item.id : null)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.product_url ? <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{item.sku}</a> : item.sku}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{item.raw_mpn || "No number listed"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {options.package ? <Chip>{options.package}</Chip> : null}
                    {item.other_number ? <Chip tone="warning">Different number</Chip> : null}
                    <Chip><PackagingChip packaging={item.packaging} reelSize={item.reel_size} inferred={item.packaging_inferred} />{item.packaging === "unknown" ? "Packaging unknown" : null}</Chip>
                    {item.stock !== null ? <Chip>{item.stock.toLocaleString()} in stock</Chip> : null}
                    {money(item, "100") ? <Chip><PriceAtQuantity price={money(item, "100")} quantity={100} /></Chip> : null}
                    {item.moq !== null ? <Chip>min {item.moq}{(item.order_multiple ?? 1) > 1 ? ` in ${item.order_multiple}s` : ""}</Chip> : null}
                    {item.lead_time_days !== null ? <Chip>{formatLeadTime(item.lead_time_days)}</Chip> : null}
                    {item.marketplace ? <Chip>Marketplace</Chip> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {similar ? (
          <ul className="max-h-64 space-y-1 themed-scrollbar overflow-y-auto text-sm" aria-label="Similar parts">
            {similar.items.map((item) => (
              <li key={item.part_id} className="flex items-center gap-2">
                <Checkbox id={`sim-${item.part_id}`} checked={chosen.has(item.part_id)} onCheckedChange={(on) => toggle(item.part_id, on === true)} />
                <label htmlFor={`sim-${item.part_id}`}>{item.mpn}, {item.manufacturer} <span className="text-muted-foreground">({item.sku})</span></label>
              </li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{similar ? "Not these" : "Close"}</Button>
          {!similar && options ? <Button disabled={ticked === options.picked} onClick={save}>Save</Button> : null}
          {similar ? <Button disabled={chosen.size === 0} onClick={apply}>Apply to {chosen.size}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
