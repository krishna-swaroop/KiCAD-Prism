import { cn } from "@/lib/utils";
import { ChartCard } from "./chart-card";

export type HolderKey = "none" | "one" | "two" | "three_plus" | "unknown";

const HOLDERS: Array<{ key: HolderKey; label: string; stroke: string; swatch: string }> = [
  { key: "none", label: "No distributor", stroke: "stroke-destructive", swatch: "bg-destructive" },
  { key: "one", label: "One distributor", stroke: "stroke-warning", swatch: "bg-warning" },
  { key: "two", label: "Two", stroke: "stroke-primary/60", swatch: "bg-primary/60" },
  { key: "three_plus", label: "Three or more", stroke: "stroke-success", swatch: "bg-success" },
];

const RADIUS = 15.9155;

/** How many distributors hold stock of each part, as a donut. "One" is the single-source exposure. */
export function HoldersCard({ holders, onOpen }: { holders: Record<HolderKey, number>; onOpen: (key: HolderKey) => void }) {
  const total = HOLDERS.reduce((sum, item) => sum + holders[item.key], 0);
  let offset = 25;
  const arcs = HOLDERS.map((item) => {
    const share = (holders[item.key] / (total || 1)) * 100;
    const arc = { item, share, offset };
    offset -= share;
    return arc;
  });
  return (
    <ChartCard
      title="Where stock is held"
      answer={holders.one === 0 ? "No part depends on a single distributor" : `${holders.one.toLocaleString()} ${holders.one === 1 ? "part depends" : "parts depend"} on one distributor`}
    >
      <div className="flex items-center gap-4">
        <svg role="img" aria-label="Parts by number of distributors holding stock" viewBox="0 0 36 36" className="h-24 w-24 shrink-0">
          <circle cx="18" cy="18" r={RADIUS} fill="none" className="stroke-muted" strokeWidth="5" />
          {total > 0 ? arcs.map(({ item, share, offset: start }) => (
            <circle key={item.key} cx="18" cy="18" r={RADIUS} fill="none" className={item.stroke} strokeWidth="5" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={start} />
          )) : null}
        </svg>
        <ul className="space-y-1 text-xs">
          {HOLDERS.map((item) => (
            <li key={item.key}>
              <button type="button" className="flex items-center gap-1.5 hover:underline" onClick={() => onOpen(item.key)}>
                <span className={cn("inline-block h-2.5 w-2.5", item.swatch)} />{item.label} <span className="tabular-nums text-muted-foreground">{holders[item.key]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}
