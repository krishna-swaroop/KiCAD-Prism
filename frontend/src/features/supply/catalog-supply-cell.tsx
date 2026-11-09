import type { SupplyComponentStanding } from "@/types/supply";
import { StatusDot } from "./status-dot";
import { storesText } from "./stores-cell";
import { formatPrice, formatStock, STATUS_LABEL } from "./supply-format";
import { TestDataChip } from "./test-data-chip";

/** The catalog row's Supply column: the distributors' status and price, then their stock and the usable local stock. */
export function CatalogSupplyCell({ standing }: { standing: SupplyComponentStanding | undefined }) {
  if (!standing) return <p className="text-xs text-muted-foreground">-</p>;
  const tracked = standing.watched || standing.stock !== null;
  const price = formatPrice(standing.unit_price ?? null, standing.currency ?? "");
  const stores = standing.stores ? storesText(standing.stores) : null;
  const distributors = tracked ? `Dist ${formatStock(standing.stock)}` : "";
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center gap-1.5 truncate text-xs">
        {tracked ? <><StatusDot status={standing.status} /><span className="truncate">{STATUS_LABEL[standing.status]}</span></> : <span className="text-muted-foreground">Not tracked</span>}
        {price ? <span className="ml-auto shrink-0 tabular-nums">{price}<TestDataChip show={standing.test_data} /></span> : null}
      </p>
      <p className="truncate text-xs text-muted-foreground tabular-nums">
        {distributors || (stores ? "" : "No stock reading")}
        {distributors && stores ? " · " : ""}
        {stores ? <span className={stores.tone === "bad" ? "text-destructive" : undefined}>Stores {stores.text}</span> : null}
      </p>
    </div>
  );
}
