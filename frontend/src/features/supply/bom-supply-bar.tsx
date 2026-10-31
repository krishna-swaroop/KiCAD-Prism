import { CheckOnceButton } from "./check-once-button";
import type { BomSupply } from "./use-bom-supply";

/** What the BOM's supply says while it reads or when it cannot, and a one-off check of the lines nobody reads. Tracking is on the project's Supply page. */
export function BomSupplyBar({ supply }: { supply: BomSupply }) {
  const { lookup, status, lines } = supply;

  // Lines with a manufacturer and a number that nobody reads: a check once would give them figures.
  const unread = lookup
    ? lines.filter((line) => {
      const result = lookup.lines[line.key];
      return Boolean(line.manufacturer && line.mpn && result && (result.state === "unknown" || (result.state === "tracked" && result.stock == null)));
    })
    : [];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b bg-card/40 px-2 py-1.5 text-xs">
      {status === "loading" ? <span className="text-muted-foreground">Reading supply data...</span> : null}
      {status === "error" ? (
        <span className="text-destructive">
          {supply.error}{" "}
          <button type="button" className="underline" onClick={supply.retry}>Retry</button>
        </span>
      ) : null}
      {supply.truncated ? <span className="text-warning">Only the first 2,000 distinct parts are looked up.</span> : null}
      {supply.projectId && unread.length > 0 ? (
        <span className="ml-auto"><CheckOnceButton projectId={supply.projectId} lines={unread} onFinished={supply.refresh} /></span>
      ) : null}
    </div>
  );
}
