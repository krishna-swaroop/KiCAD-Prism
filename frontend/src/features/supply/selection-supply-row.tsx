import { useCallback, useState } from "react";
import { Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canOpenSupply } from "@/lib/roles";
import type { User } from "@/types/auth";
import type { SemanticComponent } from "@/types/prism-selection";
import { identityOf } from "./bom-supply";
import { PartSheet } from "./part-sheet";
import { lookupSupplyPart } from "./supply-api";
import { useLoaded } from "./use-loaded";

/**
 * The supply link of a component picked in a viewer: when Prism knows its part, a button opens the part's sheet where the viewer
 * stands, with a note when the part is known but not tracked. Nothing shows for a role that cannot read supply data or a component with no part number.
 */
export function SelectionSupplyRow({ component, user }: { component: SemanticComponent; user: User | null }) {
  const { manufacturer, mpn } = identityOf(component);
  const allowed = canOpenSupply(user?.role) && mpn !== "";
  const fetcher = useCallback((signal: AbortSignal) => (allowed ? lookupSupplyPart(manufacturer, mpn, signal) : Promise.resolve(null)), [allowed, manufacturer, mpn]);
  const found = useLoaded<{ partId: string; followed: boolean } | null>(`parts/found/${manufacturer}|${mpn}`, fetcher, "Could not look the part up in Supply");
  const [open, setOpen] = useState(false);
  if (!allowed || found.status === "error") return null;
  return (
    <div className="flex items-center justify-between gap-2.5 py-2" data-testid="selection-supply-row">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">Supply</span>
      </span>
      {found.status === "loading" ? (
        <span className="text-xs text-muted-foreground">Looking up</span>
      ) : found.data ? (
        <span className="flex items-center gap-2">
          {found.data.followed ? null : <span className="text-xs text-muted-foreground">Not tracked</span>}
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Open supply part</Button>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Not in Supply</span>
      )}
      {found.data ? <PartSheet partId={open ? found.data.partId : null} user={user} onClose={() => setOpen(false)} onWatchChanged={() => undefined} /> : null}
    </div>
  );
}
