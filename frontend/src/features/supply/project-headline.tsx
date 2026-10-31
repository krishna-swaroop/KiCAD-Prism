import { Pencil } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ProjectSupply, SupplyStatus } from "@/types/supply";
import { BoardCount } from "./board-count";
import { StatusBar } from "./project-row-summary";
import { StatusDot } from "./status-dot";
import { formatPrice, STATUS_LABEL } from "./supply-format";
import { TestDataChip } from "./test-data-chip";

function Tile({ label, bad, action, children }: { label: string; bad?: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <div className={`space-y-1 border p-3 ${bad ? "border-destructive/40" : ""}`}>
      <p className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">{label}{action}</p>
      {children}
    </div>
  );
}

const big = (bad: boolean | undefined) => `text-xl font-semibold tabular-nums ${bad ? "text-destructive" : ""}`;

/** The pencil on the Build tile: the number of boards the page is for, and a way to keep it as the project's usual build. */
function BoardsEditor({ boards, usualBuild, onBoards, onKeepUsual }: { boards: number; usualBuild: number | null | undefined; onBoards: (next: number) => void; onKeepUsual: () => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Change the number of boards" title="Change the number of boards"><Pencil className="h-3.5 w-3.5" /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2 p-3">
        <BoardCount key={boards} boards={boards} onChange={onBoards} />
        <p className="text-xs normal-case tracking-normal text-muted-foreground">The costing and the download use it. It is not saved unless you keep it.</p>
        {usualBuild != null && usualBuild !== boards ? (
          <Button size="sm" variant="outline" onClick={onKeepUsual}>Keep {boards.toLocaleString()} as the usual build</Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function BuildTile({ supply, boards, onOpenPart, editor }: { supply: ProjectSupply; boards: number; onOpenPart: (partId: string) => void; editor: ReactNode }) {
  const rollup = supply.rollup!;
  const limiting = (supply.parts ?? []).find((part) => part.key === rollup.limited_by);
  const covered = rollup.can_build;
  const short = covered !== null && covered < boards;
  const limitedBy = short && limiting ? (
    <>limited by{" "}
      {limiting.part_id ? <button type="button" className="text-primary hover:underline" onClick={() => onOpenPart(limiting.part_id as string)}>{limiting.mpn}</button> : limiting.mpn}</>
  ) : null;
  // A line nobody could check (no part number, an unknown or ambiguous part) leaves the answer open, whatever the rest covers.
  const unchecked = rollup.not_tracked;
  if (unchecked > 0) {
    return (
      <Tile label="Build" bad action={editor}>
        <p className={big(true)}>Unconfirmed</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {covered === null ? "" : `${Math.min(covered, boards).toLocaleString()} of ${boards.toLocaleString()} boards · `}{unchecked.toLocaleString()} unchecked
        </p>
        {limitedBy ? <p className="text-xs text-muted-foreground">{limitedBy}</p> : null}
      </Tile>
    );
  }
  return (
    <Tile label="Build" bad={short} action={editor}>
      <p className={big(short)}>{covered === null ? "Not known" : `${Math.min(covered, boards).toLocaleString()} of ${boards.toLocaleString()} boards`}</p>
      <p className="text-xs text-muted-foreground">
        {covered === null ? "No stock figure yet." : limitedBy ?? `The stock covers ${covered.toLocaleString()}.`}
      </p>
    </Tile>
  );
}

function CostTile({ supply, boards }: { supply: ProjectSupply; boards: number }) {
  const rollup = supply.rollup!;
  const currency = rollup.currency;
  if (!rollup.cost_build || !currency) {
    return <Tile label="Cost"><p className={big(false)}>No total</p><p className="text-xs text-muted-foreground">Nothing is priced, or the prices cannot be added.</p></Tile>;
  }
  const waste = rollup.waste_cost && Number(rollup.waste_cost) > 0 ? `${formatPrice(rollup.waste_cost, currency, 2)} left over from minimum orders` : "";
  const spares = supply.attrition_percent === null ? "spares by package" : supply.attrition_percent ? `${supply.attrition_percent}% spares` : "";
  const notes = [waste, spares, rollup.lines_priced < rollup.lines ? `${rollup.lines_priced} of ${rollup.lines} lines priced` : ""].filter(Boolean);
  return (
    <Tile label="Cost">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p><span className={big(false)}>{formatPrice(rollup.cost_build, currency, 2)}</span> <span className="text-xs text-muted-foreground">for {boards.toLocaleString()} boards</span><TestDataChip show={rollup.test_data} /></p>
        {rollup.cost_per_board ? <p><span className={big(false)}>{formatPrice(rollup.cost_per_board, currency, 2)}</span> <span className="text-xs text-muted-foreground">a board</span></p> : null}
      </div>
      {notes.length > 0 ? <p className="text-xs text-muted-foreground">{notes.join(", ")}</p> : null}
    </Tile>
  );
}

const LEGEND: readonly SupplyStatus[] = ["fatal", "error", "warning", "ok", "unknown"];

function HealthTile({ supply }: { supply: ProjectSupply }) {
  const rollup = supply.rollup!;
  const statuses: Partial<Record<SupplyStatus, number>> = {};
  const seen = new Set<string>();
  for (const part of supply.parts ?? []) {
    if (!part.part_id || !part.status || seen.has(part.part_id)) continue;
    seen.add(part.part_id);
    statuses[part.status] = (statuses[part.status] ?? 0) + 1;
  }
  const bad = rollup.health !== null && rollup.health_status !== "ok";
  const looks = Math.max(0, (rollup.needs_a_look ?? rollup.at_risk) - rollup.at_risk);
  return (
    <Tile label="Health" bad={bad && rollup.health_status !== "warning"}>
      <p className={big(bad)}>
        {rollup.health === null ? "No data" : `${rollup.health.toFixed(1)} of 10`}
        {rollup.health === null ? null : <span className="ml-2 text-xs font-normal text-muted-foreground">{STATUS_LABEL[rollup.health_status]}</span>}
      </p>
      <StatusBar group={{ statuses, count: seen.size }} className="w-full" />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
        {LEGEND.filter((status) => (statuses[status] ?? 0) > 0).map((status) => (
          <span key={status} className="flex items-center gap-1"><StatusDot status={status} className="h-2 w-2" />{statuses[status]}</span>
        ))}
        <span>of {seen.size} {seen.size === 1 ? "part" : "parts"}</span>
      </p>
      <p className="text-xs text-muted-foreground">{rollup.at_risk} at risk, {looks} more need a look, {rollup.not_tracked} not tracked</p>
    </Tile>
  );
}

/** How much of the build the stock covers, line by line: the share of every BOM line whose part is in stock for the boards. A line
 *  without a stock figure counts as not covered, so the share is never 100% while a line is unchecked. */
function CoverageTile({ supply, boards }: { supply: ProjectSupply; boards: number }) {
  const lines = supply.parts ?? [];
  const known = lines.filter((part) => part.part_id && part.stock !== null);
  const covered = known.filter((part) => !part.short).length;
  const unknown = lines.length - known.length;
  const share = known.length === 0 ? null : covered / lines.length;
  return (
    <Tile label="Stock coverage" bad={share !== null && share < 0.9}>
      <p className={big(share !== null && share < 0.9)}>{share === null ? "No data" : `${Math.round(share * 100)}%`}</p>
      <p className="text-xs text-muted-foreground">
        {share === null ? "No stock figure yet." : `${covered} of ${lines.length} lines in stock for ${boards.toLocaleString()} boards${known.length > covered ? `, ${known.length - covered} short` : ""}`}
        {unknown > 0 && share !== null ? `, ${unknown} unknown` : ""}
      </p>
    </Tile>
  );
}

/** Four tiles that answer "can we build N boards, and what stops us": the build, its cost, the health of the parts and how much the stock covers. */
export function ProjectHeadline({ supply, boards, onOpenPart, onBoards, onKeepUsual }: {
  supply: ProjectSupply; boards: number; onOpenPart: (partId: string) => void;
  onBoards: (next: number) => void; onKeepUsual: () => void;
}) {
  if (!supply.rollup) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Headline">
      <BuildTile supply={supply} boards={boards} onOpenPart={onOpenPart} editor={supply.available ? <BoardsEditor boards={boards} usualBuild={supply.usual_build} onBoards={onBoards} onKeepUsual={onKeepUsual} /> : null} />
      <CostTile supply={supply} boards={boards} />
      <HealthTile supply={supply} />
      <CoverageTile supply={supply} boards={boards} />
    </div>
  );
}
