import * as React from "react";
// react-doctor-disable-next-line prefer-dynamic-import - this module is only ever reached through React.lazy (see part-sheet), in its own chunk
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

/** What each data key is called and coloured. Colours are CSS colours; theme tokens go in as `hsl(var(--primary))`. */
export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used inside a <ChartContainer />");
  return context;
}

interface ChartContainerProps extends React.ComponentProps<"div"> {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}

/** Sizes a Recharts chart to its box and exposes each config colour as `--color-<key>`. */
function ChartContainer({ id, className, children, config, style, ...props }: ChartContainerProps) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;
  const context = React.useMemo(() => ({ config }), [config]);
  const colors: Record<string, string> = {};
  for (const [key, item] of Object.entries(config)) {
    if (item.color) colors[`--color-${key}`] = item.color;
  }
  return (
    <ChartContext.Provider value={context}>
      <div
        data-slot="chart"
        data-chart={chartId}
        style={{ ...colors, ...style } as React.CSSProperties}
        className={cn(
          "flex aspect-video justify-center text-xs",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line]:stroke-border/60",
          "[&_.recharts-reference-line_line]:stroke-border",
          "[&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: unknown;
}

interface ChartTooltipContentProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: unknown;
  /** The heading, from the x value. */
  labelFormatter?: (label: unknown, payload: ReadonlyArray<TooltipEntry>) => React.ReactNode;
  /** One row per series. */
  valueFormatter?: (value: unknown, key: string, entry: TooltipEntry) => React.ReactNode;
  /** Extra lines under the rows, from the hovered data row. */
  footer?: (row: unknown) => React.ReactNode;
  className?: string;
}

/** The hover card: a heading and one row per series, with the series colour and label from the config. */
function ChartTooltipContent({ active, payload, label, labelFormatter, valueFormatter, footer, className }: ChartTooltipContentProps) {
  const { config } = useChart();
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className={cn("grid min-w-32 gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md", className)}>
      <div className="font-medium">{labelFormatter ? labelFormatter(label, payload) : String(label ?? "")}</div>
      {payload.map((entry) => {
        const key = String(entry.dataKey ?? entry.name ?? "");
        const item = config[key];
        return (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item?.color ?? entry.color }} />
              {item?.label ?? key}
            </span>
            <span className="font-mono font-medium tabular-nums">
              {valueFormatter ? valueFormatter(entry.value, key, entry) : String(entry.value ?? "")}
            </span>
          </div>
        );
      })}
      {footer ? <div className="text-muted-foreground">{footer(payload[0]?.payload)}</div> : null}
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
