import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  CircleAlert,
  CircleDashed,
  FilterX,
  Library,
  Loader2,
  Package,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldQuestion,
  TriangleAlert,
  X,
} from "lucide-react";


import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CatalogSupplyDot, RestrictionTag } from "@/features/supply/catalog-supply-dot";
import { CatalogSupplyBar } from "@/features/supply/catalog-supply-bar";
import { CatalogSupplyCell } from "@/features/supply/catalog-supply-cell";
import { passesSupplyFilter, supplyFilterFrom } from "@/features/supply/catalog-supply-filter";
import { useCatalogPicks } from "@/features/supply/use-catalog-picks";
import { useCatalogSupply } from "@/features/supply/use-catalog-supply";
import { useVirtualViewport } from "@/hooks/use-virtual-viewport";
import { getComponent, listCategories, listComponents } from "./catalog-client";
import { CreateComponentDialog } from "./create-component-dialog";
import {
  AVAILABILITY_BADGE_TITLE,
  AVAILABILITY_BADGE_VARIANT,
  VALIDATION_BADGE_TITLE,
  VALIDATION_BADGE_VARIANT,
  WORKFLOW_BADGE_TITLE,
  WORKFLOW_BADGE_VARIANT,
} from "@/lib/catalog-badges";
import { PermissionHint } from "@/components/ui/permission-hint";
import { canAdministerCatalog, canEditSupply, canOpenSupply, canWriteCatalog } from "@/lib/roles";
import { useServerState } from "@/lib/server-state";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type {
  AvailabilityState,
  CatalogComponent,
  CatalogValidationStatus,
  WorkflowStage,
} from "@/types/catalog";
import { LibraryCatalogFileCheck } from "./library-catalog-file-check";
import { LibraryPager } from "./library-pager";
import { LibraryComponentQuickView } from "./library-component-quick-view";
import { useScrollBelowHead } from "@/lib/use-scroll-below-head";

const PAGE_SIZE = 100;
const CATALOG_ROW_HEIGHT = 64;
// Every column has a floor wide enough for its content and grows from there.
// Text columns used to have none, so a narrow pane or the open quick view
// squeezed them to nothing and their headers printed over each other. Below the
// floors the header and rows scroll sideways together instead.
const CATALOG_GRID_TEMPLATE =
  "minmax(180px,2.4fr) minmax(120px,1.5fr) minmax(120px,1.5fr) minmax(124px,1fr) minmax(104px,0.9fr) minmax(104px,0.9fr) minmax(130px,1.6fr)";
// Supply roles see one more column: the distributors' status, price and stock, and the usable local stock.
const CATALOG_SUPPLY_GRID_TEMPLATE = `${CATALOG_GRID_TEMPLATE} minmax(150px,1.4fr)`;
const CATALOG_OVERSCAN = 6;

type SortKey = "name" | "manufacturer" | "category" | "package_name" | "availability_state" | "workflow_stage" | "updated_at";
type SortDirection = "asc" | "desc";

const SORT_KEYS: SortKey[] = ["name", "manufacturer", "category", "package_name", "availability_state", "workflow_stage", "updated_at"];
const WORKFLOW_KEYS: WorkflowStage[] = ["open", "in_progress", "qa_review", "done", "released", "archived"];
const AVAILABILITY_KEYS: AvailabilityState[] = ["place_ready", "files_partial", "metadata_only"];
const VALIDATION_KEYS: CatalogValidationStatus[] = ["passed", "warning", "failed", "skipped", "not_run"];

const enumParam = <T extends string>(value: string | null, allowed: T[], fallback: T): T =>
  value && allowed.includes(value as T) ? value as T : fallback;


const WORKFLOW_LABELS: Record<WorkflowStage, string> = {
  open: "Open",
  in_progress: "In progress",
  qa_review: "QA review",
  done: "Approved",
  released: "Released",
  archived: "Archived",
};

const AVAILABILITY_LABELS: Record<AvailabilityState, string> = {
  place_ready: "CAD complete",
  files_partial: "Files partial",
  metadata_only: "Metadata only",
};

const VALIDATION_LABELS: Record<CatalogValidationStatus, string> = {
  passed: "Passed",
  warning: "Warnings",
  failed: "Failed",
  skipped: "Skipped",
  not_run: "Not run",
};

// Constructing an Intl formatter is the expensive part; the runtime locale
// cannot change mid-session, so build it once.
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
};

// Every column heading, sortable or not, is the same box so the header row lines up.
const HEADING = "flex min-w-0 items-center text-xs font-medium text-muted-foreground";

