import { Calculator, Pencil } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SupplyListing } from "@/types/supply";
import { pricesAt } from "./price-text";
import { setPriceQuantity } from "./supply-api";
import { formatPrice } from "./supply-format";
import { VendorName } from "./vendor-name";

const LOW = 1;
const HIGH = 1_000_000;

function QuantityDialog({ partId, quantity, standard, own, onClose, onChanged }: {
  partId: string; quantity: number; standard: number; own: boolean; onClose: () => void; onChanged: () => Promise<void> | void;
}) {
  const [text, setText] = useState(String(quantity));
  const [error, setError] = useState("");
  const wanted = Number(text.replace(/[,\s]/g, ""));
  const valid = Number.isInteger(wanted) && wanted >= LOW && wanted <= HIGH;
  const send = (value: number | null) => {
    setPriceQuantity(partId, value).then(() => onChanged()).then(onClose).catch((caught: Error) => setError(caught.message));
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Price quantity</DialogTitle>
          <DialogDescription>
            Lists, the price history and price alerts price this part at this many pieces. Others use {standard.toLocaleString()}.
          </DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <div className="space-y-1">
          <Label htmlFor="price-quantity" className="text-xs">Pieces</Label>
          <Input id="price-quantity" inputMode="numeric" value={text} onChange={(event) => setText(event.target.value)} />
          <p className="text-xs text-muted-foreground">{LOW.toLocaleString()} to {HIGH.toLocaleString()}.</p>
        </div>
        <DialogFooter>
          {own ? <Button variant="outline" onClick={() => send(null)}>Use {standard.toLocaleString()}</Button> : null}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={() => send(wanted)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "for 100" and a pencil, in the line of the Price heading and its type: the quantity the price is for, and a way to give this part its own. */
export function PriceQuantity({ partId, quantity, standard, own, canEdit, onChanged }: {
  partId: string; quantity: number; standard: number; own: boolean; canEdit: boolean; onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <span title={own ? "Set for this part" : `Priced at ${standard.toLocaleString()} pieces unless a part has its own`}>for {quantity.toLocaleString()}</span>
      {canEdit ? (
        <Button type="button" size="icon" variant="ghost" className="h-5 w-5" aria-label="Change the price quantity" title="Change the price quantity" onClick={() => setOpen(true)}>
          <Pencil className="h-3 w-3" />
        </Button>
      ) : null}
      {open ? <QuantityDialog partId={partId} quantity={quantity} standard={standard} own={own} onClose={() => setOpen(false)} onChanged={onChanged} /> : null}
    </span>
  );
}

/**
 * Try any quantity: an icon on the Listings line opens a box for it and shows what each vendor charges, the vendor in its colour
 * and the number it lists the part under in grey. The icon closes it again. Nothing is saved.
 */
export function TryQuantity({ listings }: { listings: SupplyListing[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const wanted = Number(text.replace(/[,\s]/g, ""));
  const shown = Number.isInteger(wanted) && wanted >= LOW && wanted <= HIGH ? pricesAt(listings, wanted) : [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button" size="icon" variant={open ? "secondary" : "outline"} className="h-7 w-7" aria-expanded={open}
          aria-label="Try a quantity" title="Try a quantity"
        >
          <Calculator className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-2 p-3" onOpenAutoFocus={(event) => event.preventDefault()}>
        <Label htmlFor="try-quantity" className="text-xs font-normal text-muted-foreground">Try a quantity</Label>
        <Input id="try-quantity" className="h-8 w-32" inputMode="numeric" placeholder="500" autoFocus value={text} onChange={(event) => setText(event.target.value)} />
        {shown.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {shown.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <VendorName provider={item.provider} name={item.vendor} />
                  <span className="truncate text-xs text-muted-foreground">({item.sku})</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatPrice(item.price, item.currency)}{item.quantity !== wanted ? `, orders ${item.quantity.toLocaleString()}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
