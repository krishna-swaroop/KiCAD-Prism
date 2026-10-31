import { useCallback } from "react";
import { Link } from "react-router-dom";

import type { BudgetCall, BudgetConnector } from "@/types/supply";
import { partHref } from "./supply-views";
import { getBudget } from "./tracking-api";
import { useLoaded } from "./use-loaded";

const PURPOSES: ReadonlyArray<{ id: string; label: string; tone: string }> = [
  { id: "tier1", label: "Tier 1", tone: "bg-primary" },
  { id: "tier2", label: "Tier 2", tone: "bg-primary/60" },
  { id: "committed", label: "Committed", tone: "bg-primary/40" },
  { id: "interactive", label: "People", tone: "bg-warning" },
  { id: "oneoff", label: "One-off", tone: "bg-warning/60" },
  { id: "spare", label: "Spare", tone: "bg-success" },
];

function hoursMinutes(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function totalsByPurpose(rows: readonly BudgetCall[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.purpose, (totals.get(row.purpose) ?? 0) + row.calls);
  return totals;
}

/** What a day's calls were for, as the hover says it. */
function daySplit(rows: readonly BudgetCall[], day: string): string {
  const parts = PURPOSES.flatMap((purpose) => {
    const calls = rows.reduce((sum, row) => sum + (row.day === day && row.purpose === purpose.id ? row.calls : 0), 0);
    return calls > 0 ? [`${purpose.label} ${calls}`] : [];
  });
  return `${day}: ${parts.join(", ") || "no calls"}`;
}

/** Fourteen days as stacked bars, one per day, split by what the calls were for, with the daily budget as a line and a legend. */
function Days({ rows, budget }: { rows: readonly BudgetCall[]; budget: number }) {
  const days = [...new Set(rows.map((row) => row.day ?? ""))].sort();
  const peak = Math.max(1, budget, ...days.map((day) => rows.reduce((sum, row) => sum + (row.day === day ? row.calls : 0), 0)));
  const used = new Set(rows.map((row) => row.purpose));
  return (
    <div className="space-y-1">
      <div className="relative flex h-16 items-end gap-0.5" role="img" aria-label="Calls a day for the last two weeks">
        {days.map((day) => (
          <div key={day} className="flex h-full flex-1 flex-col-reverse" title={daySplit(rows, day)}>
            {PURPOSES.map((purpose) => {
              const calls = rows.reduce((sum, row) => sum + (row.day === day && row.purpose === purpose.id ? row.calls : 0), 0);
              return calls > 0 ? <div key={purpose.id} className={purpose.tone} style={{ height: `${(calls / peak) * 100}%` }} /> : null;
            })}
          </div>
        ))}
        {budget > 0 ? <div aria-hidden title={`Daily budget ${budget}`} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-destructive" style={{ bottom: `${(budget / peak) * 100}%` }} /> : null}
      </div>
      <ul className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground" aria-label="What the days' calls were for">
        {PURPOSES.filter((purpose) => used.has(purpose.id)).map((purpose) => (
          <li key={purpose.id}><span className={`mr-1 inline-block h-2 w-2 ${purpose.tone}`} />{purpose.label}</li>
        ))}
        {budget > 0 ? <li><span className="mr-1 inline-block h-0 w-3 border-t border-dashed border-destructive align-middle" />Daily budget {budget.toLocaleString()}</li> : null}
      </ul>
    </div>
  );
}

/** Where a connector's budget goes today and what tracking costs, shown under its card's Calls today bar. */
export function BudgetDetail({ item }: { item: BudgetConnector }) {
  const today = totalsByPurpose(item.hourly);
  const standing = item.tracking;
  return (
    <div aria-label={`${item.name} call budget`} className="space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">
        Day resets in {hoursMinutes(item.reset_in_seconds)}{item.shares_account ? ", shares its budget with another connector" : ""}
      </p>
      {item.refused_today > 0 ? <p className="text-xs text-warning">{item.refused_today} calls turned away today.</p> : null}
      {standing ? (
        <p className="text-xs text-muted-foreground">
          Tracking promises {standing.committed} of {standing.capacity} calls a day, for {standing.admitted} parts{standing.waiting > 0 ? `; ${standing.waiting} wait for room` : ""}.
        </p>
      ) : null}
      {item.quotes.of > 0 ? (
        <p className="text-xs text-muted-foreground">Gives a price for {item.quotes.parts.toLocaleString()} of {item.quotes.of.toLocaleString()} tracked parts.</p>
      ) : null}
      {item.searches_pending > 0 ? (
        <p className="text-xs text-muted-foreground">
          {item.searches_pending.toLocaleString()} watched {item.searches_pending === 1 ? "part has" : "parts have"} not been searched here yet.
        </p>
      ) : null}
      <ul className="flex flex-wrap gap-x-3 text-xs text-muted-foreground" aria-label="Spent today">
        {PURPOSES.filter((purpose) => today.has(purpose.id)).map((purpose) => (
          <li key={purpose.id}><span className={`mr-1 inline-block h-2 w-2 ${purpose.tone}`} />{purpose.label} {today.get(purpose.id)}</li>
        ))}
      </ul>
      <Days rows={item.days} budget={item.daily_budget} />
      {item.owners.projects.length > 0 || item.owners.parts.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">What costs most</summary>
          <ul className="mt-1 space-y-0.5">
            {item.owners.projects.map((project) => (
              <li key={project.project_id}>
                {project.project_id ? (
                  <Link to={`/project/${encodeURIComponent(project.project_id)}?section=supply`} className="text-primary hover:underline">
                    {project.project_name || project.project_id}
                  </Link>
                ) : "Not in a project"}
                : {project.calls_a_day.toFixed(1)} calls a day
              </li>
            ))}
            {item.owners.parts.slice(0, 5).map((part) => (
              <li key={part.part_id} className="text-muted-foreground">
                <Link to={partHref(part.part_id)} className="text-primary hover:underline">{part.mpn}</Link>
                , {part.manufacturer}: {part.calls_a_day.toFixed(2)} a day{part.pick_saves > 0 ? `, a packaging pick saves ${part.pick_saves.toFixed(2)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** Every metered connector's budget, for the cards. Empty when it cannot be read. */
export function useBudget(): BudgetConnector[] {
  const fetcher = useCallback((signal: AbortSignal) => getBudget(signal), []);
  const { data } = useLoaded<BudgetConnector[]>("connectors/budget", fetcher, "Could not load the call budget");
  return data ?? [];
}
