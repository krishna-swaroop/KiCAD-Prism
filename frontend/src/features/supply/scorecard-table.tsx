import type { ScorecardRow, SupplyScorecard } from "@/types/supply";
import { ChartCard } from "./chart-card";
import { formatLeadTime } from "./supply-format";

const dash = <span className="text-muted-foreground">-</span>;

function Row({ row, minEvents }: { row: ScorecardRow; minEvents: number }) {
  const first = row.restocked_first;
  const kept = row.promises;
  return (
    <tr className="border-t">
      <td className="py-1 pr-2">{row.name}<span className="block text-xs text-muted-foreground">{row.parts} shared {row.parts === 1 ? "part" : "parts"}</span></td>
      <td className="py-1 text-right tabular-nums" title={`${row.stock_outs.n} stock-outs`}>
        {row.stock_outs.n}
        {row.stock_outs.median_days_out === null ? null : <span className="block text-xs text-muted-foreground">{row.stock_outs.median_days_out} d out</span>}
      </td>
      <td className="py-1 text-right tabular-nums" title={first.first === null ? `Needs ${minEvents} rounds` : undefined}>
        {first.first === null ? dash : <>{first.first} of {first.rounds}</>}
      </td>
      <td className="py-1 text-right tabular-nums" title={kept.kept === null ? `Needs ${minEvents} promises` : undefined}>
        {kept.kept === null ? dash : <>{kept.kept} of {kept.resolved}</>}
        {kept.median_days_late === null ? null : <span className="block text-xs text-muted-foreground">late by {kept.median_days_late} d</span>}
      </td>
      <td className="py-1 text-right tabular-nums" title={row.wait.quoted_days === null ? `Needs ${minEvents} waits` : `Median over ${row.wait.n} waits`}>
        {row.wait.quoted_days === null || row.wait.real_days === null ? dash : <>{formatLeadTime(row.wait.quoted_days)} said, {formatLeadTime(row.wait.real_days)} real</>}
      </td>
      <td className="py-1 text-right tabular-nums">{row.in_stock.share === null ? dash : `${Math.round(row.in_stock.share * 100)}%`}</td>
    </tr>
  );
}

/** Each distributor's record on the parts two or more list, so one that carries the harder parts is not punished. */
export function ScorecardTable({ scorecard }: { scorecard: SupplyScorecard }) {
  const rows = scorecard.distributors;
  return (
    <ChartCard
      title="Scorecard"
      className="lg:row-span-2"
      info={`Only parts that two or more distributors list count. A figure shows from ${scorecard.min_events} events. It needs months of readings to say much.`}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No part is listed by two distributors yet.</p>
      ) : (
        <div className="themed-scrollbar overflow-x-auto overflow-y-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">Distributor</th>
                <th className="py-1 text-right font-normal">Stock-outs</th>
                <th className="py-1 text-right font-normal">Restocked first</th>
                <th className="py-1 text-right font-normal">Promises kept</th>
                <th className="py-1 text-right font-normal">Wait, said and real</th>
                <th className="py-1 text-right font-normal">In stock</th>
              </tr>
            </thead>
            <tbody>{rows.map((row) => <Row key={row.connector_id} row={row} minEvents={scorecard.min_events} />)}</tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
