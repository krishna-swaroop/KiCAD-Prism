import { cn } from "@/lib/utils";
import type { SupplyDashboard } from "@/types/supply";
import { ChartCard } from "./chart-card";

type RunwayKey = keyof SupplyDashboard["runway"];

const RUNWAY: Array<{ key: RunwayKey; label: string; bad: boolean }> = [
  { key: "out_now", label: "Out now", bad: true },
  { key: "runs_out_2w", label: "Under 2 weeks", bad: true },
  { key: "runs_out_8w", label: "2 to 8 weeks", bad: false },
  { key: "runs_out_later", label: "Later", bad: false },
  { key: "steady", label: "Steady or rising", bad: false },
  { key: "few_readings", label: "Too few readings", bad: false },
];

/** When stock is projected to run out, as bars by bucket. A bar opens the parts in it. */
export function RunwayCard({ runway, onOpen }: { runway: SupplyDashboard["runway"]; onOpen: (key: RunwayKey) => void }) {
  const largest = Math.max(1, ...RUNWAY.map((item) => runway[item.key]));
  const soon = runway.out_now + runway.runs_out_2w;
  return (
    <ChartCard
      title="Projected stock"
      info="Projected from each part's own readings at the rate its stock has been falling. Parts with too few readings are not guessed at."
      answer={soon === 0 ? "Nothing runs out within 2 weeks" : `${soon.toLocaleString()} ${soon === 1 ? "part is" : "parts are"} out or run out within 2 weeks`}
    >
      <ul className="space-y-1">
        {RUNWAY.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className="grid w-full grid-cols-[8rem_1fr_3rem] items-center gap-2 text-left text-xs hover:bg-muted/30"
              onClick={() => onOpen(item.key)}
              aria-label={`${item.label}: ${runway[item.key]}`}
            >
              <span>{item.label}</span>
              <span className="h-4 bg-muted/30"><span className={cn("block h-full", item.bad ? "bg-destructive" : "bg-primary")} style={{ width: `${(runway[item.key] / largest) * 100}%` }} /></span>
              <span className="text-right tabular-nums">{runway[item.key]}</span>
            </button>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
