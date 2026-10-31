import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TrackingPreview } from "@/types/supply";
import { previewTrackComponents, type TrackChoice } from "./catalog-supply-api";
import { TrackCostBars } from "./track-cost-bars";

const CHOICES: ReadonlyArray<{ value: string; label: string; hint: string; choice: TrackChoice }> = [
  { value: "2w", label: "Weekly", hint: "Tier 2, read once a week", choice: { tier: 2, rate: "weekly" } },
  { value: "2m", label: "Monthly", hint: "Tier 2, read once a month", choice: { tier: 2, rate: "monthly" } },
  { value: "1", label: "Daily", hint: "Tier 1, read every day", choice: { tier: 1, rate: "weekly" } },
];

/** How often these components are read, what that costs each distributor's call budget, and the work starts where there is room. */
export function TrackPicksDialog({
  components, busy, onClose, onTrack,
}: {
  components: Array<{ id: string; manufacturer: string; mpn: string }>;
  busy: boolean;
  onClose: () => void;
  onTrack: (choice: TrackChoice) => void;
}) {
  const [value, setValue] = useState("2w");
  const [preview, setPreview] = useState<TrackingPreview | null>(null);
  const [error, setError] = useState("");
  const choice = (CHOICES.find((item) => item.value === value) ?? CHOICES[0]).choice;

  useEffect(() => {
    const controller = new AbortController();
    previewTrackComponents(components, choice, controller.signal)
      .then((next) => { setPreview(next); setError(""); })
      .catch((caught: Error) => { if (!controller.signal.aborted) { setPreview(null); setError(caught.message); } });
    return () => controller.abort();
  }, [components, choice]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Track {components.length} {components.length === 1 ? "Part" : "Parts"}</DialogTitle>
          <DialogDescription>How often they are read.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tier">
          {CHOICES.map((item) => (
            <button
              key={item.value} type="button" aria-pressed={value === item.value} title={item.hint} onClick={() => setValue(item.value)}
              className={cn("border px-3 py-2 text-left text-sm font-medium hover:bg-muted/30", value === item.value && "border-primary bg-primary/5")}
            >
              {item.label}
            </button>
          ))}
        </div>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {preview ? (
          <section aria-label="Cost" className="space-y-1">
            <h3 className="text-xs font-medium text-muted-foreground">Daily call limit</h3>
            <TrackCostBars connectors={preview.connectors} />
          </section>
        ) : null}
        {preview?.fits_nowhere ? <p className="text-sm text-destructive">Nothing fits at any distributor.</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || preview?.fits_nowhere === true} onClick={() => onTrack(choice)}>Track ({components.length})</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
