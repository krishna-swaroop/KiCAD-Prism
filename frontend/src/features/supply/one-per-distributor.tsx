import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PackagingChip } from "./packaging-chip";
import { applyAutoProposals, getAutoProposals } from "./packaging-api";
import { useLoaded } from "./use-loaded";

/** What Prism would pick at each distributor that lists several packagings, and the calls it saves, before it does. */
export function OnePerDistributor({ partId, onClose, onDone }: { partId: string; onClose: () => void; onDone: () => Promise<void> | void }) {
  const fetcher = useCallback((signal: AbortSignal) => getAutoProposals(partId, signal), [partId]);
  const { data, status, error } = useLoaded(`parts/${partId}/auto-picks`, fetcher, "Could not work out the picks");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const apply = () => {
    setBusy(true);
    applyAutoProposals(partId)
      .then(async (result) => { toast.success(`Picked at ${result.picked} ${result.picked === 1 ? "distributor" : "distributors"}`); await onDone(); onClose(); })
      .catch((caught: Error) => setFailed(caught.message))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>One Listing per Distributor</DialogTitle>
          <DialogDescription>Only the listing followed is read, and only its stock counts. Prism picks by the packaging this part is bought in.</DialogDescription>
        </DialogHeader>
        {status === "error" || failed ? <Alert variant="destructive"><AlertDescription>{failed || error}</AlertDescription></Alert> : null}
        {data && data.items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waits for a pick.</p> : null}
        {data && data.items.length > 0 ? (
          <ul className="divide-y border" aria-label="Picks">
            {data.items.map((item) => (
              <li key={item.connector_id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-medium">{item.connector}</span>
                <span className="flex-1 text-xs text-muted-foreground">
                  {item.sku} <PackagingChip packaging={item.packaging} />{item.note ? `, ${item.note}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.saves_calls_a_day > 0 ? `saves ${item.saves_calls_a_day.toFixed(2)} calls a day` : "read together: no saving"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {data && data.items.length > 0 ? <p className="text-xs text-muted-foreground">Saves {data.saves_calls_a_day.toFixed(2)} calls a day in all.</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !data || data.items.length === 0} onClick={apply}>Pick these</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
