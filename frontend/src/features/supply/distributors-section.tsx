import type { PartsFilter, SupplyDistributorBehaviour } from "@/types/supply";
import { ChartCard } from "./chart-card";
import { ScorecardTable } from "./scorecard-table";
import { vendorColor } from "./vendor-colors";

interface Bar {
  name: string;
  value: number;
  label: string;
}

/** The distributor's own colour: its display name starts with its provider ("TME AT", "DigiKey"). */
function colourOf(name: string): string {
  return vendorColor(name.split(/\s/)[0]) ?? "hsl(var(--primary))";
}

function Bars({ title, info, empty, rows, filter, onOpen }: {
  title: string; info?: string; empty: string; rows: Bar[];
  /** The kind of filter a bar opens, with the distributor's name as its value. */
  filter: "repricing" | "leader" | "restock_first";
  onOpen: (filter: PartsFilter) => void;
}) {
  const largest = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ChartCard title={title} info={info}>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.name}>
              <button type="button" className="grid w-full grid-cols-[7rem_1fr_5rem] items-center gap-2 text-left text-xs hover:bg-muted/30" aria-label={`${row.name}: ${row.label}`} onClick={() => onOpen(`${filter}:${row.name}`)}>
                <span className="truncate">{row.name}</span>
                <span className="h-4 bg-muted/30"><span className="block h-full" style={{ width: `${(row.value / largest) * 100}%`, backgroundColor: colourOf(row.name) }} /></span>
                <span className="text-right tabular-nums">{row.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

/** How each distributor behaves across every tracked part: how often it changes price, who moves first, who restocks first, arrivals. */
export function DistributorsSection({ distributors, onOpen }: { distributors: SupplyDistributorBehaviour; onOpen: (filter: PartsFilter) => void }) {
  const arrivals = distributors.arrivals;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {distributors.scorecard ? <ScorecardTable scorecard={distributors.scorecard} /> : null}
      <Bars
        title="Days between price changes"
        info="The median over the parts each distributor prices. Needs several price changes per part, so a new install shows little."
        empty="Not enough price changes seen yet."
        rows={distributors.repricing.map((item) => ({ name: item.name, value: item.days, label: `${item.days} days` }))}
        filter="repricing" onOpen={onOpen}
      />
      <Bars
        title="Moves price first"
        info="Parts where this distributor's price change was followed by another's within two weeks."
        empty="No price change has been followed yet."
        rows={distributors.leaders.map((item) => ({ name: item.name, value: item.parts, label: `${item.parts} ${item.parts === 1 ? "part" : "parts"}` }))}
        filter="leader" onOpen={onOpen}
      />
      <Bars
        title="Restocks first"
        empty="No restock order seen yet."
        rows={distributors.restock_first.map((item) => ({ name: item.name, value: item.parts, label: `${item.parts} ${item.parts === 1 ? "part" : "parts"}` }))}
        filter="restock_first" onOpen={onOpen}
      />
      <ChartCard title="Arrivals on time" info="Announced arrival dates that were met within a week.">
        {arrivals ? (
          <p className="text-2xl font-semibold tabular-nums">{Math.round((arrivals.on_time / arrivals.resolved) * 100)}%<span className="ml-2 text-sm font-normal text-muted-foreground">of {arrivals.resolved} announced arrivals</span></p>
        ) : <p className="text-sm text-muted-foreground">Needs a few announced arrivals to have come or slipped.</p>}
      </ChartCard>
    </div>
  );
}
