// react-doctor-disable-next-line prefer-dynamic-import - the whole module is loaded with React.lazy (see runway-section)
import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { SupplyInsightsPage } from "@/types/supply";

const CONFIG: ChartConfig = {
  short: { label: "Runs out before an order could arrive", color: "hsl(var(--destructive))" },
  fine: { label: "Lasts longer than the lead time", color: "hsl(var(--primary))" },
};

type Point = SupplyInsightsPage["scatter"][number];

/** Days of stock left against the quoted lead time. Above the line a part runs out before an order could arrive. A dot opens the part. */
export default function RunwayScatter({ points, onOpen }: { points: Point[]; onOpen: (partId: string) => void }) {
  const short = points.filter((point) => point.days_to_zero < point.lead_days);
  const fine = points.filter((point) => point.days_to_zero >= point.lead_days);
  const top = Math.max(30, ...points.map((point) => Math.max(point.days_to_zero, point.lead_days)));
  const open = (point: { payload?: Point }) => { if (point.payload) onOpen(point.payload.part_id); };
  return (
    <div role="img" aria-label="Days of stock left against lead time" className="w-full">
      <ChartContainer config={CONFIG} className="aspect-auto h-64 w-full">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="days_to_zero" name="Days of stock left" domain={[0, top]} tickLine={false} label={{ value: "Days of stock left", position: "insideBottom", offset: -8, fontSize: 11 }} />
          <YAxis type="number" dataKey="lead_days" name="Lead time" domain={[0, top]} tickLine={false} width={40} label={{ value: "Lead time (days)", angle: -90, position: "insideLeft", fontSize: 11 }} />
          <ZAxis range={[40, 40]} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: top, y: top }]} strokeDasharray="4 4" />
          <Tooltip cursor={false} formatter={(value, name) => [`${value} days`, name]} labelFormatter={() => ""} content={({ payload }) => {
            const row = payload?.[0]?.payload as Point | undefined;
            return row ? <div className="border bg-background px-2 py-1 text-xs"><div className="font-medium">{row.mpn}</div><div>{row.manufacturer}</div><div>{row.days_to_zero} days left, lead time {row.lead_days}</div></div> : null;
          }} />
          <Scatter name="Runs out before an order could arrive" data={short} fill="var(--color-short)" isAnimationActive={false} onClick={open} cursor="pointer" />
          <Scatter name="Lasts longer than the lead time" data={fine} fill="var(--color-fine)" isAnimationActive={false} onClick={open} cursor="pointer" />
        </ScatterChart>
      </ChartContainer>
    </div>
  );
}
