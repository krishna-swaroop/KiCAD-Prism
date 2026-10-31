import { Maximize2 } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { PartForecast, PartHistory } from "@/types/supply";
import { HistoryLegend } from "./history-legend";
import { PartHistoryDialog } from "./part-history-dialog";
import { TOTAL_KEY, type HistoryKind } from "./part-history-model";
import { formatPrice } from "./supply-format";
import { useHidden } from "./use-hidden";

const PartHistoryChart = lazy(() => import("./part-history-chart"));

function ChartButton({ kind, label, onOpen, children }: { kind: HistoryKind; label: string; onOpen: (kind: HistoryKind) => void; children: ReactNode }) {
  return (
    <div className="group relative">
      {children}
      <Button
        type="button" size="icon" variant="ghost" className="absolute right-1 top-0 h-6 w-6 opacity-60 hover:opacity-100"
        aria-label={label} title={label} onClick={() => onOpen(kind)}
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Every key the legend lists: the distributors drawn, and the total on the stock chart. */
function legendKeys(history: PartHistory, withTotal: boolean): string[] {
  return [...history.connectors.map((line) => line.connector_id), ...(withTotal ? [TOTAL_KEY] : [])];
}

/** The latest figure of each line: its stock, or its price in the base currency. */
function latest(history: PartHistory, kind: "stock" | "price"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of history.connectors) {
    const last = (kind === "stock" ? line.stock : line.price).at(-1);
    if (last) out[line.connector_id] = kind === "stock" ? last[1].toLocaleString() : formatPrice(String(last[1]), history.currency);
  }
  const total = history.total.at(-1);
  if (kind === "stock" && total) out[TOTAL_KEY] = total[1].toLocaleString();
  return out;
}

/**
 * One chart of the part over the last 90 days, a line per distributor, under a legend that switches them. Stock or price: the
 * sheet shows each under its own heading. A chart opens larger with a choice of timeframe.
 */
export function PartHistoryPanel({ partId, history, kind, threshold = null, forecast = null }: {
  partId: string;
  history: PartHistory | null | undefined;
  kind: "stock" | "price";
  threshold?: number | null;
  forecast?: PartForecast | null;
}) {
  const { hidden, pick } = useHidden();
  const [opened, setOpened] = useState<HistoryKind | null>(null);
  const drawn = history ? { ...history, connectors: history.connectors.filter((line) => kind === "stock" || line.price.length > 0) } : null;
  if (!history || !drawn || drawn.connectors.length === 0) {
    return <p className="text-xs text-muted-foreground">{kind === "stock" ? "History builds up as the part is read." : "Price history builds up as the part is read."}</p>;
  }
  return (
    <div className="space-y-2">
      <HistoryLegend history={drawn} hidden={hidden} onToggle={(key) => pick(key, legendKeys(drawn, kind === "stock"))} withTotal={kind === "stock"} values={latest(drawn, kind)} />
      <ChartButton kind={kind} label={`Open the ${kind} history larger`} onOpen={setOpened}>
        <Suspense fallback={<div className={kind === "stock" ? "h-44" : "h-36"} />}>
          <PartHistoryChart history={history} kind={kind} hidden={hidden} threshold={kind === "stock" ? threshold : undefined} height={kind === "stock" ? undefined : "h-36"} forecast={forecast} />
        </Suspense>
      </ChartButton>
      {opened ? <PartHistoryDialog partId={partId} threshold={threshold} forecast={forecast} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}
