import { ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";


import type { TrackingRoom, TrackingRoomAccount } from "@/types/supply";
import { getTrackingRoom } from "./tracking-api";
import { useLoaded } from "./use-loaded";

/** A count rounded to two significant figures: the estimate is not better than that. */
export function roughly(count: number): string {
  if (count < 100) return count.toLocaleString();
  const step = 10 ** (Math.floor(Math.log10(count)) - 1);
  return (Math.round(count / step) * step).toLocaleString();
}

function useRoom() {
  const fetcher = useCallback((signal: AbortSignal) => getTrackingRoom(signal), []);
  return useLoaded<TrackingRoom>("tracking/room", fetcher, "Could not work out the room for tracking");
}

function basis(item: TrackingRoomAccount): string {
  const parts = [`carries ${item.carried_percent}% of ${item.searched} parts searched`];
  if (item.measured_per_day !== null) {
    parts.push(`tracking spent ${item.measured_per_day} calls a day last week, against ${item.estimated_per_day} estimated`);
  }
  return parts.join("; ");
}

/** Yesterday's spend against the estimate. A gap of more than a quarter either way means the room estimate is off. */
function spendSentence(account: TrackingRoomAccount): { text: string; off: boolean } | null {
  const { expected, spent } = account.yesterday;
  if (spent === null || expected <= 0) return null;
  return { text: `Yesterday: expected ${expected.toLocaleString()}, spent ${spent.toLocaleString()}`, off: Math.abs(spent - expected) / expected > 0.25 };
}

function RoomRow({ item }: { item: TrackingRoomAccount }) {
  const withheld = item.room.daily === null;
  return (
    <tr className="border-t">
      <th scope="row" className="py-1.5 pr-3 text-left font-medium">
        {item.name}{item.assembly_only ? <span className="ml-1 font-normal text-muted-foreground">(assembly)</span> : null}
      </th>
      <td className="py-1.5 pr-3 text-right tabular-nums">{withheld ? "–" : roughly(item.room.daily ?? 0)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{withheld ? "–" : roughly(item.room.weekly ?? 0)}</td>
      <td className="py-1.5 text-muted-foreground">
        {withheld ? "Too few parts searched there to tell" : item.waiting > 0 ? `${item.waiting} wait for room` : basis(item)}
      </td>
    </tr>
  );
}

/** One tier's committed calls of the day against what tracking may commit, and how many more parts of this tier fit. */
function TierProgress({ label, calls, parts, capacity, room }: { label: string; calls: number; parts: number; capacity: number; room: number }) {
  const percent = capacity > 0 ? Math.min(100, Math.round((calls / capacity) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{calls.toLocaleString()} calls for {parts.toLocaleString()} parts · about {roughly(room)} more fit</span>
      </div>
      <div role="progressbar" aria-label={`${label} committed calls`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden bg-muted">
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** The call budget for the Connectors page: a bar each for tier 1 and tier 2 at the distributor that fills first, the rest on request. */
export function TrackingRoomSection() {
  const { data, status } = useRoom();
  const [open, setOpen] = useState(false);
  if (status !== "ready" || !data || data.accounts.length === 0) return null;
  const daily = data.headline.daily;
  const weekly = data.headline.weekly;
  const first = daily ? data.accounts.find((item) => item.name === daily.limited_by) : undefined;
  const spend = first ? spendSentence(first) : null;
  return (
    <section aria-label="Daily call limit" className="space-y-2">
      <h3 className="text-sm font-semibold">Daily call limit</h3>
      {first && daily && weekly ? (
        <div className="space-y-2">
          <TierProgress label="Tier 1" calls={first.by_tier["1"].calls} parts={first.by_tier["1"].parts} capacity={first.capacity} room={daily.room} />
          <TierProgress label="Tier 2" calls={first.by_tier["2"].calls} parts={first.by_tier["2"].parts} capacity={first.capacity} room={weekly.room} />
          {spend ? <p className={`text-xs ${spend.off ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{spend.text}</p> : null}
        </div>
      ) : <p className="text-xs text-muted-foreground">Not enough parts searched yet to tell.</p>}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />Per distributor
        </CollapsibleTrigger>
        <CollapsibleContent>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="pb-1 pr-3 text-left font-normal">Distributor</th>
                <th scope="col" className="pb-1 pr-3 text-right font-normal">Tier 1 parts</th>
                <th scope="col" className="pb-1 pr-3 text-right font-normal">Tier 2 parts</th>
                <th scope="col" className="pb-1 text-left font-normal">Based on</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((item) => <RoomRow key={item.connector_ids.join(",")} item={item} />)}
            </tbody>
          </table>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
