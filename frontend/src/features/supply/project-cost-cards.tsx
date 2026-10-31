import { lazy, Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectSupply } from "@/types/supply";
import { BarList } from "./bar-list";
import { ChartCard } from "./chart-card";
import { formatPrice } from "./supply-format";

const CostCurveChart = lazy(() => import("./project-cost-chart"));
const CostHistoryChart = lazy(() => import("./project-cost-chart").then((module) => ({ default: module.CostHistoryChart })));

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** The cost of a board at 1, 10, 100, 1,000 and 10,000 boards, and where the money of the chosen build goes. */
export function ProjectCostCards({ supply, boards, onOpenPart }: { supply: ProjectSupply; boards: number; onOpenPart: (partId: string) => void }) {
  const currency = supply.rollup?.currency;
  const curve = supply.cost_curve ?? [];
  const money = supply.money;
  if (!currency || (curve.length === 0 && !money)) return null;
  const first = curve.find((point) => point.cost_per_board !== null);
  const last = [...curve].reverse().find((point) => point.cost_per_board !== null);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {first && last && first !== last ? (
        <ChartCard
          title="Cost per board by build size"
          answer={`${formatPrice(first.cost_per_board as string, currency, 2)} for one board, ${formatPrice(last.cost_per_board as string, currency, 2)} at ${last.boards.toLocaleString()}`}
        >
          <Suspense fallback={<Skeleton className="h-44 w-full" />}><CostCurveChart curve={curve} chosen={boards} currency={currency} /></Suspense>
        </ChartCard>
      ) : null}
      {money ? (
        <ChartCard title="Cost allocation" answer={`${money.lines.length} of the lines cost ${percent(1 - money.other.share)} of ${formatPrice(money.total, currency, 2)}`}>
          <BarList
            labelWidth="11rem"
            rows={[
              ...money.lines.map((item) => ({
                key: item.key, label: `${item.mpn} · ${percent(item.share)}`, value: Number(item.cost),
                onClick: item.part_id ? () => onOpenPart(item.part_id as string) : undefined,
              })),
              ...(money.other.count > 0 ? [{ key: "other", label: `Other ${money.other.count} lines · ${percent(money.other.share)}`, value: Number(money.other.cost), tone: "bg-muted-foreground/40" }] : []),
            ]}
          />
        </ChartCard>
      ) : null}
    </div>
  );
}

/** The cost of a board over time, with the days left out because one price read wrong. */
export function ProjectCostHistory({ supply }: { supply: ProjectSupply }) {
  const points = supply.cost_history ?? [];
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  // One series is in one currency (a currency change starts a new one): the points' own, not today's rollup's.
  const currency = last.currency;
  const change = Number(last.cost_per_board) - Number(first.cost_per_board);
  const left = supply.cost_history_left_out ?? [];
  return (
    <ChartCard
      title="Cost over time"
      answer={`${formatPrice(last.cost_per_board, currency, 2)} a board at ${last.boards.toLocaleString()} ${last.boards === 1 ? "board" : "boards"} now, ${change === 0 ? "unchanged" : `${change > 0 ? "up" : "down"} ${formatPrice(String(Math.abs(change)), currency, 2)}`} since ${first.day}`}
    >
      <Suspense fallback={<Skeleton className="h-32 w-full" />}><CostHistoryChart points={points} currency={currency} /></Suspense>
      {left.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Left out as one price read wrong: {left.map((point) => `${point.day} (${formatPrice(point.cost_per_board, currency, 2)})`).join(", ")}.
        </p>
      ) : null}
    </ChartCard>
  );
}
