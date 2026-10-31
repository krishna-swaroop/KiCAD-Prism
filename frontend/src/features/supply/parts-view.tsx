import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Eye, PackageSearch, Upload } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PermissionHint } from "@/components/ui/permission-hint";
import { Skeleton } from "@/components/ui/skeleton";
import { canEditSupply, canFollowSupply } from "@/lib/roles";
import type { User } from "@/types/auth";
import type { PartsScope } from "@/types/supply";
import { BomFileView } from "./bom-file-view";
import { PartSheet } from "./part-sheet";
import { refreshSupplyUsage } from "./supply-api";
import { VendorSelect } from "./vendor-filter";
import { LayoutToggle } from "./layout-toggle";
import { LifecycleSelect, ActiveFilterChip } from "./lifecycle-filter";
import { layoutFromParam } from "./parts-layout";
import { LoadMore } from "./load-more";
import { filterFromParam } from "./parts-filters";
import { sortFromParam } from "./parts-sort";
import { PartsTable } from "./parts-table";
import { useSupplyPartsFeed } from "./use-supply-parts";
import { SearchBox } from "./search-box";
import { ReadProjectBomsButton } from "./read-project-boms-button";
import { WatchPartDialog } from "./watch-part-dialog";

const SCOPES: ReadonlyArray<{ id: PartsScope; label: string }> = [
  { id: "followed", label: "Tracked and in projects" },
  { id: "watched", label: "Tracked" },
  { id: "tier1", label: "Tier 1" },
  { id: "tier2", label: "Tier 2" },
  { id: "waiting", label: "Queued for calls" },
  { id: "pick", label: "Pick a packaging" },
  { id: "in_use", label: "In use" },
];

/** Supply > Tracking: the parts Prism follows, by tier, what waits for room or a packaging, and the BOM-file check. Browsing every
 * part is the catalog's job. The URL holds the scope, search and open part. */
