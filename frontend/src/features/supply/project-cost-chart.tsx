// react-doctor-disable-next-line prefer-dynamic-import - the whole module is loaded with React.lazy (see project-cost-cards)
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { ProjectCostPoint } from "@/types/supply";
import { formatDay } from "./supply-format";
import { formatAxisPrice, formatPrice } from "./supply-format";

const CONFIG: ChartConfig = { cost: { label: "Cost of a board", color: "hsl(var(--primary))" } };
const SIZES = [1, 10, 100, 1_000, 10_000];

/** The cost of one board against the build size, a step line on a log axis with the chosen size marked. */
export default function CostCurveChart({ curve, chosen, currency }: { curve: readonly ProjectCostPoint[]; chosen: number; currency: string }) {
  const data = curve.flatMap((point) => (point.cost_per_board === null ? [] : [{ boards: point.boards, cost: Number(point.cost_per_board), total: point.cost_build, short: point.short }]));
  return (
    <div role="img" aria-label="Cost of a board by build size" className="w-full">
      <ChartContainer config={CONFIG} className="aspect-auto h-44 w-full">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="boards" type="number" scale="log" domain={[1, 10_000]} ticks={SIZES} tickLine={false} axisLine={false} tickFormatter={(value: number) => value.toLocaleString()} />
          <YAxis width={56} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(value: number) => formatAxisPrice(value, currency)} />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as { boards: number; cost: number; total: string | null; short: number } | undefined;
              if (!active || !row) return null;
              return (
                <div className="border bg-background px-2.5 py-1.5 text-xs shadow-md">
                  <p className="mb-1 font-medium">{row.boards.toLocaleString()} boards</p>
                  <p>{formatPrice(String(row.cost), currency, 2)} a board{row.total ? `, ${formatPrice(row.total, currency, 2)} in all` : ""}</p>
                  <p className="text-muted-foreground">{row.short === 0 ? "No part is short" : `${row.short} ${row.short === 1 ? "part is" : "parts are"} short`}</p>
                </div>
              );
            }}
          />
          <ReferenceLine x={chosen} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: "chosen", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} ifOverflow="hidden" />
          <Line dataKey="cost" type="stepAfter" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

/** The cost of a board each day, as kept: the days that price every line and are not one price read wrong. */
export function CostHistoryChart({ points, currency }: { points: ReadonlyArray<{ day: string; cost_per_board: string }>; currency: string }) {
  const data = points.map((point) => ({ day: point.day, cost: Number(point.cost_per_board) }));
  return (
    <div role="img" aria-label="Cost of a board over time" className="w-full">
      <ChartContainer config={CONFIG} className="aspect-auto h-32 w-full">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={36} tickFormatter={(value) => formatDay(String(value))} />
          <YAxis width={56} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(value: number) => formatAxisPrice(value, currency)} />
          <Tooltip cursor={false} formatter={(value) => formatPrice(String(value), currency, 2)} labelFormatter={(label) => formatDay(String(label))} />
          <Line dataKey="cost" type="monotone" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
