import { useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { RestrictionLevel } from "@/types/supply";
import { getComponentsStatus } from "./catalog-supply-api";
import { clearRestriction } from "./ending-api";
import { ReadFailed } from "./read-failed";
import { invalidateSupply, useLoaded } from "./use-loaded";

/** "Not for new designs" on a component's Supply tab, with Clear for QA and administrators. Nothing for an unmarked component. */
export function RestrictionNotice({ componentId, manufacturer, mpn, canDecide }: { componentId: string; manufacturer: string; mpn: string; canDecide: boolean }) {
  const fetcher = useCallback(async (signal: AbortSignal): Promise<RestrictionLevel | null> => (
    (await getComponentsStatus([{ id: componentId, manufacturer, mpn }], signal))[componentId]?.restriction ?? null
  ), [componentId, manufacturer, mpn]);
  const read = useLoaded(`components/${componentId}/restriction/${manufacturer}|${mpn}`, fetcher, "Could not read the mark");
  const level = read.data;
  // A warning that could not be read is said to be unknown, never left out as if there were none.
  if (read.status === "error" && level === null) return <ReadFailed error={read.error} onRetry={read.retry} className="border" />;
  if (level !== "not_for_new_designs") return null;
  const clear = () => {
    clearRestriction(componentId).then(() => { void invalidateSupply(`components/${componentId}`, "catalog", "ending"); toast.success("Mark cleared"); }, (caught: Error) => toast.error(caught.message));
  };
  return (
    <div className="flex items-center justify-between gap-3 border border-warning/40 bg-warning/10 px-3 py-2 text-sm" role="status">
      <span className="font-medium text-warning">Not for new designs</span>
      {canDecide ? <Button size="sm" variant="ghost" onClick={clear}>Clear mark</Button> : null}
    </div>
  );
}
