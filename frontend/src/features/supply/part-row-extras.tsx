import { ArrowDown, ArrowUp, Ban, Hourglass, PackageX, ShieldAlert, Star, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import type { SupplyPartRow } from "@/types/supply";
import { PriceAtQuantity } from "./price-at-quantity";
import { formatPrice } from "./supply-format";
import { vendorColor } from "./vendor-colors";

/** An icon the size of the lifecycle and read-age icons, with its words as the tooltip and the accessible name. */
function Tip({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return <Icon role="img" aria-label={label} className={`inline h-4 w-4 shrink-0 ${className ?? ""}`}><title>{label}</title></Icon>;
}

const FLAG: Record<string, { icon: LucideIcon; text: string }> = {
  waiting: { icon: Hourglass, text: "Queued for calls" },
  rohs: { icon: ShieldAlert, text: "A distributor says it is not RoHS compliant" },
  reach: { icon: ShieldAlert, text: "A distributor says REACH affects it" },
  ncnr: { icon: Ban, text: "Non-cancellable, non-returnable" },
  not_stocked: { icon: PackageX, text: "A distributor does not normally stock it" },
};

/** The projects using the part: the first two by name, then how many more. */
export function ProjectNames({ part }: { part: SupplyPartRow }) {
  if (part.used_in <= 0) return null;
  const shown = part.project_names ?? [];
  const more = part.used_in - shown.length;
  return (
    <div className="text-xs text-muted-foreground">
      {shown.length > 0 ? shown.join(", ") : `Used in ${part.used_in} ${part.used_in === 1 ? "project" : "projects"}`}
      {shown.length > 0 && more > 0 ? ` +${more}` : ""}
    </div>
  );
}

function Square({ item, preferred }: { item: NonNullable<SupplyPartRow["distributors"]>[number]; preferred: boolean }) {
  const [open, setOpen] = useState(false);
  const color = vendorColor(item.provider) ?? "#6b7280";
  const held = item.stock > 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button" aria-label={`${item.name}: ${held ? `${item.stock.toLocaleString()} in stock` : "none in stock"}${preferred ? ", preferred" : ""}`}
          className={`h-4 w-4 rounded-[3px] border-2 transition hover:scale-125 hover:shadow focus-visible:scale-125 ${preferred ? "ring-2 ring-foreground ring-offset-1" : ""}`}
          style={{ borderColor: color, backgroundColor: held ? color : "transparent" }}
          onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={(event) => event.stopPropagation()}
        />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-48 gap-1 p-2" onOpenAutoFocus={(event) => event.preventDefault()} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <p className="flex items-center gap-1.5 font-medium"><span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: color }} />{item.name}{preferred ? <Star className="h-3 w-3 fill-current text-primary" aria-label="Preferred" /> : null}</p>
        <p className="text-muted-foreground">{held ? `${item.stock.toLocaleString()} in stock` : "None in stock"}</p>
        {item.price && item.currency ? <p className="text-muted-foreground"><PriceAtQuantity price={formatPrice(item.price, item.currency)} quantity={100} /></p> : null}
      </PopoverContent>
    </Popover>
  );
}

/** One square per distributor in its colour: filled when it holds stock, hollow when it lists the part with none. The preferred one has a ring. Hovering one opens its name, stock and price. */
export function DistributorSquares({ part }: { part: SupplyPartRow }) {
  const list = part.distributors ?? [];
  if (list.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Distributors">
      {list.map((item) => <Square key={item.connector_id} item={item} preferred={item.connector_id === part.preferred_connector_id} />)}
    </span>
  );
}

/** The price's move over 30 days as an arrow and a percent, when a distributor's price has moved. */
export function PriceMove({ percent }: { percent: number | null | undefined }) {
  if (percent === null || percent === undefined || percent === 0) return null;
  const Icon = percent > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center text-xs ${percent > 0 ? "text-warning" : "text-success"}`} title={`Cheapest price ${percent > 0 ? "up" : "down"} ${Math.abs(percent)}% over 30 days`}>
      <Icon className="h-4 w-4" />{Math.abs(percent)}%
    </span>
  );
}

/** Problems the list used to hide, as icons. */
export function RowFlags({ flags }: { flags: readonly string[] | undefined }) {
  if (!flags || flags.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {flags.map((flag) => {
        const item = FLAG[flag];
        if (!item) return null;
        return <Tip key={flag} icon={item.icon} label={item.text} className="text-warning" />;
      })}
    </span>
  );
}