function SortControl({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      className={cn(HEADING, "gap-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "text-foreground")}
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}${active ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
      aria-pressed={active}
    >
      {label}<Icon className="h-3 w-3" />
    </button>
  );
}

// Badges sit in narrow adaptive columns. They must clip inside their own cell
// rather than spill across the next column's content.
const BADGE_CELL = "min-w-0 max-w-full shrink";

function AvailabilityBadge({ state }: { state: AvailabilityState }) {
  const Icon = state === "place_ready" ? PackageCheck : state === "files_partial" ? Package : CircleDashed;
  return (
    <Badge variant={AVAILABILITY_BADGE_VARIANT[state]} className={BADGE_CELL} title={AVAILABILITY_BADGE_TITLE[state]}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{AVAILABILITY_LABELS[state]}</span>
    </Badge>
  );
}

function WorkflowBadge({ stage }: { stage: WorkflowStage }) {
  return (
    <Badge variant={WORKFLOW_BADGE_VARIANT[stage]} className={BADGE_CELL} title={WORKFLOW_BADGE_TITLE[stage]}>
      <span className="truncate">{WORKFLOW_LABELS[stage]}</span>
    </Badge>
  );
}

function ValidationBadge({ status }: { status: CatalogValidationStatus }) {
  const Icon = status === "failed" ? CircleAlert : status === "warning" ? TriangleAlert : status === "passed" ? ShieldCheck : ShieldQuestion;
  return (
    <Badge variant={VALIDATION_BADGE_VARIANT[status]} className={BADGE_CELL} title={VALIDATION_BADGE_TITLE[status]}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{VALIDATION_LABELS[status]}</span>
    </Badge>
  );
}

function CatalogEmpty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <Library className="size-6" aria-hidden />
      {filtered ? "No matches" : "No components"}
      {filtered ? <Button size="sm" variant="outline" onClick={onClear}><FilterX className="h-3.5 w-3.5" /> Clear filters</Button> : null}
    </div>
  );
}


const CATEGORIES_KEY = ["catalog", "categories"] as const;
const COMPONENTS_KEY = ["catalog", "components"] as const;
const NO_CATEGORIES: Array<{ name: string; count: number }> = [];
const NO_COMPONENTS: CatalogComponent[] = [];

