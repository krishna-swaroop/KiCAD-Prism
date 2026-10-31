import type { SupplyComponentStanding } from "@/types/supply";
import { StatusDot } from "./status-dot";
import { formatStock } from "./supply-format";

/** A component's supply status in a catalog row. Nothing for a component Prism does not track (one only the local inventory or a
 * library mark puts in the standing). */
export function CatalogSupplyDot({ standing }: { standing: SupplyComponentStanding | undefined }) {
  if (!standing || (!standing.watched && standing.stock === null && standing.status === "unknown")) return null;
  return (
    <span title={`${standing.watched ? "Watched, " : ""}${standing.stock === null ? "not read yet" : `${formatStock(standing.stock)} in stock`}`} className="inline-flex">
      <StatusDot status={standing.status} />
    </span>
  );
}

/** "Not for new designs" beside a component the library marked. Nothing for any other. */
export function RestrictionTag({ standing }: { standing: SupplyComponentStanding | undefined }) {
  if (standing?.restriction !== "not_for_new_designs") return null;
  return <span className="shrink-0 border border-warning/40 px-1 text-[10px] font-medium uppercase tracking-wide text-warning" title="The library marked this component: do not use it in new designs">Not for new designs</span>;
}
