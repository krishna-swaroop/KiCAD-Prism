import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { canOpenSupply } from "@/lib/roles";
import type { UserRole } from "@/types/auth";
import type { SupplyComponentStanding } from "@/types/supply";
import type { CatalogSupplyFilter } from "./catalog-supply-filter";
import { watchCatalogComponents, type TrackChoice } from "./catalog-supply-api";
import { TrackPicksDialog } from "./track-picks-dialog";

interface CatalogRow {
  id: string;
  manufacturer: string;
  mpn: string;
}

/** Tracked, At risk and In local stock filters for the components on this page, and a button to track the ones shown at a tier. */
export function CatalogSupplyBar({ filter, onFilter, rows, standing, role, onChanged, picked, onClearPicks }: {
  filter: CatalogSupplyFilter;
  onFilter: (next: CatalogSupplyFilter) => void;
  /** The components shown (after the filter). */
  rows: readonly CatalogRow[];
  standing: Record<string, SupplyComponentStanding>;
  role: UserRole | null | undefined;
  onChanged: () => void;
  /** Ids of the rows picked with ctrl-click. When there are any, only those are watched. */
  picked: ReadonlySet<string>;
  onClearPicks: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const chosen = picked.size > 0;
  const toWatch = useMemo(
    () => rows.filter((row) => (!picked.size || picked.has(row.id)) && row.manufacturer && row.mpn && !standing[row.id]?.watched),
    [rows, picked, standing],
  );
  if (!canOpenSupply(role)) return null;

  const watchShown = async (choice: TrackChoice) => {
    setBusy(true);
    try {
      const { watched, skipped } = await watchCatalogComponents(toWatch, choice);
      const done = watched === 1 ? "Tracking 1 part" : `Tracking ${watched} parts`;
      if (skipped > 0) toast.warning(done, { description: `${skipped} left out: Prism does not know their manufacturer yet. Admin or QA can add it in Review.` });
      else toast.success(done);
      setChoosing(false);
      onClearPicks();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not track the parts");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="group" aria-label="Supply" className="flex items-center gap-1">
      {([["watched", "Tracked"], ["at_risk", "At risk"], ["local_stock", "In local stock"]] as const).map(([value, label]) => (
        <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} className="h-7" aria-pressed={filter === value}
          onClick={() => onFilter(filter === value ? "" : value)}>
          {label}
        </Button>
      ))}
      {toWatch.length > 0 ? (
        <Button size="sm" variant="outline" className="h-7" disabled={busy} title="Ctrl-click rows to pick which to track" onClick={() => setChoosing(true)}>
          <Eye className="h-3.5 w-3.5" /> Track {chosen ? `${toWatch.length} picked` : toWatch.length === rows.length ? "these" : `${toWatch.length} shown`}
        </Button>
      ) : null}
      {choosing ? <TrackPicksDialog components={toWatch} busy={busy} onClose={() => setChoosing(false)} onTrack={(choice) => void watchShown(choice)} /> : null}
      {chosen ? <Button size="sm" variant="ghost" className="h-7" onClick={onClearPicks}>Clear picks</Button> : null}
    </div>
  );
}
