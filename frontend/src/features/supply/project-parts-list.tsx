import { useCallback, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PartsFilter, ProjectSupplyPart } from "@/types/supply";
import { LayoutToggle } from "./layout-toggle";
import { LifecycleSelect } from "./lifecycle-filter";
import { CHIPS, type Chip } from "./project-part-filters";
import type { PartsLayout } from "./parts-layout";
import { PartsTable } from "./parts-table";
import type { PartsSort } from "./parts-sort";
import type { ProjectLines } from "./project-line-cells";
import { SearchBox } from "./search-box";
import { getProjectParts } from "./supply-api";
import { useLoaded } from "./use-loaded";
import { VendorSelect } from "./vendor-filter";

/** Parts a page shows. */
const PAGE = 100;

/**
 * A project's parts, as the Parts tab lists them (compact or a row for each vendor, search, lifecycle and vendor menus, runs out
 * first, sortable columns) with the pieces a board uses, the pieces the build needs and each line's cost added. The server pages
 * them and counts the chips over the whole project, so the counts and the list agree.
 */
export function ProjectPartsList({ projectId, variant, boards, currency, selectedId, onOpen, onAddToLibrary }: {
  projectId: string;
  variant: string;
  /** The build the lines are priced for; undefined is the project's usual build. */
  boards: number | undefined;
  currency: string;
  selectedId: string | null;
  onOpen: (partId: string) => void;
  onAddToLibrary?: (line: ProjectSupplyPart) => void;
}) {
  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState<PartsFilter>("");
  const [vendor, setVendor] = useState("");
  const [layout, setLayout] = useState<PartsLayout>("compact");
  const [sort, setSort] = useState<PartsSort>("");
  const [chip, setChip] = useState<Chip | null>(null);
  const [offset, setOffset] = useState(0);
  const asked = useMemo(
    () => ({ variant, boards, chip: chip ?? "", q: query, only: lifecycle, vendor, sort, offset, limit: PAGE }),
    [variant, boards, chip, query, lifecycle, vendor, sort, offset],
  );
  const fetcher = useCallback((signal: AbortSignal) => getProjectParts(projectId, asked, signal), [projectId, asked]);
  const loaded = useLoaded(`projects/${projectId}/parts/${JSON.stringify(asked)}`, fetcher, "Could not load the parts");
  const page = loaded.data;
  const lines = useMemo<ProjectLines>(() => ({
    byPart: new Map((page?.items ?? []).flatMap((item) => (item.line ? [[item.id, item.line] as const] : []))), currency, onAddToLibrary,
  }), [page, currency, onAddToLibrary]);
  const labels = new Map(CHIPS.map((item) => [item.key, item.label]));
  const chips = page?.chips ?? [];
  const narrowed = query !== "" || lifecycle !== "" || vendor !== "" || chip !== null;
  // Any change of what is asked starts again at the first page.
  const narrow = <T,>(set: (value: T) => void) => (value: T) => { set(value); setOffset(0); };
  const items = page?.items ?? [];
  const unmatched = page?.unmatched ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {chips.length > 0 ? (
          <div role="group" aria-label="Needs a look" className="flex gap-1">
            {chips.map((item) => (
              <Button key={item.key} size="sm" variant={chip === item.key ? "secondary" : "ghost"} aria-pressed={chip === item.key} onClick={() => narrow(setChip)(chip === item.key ? null : item.key)}>
                {labels.get(item.key)}<span className="tabular-nums text-muted-foreground">{item.count.toLocaleString()}</span>
              </Button>
            ))}
          </div>
        ) : null}
        <Button variant={sort === "runout" ? "default" : "outline"} size="sm" aria-pressed={sort === "runout"} onClick={() => narrow(setSort)(sort === "runout" ? "" : "runout")}>Runs out first</Button>
        <LifecycleSelect only={lifecycle} onChange={narrow(setLifecycle)} />
        <VendorSelect vendor={vendor} onChange={narrow(setVendor)} />
        <SearchBox key={query} initial={query} onSearch={narrow(setQuery)} placeholder="Part number, maker or reference" />
        <div className="ml-auto"><LayoutToggle layout={layout} onChange={setLayout} /></div>
      </div>
      {loaded.status === "loading" ? <Skeleton className="h-48 w-full" aria-label="Loading the parts" /> : null}
      {loaded.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            {loaded.error}
            <Button size="sm" variant="outline" onClick={loaded.retry}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {loaded.data ? (
        items.length === 0 && unmatched.length === 0 ? (
          <p className="border border-dashed p-6 text-center text-sm text-muted-foreground">{narrowed ? "No part matches" : "No part of this BOM is known to Prism yet"}</p>
        ) : (
          // The filters stay where they are and the list scrolls under them, as on the Parts tab; its column names stay at its top.
          <div className="themed-scrollbar max-h-[calc(100vh-12rem)] min-h-64 overflow-auto">
            <PartsTable
              stickyHead layout={layout} items={items} selectedId={selectedId} onOpen={onOpen} showProjects={false}
              forecastState={loaded.data.forecast_state} sort={sort} onSort={narrow(setSort)} lines={lines} unmatched={unmatched}
            />
          </div>
        )
      ) : null}
      {page && page.total > PAGE ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{(offset + 1).toLocaleString()}–{Math.min(offset + PAGE, page.total).toLocaleString()} of {page.total.toLocaleString()}</span>
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
          <Button size="sm" variant="outline" disabled={page.next_offset == null} onClick={() => setOffset(page.next_offset ?? offset)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}
