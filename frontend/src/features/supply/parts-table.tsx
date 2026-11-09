import { useRef } from "react";

import { useWindowedRows } from "@/lib/use-windowed-rows";
import { cn } from "@/lib/utils";
import type { ForecastState, ProjectSupplyPart, SupplyPartRow } from "@/types/supply";
import { PartOfferRows } from "./part-offer-rows";
import type { PartsLayout } from "./parts-layout";
import { clickColumn, columnOf, type PartsSort, type ProjectColumn, type SortColumn } from "./parts-sort";
import { Sparkline } from "./sparkline";
import { StatusDot } from "./status-dot";
import { ariaSort, SortHeader } from "./sort-header";
import { formatStock, PROBLEM_LABEL } from "./supply-format";
import { DistributorSquares, ProjectNames, RowFlags } from "./part-row-extras";
import { PriceCell } from "./price-cell";
import { RowRunout } from "./part-row-forecast";
import { BoardCells, CostCell, LineNotes, LinePriceCell, UnmatchedRow, type ProjectLines } from "./project-line-cells";
import { JlcIcon, LifecycleIcon } from "./supply-icons";

interface PartsTableProps {
  items: SupplyPartRow[];
  selectedId: string | null;
  onOpen: (partId: string) => void;
  /** The state of the forecast models, from the list. */
  forecastState?: Partial<Record<"runout" | "out_4w" | "can_buy_4w" | "can_buy_8w", ForecastState>>;
  /** The column names stay at the top of the scrolling parent. The parent must be the one that scrolls, both ways. */
  stickyHead?: boolean;
  /** Compact is one row a part; detailed adds a row for each vendor under it. */
  layout?: PartsLayout;
  /** Name the projects using each part. Off where the list is already grouped by project. */
  showProjects?: boolean;
  /** What the list is sorted by, and the choice of a new one; the column names sort only when this is given. */
  sort?: PartsSort;
  onSort?: (sort: PartsSort) => void;
  /** A project's own list: its lines add the pieces a board uses, the pieces needed and the line's cost to each part. */
  lines?: ProjectLines;
  /** Lines of the project's BOM that match no part, shown after the parts. */
  unmatched?: ProjectSupplyPart[];
}

