import { useCallback } from "react";

import type { ForecastInsights, TrackRecordModel } from "@/types/supply";
import { ChartCard } from "./chart-card";
import { ComingUpCard } from "./dashboard-forecast";
import { ModelChip } from "./forecast-chip";
import { getForecastInsights } from "./supply-api";
import { formatLeadTime, formatPrice } from "./supply-format";
import { useLoaded } from "./use-loaded";

const STATE_LABEL = { shown: "Shown", learning: "Learning", paused: "Paused" } as const;

function stateOf(models: TrackRecordModel[], target: string) {
  const found = models.find((model) => model.target === target);
  return found ? { state: found.state, checks: found.checks, needs: found.needs, reason: found.reason } : undefined;
}

const DIRECTION = { stretching: "Stretching", easing: "Easing", flat: "Flat" } as const;

function LeadTimes({ page }: { page: ForecastInsights }) {
  const model = stateOf(page.track_record.models, "lead_90");
  const rows = page.lead_times;
  return (
    <ChartCard title="Lead times ahead" info="The median quoted lead time of each maker and category, three months ahead, from its recent trend." answer={<ModelChip model={model} />}>
        <ul className="max-h-64 space-y-1 themed-scrollbar overflow-y-auto text-sm">
          {rows.map((row) => (
            <li key={`${row.kind}:${row.scope}`} className={`flex items-baseline justify-between gap-3 ${model?.state === "shown" ? "" : "text-muted-foreground"}`}>
              <span className="min-w-0 truncate">{row.scope.replace(/^category:/, "")}</span>
              <span className="shrink-0 tabular-nums">
                <strong>{DIRECTION[row.direction]}</strong>{" "}
                <span className="text-xs text-muted-foreground">{formatLeadTime(Math.round(row.now))} now, {formatLeadTime(Math.round(row.low))} to {formatLeadTime(Math.round(row.high))} in 3 months</span>
              </span>
            </li>
          ))}
        </ul>
    </ChartCard>
  );
}

const METRIC = { out_of_stock: "out of stock", median_lead_time_days: "median lead time", dropped: "dropped by every distributor", lifecycle_risk: "reported as ending" } as const;

function percent(metric: string, value: number): string {
  return metric === "median_lead_time_days" ? formatLeadTime(Math.round(value)) : `${Math.round(value * 100)}%`;
}

function Warnings({ page }: { page: ForecastInsights }) {
  return (
    <ChartCard title="Early warnings" info="A family whose figure moved and stayed moved for two weeks, beyond its usual swings.">
        <ul className="max-h-64 space-y-1 themed-scrollbar overflow-y-auto text-sm">
          {page.warnings.map((warning) => (
            <li key={`${warning.kind}:${warning.scope}:${warning.metric}`}>
              <span className="font-medium">{warning.scope.replace(/^category:/, "")}</span>: {METRIC[warning.metric as keyof typeof METRIC] ?? warning.metric} {warning.direction === "up" ? "up" : "down"} from {percent(warning.metric, warning.before)} to {percent(warning.metric, warning.after)} since {warning.since}
            </li>
          ))}
        </ul>
    </ChartCard>
  );
}

function Prices({ page, currency, onOpenPart }: { page: ForecastInsights; currency: string; onOpenPart: (partId: string) => void }) {
  const model = stateOf(page.track_record.models, "price_90");
  const { prices } = page;
  const rising = prices.likeliest_up.filter((item) => item.change > 0.005);
  return (
    <ChartCard
      title="Prices ahead" info="The cheapest price in 90 days, as a range, for each tracked part. Most stay flat."
      answer={prices.parts === 0 ? undefined : <>{prices.flat} of {prices.parts} {prices.parts === 1 ? "part is" : "parts are"} likely to stay flat <ModelChip model={model} /></>}
    >
        <ul className={`max-h-64 space-y-1 themed-scrollbar overflow-y-auto text-sm ${model?.state === "shown" ? "" : "text-muted-foreground"}`}>
          {rising.map((item) => (
            <li key={item.part_id}>
              <button type="button" className="flex w-full items-baseline justify-between gap-3 text-left hover:underline" onClick={() => onOpenPart(item.part_id)}>
                <span className="min-w-0 truncate font-medium">{item.mpn}</span>
                <span className="shrink-0 tabular-nums text-xs">{formatPrice(String(item.low), currency)} to {formatPrice(String(item.high), currency)}, up {Math.round(item.change * 1000) / 10}%</span>
              </button>
            </li>
          ))}
        </ul>
    </ChartCard>
  );
}

