import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SupplyMarket, SupplyMarketScope } from "@/types/supply";
import { ChartCard } from "./chart-card";
import { Sparkline } from "./sparkline";
import { MarketHistory } from "./market-history";
import { marketChange, marketFigure, type MarketColumn } from "./market-model";
import { marketColumns } from "./insights-shown";

/** How bad a figure is, as a tint behind it. Price index is not good or bad. */
function tint(column: MarketColumn, value: number | undefined): string {
  if (value === undefined) return "";
  if (column.kind === "share") return value >= 0.25 ? "bg-destructive/15" : value >= 0.1 ? "bg-warning/15" : "";
  if (column.kind === "days") return value >= 112 ? "bg-destructive/15" : value >= 56 ? "bg-warning/15" : "";
  return "";
}

function Arrow({ column, scope }: { column: MarketColumn; scope: SupplyMarketScope }) {
  const metric = scope.metrics[column.key];
  if (!metric || metric.before === null) return null;
  const delta = metric.value - metric.before;
  if (Math.abs(delta) < 1e-9) return null;
  const worse = column.kind !== "index" && delta > 0;
  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  return <Icon aria-label={marketChange(column, metric)} className={cn("ml-1 inline h-3 w-3", worse ? "text-destructive" : "text-muted-foreground")} />;
}

/** The followed parts as a group: five figures as cards, one over time, and the makers and categories as a tinted table. */
export function MarketSection({ market, trends = {}, onOpenGroup }: { market: SupplyMarket; trends?: Record<string, number[]>; onOpenGroup: (name: string) => void }) {
  const columns = useMemo(() => marketColumns(market), [market]);
  const [picked, setColumn] = useState<MarketColumn | null>(null);
  const column = picked && columns.includes(picked) ? picked : columns[0];
  const [kind, setKind] = useState<"manufacturer" | "category">("manufacturer");
  const [sortBy, setSortBy] = useState<string>("sample");
  const all = market.scopes.find((scope) => scope.kind === "all");
  const groups = useMemo(() => {
    const rows = market.scopes.filter((scope) => scope.kind === kind);
    const value = (scope: SupplyMarketScope) => (sortBy === "sample" ? scope.sample : scope.metrics[sortBy as MarketColumn["key"]]?.value ?? -1);
    return [...rows].sort((a, b) => value(b) - value(a));
  }, [market.scopes, kind, sortBy]);

  if (!column) return null;
  return (
    <div className="space-y-3">
      {all ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {columns.filter((item) => all.metrics[item.key] !== undefined).map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={item.key === column.key}
              onClick={() => setColumn(item)}
              className={cn("flex flex-col gap-1 border p-3 text-left hover:bg-muted/30", item.key === column.key && "bg-muted/50")}
            >
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{item.label}</span>
              <span className="text-2xl font-semibold tabular-nums">{marketFigure(item, all.metrics[item.key])}<Arrow column={item} scope={all} /></span>
              <span className="flex items-end justify-between gap-2 text-xs text-muted-foreground">
                {marketChange(item, all.metrics[item.key]) || `${all.sample} parts`}
                {(trends[item.key]?.length ?? 0) > 1 ? <Sparkline values={trends[item.key]} label={`${item.label} over time`} width={64} height={20} /> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <ChartCard title={`${column.label} over time`} info={`Your own parts, not the market. A group shows with at least ${market.min_sample ?? 3} parts. One reading is stored a day.`}>
        <MarketHistory column={column} />
      </ChartCard>
      <div className="space-y-2">
        <div role="group" aria-label="Group by" className="flex gap-1">
          <Button size="sm" variant={kind === "manufacturer" ? "secondary" : "ghost"} aria-pressed={kind === "manufacturer"} onClick={() => setKind("manufacturer")}>Makers</Button>
          <Button size="sm" variant={kind === "category" ? "secondary" : "ghost"} aria-pressed={kind === "category"} onClick={() => setKind("category")}>Categories</Button>
        </div>
        {groups.length === 0 ? null : (
          <div className="themed-scrollbar overflow-x-auto border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-2">{kind === "manufacturer" ? "Maker" : "Category"}</th>
                  <th className="p-2 text-right"><button type="button" onClick={() => setSortBy("sample")} aria-label="Sort by parts">Parts</button></th>
                  {columns.map((item) => <th key={item.key} className="p-2"><button type="button" className="uppercase" onClick={() => setSortBy(item.key)} aria-label={`Sort by ${item.label}`}>{item.label}</button></th>)}
                </tr>
              </thead>
              <tbody>
                {groups.map((scope) => (
                  <tr key={`${scope.kind}:${scope.scope}`} className="border-t">
                    <th scope="row" className="p-2 text-left font-medium"><button type="button" className="hover:underline" onClick={() => onOpenGroup(scope.scope)}>{scope.scope}</button></th>
                    <td className="p-2 text-right tabular-nums">{scope.sample}</td>
                    {columns.map((item) => (
                      <td key={item.key} className={cn("p-2 tabular-nums", tint(item, scope.metrics[item.key]?.value))}>
                        {marketFigure(item, scope.metrics[item.key])}<Arrow column={item} scope={scope} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {market.day ? <p className="text-xs text-muted-foreground">Snapshot of {market.day}{market.compared_with ? `, changes against ${market.compared_with}` : ""}</p> : null}
    </div>
  );
}
