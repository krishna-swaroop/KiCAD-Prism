import { useReducer } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupplyWatch } from "@/types/supply";
import { MakerCombobox } from "./maker-combobox";
import { followNumber } from "./tracking-api";
import { parseThreshold } from "./supply-format";
import { useConnectorSubmit } from "./use-connector-submit";
import { useSupplyManufacturers } from "./use-supply-parts";

interface WatchPartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWatched: (watch: SupplyWatch) => void;
}

interface Form {
  manufacturer: string;
  mpn: string;
  threshold: string;
  pinned: boolean;
}

function edit(state: Form, change: Partial<Form>): Form {
  return { ...state, ...change };
}

const EMPTY: Form = { manufacturer: "", mpn: "", threshold: "", pinned: false };

export function WatchPartDialog({ open, onOpenChange, onWatched }: WatchPartDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <WatchForm onClose={() => onOpenChange(false)} onWatched={onWatched} />
      </DialogContent>
    </Dialog>
  );
}

function WatchForm({ onClose, onWatched }: { onClose: () => void; onWatched: (watch: SupplyWatch) => void }) {
  const [form, update] = useReducer(edit, EMPTY);
  const { busy, error, run } = useConnectorSubmit();
  const manufacturers = useSupplyManufacturers();
  const threshold = parseThreshold(form.threshold);
  const ready = form.mpn.trim() !== "" && threshold !== undefined;

  const submit = async () => {
    const watched = await run(async () => {
      onWatched(await followNumber({
        manufacturer: form.manufacturer.trim(),
        mpn: form.mpn.trim(),
        threshold,
        pinned: form.pinned,
      }));
    });
    if (watched) onClose();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Track a Part</DialogTitle>
        <DialogDescription>
          Read regularly at your distributors. Prism finds the maker from what they list.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="watch-manufacturer">Manufacturer (optional)</Label>
          <MakerCombobox
            id="watch-manufacturer"
            value={form.manufacturer}
            options={manufacturers.map((item) => item.name)}
            onChange={(manufacturer) => update({ manufacturer })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="watch-mpn">Part number</Label>
          <Input id="watch-mpn" value={form.mpn} onChange={(event) => update({ mpn: event.target.value })} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="watch-new-threshold">Warn when stock is at or below</Label>
          <Input
            id="watch-new-threshold"
            inputMode="numeric"
            className="w-40"
            placeholder="No threshold"
            value={form.threshold}
            onChange={(event) => update({ threshold: event.target.value })}
          />
          {threshold === undefined ? <p className="text-xs text-destructive">A whole number, or leave it empty.</p> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="watch-new-pinned" checked={form.pinned} onCheckedChange={(checked) => update({ pinned: checked === true })} />
        <Label htmlFor="watch-new-pinned" className="font-normal">Always read at the fastest rate</Label>
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || !ready}>{busy ? "Watching…" : "Watch part"}</Button>
      </DialogFooter>
    </form>
  );
}
