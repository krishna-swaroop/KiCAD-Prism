import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  CircleAlert,
  CircleDashed,
  Database,
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
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useVirtualViewport } from "@/hooks/use-virtual-viewport";
import { fetchJson } from "@/lib/api";
import {
  AVAILABILITY_BADGE_TITLE,
  AVAILABILITY_BADGE_VARIANT,
  VALIDATION_BADGE_TITLE,
  VALIDATION_BADGE_VARIANT,
  WORKFLOW_BADGE_TITLE,
  WORKFLOW_BADGE_VARIANT,
} from "@/lib/catalog-badges";
import { PermissionHint } from "@/components/ui/permission-hint";
import { canWriteCatalog } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type {
  AvailabilityState,
  CatalogComponent,
  CatalogValidationStatus,
  PaginatedComponents,
  WorkflowStage,
} from "@/types/catalog";
import { LibraryComponentQuickView } from "./library-component-quick-view";

const PAGE_SIZE = 100;
const CATALOG_ROW_HEIGHT = 64;
const CATALOG_OVERSCAN = 6;

type SortKey = "name" | "manufacturer" | "category" | "package_name" | "availability_state" | "workflow_stage" | "updated_at";
type SortDirection = "asc" | "desc";

const SORT_KEYS: SortKey[] = ["name", "manufacturer", "category", "package_name", "availability_state", "workflow_stage", "updated_at"];
const WORKFLOW_KEYS: WorkflowStage[] = ["open", "in_progress", "qa_review", "done", "released", "archived"];
const AVAILABILITY_KEYS: AvailabilityState[] = ["place_ready", "files_partial", "metadata_only"];
const VALIDATION_KEYS: CatalogValidationStatus[] = ["passed", "warning", "failed", "skipped", "not_run"];

const enumParam = <T extends string>(value: string | null, allowed: T[], fallback: T): T =>
  value && allowed.includes(value as T) ? value as T : fallback;

type CreateComponentForm = {
  value: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  description: string;
  datasheet: string;
  category: string;
  packageName: string;
  changeSummary: string;
};

const EMPTY_CREATE_FORM: CreateComponentForm = {
  value: "",
  manufacturer: "",
  manufacturerPartNumber: "",
  description: "",
  datasheet: "",
  category: "",
  packageName: "",
  changeSummary: "Create component metadata record",
};

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

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
};

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
      className={cn("inline-flex items-center gap-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "text-foreground")}
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
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 border border-dashed p-8 text-center">
      <Library className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{filtered ? "No components match this query" : "The component catalog is empty"}</p>
      <p className="max-w-xl text-xs text-muted-foreground">{filtered ? "Search and filters run on the server. Clear them to return to the complete catalog." : "Create a metadata record or import components from existing KiCad projects to get started."}</p>
      {filtered ? <Button size="sm" variant="outline" className="mt-2" onClick={onClear}><FilterX className="h-3.5 w-3.5" /> Clear search and filters</Button> : null}
    </div>
  );
}

function CreateComponentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (component: CatalogComponent) => void;
}) {
  const [form, setForm] = useState<CreateComponentForm>(EMPTY_CREATE_FORM);
  const [submitting, setSubmitting] = useState(false);

  const setField = (field: keyof CreateComponentForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const canSubmit = Boolean(form.value.trim() && form.manufacturer.trim() && form.manufacturerPartNumber.trim() && form.description.trim() && form.datasheet.trim() && form.changeSummary.trim());

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("Complete every required component field and the change summary.");
      return;
    }
    setSubmitting(true);
    try {
      const component = await fetchJson<CatalogComponent>("/api/catalog/components", {
        method: "POST",
        body: JSON.stringify({
          value: form.value.trim(),
          manufacturer: form.manufacturer.trim(),
          manufacturer_part_number: form.manufacturerPartNumber.trim(),
          description: form.description.trim(),
          datasheet: form.datasheet.trim(),
          category: form.category.trim(),
          package_name: form.packageName.trim(),
          change_summary: form.changeSummary.trim(),
        }),
      });
      toast.success(`${component.name} created as revision v${component.revision}.`);
      setForm(EMPTY_CREATE_FORM);
      onOpenChange(false);
      onCreated(component);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create component record</DialogTitle>
          <DialogDescription>Create the first immutable metadata revision, then attach and validate CAD assets in the component workspace.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="catalog-create-value">Value *</Label><Input id="catalog-create-value" autoFocus required value={form.value} onChange={(event) => setField("value", event.target.value)} placeholder="10 kΩ, TPS55289, USB-C…" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-create-manufacturer">Manufacturer *</Label><Input id="catalog-create-manufacturer" required value={form.manufacturer} onChange={(event) => setField("manufacturer", event.target.value)} placeholder="Texas Instruments" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-create-mpn">Manufacturer part number *</Label><Input id="catalog-create-mpn" required value={form.manufacturerPartNumber} onChange={(event) => setField("manufacturerPartNumber", event.target.value)} placeholder="TPS55289RGER" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-create-datasheet">Datasheet URL *</Label><Input id="catalog-create-datasheet" type="url" required value={form.datasheet} onChange={(event) => setField("datasheet", event.target.value)} placeholder="https://…" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-create-category">Category</Label><Input id="catalog-create-category" value={form.category} onChange={(event) => setField("category", event.target.value)} placeholder="Power management" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-create-package">Package</Label><Input id="catalog-create-package" value={form.packageName} onChange={(event) => setField("packageName", event.target.value)} placeholder="VQFN-24" /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="catalog-create-description">Description *</Label><Textarea id="catalog-create-description" required value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Concise engineering description and key function…" rows={3} /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="catalog-create-summary">Change summary *</Label><Input id="catalog-create-summary" required value={form.changeSummary} onChange={(event) => setField("changeSummary", event.target.value)} placeholder="Why this component record is being introduced" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={submitting || !canSubmit} onClick={() => void handleSubmit()}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create revision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [items, setItems] = useState<CatalogComponent[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState(urlQuery);
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const selectedComponentId = searchParams.get("catalogSelection") || "";
  const [selectedComponent, setSelectedComponent] = useState<CatalogComponent | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState("");
  const [selectedRefreshKey, setSelectedRefreshKey] = useState(0);
  const catalogViewport = useVirtualViewport();
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

  useEffect(() => {
    let cancelled = false;
    void fetchJson<{ categories: Array<{ name: string; count: number }> }>("/api/catalog/categories")
      .then((response) => { if (!cancelled) setCategories(response.categories); })
      .catch(() => { /* Category discovery is non-blocking for catalog browsing. */ });
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
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

    void fetchJson<PaginatedComponents>(`/api/catalog/components?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        setItems(response.items);
        setTotal(response.total);
        setPages(response.pages);
        if (page > response.pages) updateCatalogParams({ catalogPage: response.pages > 1 ? String(response.pages) : null }, true);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setItems([]);
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [availability, category, page, refreshKey, sortDirection, sortKey, updateCatalogParams, urlQuery, validation, workflow]);

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
    void fetchJson<CatalogComponent>(`/api/catalog/components/${encodeURIComponent(selectedComponentId)}`, { signal: controller.signal })
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

  const [pageInput, setPageInput] = useState("");
  const activeFilterCount = [workflow, availability, validation, category].filter((value) => value !== "all").length;
  const isFiltered = Boolean(urlQuery || activeFilterCount);
  // Twelve equal columns gave the badge columns a single 1/12 slice, far narrower
  // than "CAD complete" or "Not run", so they overflowed into their neighbour.
  // Each column now has a floor wide enough for its content and grows from there.
  // With the detail panel open the same columns stay present but narrow, so a row
  // never changes shape under the reader while they are comparing components.
  const catalogGridTemplate = selectedComponentId
    ? "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(112px,0.9fr) minmax(96px,0.8fr) minmax(96px,0.8fr) minmax(0,1.1fr)"
    : "minmax(0,2.4fr) minmax(0,1.5fr) minmax(0,1.5fr) minmax(124px,1fr) minmax(104px,0.9fr) minmax(104px,0.9fr) minmax(0,1.6fr)";
  const firstItem = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastItem = Math.min(page * PAGE_SIZE, total);
  const firstVisibleRow = Math.max(0, Math.floor(catalogViewport.scrollTop / CATALOG_ROW_HEIGHT) - CATALOG_OVERSCAN);
  const lastVisibleRow = Math.min(items.length, Math.ceil((catalogViewport.scrollTop + catalogViewport.height) / CATALOG_ROW_HEIGHT) + CATALOG_OVERSCAN);
  const visibleItems = items.slice(firstVisibleRow, lastVisibleRow);

  const clearFilters = () => {
    setQuery("");
    updateCatalogParams({
      catalogQ: null,
      catalogPage: null,
      catalogWorkflow: null,
      catalogAvailability: null,
      catalogValidation: null,
      catalogCategory: null,
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
      <header className="shrink-0 border-b bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div>
            <div className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Component Catalog</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Server-indexed component identity, lifecycle, CAD readiness, and revision evidence.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" aria-label="Refresh component catalog" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh</Button>
            {/* Shown disabled rather than hidden: a reader who cannot find the
                button assumes the feature is missing, where a disabled one that
                explains itself tells them exactly what to ask for. */}
            <PermissionHint blocked={!canCreate} action="create catalog components" allowedRoles={["component_designer", "admin"]}>
              <Button size="sm" disabled={!canCreate} onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> New component</Button>
            </PermissionHint>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2">
          <div className="relative min-w-64 flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input data-shortcut-search aria-label="Search component catalog" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search MPN, value, description, manufacturer…" className="h-8 pl-8 pr-8 text-xs" />
            {query ? <button type="button" aria-label="Clear catalog search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setQuery("")}><X className="h-3.5 w-3.5" /></button> : null}
          </div>
          <Select value={workflow} onValueChange={(value) => updateCatalogParams({ catalogWorkflow: value === "all" ? null : value, catalogPage: null })}><SelectTrigger size="sm" aria-label="Filter by workflow"><SelectValue placeholder="Workflow" /></SelectTrigger><SelectContent><SelectItem value="all">All workflow stages</SelectItem>{Object.entries(WORKFLOW_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={availability} onValueChange={(value) => updateCatalogParams({ catalogAvailability: value === "all" ? null : value, catalogPage: null })}><SelectTrigger size="sm" aria-label="Filter by CAD availability"><SelectValue placeholder="CAD availability" /></SelectTrigger><SelectContent><SelectItem value="all">All CAD states</SelectItem>{Object.entries(AVAILABILITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={validation} onValueChange={(value) => updateCatalogParams({ catalogValidation: value === "all" ? null : value, catalogPage: null })}><SelectTrigger size="sm" aria-label="Filter by validation"><SelectValue placeholder="Validation" /></SelectTrigger><SelectContent><SelectItem value="all">All validation states</SelectItem>{Object.entries(VALIDATION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={category} onValueChange={(value) => updateCatalogParams({ catalogCategory: value === "all" ? null : value, catalogPage: null })}><SelectTrigger size="sm" aria-label="Filter by category" className="max-w-48"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem><SelectItem value="uncategorized">Uncategorized</SelectItem>{categories.filter((item) => item.name).map((item) => <SelectItem key={item.name} value={item.name}>{item.name} ({item.count})</SelectItem>)}</SelectContent></Select>
          {isFiltered ? <Button size="sm" variant="ghost" className="h-7" onClick={clearFilters}><FilterX className="h-3.5 w-3.5" /> Clear {activeFilterCount ? `(${activeFilterCount})` : ""}</Button> : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <span aria-live="polite">{loading ? "Querying catalog index…" : `${firstItem.toLocaleString()}–${lastItem.toLocaleString()} of ${total.toLocaleString()} components`}</span>
          <span>100 rows per page · server-side search and sort</span>
        </div>

        {error ? (
          <div className="flex min-h-64 flex-1 items-center justify-center">
            <div className="max-w-xl border border-destructive bg-destructive/10 p-5 text-center"><CircleAlert className="mx-auto h-6 w-6 text-destructive" /><p className="mt-2 text-sm font-medium">Catalog query failed</p><p className="mt-1 text-xs text-muted-foreground">{error}</p><Button className="mt-4" size="sm" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></div>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="flex min-h-64 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading catalog page from the server…</div>
        ) : items.length === 0 ? <CatalogEmpty filtered={isFiltered} onClear={clearFilters} /> : (
          <div className={cn("flex min-h-0 flex-1 flex-col border transition-opacity", loading && "pointer-events-none opacity-60")} aria-busy={loading}>
            <div className="hidden shrink-0 gap-3 border-b bg-muted/30 px-3 py-2 lg:grid" style={{ gridTemplateColumns: catalogGridTemplate }}>
              <span className="min-w-0"><SortControl label="Component / MPN" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              <span className="min-w-0"><SortControl label="Manufacturer" sortKey="manufacturer" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              <span className="min-w-0"><SortControl label="Category / Package" sortKey="category" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              <span className="min-w-0"><SortControl label="CAD" sortKey="availability_state" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              <span className="min-w-0"><SortControl label="Workflow" sortKey="workflow_stage" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
              <span className="min-w-0 text-xs font-medium text-muted-foreground">Validation</span>
              <span className="min-w-0"><SortControl label="Revision / Updated" sortKey="updated_at" activeKey={sortKey} direction={sortDirection} onSort={handleSort} /></span>
            </div>
            <div
              ref={catalogViewport.viewportRef}
              className="min-h-0 flex-1 overflow-auto"
              onScroll={catalogViewport.onScroll}
            >
              <div className="relative" style={{ height: items.length * CATALOG_ROW_HEIGHT }}>
              {visibleItems.map((component, visibleIndex) => (
                <button
                  key={component.id}
                  type="button"
                  className={cn("absolute inset-x-0 grid h-16 w-full items-center gap-3 border-b px-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", selectedComponentId === component.id && "bg-secondary")}
                  style={{ transform: `translateY(${(firstVisibleRow + visibleIndex) * CATALOG_ROW_HEIGHT}px)`, gridTemplateColumns: catalogGridTemplate }}
                  onClick={() => selectComponent(component)}
                  aria-pressed={selectedComponentId === component.id}
                >
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{component.name}</p><p className="truncate text-xs text-muted-foreground">{component.mpn || component.value || "No part number"}</p></div>
                  <div className="min-w-0"><p className="truncate text-xs">{component.manufacturer || "—"}</p><p className="truncate text-xs text-muted-foreground">{component.vendor || component.source}</p></div>
                  <div className="min-w-0"><p className="truncate text-xs">{component.category || "Uncategorized"}</p><p className="truncate text-xs text-muted-foreground">{component.package_name || "No package"}</p></div>
                  <div className="flex min-w-0"><AvailabilityBadge state={component.availability_state} /></div>
                  <div className="flex min-w-0"><WorkflowBadge stage={component.workflow_stage} /></div>
                  <div className="flex min-w-0"><ValidationBadge status={component.validation.status} /></div>
                  <div className="min-w-0"><p className="text-xs font-medium">v{component.revision}</p><p className="truncate text-xs text-muted-foreground" title={component.created_by}>{formatDate(component.revision_updated_at)} · {component.created_by || "Unknown author"}</p></div>
                </button>
              ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2">
              <span className="text-xs text-muted-foreground">Page {page.toLocaleString()} of {pages.toLocaleString()}</span>
              <nav className="flex items-center gap-1" aria-label="Catalog pagination">
                <Button size="sm" variant="outline" className="h-7" disabled={loading || page <= 1} onClick={() => updateCatalogParams({ catalogPage: null })}>First</Button>
                <Button size="sm" variant="outline" className="h-7" disabled={loading || page <= 1} onClick={() => updateCatalogParams({ catalogPage: page - 1 > 1 ? String(page - 1) : null })}>Previous</Button>
                {/* Stepping to page 173 of 240 one click at a time is not a workflow. */}
                <form
                  className="flex items-center gap-1 px-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const requested = Number(pageInput);
                    if (!Number.isFinite(requested)) return;
                    const target = Math.min(pages, Math.max(1, Math.trunc(requested)));
                    updateCatalogParams({ catalogPage: target > 1 ? String(target) : null });
                    setPageInput("");
                  }}
                >
                  <label htmlFor="catalog-page-input" className="sr-only">Go to page</label>
                  <Input
                    id="catalog-page-input"
                    className="h-7 w-16 text-center text-xs"
                    inputMode="numeric"
                    disabled={loading || pages <= 1}
                    value={pageInput}
                    placeholder={String(page)}
                    onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
                    aria-label={`Go to page, ${pages} pages available`}
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-7" disabled={loading || !pageInput}>Go</Button>
                </form>
                <Button size="sm" variant="outline" className="h-7" disabled={loading || page >= pages} onClick={() => updateCatalogParams({ catalogPage: String(Math.min(pages, page + 1)) })}>Next</Button>
                <Button size="sm" variant="outline" className="h-7" disabled={loading || page >= pages} onClick={() => updateCatalogParams({ catalogPage: String(pages) })}>Last</Button>
              </nav>
            </div>
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
