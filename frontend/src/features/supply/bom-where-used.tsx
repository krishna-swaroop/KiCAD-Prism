import { Link } from "react-router-dom";

import { useSupplyPart, useSupplyPartFor } from "./use-supply-parts";

interface BomWhereUsedProps {
  manufacturer: string;
  mpn: string;
  /** Projects the imports already list, which this section does not repeat. */
  knownProjectIds: ReadonlySet<string>;
}

/**
 * Projects whose BOM carries this component's manufacturer part, found by part number.
 * Imports record exact usage; this adds boards whose BOM names the part without an import.
 */
export default function BomWhereUsed({ manufacturer, mpn, knownProjectIds }: BomWhereUsedProps) {
  if (!manufacturer.trim() || !mpn.trim()) return null;
  return <Found manufacturer={manufacturer.trim()} mpn={mpn.trim()} knownProjectIds={knownProjectIds} />;
}

function Found({ manufacturer, mpn, knownProjectIds }: BomWhereUsedProps) {
  const lookup = useSupplyPartFor(manufacturer, mpn);
  const part = useSupplyPart(lookup.data ?? null);
  const others = (part.data?.used_in ?? []).filter((use) => !knownProjectIds.has(use.project_id));
  if (others.length === 0) return null;
  return (
    <section aria-label="In project BOMs" className="space-y-2 border p-4">
      <h3 className="text-sm font-medium">Also in project BOMs ({others.length})</h3>
      <p className="text-xs text-muted-foreground">Found by manufacturer part number in each project&apos;s BOM, not through an import.</p>
      <ul className="space-y-1 text-sm">
        {others.map((use) => (
          <li key={use.project_id} className="flex items-baseline justify-between gap-3">
            <Link to={`/project/${encodeURIComponent(use.project_id)}`} className="text-primary hover:underline">{use.project_name}</Link>
            <span className="text-xs text-muted-foreground" title={use.references}>{use.quantity} per board</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