function TrackRecord({ page }: { page: ForecastInsights }) {
  const record = page.track_record;
  return (
    <ChartCard
      title="Track record" className="lg:col-span-2"
      info="Every forecast is kept and compared with what happened. A forecast is shown only while its 80% ranges hold about 80% of the time (a chance: off by no more than 10 points)."
    >
      <div className="themed-scrollbar overflow-x-auto overflow-y-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1 font-normal">Forecast</th><th className="py-1 text-right font-normal">Checks</th><th className="py-1 text-right font-normal">Held</th><th className="py-1 text-right font-normal">State</th></tr>
          </thead>
          <tbody>
            {record.models.map((model) => (
              <tr key={model.target} className="border-t">
                <td className="py-1">{model.label}<span className="block text-xs text-muted-foreground">{model.reason}</span></td>
                <td className="py-1 text-right tabular-nums">{model.checks} of {model.needs}</td>
                <td className="py-1 text-right tabular-nums">{model.score === null ? "-" : `${Math.round(model.score * 100)}%`}</td>
                <td className="py-1 text-right">{STATE_LABEL[model.state]}{model.since && model.state === "shown" ? <span className="block text-xs text-muted-foreground">since {model.since.slice(0, 10)}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Object.entries(record.reliability).flatMap(([target, bins]) => (bins.length === 0 ? [] : [(
        <div key={target} className="mt-3 text-xs">
          <p className="font-medium">{record.models.find((model) => model.target === target)?.label}: said, then happened</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
            {bins.map((bin) => <li key={bin.said}>said {Math.round(bin.said * 100)}%, happened {Math.round(bin.happened * 100)}% ({bin.cases})</li>)}
          </ul>
        </div>
      )]))}
      <p className="mt-3 text-xs text-muted-foreground">
        End of life: {page.lifecycle.changes} of the {page.lifecycle.needs} lifecycle changes needed have been seen.
        {page.lifecycle.last_buy_lag.available
          ? ` A last time buy came a median ${Math.round(page.lifecycle.last_buy_lag.median ?? 0)} months after a first sign (${page.lifecycle.last_buy_lag.cases} parts).`
          : ` The time from a first sign to a last time buy needs ${page.lifecycle.last_buy_lag.needs ?? 5} parts with both; ${page.lifecycle.last_buy_lag.cases} so far.`}
      </p>
    </ChartCard>
  );
}

/** What Prism expects across the tracked parts, and how well its forecasts have done so far. Only cards with something to show. */
export function ForecastInsightsSection({ page, onOpenPart }: { page: ForecastInsights; onOpenPart: (partId: string) => void }) {
  const shown = (target: string) => stateOf(page.track_record.models, target)?.state === "shown";
  const rising = page.prices.likeliest_up.some((item) => item.change > 0.005);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {shown("out_4w") && page.coming_up.length > 0 ? <ComingUpCard events={page.coming_up} today={new Date().toISOString().slice(0, 10)} onOpenPart={onOpenPart} /> : null}
      {shown("lead_90") && page.lead_times.length > 0 ? <LeadTimes page={page} /> : null}
      {page.warnings.length > 0 ? <Warnings page={page} /> : null}
      {shown("price_90") && rising ? <Prices page={page} currency={page.currency} onOpenPart={onOpenPart} /> : null}
      <TrackRecord page={page} />
    </div>
  );
}

/** The forecast figures behind the Insights page, loaded beside it. */
export function useForecastInsights() {
  const fetcher = useCallback((signal: AbortSignal) => getForecastInsights(signal), []);
  return useLoaded<ForecastInsights>("insights/forecasts", fetcher, "Could not load the forecasts");
}
