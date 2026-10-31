import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SupplyComponentWatch, WatchPackaging } from "@/types/supply";
import { followComponent, getComponentFollow, stopFollowingComponent } from "./tracking-api";
import { useLoaded } from "./use-loaded";
import { PACKAGINGS } from "./watch-packaging";

/** Watching a component: its own part, counted in the packaging chosen. */
export function ComponentWatch({ componentId, canEdit, onChanged }: { componentId: string; canEdit: boolean; onChanged: () => void }) {
  const fetcher = useCallback((signal: AbortSignal) => getComponentFollow(componentId, signal), [componentId]);
  const loaded = useLoaded<SupplyComponentWatch | null>(`tracking/components/${componentId}`, fetcher, "Could not load the component watch");
  const [packaging, setPackaging] = useState<WatchPackaging | null>(null);
  const [error, setError] = useState("");
  if (loaded.status !== "ready") return null;
  const watch = loaded.data ?? null;
  if (!watch && !canEdit) return null;

  const packagingNow = packaging ?? watch?.packaging ?? "any";
  const act = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
      setPackaging(null);
      await loaded.refresh();
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong");
    }
  };

  if (!canEdit) {
    return watch ? <p className="text-xs text-muted-foreground">Watched by {watch.owner}.</p> : null;
  }
  return (
    <div className="space-y-2 border p-2" aria-label="Watch this component">
      <p className="text-xs text-muted-foreground">
        {watch ? "This component's part is watched." : "Watch the component's part."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Count stock of"
          className="h-8 border bg-background px-2 text-xs"
          value={packagingNow}
          onChange={(event) => setPackaging(event.target.value as WatchPackaging)}
        >
          {PACKAGINGS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <Button size="sm" onClick={() => void act(() => followComponent(componentId, packagingNow))}>
          {watch ? "Update" : "Watch component"}
        </Button>
        {watch ? <Button size="sm" variant="ghost" onClick={() => void act(() => stopFollowingComponent(componentId))}>Stop watching</Button> : null}
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