// react-doctor-disable-next-line no-giant-component - query params, grid, and facet state are one page
export function LibraryCatalogWorkspace({
  user,
  onOpenComponent,
}: {
  user: User | null;
  onOpenComponent: (componentId: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("catalogQ") || "";
  const parsedPage = Number.parseInt(searchParams.get("catalogPage") || "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const workflow = enumParam<WorkflowStage | "all">(searchParams.get("catalogWorkflow"), [...WORKFLOW_KEYS, "all"], "all");
  const availability = enumParam<AvailabilityState | "all">(searchParams.get("catalogAvailability"), [...AVAILABILITY_KEYS, "all"], "all");
  const validation = enumParam<CatalogValidationStatus | "all">(searchParams.get("catalogValidation"), [...VALIDATION_KEYS, "all"], "all");
  const category = searchParams.get("catalogCategory") || "all";
  const sortKey = enumParam<SortKey>(searchParams.get("catalogSort"), SORT_KEYS, "updated_at");
  const sortDirection = enumParam<SortDirection>(searchParams.get("catalogDir"), ["asc", "desc"], sortKey === "updated_at" ? "desc" : "asc");
  const [query, setQuery] = useState(urlQuery);
  const [createOpen, setCreateOpen] = useState(false);
  const selectedComponentId = searchParams.get("catalogSelection") || "";
  const [selectedComponent, setSelectedComponent] = useState<CatalogComponent | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState("");
  const [selectedRefreshKey, setSelectedRefreshKey] = useState(0);
  const catalogViewport = useVirtualViewport();
  // The table's scrollbar runs beside the rows, below the sticky header.
  const catalogScroller = useRef<HTMLDivElement | null>(null);
  const catalogHead = useRef<HTMLDivElement>(null);
  const { viewportRef: catalogViewportRef } = catalogViewport;
  const setCatalogScroller = useCallback((node: HTMLDivElement | null) => {
    catalogScroller.current = node;
    catalogViewportRef(node);
  }, [catalogViewportRef]);
  useScrollBelowHead(catalogScroller, catalogHead);
  const canCreate = canWriteCatalog(user?.role);

  const updateCatalogParams = useCallback((values: Record<string, string | null>, replace = false) => {
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      for (const [key, value] of Object.entries(values)) {
        if (value && value !== "all") updated.set(key, value);
        else updated.delete(key);
      }
      updated.set("section", "library-manager");
      updated.set("libraryView", "catalog");
      return updated;
    }, { replace });
  }, [setSearchParams]);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized === urlQuery) return;
    const timer = window.setTimeout(() => updateCatalogParams({ catalogQ: normalized || null, catalogPage: null }, true), 250);
    return () => window.clearTimeout(timer);
  }, [query, updateCatalogParams, urlQuery]);

  // Category discovery is non-blocking for catalog browsing: a failure shows no categories.
  const categoryRead = useServerState(CATEGORIES_KEY, () => listCategories());
  const categories = categoryRead.data?.categories ?? NO_CATEGORIES;

  // One page per filter/sort/page combination. A new combination keeps the
  // previous rows on screen until it answers; a failed read shows the error
  // (and no rows) until the next read starts.
  const listParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
      sort_by: sortKey,
      sort_dir: sortDirection,
      lightweight: "true",
    });
    if (urlQuery) params.set("q", urlQuery);
    if (workflow !== "all") params.set("workflow_stage", workflow);
    if (availability !== "all") params.set("availability_state", availability);
    if (validation !== "all") params.set("validation_status", validation);
    if (category !== "all") params.set("category", category === "uncategorized" ? "" : category);
    return params.toString();
  }, [availability, category, page, sortDirection, sortKey, urlQuery, validation, workflow]);
  const listing = useServerState(
    [...COMPONENTS_KEY, listParams],
    (signal) => listComponents(new URLSearchParams(listParams), signal),
    {
      keepPrevious: true,
      onData: (response) => {
        if (page > response.pages) updateCatalogParams({ catalogPage: response.pages > 1 ? String(response.pages) : null }, true);
      },
    },
  );
  const loading = listing.loading || listing.fetching;
  const error = loading || !listing.error ? "" : listing.error.message;
  const items = error ? NO_COMPONENTS : listing.data?.items ?? NO_COMPONENTS;
  const total = listing.data?.total ?? 0;
  const pages = listing.data?.pages ?? 1;
  const refreshCatalog = () => {
    void categoryRead.refresh();
    void listing.refresh();
  };

  useEffect(() => {
    if (!selectedComponentId) {
      setSelectedComponent(null);
      setSelectedError("");
      return;
    }
    const listed = items.find((item) => item.id === selectedComponentId) || null;
    if (listed) setSelectedComponent(listed);
    const controller = new AbortController();
    setSelectedLoading(true);
    setSelectedError("");
    void getComponent(selectedComponentId, controller.signal)
      .then(setSelectedComponent)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setSelectedError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!controller.signal.aborted) setSelectedLoading(false); });
    return () => controller.abort();
  }, [items, selectedComponentId, selectedRefreshKey]);

  const { resetScroll } = catalogViewport;
  useEffect(() => {
    resetScroll();
  }, [availability, category, page, resetScroll, sortDirection, sortKey, urlQuery, validation, workflow]);

  const activeFilterCount = [workflow, availability, validation, category].filter((value) => value !== "all").length;
  const isFiltered = Boolean(urlQuery || activeFilterCount);
  const firstItem = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastItem = Math.min(page * PAGE_SIZE, total);
  const picks = useCatalogPicks();
  const { standing: supplyStanding, refresh: refreshSupply } = useCatalogSupply(items.map((item) => ({ id: item.id, manufacturer: item.manufacturer, mpn: item.mpn })), user?.role);
  // The Watched and At risk filters narrow the page that is loaded; the server does not know about supply.
  const supplyFilter = supplyFilterFrom(searchParams.get("catalogSupply"));
  const supplyColumn = canOpenSupply(user?.role);
  const gridTemplate = supplyColumn ? CATALOG_SUPPLY_GRID_TEMPLATE : CATALOG_GRID_TEMPLATE;
  const shownItems = supplyFilter ? items.filter((item) => passesSupplyFilter(supplyFilter, supplyStanding[item.id])) : items;
  const firstVisibleRow = Math.max(0, Math.floor(catalogViewport.scrollTop / CATALOG_ROW_HEIGHT) - CATALOG_OVERSCAN);
  const lastVisibleRow = Math.min(shownItems.length, Math.ceil((catalogViewport.scrollTop + catalogViewport.height) / CATALOG_ROW_HEIGHT) + CATALOG_OVERSCAN);
  const visibleItems = shownItems.slice(firstVisibleRow, lastVisibleRow);

  const clearFilters = () => {
    setQuery("");
    updateCatalogParams({
      catalogQ: null,
      catalogPage: null,
      catalogWorkflow: null,
      catalogAvailability: null,
      catalogValidation: null,
      catalogCategory: null,
      catalogSupply: null,
    });
  };

  const handleSort = (next: SortKey) => {
    const direction = sortKey === next ? sortDirection === "asc" ? "desc" : "asc" : next === "updated_at" ? "desc" : "asc";
    updateCatalogParams({ catalogSort: next === "updated_at" ? null : next, catalogDir: direction === "desc" ? null : direction, catalogPage: null });
  };

  const selectComponent = (component: CatalogComponent) => {
    setSelectedComponent(component);
    updateCatalogParams({ catalogSelection: component.id }, true);
  };

  const closeQuickView = () => updateCatalogParams({ catalogSelection: null }, true);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <div className="relative min-w-48 flex-1 lg:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input data-shortcut-search aria-label="Search component catalog" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-8 pl-8 pr-8 text-xs" />
          {query ? <Button size="icon-sm" variant="ghost" aria-label="Clear catalog search" title="Clear" className="absolute right-0.5 top-1/2 -translate-y-1/2" onClick={() => setQuery("")}><X className="h-3.5 w-3.5" /></Button> : null}
        </div>
        <Select value={workflow} onValueChange={(value) => updateCatalogParams({ catalogWorkflow: value === "all" ? null : value, catalogPage: null })}><SelectTrigger size="sm" aria-label="Filter by workflow"><SelectValue placeholder="Workflow" /></SelectTrigger><SelectContent><SelectItem value="all">Any workflow</SelectItem>{Object.entries(WORKFLOW_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Select value={availability} onValueChange={(value) => updateCatalogParams({ catalogAvailability: value === "all" ? null : value, catalogPage: null })}><SelectTrigger size="sm" aria-label="Filter by CAD availability"><SelectValue placeholder="CAD" /></SelectTrigger><SelectContent><SelectItem value="all">Any CAD</SelectItem>{Object.entries(AVAILABILITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Select value={validation} onValueChange={(value) => updateCatalogParams({ catalogValidation: value === "all" ? null : value, catalogPage: null })}><SelectTrigger size="sm" aria-label="Filter by validation"><SelectValue placeholder="Validation" /></SelectTrigger><SelectContent><SelectItem value="all">Any validation</SelectItem>{Object.entries(VALIDATION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Select value={category} onValueChange={(value) => updateCatalogParams({ catalogCategory: value === "all" ? null : value, catalogPage: null })}><SelectTrigger size="sm" aria-label="Filter by category" className="max-w-48"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">Any category</SelectItem><SelectItem value="uncategorized">Uncategorized</SelectItem>{categories.flatMap((item) => (item.name ? [<SelectItem key={item.name} value={item.name}>{item.name} ({item.count})</SelectItem>] : []))}</SelectContent></Select>
        <CatalogSupplyBar
          filter={supplyFilter}
          onFilter={(next) => updateCatalogParams({ catalogSupply: next || null })}
          rows={shownItems}
          standing={supplyStanding}
          role={user?.role}
          onChanged={() => void refreshSupply()}
          picked={picks.picked}
          onClearPicks={picks.clear}
        />
        {isFiltered ? <Button size="sm" variant="ghost" className="h-7" title="Clear filters" onClick={clearFilters}><FilterX className="h-3.5 w-3.5" />{activeFilterCount ? activeFilterCount : null}</Button> : null}
        <div className="ml-auto flex items-center gap-1.5">
          {canAdministerCatalog(user?.role) ? <LibraryCatalogFileCheck /> : null}
          <Button size="icon-sm" variant="outline" aria-label="Refresh component catalog" title="Refresh" disabled={loading} onClick={refreshCatalog}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /></Button>
          {/* Shown disabled rather than hidden: a reader who cannot find the
              button assumes the feature is missing. */}
          <PermissionHint blocked={!canCreate} action="create catalog components" allowedRoles={["designer", "admin"]}>
            <Button size="sm" disabled={!canCreate} onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New</Button>
          </PermissionHint>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col p-4">

        {error ? (
          <Alert variant="destructive" className="max-w-xl self-center">
            <CircleAlert />
            <AlertTitle>Catalog not loaded</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3"><span className="truncate" title={error}>{error}</span><Button size="sm" variant="outline" onClick={refreshCatalog}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></AlertDescription>
          </Alert>
        ) : loading && items.length === 0 ? (
          <div className="flex min-h-64 flex-1 items-center justify-center text-muted-foreground" aria-label="Loading"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : items.length === 0 ? <CatalogEmpty filtered={isFiltered} onClear={clearFilters} /> : (
          <div className={cn("flex min-h-0 flex-1 flex-col border transition-opacity", loading && "pointer-events-none opacity-60")} aria-busy={loading}>
            <div
              ref={setCatalogScroller}
              className="themed-scrollbar scroll-below-head min-h-0 flex-1 overflow-auto"
              onScroll={catalogViewport.onScroll}
            >
            <div className={supplyColumn ? "min-w-[1140px]" : "min-w-[980px]"}>
            <div ref={catalogHead} className="sticky top-0 z-10 grid items-center gap-3 border-b bg-muted px-3 py-2" style={{ gridTemplateColumns: gridTemplate }}>
              <span className="flex min-w-0"><SortControl label="Component / MPN" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              <span className="flex min-w-0"><SortControl label="Manufacturer" sortKey="manufacturer" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              <span className="flex min-w-0"><SortControl label="Category / Package" sortKey="category" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              <span className="flex min-w-0"><SortControl label="CAD" sortKey="availability_state" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              <span className="flex min-w-0"><SortControl label="Workflow" sortKey="workflow_stage" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              <span className={HEADING}>Validation</span>
              <span className="flex min-w-0"><SortControl label="Revision / Updated" sortKey="updated_at" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              {supplyColumn ? <span className={HEADING}>Supply</span> : null}
            </div>
              <div className="relative" style={{ height: items.length * CATALOG_ROW_HEIGHT }}>
              {visibleItems.map((component, visibleIndex) => (
                <button
                  key={component.id}
                  type="button"
                  className={cn("absolute inset-x-0 grid h-16 w-full items-center gap-3 border-b px-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", selectedComponentId === component.id && "bg-secondary", picks.picked.has(component.id) && "bg-primary/10 ring-1 ring-inset ring-primary/40")}
                  style={{ transform: `translateY(${(firstVisibleRow + visibleIndex) * CATALOG_ROW_HEIGHT}px)`, gridTemplateColumns: gridTemplate }}
                  onClick={(event) => (event.ctrlKey || event.metaKey) && canEditSupply(user?.role) ? picks.toggle(component.id) : selectComponent(component)}
                  aria-pressed={selectedComponentId === component.id}
                >
                  <div className="min-w-0"><p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium"><CatalogSupplyDot standing={supplyStanding[component.id]} /><RestrictionTag standing={supplyStanding[component.id]} /><span className="truncate">{component.name}</span></p><p className="truncate text-xs text-muted-foreground">{component.mpn || component.value || "No part number"}</p></div>
                  <div className="min-w-0"><p className="truncate text-xs">{component.manufacturer || "—"}</p><p className="truncate text-xs text-muted-foreground">{component.vendor || component.source}</p></div>
                  <div className="min-w-0"><p className="truncate text-xs">{component.category || "Uncategorized"}</p><p className="truncate text-xs text-muted-foreground">{component.package_name || "No package"}</p></div>
                  <div className="flex min-w-0"><AvailabilityBadge state={component.availability_state} /></div>
                  <div className="flex min-w-0"><WorkflowBadge stage={component.workflow_stage} /></div>
                  <div className="flex min-w-0"><ValidationBadge status={component.validation.status} /></div>
                  <div className="min-w-0"><p className="text-xs font-medium">v{component.revision}</p><p className="truncate text-xs text-muted-foreground" title={component.created_by}>{formatDate(component.revision_updated_at)} · {component.created_by || "Unknown author"}</p></div>
                  {supplyColumn ? <CatalogSupplyCell standing={supplyStanding[component.id]} /> : null}
                </button>
              ))}
              </div>
            </div>
            </div>
            <LibraryPager
              label="Catalog pagination"
              page={page}
              pages={pages}
              first={firstItem}
              last={lastItem}
              total={total}
              disabled={loading}
              jump
              onPage={(target) => updateCatalogParams({ catalogPage: target > 1 ? String(target) : null })}
            />
          </div>
        )}
        </div>
        {selectedComponentId ? (
          <LibraryComponentQuickView
            component={selectedComponent}
            loading={selectedLoading}
            error={selectedError}
            onClose={closeQuickView}
            onOpenWorkspace={() => onOpenComponent(selectedComponentId)}
            onRetry={() => setSelectedRefreshKey((value) => value + 1)}
          />
        ) : null}
      </div>

      <CreateComponentDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(component) => onOpenComponent(component.id)} />
    </div>
  );
}
