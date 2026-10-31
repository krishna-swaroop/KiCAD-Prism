import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import type { User } from "@/types/auth";
import type { PackagingSeveral } from "@/types/supply";
import { CollapsibleSection } from "./collapsible-section";
import { PartSheet } from "./part-sheet";
import { PackagingPickDialog } from "./packaging-pick-dialog";
import { listPackagingSeveral } from "./packaging-api";
import { useLoaded } from "./use-loaded";
import { VendorName } from "./vendor-name";

function who(item: PackagingSeveral): string {
  if (!item.picked_by) return "No pick yet";
  const by = item.picked_by === "auto" ? "Prism" : item.picked_by;
  return `Following ${item.picked_sku}, picked by ${by}${item.note ? ` (${item.note})` : ""}`;
}

/** Every tracked part that a distributor lists in more than one packaging, with the listing followed there. A place to check and change the picks. */
export function SeveralListings({ canDecide, user = null }: { canDecide: boolean; user?: User | null }) {
  const fetcher = useCallback((signal: AbortSignal) => listPackagingSeveral(signal), []);
  const { data, retry } = useLoaded("packaging/several", fetcher, "Could not load the listings");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [choosing, setChoosing] = useState<PackagingSeveral | null>(null);
  const [openPart, setOpenPart] = useState<string | null>(null);
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  const shown = onlyOpen ? items.filter((item) => !item.picked_by) : items;
  const open = items.filter((item) => !item.picked_by).length;
  return (
    <CollapsibleSection id="review-several" title="Several listings at a distributor" count={items.length} startOpen={false}>
      <div className="space-y-2 p-2">
        <button
          type="button" aria-pressed={onlyOpen} onClick={() => setOnlyOpen(!onlyOpen)}
          className={`border px-2 py-0.5 text-xs ${onlyOpen ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/30"}`}
        >
          No pick yet ({open})
        </button>
        <ul className="divide-y">
          {shown.map((item) => (
            <li key={`${item.part_id}:${item.connector_id}`} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setOpenPart(item.part_id)}>{item.mpn}</button>
              <VendorName provider={item.provider} name={item.connector} className="text-xs" />
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{who(item)}</span>
              {item.new_since_pick ? <span className="text-xs text-warning">a new packaging since the pick</span> : null}
              <span className="text-xs text-muted-foreground">
                {item.saves_calls_a_day > 0 ? `saves ${item.saves_calls_a_day.toFixed(2)} calls a day` : "read together"}
              </span>
              {canDecide ? <Button size="sm" variant="outline" onClick={() => setChoosing(item)}>{item.picked_by ? "Change" : "Choose"}</Button> : null}
            </li>
          ))}
        </ul>
      </div>
      <PartSheet partId={openPart} user={user} onClose={() => setOpenPart(null)} onWatchChanged={retry} />
      {choosing ? <PackagingPickDialog partId={choosing.part_id} connectorId={choosing.connector_id} onClose={() => setChoosing(null)} onChanged={retry} /> : null}
    </CollapsibleSection>
  );
}
