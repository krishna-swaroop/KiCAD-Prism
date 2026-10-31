import { LibraryBig } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProjectSupplyPart } from "@/types/supply";
import { AlternatesNote } from "./alternates-note";
import { PriceAtQuantity } from "./price-at-quantity";
import { StoresCell } from "./stores-cell";
import { formatPrice, formatStock } from "./supply-format";
import { TestDataChip } from "./test-data-chip";

/** What a project's parts list adds to a part: its lines of the BOM and the currency the cost is in. */
export interface ProjectLines {
  byPart: ReadonlyMap<string, ProjectSupplyPart>;
  currency: string;
  /** Starts a catalog component for a line no component has; omitted when the user cannot write the catalog. */
  onAddToLibrary?: (line: ProjectSupplyPart) => void;
}

/** Under the part number: where the part sits on the board, and the notes written on the line. */
export function LineNotes({ line }: { line: ProjectSupplyPart | undefined }) {
  if (!line) return null;
  return (
    <>
      {line.references || line.stores ? (
        <div className="flex gap-3 text-xs text-muted-foreground">
          {line.references ? <span className="truncate">{line.references}</span> : null}
          {line.stores ? <span className="shrink-0">Stores <StoresCell stores={line.stores} /></span> : null}
        </div>
      ) : null}
      {line.alternates?.length ? (
        <span className="text-xs text-muted-foreground" title="Stock of the part and its approved alternates">
          {line.stock === null ? "" : `${formatStock(line.stock)} with alternates`}
          <AlternatesNote alternates={line.alternates} statusFrom={line.status_from} />
        </span>
      ) : null}
      {line.notes > 0 ? <span className="ml-2 text-xs text-muted-foreground">{line.notes} {line.notes === 1 ? "note" : "notes"}</span> : null}
    </>
  );
}

/** The columns only a project has, in the order the table puts them: pieces a board uses, pieces the build needs. */
export function BoardCells({ line }: { line: ProjectSupplyPart | undefined }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{line?.quantity ?? ""}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${line?.short ? "text-destructive" : ""}`}>{line?.need ?? ""}</td>
    </>
  );
}

/** The unit price the line's cost is made of, in the total's currency when it converts, else in its own; with the offer's own price
 * as the title when they differ. */
function unitShown(line: ProjectSupplyPart, lines: ProjectLines): { text: string; title?: string } | null {
  if (!line.unit_price) return null;
  const own = line.unit_currency || lines.currency;
  if (!own) return null;
  const native = formatPrice(line.unit_price, own);
  if (line.unit_price_in_total && lines.currency && own !== lines.currency) {
    return { text: formatPrice(line.unit_price_in_total, lines.currency), title: `Converted from ${native}` };
  }
  return { text: native };
}

/** The line's unit price at the quantity the build buys, which is what its cost is made of (UX-05). */
export function LinePriceCell({ line, lines }: { line: ProjectSupplyPart | undefined; lines: ProjectLines }) {
  const unit = line ? unitShown(line, lines) : null;
  if (!line || !unit) return <td className="px-3 py-2 text-right text-muted-foreground">-</td>;
  return (
    <td className="px-3 py-2 text-right tabular-nums" title={unit.title}>
      <PriceAtQuantity price={unit.text} quantity={line.buy_quantity} />
      <TestDataChip show={line.test_data} />
    </td>
  );
}

/** What the line costs for the build, with what it is made of: pieces bought times the unit price. */
export function CostCell({ line, lines }: { line: ProjectSupplyPart | undefined; lines: ProjectLines }) {
  if (!line?.line_cost || !lines.currency) return <td className="px-3 py-2 text-right tabular-nums" />;
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      {formatPrice(line.line_cost, lines.currency)}<TestDataChip show={line.test_data} />
      {line.buy_quantity && unitShown(line, lines) ? <div className="text-xs text-muted-foreground"><PriceAtQuantity price={unitShown(line, lines)?.text} quantity={line.buy_quantity} quantityFirst /></div> : null}
    </td>
  );
}

/** A line of the BOM that matches no part Prism knows, so the list of parts has no row for it. */
export function UnmatchedRow({ line, lines }: { line: ProjectSupplyPart; lines: ProjectLines }) {
  return (
    <tr className="border-t">
      <td className="px-3 py-2" />
      <td className="px-3 py-2">
        {line.mpn ? <span className="font-medium">{line.mpn}</span> : <span className="font-medium text-destructive">No MPN</span>}
        <div className="text-xs text-muted-foreground">{line.manufacturer}{line.references ? ` · ${line.references}` : ""}</div>
      </td>
      <BoardCells line={line} />
      <td className="px-3 py-2" colSpan={2}>
        {line.in_library === false ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            Not in library
            {lines.onAddToLibrary ? (
              <Button size="xs" variant="outline" onClick={() => lines.onAddToLibrary?.(line)}><LibraryBig className="h-3.5 w-3.5" />Add to Component Database</Button>
            ) : null}
          </span>
        ) : null}
      </td>
      <CostCell line={line} lines={lines} />
      <td colSpan={3} />
    </tr>
  );
}
