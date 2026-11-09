// react-doctor-disable-next-line prefer-dynamic-import - the whole module is loaded with React.lazy (see market-history)
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { SupplyMarketHistory } from "@/types/supply";
import { formatDay } from "./supply-format";
import { marketRows, type MarketColumn } from "./market-model";

const COLOURS = ["hsl(var(--primary))", "#0070bb", "#4eb661", "#ff2100", "#a855f7", "#f59e0b"];

/** One line per group over the stored days. Shares are drawn as percentages. */
export default function MarketChart({ series, column, dots = false }: { series: SupplyMarketHistory["series"]; column: MarketColumn; dots?: boolean }) {
  const config: ChartConfig = Object.fromEntries(series.map((line, index) => [`s${index}`, { label: line.scope, color: COLOURS[index % COLOURS.length] }]));
  const share = column.kind === "share";
  const show = (value: number) => (share ? `${Math.round(value * 100)}%` : column.kind === "index" ? value.toFixed(1) : `${Math.round(value)} d`);
  return (
    <div role="img" aria-label={`${column.label} over time`} className="w-full">
      <ChartContainer config={config} className="aspect-auto h-52 w-full">
        <LineChart data={marketRows(series)} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={36} tickMargin={6} tickFormatter={(value) => formatDay(String(value))} />
          <YAxis width={44} tickLine={false} axisLine={false} domain={share ? [0, 1] : column.kind === "index" ? ["auto", "auto"] : [0, "auto"]} tickFormatter={show} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(label) => formatDay(String(label))} valueFormatter={(value) => show(Number(value))} />} />
          {series.map((line, index) => (
            <Line key={`${line.kind}:${line.scope}`} dataKey={`s${index}`} type="monotone" stroke={`var(--color-s${index})`} strokeWidth={2} dot={dots ? { r: 3 } : false} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
