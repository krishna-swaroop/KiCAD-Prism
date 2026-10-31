import type { BudgetConnector } from "@/types/supply";

function hoursMinutes(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

interface Segment {
  id: string;
  label: string;
  calls: number;
  tone: string;
}

/** The day's budget as it stands: what was spent (tracking, people, spare), then what is left as kept for scheduled work, kept for people, free, and the margin. */
export function daySegments(item: BudgetConnector): Segment[] {
  const left = Math.max(0, item.daily_budget - item.spent);
  const scheduled = Math.min(item.free?.scheduled ?? 0, left);
  const kept = Math.min(item.free?.kept_for_people ?? 0, left - scheduled);
  const free = Math.min(item.free?.free ?? 0, left - scheduled - kept);
  return [
    { id: "tracking", label: "Spent on tracking", calls: item.committed.spent, tone: "bg-primary" },
    { id: "people", label: "Spent by people and one-off checks", calls: item.pool.spent, tone: "bg-warning" },
    { id: "spare", label: "Spent on spare work", calls: item.spare_spent, tone: "bg-success" },
    { id: "scheduled", label: "Kept for scheduled work", calls: scheduled, tone: "bg-primary/30" },
    { id: "kept", label: "Kept for people", calls: kept, tone: "bg-warning/30" },
    { id: "free", label: "Left today", calls: free, tone: "bg-success/30" },
    { id: "margin", label: "Margin", calls: left - scheduled - kept - free, tone: "bg-muted-foreground/20" },
  ].filter((segment) => segment.calls > 0);
}

/** One bar for the whole day, open on the card, with what is free under it. */
export function DayBar({ item }: { item: BudgetConnector }) {
  const segments = daySegments(item);
  const total = Math.max(1, item.daily_budget);
  const summary = segments.map((segment) => `${segment.label} ${segment.calls}`).join(", ");
  return (
    <>
      <div role="img" aria-label={`Today's calls: ${summary || "nothing spent"} of ${item.daily_budget}`} className="flex h-1.5 overflow-hidden bg-muted">
        {segments.map((segment) => <div key={segment.id} title={`${segment.label}: ${segment.calls}`} className={`h-full ${segment.tone}`} style={{ width: `${(segment.calls / total) * 100}%` }} />)}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {item.free ? `${item.free.free.toLocaleString()} ${item.free.free === 1 ? "call" : "calls"} left today. ` : ""}Resets in {hoursMinutes(item.reset_in_seconds)}.
      </p>
    </>
  );
}
