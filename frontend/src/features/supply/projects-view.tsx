import { FolderOpen } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { canEditSupply } from "@/lib/roles";
import type { User } from "@/types/auth";
import { VendorSelect } from "./vendor-filter";
import { LayoutToggle } from "./layout-toggle";
import { layoutFromParam } from "./parts-layout";
import { ActiveFilterChip, LifecycleSelect } from "./lifecycle-filter";
import { filterFromParam } from "./parts-filters";
import { sortFromParam } from "./parts-sort";
import { PartSheet } from "./part-sheet";
import { PartGroups } from "./project-groups";
import { ReadProjectBomsButton } from "./read-project-boms-button";
import { SearchBox } from "./search-box";
import { useSupplyPartGroups } from "./use-supply-parts";

/** The parts of each project, a project at a time, closed until opened. Tracked projects first. */
export function ProjectsView({ user }: { user: User | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("projQ") ?? "";
  const openPart = searchParams.get("part");
  const only = filterFromParam(searchParams.get("projOnly"));
  const layout = layoutFromParam(searchParams.get("projLayout"));
  const vendor = searchParams.get("projVendor") ?? "";
  const sort = sortFromParam(searchParams.get("projSort"));
  const loaded = useSupplyPartGroups("in_use", query, only, vendor);
  const groups = (loaded.data?.items ?? []).filter((group) => group.project_id !== "none");
  const setParams = (changes: Record<string, string | null>) => {
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") updated.delete(key);
        else updated.set(key, value);
      }
      return updated;
    });
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col p-4">
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <LifecycleSelect only={only} onChange={(next) => setParams({ projOnly: next })} />
          <VendorSelect vendor={vendor} onChange={(next) => setParams({ projVendor: next })} />
          <SearchBox key={query} initial={query} onSearch={(text) => setParams({ projQ: text })} label="Search projects" placeholder="Part number or manufacturer" />
          <ActiveFilterChip only={only} onClear={() => setParams({ projOnly: null })} />
          <div className="ml-auto"><LayoutToggle layout={layout} onChange={(next) => setParams({ projLayout: next === "compact" ? null : next })} /></div>
        </div>

        <div className="themed-scrollbar min-h-0 flex-1 space-y-5 overflow-auto">
        {loaded.status === "loading" ? <Skeleton className="h-48 w-full" aria-label="Loading projects" /> : null}
        {loaded.status === "error" ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-3">
              {loaded.error}
              <Button size="sm" variant="outline" onClick={loaded.retry}>Retry</Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {loaded.status === "ready" ? (
          groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 border border-dashed p-10 text-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">{query || only || vendor ? "No project matches" : "No project uses a part Prism knows yet"}</p>
              {!query && !only && !vendor && canEditSupply(user?.role) ? <ReadProjectBomsButton /> : null}
            </div>
          ) : (
            <PartGroups
              groups={groups}
              scope="in_use"
              query={query}
              only={only}
              vendor={vendor}
              layout={layout}
              sort={sort}
              onSort={(next) => setParams({ projSort: next })}
              selectedId={openPart}
              onOpen={(partId) => setParams({ part: partId })}
            />
          )
        ) : null}
        </div>
      </div>
      <PartSheet partId={openPart} user={user} onClose={() => setParams({ part: null })} onWatchChanged={() => void loaded.refresh()} />
    </div>
  );
}
