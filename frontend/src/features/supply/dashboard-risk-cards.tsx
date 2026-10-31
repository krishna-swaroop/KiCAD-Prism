import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import type { PartsFilter, SupplyDashboard } from "@/types/supply";
import { ChartCard } from "./chart-card";
import { RISK_AVAILABILITY, RISK_LIFECYCLE } from "./parts-filters";
import { PriceAtQuantity } from "./price-at-quantity";
import { counts } from "./project-row-text";
import { partial } from "./project-row-summary";
import { formatPrice } from "./supply-format";
import { TestDataChip } from "./test-data-chip";

type Lifecycle = SupplyDashboard["risk_grid"][number]["lifecycle"];
type Column = "two_plus" | "one" | "out" | "not_read";

const COLUMNS: Array<{ key: Column; label: string }> = [
  { key: "two_plus", label: "2+ distributors" },
  { key: "one", label: "One" },
  { key: "out", label: "Out" },
  { key: "not_read", label: "Not read" },
];
/** A cell is a risk by where it sits: ending parts with little supply are red, unknown stays grey. */
function toneOf(lifecycle: Lifecycle, column: Column, count: number): string {
  if (count === 0) return "bg-muted/20 text-muted-foreground";
  if (lifecycle === "unknown" || column === "not_read") return "bg-muted-foreground/25";
  const ending = lifecycle !== "active";
  if (column === "out") return ending ? "bg-destructive/70 text-white" : "bg-destructive/40";
  if (column === "one") return ending ? "bg-destructive/40" : "bg-warning/40";
  return ending ? "bg-warning/40" : "bg-success/30";
}

/** Risk distribution: lifecycle against availability. A cell opens the parts behind it. */
export function RiskGridCard({ grid, onOpen }: { grid: SupplyDashboard["risk_grid"]; onOpen: (filter: PartsFilter) => void }) {
  const total = grid.reduce((sum, row) => sum + row.two_plus + row.one + row.out + row.not_read, 0);
  const worst = grid.filter((row) => row.lifecycle !== "active" && row.lifecycle !== "unknown").reduce((sum, row) => sum + row.one + row.out, 0);
  return (
    <ChartCard
      title="Risk Distribution"
      info="Manufacturer lifecycle against how many distributors hold stock. Unknown is its own row and column: it is not counted as fine."
      answer={total === 0 ? "No parts tracked yet" : worst === 0 ? "No ending part is low on stock" : `${worst.toLocaleString()} ending ${worst === 1 ? "part is" : "parts are"} out or held by one distributor`}
    >
      <table className="w-full table-fixed border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="w-1/3" />
            {COLUMNS.map((column) => <th key={column.key} scope="col" className="px-1 pb-1 text-center font-normal text-muted-foreground">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.map((row) => (
            <tr key={row.lifecycle}>
              <th scope="row" className="pr-2 text-left font-normal">{RISK_LIFECYCLE[row.lifecycle] ?? row.lifecycle}</th>
              {COLUMNS.map((column) => {
                const count = row[column.key];
                return (
                  <td key={column.key} className="p-0">
                    <button
                      type="button" disabled={count === 0} onClick={() => onOpen(`risk:${row.lifecycle}.${column.key}`)}
                      aria-label={`${RISK_LIFECYCLE[row.lifecycle]}, ${RISK_AVAILABILITY[column.key]}: ${count}`}
                      className={cn("h-8 w-full tabular-nums hover:opacity-80", toneOf(row.lifecycle, column.key, count))}
                    >
                      {count.toLocaleString()}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  );
}

export const DEADLINE_KIND: Record<SupplyDashboard["deadlines"][number]["kind"], string> = {
  last_time_buy: "Last time buy", last_time_ship: "Last ship", last_buy_date: "Last date to buy",
};
const DAY = 86_400_000;

function inDays(date: string, now: number): number {
  return Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - now) / DAY);
}

/** The dates that cannot be missed in the next year, soonest first, in days; red within 90. */
export function DeadlinesCard({ deadlines, onOpenPart }: { deadlines: SupplyDashboard["deadlines"]; onOpenPart: (partId: string) => void }) {
  const now = Date.now();
  const soon = deadlines.filter((item) => inDays(item.date, now) <= 90).length;
  return (
    <ChartCard
      title="Deadlines"
      info="Last-time-buy and last-ship dates from open product change notices, and the last date to buy a distributor gives, in the next 12 months."
      answer={deadlines.length === 0 ? "No dated deadline in the next year" : soon === 0 ? `${deadlines.length} in the next year, none within 90 days` : `${soon} within 90 days`}
    >
      {deadlines.length === 0 ? null : (
        <ul className="max-h-64 divide-y themed-scrollbar overflow-y-auto text-sm">
          {deadlines.map((item) => {
            const days = inDays(item.date, now);
            return (
              <li key={`${item.part_id}:${item.kind}:${item.date}`} className="flex items-baseline gap-3 py-1.5">
                <button type="button" className="font-medium hover:underline" onClick={() => onOpenPart(item.part_id)}>{item.mpn}</button>
                <span className="flex-1 truncate text-xs text-muted-foreground">{DEADLINE_KIND[item.kind]}</span>
                <span title={item.date} className={cn("text-xs tabular-nums", days <= 90 ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

/** Which product is in trouble: each tracked project with its parts by status, the counts that need a look, boards and cost. */
export function ProjectsTableCard({ projects }: { projects: SupplyDashboard["projects"] }) {
  return (
    <ChartCard
      title="Tracked projects"
      answer={projects.length === 0 ? "No project is tracked yet" : `${projects.length} ${projects.length === 1 ? "project" : "projects"} tracked`}
    >
      {projects.length === 0 ? null : (
        <div className="themed-scrollbar overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">Project</th>
                <th className="py-1 text-right font-normal">At risk</th>
                <th className="py-1 text-right font-normal">Boards covered</th>
                <th className="py-1 text-right font-normal">Cost per board</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const stats = project.stats;
                return (
                  <tr key={project.project_id} className="border-t">
                    <td className="py-1.5">
                      <Link to={`/project/${encodeURIComponent(project.project_id)}?section=supply`} className="font-medium text-primary hover:underline">{project.project_name}</Link>
                      <div className="text-xs text-muted-foreground">{counts({ ...project, tracked: true })}</div>
                    </td>
                    <td className={cn("py-1.5 text-right tabular-nums", stats.at_risk > 0 && "font-medium text-destructive")}>{stats.at_risk}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {stats.unchecked ? (
                        <>
                          <div className="font-medium text-destructive">Unconfirmed</div>
                          <div className="text-xs text-muted-foreground">{stats.boards == null ? "" : `${stats.boards.toLocaleString()} · `}{stats.unchecked} unchecked</div>
                        </>
                      ) : stats.boards ?? "–"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {stats.cost_per_board && stats.currency ? (
                        <PriceAtQuantity price={formatPrice(stats.cost_per_board, stats.currency)} quantity={stats.build_quantity} />
                      ) : "–"}
                      {stats.cost_per_board && partial(stats) ? <div className="text-xs text-muted-foreground">{partial(stats)}</div> : null}
                      <TestDataChip show={stats.cost_per_board ? stats.test_data : false} />
                      {stats.cost_change_percent ? <span className={cn("ml-1 text-xs", stats.cost_change_percent > 0 ? "text-warning" : "text-success")}>{stats.cost_change_percent > 0 ? "▲" : "▼"} {Math.abs(stats.cost_change_percent)}%</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