export function PartsTable({ items, selectedId, onOpen, forecastState, stickyHead = false, layout = "compact", showProjects = true, sort = "", onSort, lines, unmatched = [] }: PartsTableProps) {
  // The detailed layout gives each vendor a row below the part. On a project's list the stock, price and vendors columns stay, so
  // what the build needs can be read against what is in stock.
  const detailed = layout === "detailed";
  const columnsBelow = detailed && !lines;
  const on = columnOf(sort);
  // A long list (the Tracking list loads as it scrolls) renders the parts near the view, with a spacer for the rest.
  const tableRef = useRef<HTMLTableElement>(null);
  const shown = useWindowedRows(items.length, tableRef);
  const span = lines ? 10 : 7;
  const header = (column: SortColumn | ProjectColumn, label: string, right = true) => {
    // Where stock, price and vendors move to the rows below each part, their column names have nothing under them.
    if (columnsBelow && (column === "stock" || column === "price")) return <th className="px-3 py-2"><span className="sr-only">{label}</span></th>;
    const direction = on?.column === column ? on.direction : null;
    const aria = onSort ? { "aria-sort": ariaSort(direction) } : {};
    return (
      <th className={cn("whitespace-nowrap px-3 py-2", right && "text-right")} {...aria}>
        {onSort ? <SortHeader label={label} direction={direction} align={right ? "right" : "left"} onSort={() => onSort(clickColumn(sort, column))} /> : label}
      </th>
    );
  };
  return (
    <div className={cn("border", !stickyHead && "themed-scrollbar overflow-x-auto overflow-y-hidden")}>
      <table ref={tableRef} className="w-full text-sm">
        {/* The cells stick, not the thead: WebKit lets rows show above a sticky thead in a table of many tbodies. */}
        <thead className={cn(
          "border-b bg-muted/30 text-left text-xs font-medium text-muted-foreground",
          stickyHead && "[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted [&_th]:shadow-[inset_0_-1px_0_var(--border)]",
        )}>
          <tr>
            <th className="w-8 px-3 py-2"><span className="sr-only">Status</span></th>
            {header("part", "Part", false)}
            {lines ? header("per_board", "Per board") : null}
            {lines ? header("need", "Need") : null}
            {header("stock", "In stock")}
            {header("price", "Price")}
            {lines ? header("cost", "Line cost") : null}
            <th className="px-3 py-2 text-right">{columnsBelow ? <span className="sr-only">Vendors</span> : "Vendors"}</th>
            <th className="w-10 px-3 py-2"><span className="sr-only">Lifecycle</span></th>
            <th className="w-10 px-3 py-2"><span className="sr-only">Tracked and flags</span></th>
          </tr>
        </thead>
        {shown.before > 0 ? <tbody aria-hidden="true"><tr><td colSpan={span} style={{ height: shown.before }} /></tr></tbody> : null}
        {items.slice(shown.start, shown.end).map((part) => {
          const line = lines?.byPart.get(part.id);
          return (
            <tbody key={part.id} data-row className="border-b last:border-0">
              <tr
                className={cn("cursor-pointer hover:bg-muted/30", selectedId === part.id && "bg-muted/60")}
                onClick={() => onOpen(part.id)}
              >
                <td className="px-3 py-2"><StatusDot status={part.status} /></td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={(event) => { event.stopPropagation(); onOpen(part.id); }}
                    >
                      {part.mpn}
                    </button>
                    <span className="text-xs text-muted-foreground">{part.manufacturer}{part.manufacturer_provisional ? " (not confirmed)" : ""}</span>
                    <JlcIcon jlc={part.jlc} />
                  </div>
                  {part.problem ? <div className="text-xs text-destructive">{PROBLEM_LABEL[part.problem]}</div> : null}
                  {showProjects ? <ProjectNames part={part} /> : null}
                  {lines ? <LineNotes line={line} /> : null}
                </td>
                {lines ? <BoardCells line={line} /> : null}
                <td className={cn("px-3 py-2 text-right tabular-nums", line?.short && "text-destructive")}>
                  {columnsBelow ? null : part.stock === null ? <span className="text-muted-foreground">{formatStock(null)}</span> : formatStock(part.stock)}
                  {!columnsBelow && part.spark && part.spark.length > 1 ? <div className="flex justify-end"><Sparkline values={part.spark} label="Stock over the last 30 days" width={64} height={18} /></div> : null}
                  {forecastState?.runout === "shown" && part.forecast?.runout && !part.forecast.out_now
                    ? <RowRunout part={part} state={forecastState.runout} />
                    : part.runs_out_days ? <div className="text-xs text-muted-foreground">runs out in about {part.runs_out_days.toLocaleString()} {part.runs_out_days === 1 ? "day" : "days"}</div> : null}
                </td>
                {lines ? <LinePriceCell line={line} lines={lines} /> : <td className="px-3 py-2 text-right tabular-nums">{columnsBelow ? null : <PriceCell part={part} />}</td>}
                {lines ? <CostCell line={line} lines={lines} /> : null}
                <td className="px-3 py-2"><div className="flex justify-end">{columnsBelow ? null : <DistributorSquares part={part} />}</div></td>
                <td className="px-3 py-2"><LifecycleIcon lifecycle={part.lifecycle} /></td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2"><RowFlags flags={part.flags} /></span>
                </td>
              </tr>
              {detailed ? (
                <tr className={cn(selectedId === part.id && "bg-muted/60")}>
                  <td />
                  <td colSpan={lines ? 9 : 6} className="px-3 pb-3"><PartOfferRows part={part} /></td>
                </tr>
              ) : null}
            </tbody>
          );
        })}
        {shown.after > 0 ? <tbody aria-hidden="true"><tr><td colSpan={span} style={{ height: shown.after }} /></tr></tbody> : null}
        {lines && unmatched.length > 0 ? <tbody className="border-t">{unmatched.map((line) => <UnmatchedRow key={line.key} line={line} lines={lines} />)}</tbody> : null}
      </table>
    </div>
  );
}
