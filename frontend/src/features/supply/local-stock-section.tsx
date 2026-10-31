import { useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { LocalStock } from "@/types/supply";
import { getLocalStock } from "./component-supply-api";
import { StoresCell } from "./stores-cell";
import { formatDateTime } from "./supply-format";
import { useLoaded } from "./use-loaded";

const number = (value: number | null, uom: string) => (value === null ? "-" : `${value.toLocaleString()}${uom ? ` ${uom}` : ""}`);

/** What the local inventory holds for a component: usable now, held, at a vendor, and each record. Nothing when it holds none. */
export function LocalStockSection({ componentId }: { componentId: string }) {
  const fetcher = useCallback((signal: AbortSignal) => getLocalStock(componentId, signal), [componentId]);
  const loaded = useLoaded<LocalStock>(`components/${componentId}/local-stock`, fetcher, "Could not load the local stock");
  const stock = loaded.data;
  const failed = loaded.status === "error" ? loaded.error : "";

  if (failed) return <p className="text-sm text-destructive">{failed}</p>;
  if (!stock) return <Skeleton className="h-16 w-full" aria-label="Loading the local stock" />;
  if (stock.rows.length === 0) {
    return (
      <section className="flex items-baseline gap-3" aria-label="Stores">
        <h3 className="text-sm font-semibold">Stores</h3>
        <StoresCell stores={stock.stores} className="text-sm" />
      </section>
    );
  }
  const totals = [
    { label: "Available", value: stock.available, title: "OK stock at our locations, less what is allocated" },
    { label: "Held", value: stock.held, title: "At our locations, on hold or otherwise not usable" },
    { label: "At vendor", value: stock.at_vendor, title: "At an external location; not counted as on hand" },
  ];
  return (
    <section className="space-y-2" aria-label="Stores">
      <h3 className="flex items-baseline gap-3 text-sm font-semibold">Stores{stock.stores?.state === "down" ? <StoresCell stores={stock.stores} className="text-sm font-normal" /> : null}</h3>
      {stock.mixed_units ? <p className="text-xs text-warning">Records use different units, so they are not totalled.</p> : null}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {totals.map((total) => (
          <div key={total.label} className="flex gap-1.5" title={total.title}>
            <dt className="text-muted-foreground">{total.label}</dt>
            <dd className="tabular-nums font-medium">{number(total.value, stock.uom)}</dd>
          </div>
        ))}
      </dl>
      <div className="themed-scrollbar overflow-x-auto border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-1.5 font-normal">Location</th><th className="px-3 py-1.5 font-normal">Status</th><th className="px-3 py-1.5 text-right font-normal">Quantity</th><th className="px-3 py-1.5 text-right font-normal">Allocated</th><th className="px-3 py-1.5 font-normal">Batch</th><th className="px-3 py-1.5 font-normal">Source</th></tr>
          </thead>
          <tbody className="divide-y">
            {stock.rows.map((row) => (
              <tr key={row.key}>
                <td className="max-w-56 truncate px-3 py-1.5" title={row.location}>{row.location || "-"}{row.external ? <Badge variant="outline" className="ml-2">Vendor</Badge> : null}</td>
                <td className="px-3 py-1.5 capitalize">{row.status}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{number(row.quantity, row.uom)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.allocated ? row.allocated.toLocaleString() : "-"}</td>
                <td className="max-w-32 truncate px-3 py-1.5" title={row.batch}>{row.batch || "-"}</td>
                <td className="max-w-40 truncate px-3 py-1.5" title={`Read ${formatDateTime(row.fetched_at)}${row.stale ? ", last read failed" : ""}`}>
                  {row.source}{row.stale ? <Badge variant="destructive" className="ml-2">Stale</Badge> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
