import type { SupplyBomLookup } from "@/types/supply";
import type { FileLine } from "./bom-file-model";
import { untrackedLabel } from "./bom-supply";
import { StatusDot } from "./status-dot";
import { formatPrice, formatStock } from "./supply-format";

/** What the lookup found for each line of an uploaded BOM. */
export function BomFileResults({ lines, lookup }: { lines: readonly FileLine[]; lookup: SupplyBomLookup }) {
  return (
    <div className="themed-scrollbar overflow-x-auto border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="p-2">Part</th>
            <th className="p-2 text-right">Per board</th>
            <th className="p-2">Status</th>
            <th className="p-2 text-right">Stock / need</th>
            <th className="p-2 text-right">Extended</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const result = lookup.lines[line.key];
            return (
              <tr key={line.key} className="border-t">
                <td className="p-2">
                  <span className="font-medium">{line.mpn || line.lcsc}</span>
                  {line.manufacturer ? <span className="ml-2 text-xs text-muted-foreground">{line.manufacturer}</span> : null}
                  {line.mpn && line.lcsc ? <span className="ml-2 text-xs text-muted-foreground">{line.lcsc}</span> : null}
                </td>
                <td className="p-2 text-right tabular-nums">{line.quantity.toLocaleString()}</td>
                <td className="p-2">
                  {result?.state === "tracked" && result.status ? (
                    <span className="inline-flex items-center gap-1.5"><StatusDot status={result.status} />{result.watched ? "" : "not watched"}</span>
                  ) : <span className="text-xs text-muted-foreground">{result ? untrackedLabel(result) : ""}</span>}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {result?.state === "tracked" ? `${formatStock(result.stock ?? null)} / ${(result.part_need ?? result.need).toLocaleString()}` : ""}
                </td>
                <td className="p-2 text-right tabular-nums">{result?.buy ? formatPrice(result.buy.extended, result.buy.currency) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
