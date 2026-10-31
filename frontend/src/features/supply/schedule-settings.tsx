import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ScheduleSettings as Schedule } from "@/types/supply";
import { getSchedule, saveSchedule } from "./tracking-api";
import { useConnectorSubmit } from "./use-connector-submit";
import { useLoaded } from "./use-loaded";

const SPARE: ReadonlyArray<{ id: keyof Schedule["spare"]; label: string }> = [
  { id: "waiting", label: "Parts waiting for room" },
  { id: "tier2_early", label: "Tier 2 parts ahead of schedule" },
  { id: "notices", label: "Change notices of untracked parts" },
  { id: "library", label: "Library parts nobody follows" },
];

function Form({ initial, readOnly }: { initial: Schedule; readOnly: boolean }) {
  const [draft, setDraft] = useState(initial);
  const { busy, error, run } = useConnectorSubmit();
  const save = () => {
    void run(async () => { setDraft(await saveSchedule(draft)); toast.success("Saved"); });
  };
  return (
    <fieldset className="space-y-3" disabled={readOnly}>
      <legend className="text-sm font-medium">Background reads</legend>
      <p className="text-xs text-muted-foreground">
        Calls nobody needs today go to background reads. Choose which ones.
      </p>
      <div className="space-y-1">
        {SPARE.map((item) => (
          <span key={item.id} className="flex items-center gap-1.5">
            <Checkbox id={`spare-${item.id}`} checked={draft.spare[item.id]} onCheckedChange={(on) => setDraft({ ...draft, spare: { ...draft.spare, [item.id]: on === true } })} />
            <Label htmlFor={`spare-${item.id}`} className="font-normal">{item.label}</Label>
          </span>
        ))}
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      {readOnly ? null : <Button type="button" size="sm" disabled={busy} onClick={save}>Save</Button>}
    </fieldset>
  );
}

/** Which spare work is on. Administrators change it; anyone else sees it. */
export function ScheduleSettings({ readOnly = false }: { readOnly?: boolean }) {
  const fetcher = useCallback((signal: AbortSignal) => getSchedule(signal), []);
  const { data, status } = useLoaded<Schedule>("settings/schedule", fetcher, "Could not load the schedule");
  if (status !== "ready" || !data) return null;
  return <Form initial={data} readOnly={readOnly} />;
}