export function PartsView({ user, headerSlot }: { user: User | null; headerSlot?: HTMLElement | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedScope = searchParams.get("partsScope");
  const scope: PartsScope = SCOPES.some((item) => item.id === requestedScope) ? (requestedScope as PartsScope) : "followed";
  const query = searchParams.get("partsQ") ?? "";
  const only = filterFromParam(searchParams.get("partsOnly"));
  const layout = layoutFromParam(searchParams.get("partsLayout"));
  const vendor = searchParams.get("partsVendor") ?? "";
  const sort = sortFromParam(searchParams.get("partsSort"));
  // The part sheet belongs to the tab being shown; a tab kept behind it draws none.
  const openPart = searchParams.get("part");
  const canEdit = canEditSupply(user?.role);
  const canFollow = canFollowSupply(user?.role);
  const [watching, setWatching] = useState(false);
  const { status, data, items, total, hasMore, loadingMore, moreFailed, loadMore, error, retry, refresh, forecastState } = useSupplyPartsFeed(scope, query, only, "", vendor, sort);

  // Where parts are used comes from project BOMs read earlier; bring it up to date when the scope is chosen.
  useEffect(() => {
    if (scope !== "in_use") return;
    void refreshSupplyUsage().then(() => refresh()).catch(() => undefined);
    // `refresh` changes with the query; the usage read is for entering the scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

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

  const actions = (
    <>
      <Button variant="outline" onClick={() => setParams({ tool: "bom-file" })}>
        <Upload className="h-4 w-4" />Upload BOM
      </Button>
      <PermissionHint blocked={!canFollow} action="track parts" allowedRoles={["designer", "qa", "admin"]}>
        <Button disabled={!canFollow} onClick={() => setWatching(true)}>
          <Eye className="h-4 w-4" />Track a part
        </Button>
      </PermissionHint>
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col p-4">
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        {headerSlot === undefined ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : headerSlot ? createPortal(actions, headerSlot) : null}

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div role="group" aria-label="Which parts" className="flex gap-1">
            {SCOPES.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={scope === item.id ? "secondary" : "ghost"}
                aria-pressed={scope === item.id}
                onClick={() => setParams({ partsScope: item.id === "followed" ? null : item.id })}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <Button variant={sort === "runout" ? "default" : "outline"} size="sm" aria-pressed={sort === "runout"} onClick={() => setParams({ partsSort: sort === "runout" ? null : "runout" })}>Runs out first</Button>
          <LifecycleSelect only={only} onChange={(next) => setParams({ partsOnly: next })} />
          <VendorSelect vendor={vendor} onChange={(next) => setParams({ partsVendor: next })} />
          <SearchBox key={query} initial={query} onSearch={(text) => setParams({ partsQ: text })} />
          <ActiveFilterChip only={only} onClear={() => setParams({ partsOnly: null })} />
          <div className="ml-auto"><LayoutToggle layout={layout} onChange={(next) => setParams({ partsLayout: next === "compact" ? null : next })} /></div>
        </div>
        <div className="themed-scrollbar min-h-0 flex-1 space-y-5 overflow-auto">

        {status === "loading" ? <Skeleton className="h-48 w-full" aria-label="Loading parts" /> : null}
        {status === "error" ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-3">
              {error}
              <Button size="sm" variant="outline" onClick={retry}>Retry</Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {status === "ready" && data ? (
          <>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {items.length === 0 ? (
              <EmptyState scope={scope} searching={query !== "" || only !== "" || vendor !== ""} canEdit={canEdit} canFollow={canFollow} onWatch={() => setWatching(true)} />
            ) : (
              <>
                <PartsTable stickyHead layout={layout} items={items} selectedId={openPart} onOpen={(partId) => setParams({ part: partId })} forecastState={forecastState} sort={sort} onSort={(next) => setParams({ partsSort: next })} />
                <LoadMore hasMore={hasMore} loading={loadingMore} failed={moreFailed} onLoad={() => void loadMore()} />
                <p className="text-xs text-muted-foreground">{`${total.toLocaleString()} ${total === 1 ? "part" : "parts"}`}</p>
              </>
            )}
          </>
        ) : null}
        </div>
      </div>

      <Dialog open={searchParams.get("tool") === "bom-file"} onOpenChange={(next) => { if (!next) setParams({ tool: null }); }}>
        <DialogContent className="w-[min(95vw,72rem)] sm:max-w-none">
          <DialogHeader>
            <DialogTitle>Upload BOM</DialogTitle>
            <DialogDescription>A CSV with a part number or LCSC number column. Nothing is saved.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[75vh] themed-scrollbar overflow-y-auto"><BomFileView /></div>
        </DialogContent>
      </Dialog>
      <PartSheet partId={openPart} user={user} onClose={() => setParams({ part: null })} onWatchChanged={() => void refresh()} />
      <WatchPartDialog
        open={watching}
        onOpenChange={setWatching}
        onWatched={(watch) => {
          void refresh();
          setParams({ part: watch.part_id });
          toast.success(`Watching ${watch.mpn}`);
        }}
      />
    </div>
  );
}

function EmptyState({ scope, searching, canEdit, canFollow, onWatch }: { scope: PartsScope; searching: boolean; canEdit: boolean; canFollow: boolean; onWatch: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 border border-dashed p-10 text-center">
      <PackageSearch className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{searching ? "No parts match" : scope === "watched" || scope === "followed" ? "No tracked parts yet" : scope === "in_use" ? "No parts in use yet" : "No parts yet"}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {searching
          ? "Try a shorter part number or another manufacturer."
          : scope === "watched" || scope === "followed"
            ? "Track a part, or track a project, to have its stock read regularly."
            : scope === "in_use"
              ? "No project BOM that Prism has read uses a part it knows. Open a project BOM, then watch its parts."
              : "Parts appear here once they are watched or matched."}
      </p>
      {!searching && (scope === "watched" || scope === "followed") && canFollow ? <Button size="sm" onClick={onWatch}>Track a part</Button> : null}
      {!searching && scope === "in_use" && canEdit ? <ReadProjectBomsButton /> : null}
    </div>
  );
}
