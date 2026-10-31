import { lazy, Suspense, useCallback } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { SupplyMarketHistory } from "@/types/supply";
import type { MarketColumn } from "./market-model";
import { getSupplyMarketHistory } from "./supply-api";
import { useLoaded } from "./use-loaded";

// Recharts is large, so the chart loads on demand.
const MarketChart = lazy(() => import("./market-chart"));

/** One figure over time, a line per group, for the figure chosen above it. Needs at least two stored days to draw a line. */
export function MarketHistory({ column }: { column: MarketColumn }) {
  const fetcher = useCallback((signal: AbortSignal) => getSupplyMarketHistory(column.key, signal), [column.key]);
  const { status, data } = useLoaded<SupplyMarketHistory>(`insights/market/${column.key}`, fetcher, "Could not load the market history");
  const days = new Set((data?.series ?? []).flatMap((line) => line.points.map(([day]) => day))).size;

  return (
    <div className="space-y-2">
      {status === "loading" ? <Skeleton className="h-52 w-full" aria-label="Loading the history" /> : null}
      {status === "ready" && data && days >= 1 ? (
        <>
          <Suspense fallback={<Skeleton className="h-52 w-full" />}>
            <MarketChart series={data.series} column={column} dots={days <= 14} />
          </Suspense>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {data.series.map((line) => <li key={`${line.kind}:${line.scope}`}>{line.scope} ({line.sample} parts)</li>)}
          </ul>
        </>
      ) : null}
      {status === "ready" && days < 1 ? <p className="text-sm text-muted-foreground">Nothing stored yet. One reading is stored a day.</p> : null}
    </div>
  );
}
