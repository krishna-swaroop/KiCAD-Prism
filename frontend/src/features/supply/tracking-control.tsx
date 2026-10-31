import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PartTracking, SupplyWatch, TrackingPreview } from "@/types/supply";
import { BudgetPreview } from "./budget-preview";
import { PackagingPickDialog } from "./packaging-pick-dialog";
import { followPart, getPartTracking, previewFollow, stopTrackingPart, type TierChoice } from "./tracking-api";
import { useLoaded } from "./use-loaded";

const CHOICES: ReadonlyArray<{ value: string; label: string; choice: TierChoice | null }> = [
  { value: "1", label: "Tier 1: daily", choice: { tier: 1, rate: "weekly" } },
  { value: "2w", label: "Tier 2: weekly", choice: { tier: 2, rate: "weekly" } },
  { value: "2m", label: "Tier 2: monthly", choice: { tier: 2, rate: "monthly" } },
  { value: "none", label: "Not tracked by choice", choice: null },
];

const REASON_TEXT: Record<string, string> = {
  project: "a tracked project",
  person: "someone's choice",
  component: "a watched component",
  legacy: "a watch from before tiers",
};

function valueOf(tracking: PartTracking | null): string {
  if (!tracking) return "none";
  return tracking.tier === 1 ? "1" : tracking.rate === "monthly" ? "2m" : "2w";
}

/** How Prism follows this part and why, with a choice of tier that shows what it costs before it is applied. */
export function TrackingControl({
  partId, canEdit, onChanged, needsPick = [],
}: { partId: string; canEdit: boolean; onChanged: () => Promise<void> | void; needsPick?: ReadonlyArray<{ connector_id: string; connector: string; listings: number }> }) {
  const fetcher = useCallback((signal: AbortSignal) => getPartTracking(partId, signal), [partId]);
  const loaded = useLoaded<{ tier: PartTracking | null; waiting_at: string[]; watch: SupplyWatch | null }>(`parts/${partId}/tracking`, fetcher, "Could not read the part's tracking");
  const [pending, setPending] = useState<{ value: string; choice: TierChoice; preview: TrackingPreview } | null>(null);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState("");
  if (loaded.status !== "ready" || !loaded.data) return null;
  const tracking = loaded.data.tier;
  const reasons = [...new Set((tracking?.reasons ?? []).map((item) => REASON_TEXT[item.kind] ?? item.kind))];

  const choose = (value: string) => {
    const entry = CHOICES.find((item) => item.value === value);
    setError("");
    if (!entry?.choice) { setPending(null); return; }
    previewFollow(partId, entry.choice)
      .then((preview) => setPending({ value, choice: entry.choice as TierChoice, preview }))
      .catch((caught: Error) => setError(caught.message));
  };
  const finish = (action: Promise<unknown>) => {
    action.then(() => { setPending(null); return onChanged(); }).then(() => loaded.retry()).catch((caught: Error) => setError(caught.message));
  };

  return (
    <section aria-label="Tracking" className="space-y-1 text-sm">
      <p>
        {tracking ? `Read ${tracking.rate}${tracking.tier === 1 ? " (tier 1)" : " (tier 2)"}` : "Not followed. Read only when someone asks."}
        {reasons.length > 0 ? `, because of ${reasons.join(" and ")}.` : ""}
      </p>
      {loaded.data.waiting_at.length > 0 ? <p className="text-xs text-warning">Queued for calls at {loaded.data.waiting_at.length} distributor(s).</p> : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Tier"
            className="h-8 border bg-background px-2 text-sm"
            value={pending?.value ?? valueOf(tracking)}
            onChange={(event) => choose(event.target.value)}
          >
            {CHOICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          {pending ? <Button size="sm" onClick={() => finish(followPart(partId, pending.choice))}>Apply</Button> : null}
          {!pending && tracking && tracking.reasons.some((item) => item.kind !== "project") ? (
            <Button size="sm" variant="destructive" onClick={() => finish(stopTrackingPart(partId))}>Stop tracking</Button>
          ) : null}
        </div>
      ) : null}
      {pending ? <BudgetPreview connectors={pending.preview.connectors} /> : null}
      {tracking && needsPick.length > 0 ? (
        <ul className="text-xs" aria-label="Packaging to pick">
          {needsPick.map((item) => (
            <li key={item.connector_id} className="flex items-center gap-2">
              <span className="text-warning">Pick a packaging at {item.connector} ({item.listings} listings) to save calls.</span>
              {canEdit ? <Button size="sm" variant="outline" onClick={() => setPicking(item.connector_id)}>Pick</Button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {picking ? <PackagingPickDialog partId={partId} connectorId={picking} onClose={() => setPicking("")} onChanged={() => void onChanged()} /> : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
