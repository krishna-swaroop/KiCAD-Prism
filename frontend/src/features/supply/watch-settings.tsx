import { useReducer, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupplyWatchSummary, WatchPackaging } from "@/types/supply";
import { followPart, stopTrackingPart } from "./tracking-api";
import { parseThreshold } from "./supply-format";
import { useConnectorSubmit } from "./use-connector-submit";
import { PACKAGINGS } from "./watch-packaging";

interface WatchSettingsProps {
  part: { id: string; mpn: string; manufacturer: string };
  watch: SupplyWatchSummary | null;
  canEdit: boolean;
  /** Called after any change so the screen can reload. */
  onChanged: () => Promise<void>;
}

interface Draft {
  threshold: string;
  pinned: boolean;
  packaging: WatchPackaging;
}


function edit(state: Draft, change: Partial<Draft>): Draft {
  return { ...state, ...change };
}

function draftOf(watch: SupplyWatchSummary | null): Draft {
  return { threshold: watch?.threshold === null || watch === null ? "" : String(watch.threshold), pinned: watch?.pinned ?? false, packaging: watch?.packaging ?? "any" };
}

export function WatchSettings({ part, watch, canEdit, onChanged }: WatchSettingsProps) {
  const [draft, update] = useReducer(edit, watch, draftOf);
  const { busy, error, run } = useConnectorSubmit();
  const [confirmingStop, setConfirmingStop] = useState(false);

  if (!watch) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Not watched. Watched parts are read regularly and warn before they run out.</p>
        {canEdit ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void run(async () => {
              await followPart(part.id, {});
              await onChanged();
            })}
          >
            Watch this part
          </Button>
        ) : null}
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  const threshold = parseThreshold(draft.threshold);
  const changed = threshold !== watch.threshold || draft.pinned !== watch.pinned || draft.packaging !== watch.packaging;

  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        Watched by {watch.owner}.
        {watch.threshold !== null ? ` Warns at ${watch.threshold.toLocaleString()} in stock.` : ""}
        {watch.pinned ? " Pinned to the fastest polling." : ""}
        {watch.packaging !== "any" ? ` Counts ${PACKAGINGS.find((item) => item.value === watch.packaging)?.label.toLowerCase()}.` : ""}
      </p>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (threshold === undefined || !changed) return;
        void run(async () => {
          await followPart(part.id, { threshold, pinned: draft.pinned, packaging: draft.packaging });
          await onChanged();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="watch-threshold">Warn when stock is at or below</Label>
        <Input
          id="watch-threshold"
          inputMode="numeric"
          className="w-40"
          placeholder="No threshold"
          value={draft.threshold}
          onChange={(event) => update({ threshold: event.target.value })}
        />
        {threshold === undefined ? <p className="text-xs text-destructive">A whole number, or leave it empty.</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="watch-packaging">Count stock of</Label>
        <select
          id="watch-packaging"
          className="h-9 w-64 border bg-background px-2 text-sm"
          value={draft.packaging}
          onChange={(event) => update({ packaging: event.target.value as WatchPackaging })}
        >
          {PACKAGINGS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">Stock, price and warnings follow only the packaging you pick. Listings of unknown packaging are left out.</p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="watch-pinned" checked={draft.pinned} onCheckedChange={(checked) => update({ pinned: checked === true })} />
        <Label htmlFor="watch-pinned" className="font-normal">Always read at the fastest rate</Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !changed || threshold === undefined}>Save</Button>
        {confirmingStop ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void run(async () => {
                await stopTrackingPart(part.id);
                await onChanged();
              })}
            >
              Stop watching
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmingStop(false)}>Keep watching</Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmingStop(true)}>Stop watching…</Button>
        )}
      </div>
      {confirmingStop ? (
        <p className="text-xs text-muted-foreground">Its threshold is lost. The history stays, and the part stops being read.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">Watched by {watch.owner}.</p>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    </form>
  );
}
