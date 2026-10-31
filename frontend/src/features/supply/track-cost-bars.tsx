import { Button } from "@/components/ui/button";
import type { BudgetShare } from "@/types/supply";
import { VendorName } from "./vendor-name";

/** What tracking would add to each distributor's committed calls, as a bar: today's share, then what this adds. */
export function TrackCostBars({ connectors, onRaise }: { connectors: readonly BudgetShare[]; onRaise?: (connectorId: string) => void }) {
  return (
    <ul className="space-y-2" aria-label="Daily call limit">
      {connectors.map((item) => {
        const capacity = Math.max(item.capacity, 1);
        const today = Math.min(100, Math.round((Math.max(item.committed - (item.adds_calls ?? 0), 0) / capacity) * 100));
        const adds = Math.min(100 - today, Math.round(((item.adds_calls ?? 0) / capacity) * 100));
        const waiting = item.waiting_new ?? 0;
        return (
          <li key={item.connector_id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <VendorName provider="" name={item.name} className="font-medium" />
              <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                {(item.adds_calls ?? 0) > 0 ? `+${item.adds_calls} calls a day` : "adds nothing"}
                {waiting > 0 ? <span className="bg-warning/15 px-2 py-0.5 text-warning">{waiting} wait for room</span> : null}
              </span>
            </div>
            <div
              role="progressbar" aria-label={`${item.name} committed calls`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={today + adds}
              className="flex h-2 overflow-hidden bg-muted"
            >
              <div className="h-full bg-primary/50" style={{ width: `${today}%` }} />
              <div className={waiting > 0 ? "h-full bg-warning" : "h-full bg-primary"} style={{ width: `${adds}%` }} />
            </div>
            {waiting > 0 && onRaise ? (
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onRaise(item.connector_id)}>Raise the budget</Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
