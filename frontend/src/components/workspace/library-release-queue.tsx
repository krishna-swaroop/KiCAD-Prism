import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CircleAlert,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudioTabsList, StudioTabsTrigger } from "@/components/ui/studio-tabs";
import { Tabs } from "@/components/ui/tabs";
import { getReleaseQueue } from "./catalog-client";
import { LibraryPager } from "./library-pager";
import {
  VALIDATION_BADGE_TITLE,
  VALIDATION_BADGE_VARIANT,
  WORKFLOW_BADGE_TITLE,
  WORKFLOW_BADGE_VARIANT,
} from "@/lib/catalog-badges";
import { cn } from "@/lib/utils";
import type { CatalogComponent, CatalogReleaseQueueResponse, WorkflowStage } from "@/types/catalog";
import { formatDate } from "./library-component-chrome";

type QueueFilter = "all" | "qa_review" | "done";

const PAGE_SIZE = 50;
const QUEUE_FILTERS: QueueFilter[] = ["all", "qa_review", "done"];

const STAGE_LABELS: Record<"qa_review" | "done", string> = {
  qa_review: "Awaiting QA",
  done: "Ready to release",
};

const VALIDATION_LABELS = {
  passed: "Passed",
  warning: "Warnings",
  failed: "Failed",
  skipped: "Skipped",
  not_run: "Not run",
} as const;

const EMPTY_SUMMARY: CatalogReleaseQueueResponse["summary"] = {
  qa_review: 0,
  done: 0,
  blocked: 0,
};

// One line per revision. Every column has a floor; below them the list scrolls
// sideways rather than squeezing a column to nothing.
const QUEUE_GRID_TEMPLATE = "minmax(200px,2.2fr) 128px minmax(140px,1fr) 128px 112px minmax(140px,1fr)";

function ReadinessBadge({ component }: { component: CatalogComponent }) {
  if (component.missing_assets.length) {
    return <Badge variant="destructive" className="max-w-full" title={`Missing ${component.missing_assets.join(", ")}`}><CircleAlert className="h-3 w-3 shrink-0" /><span className="truncate">Blocked</span></Badge>;
  }
  return <Badge variant="success" className="max-w-full" title="Symbol and footprint attached"><PackageCheck className="h-3 w-3 shrink-0" /><span className="truncate">CAD complete</span></Badge>;
}

function ValidationBadge({ component }: { component: CatalogComponent }) {
  const { status, error_count: errors, warning_count: warnings } = component.validation;
  return (
    <Badge variant={VALIDATION_BADGE_VARIANT[status]} className="max-w-full" title={`${VALIDATION_BADGE_TITLE[status]} · ${errors} errors · ${warnings} warnings`}>
      {status === "failed" ? <CircleAlert className="h-3 w-3 shrink-0" /> : <ShieldCheck className="h-3 w-3 shrink-0" />}
      <span className="truncate">{VALIDATION_LABELS[status]}</span>
    </Badge>
  );
}

export function LibraryReleaseQueue({ onOpenComponent }: { onOpenComponent: (componentId: string, tab: "review") => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("releaseQueueQ") || "";
  const requestedFilter = searchParams.get("releaseQueueStage") as QueueFilter | null;
  const filter: QueueFilter = requestedFilter && QUEUE_FILTERS.includes(requestedFilter) ? requestedFilter : "all";
  const parsedPage = Number.parseInt(searchParams.get("releaseQueuePage") || "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [query, setQuery] = useState(urlQuery);
  const [items, setItems] = useState<CatalogComponent[]>([]);
  const [summary, setSummary] = useState<CatalogReleaseQueueResponse["summary"]>(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const updateQueueParams = useCallback((values: Record<string, string | null>, replace = false) => {
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      for (const [key, value] of Object.entries(values)) {
        if (value && value !== "all") updated.set(key, value);
        else updated.delete(key);
      }
      updated.set("section", "library-manager");
      updated.set("libraryView", "releases");
      return updated;
    }, { replace });
  }, [setSearchParams]);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized === urlQuery) return;
    const timer = window.setTimeout(() => updateQueueParams({ releaseQueueQ: normalized || null, releaseQueuePage: null }, true), 250);
    return () => window.clearTimeout(timer);
  }, [query, updateQueueParams, urlQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      q: urlQuery,
      workflow_stage: filter,
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    void getReleaseQueue(params, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setItems(response.items);
        setSummary(response.summary);
        setTotal(response.total);
        setPages(response.pages);
        if (page > response.pages) updateQueueParams({ releaseQueuePage: response.pages > 1 ? String(response.pages) : null }, true);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, page, refreshKey, updateQueueParams, urlQuery]);

  const firstItem = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastItem = Math.min(page * PAGE_SIZE, total);
  const filtered = Boolean(urlQuery || filter !== "all");
  const allCount = summary.qa_review + summary.done;

  const refresh = () => setRefreshKey((value) => value + 1);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <Tabs value={filter} activationMode="manual" className="shrink-0">
          <StudioTabsList aria-label="Release queue stage filter">
            {QUEUE_FILTERS.map((stage) => (
              <StudioTabsTrigger
                key={stage}
                value={stage}
                className="gap-1.5"
                onClick={() => updateQueueParams({ releaseQueueStage: stage === "all" ? null : stage, releaseQueuePage: null })}
              >
                {stage === "all" ? "All" : STAGE_LABELS[stage]}
                <span className="tabular-nums opacity-70">{stage === "all" ? allCount : summary[stage]}</span>
              </StudioTabsTrigger>
            ))}
          </StudioTabsList>
        </Tabs>
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input data-shortcut-search aria-label="Search release queue" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-8 pl-8 pr-8 text-xs" />
          {query ? <Button size="icon-sm" variant="ghost" aria-label="Clear release queue search" title="Clear" className="absolute right-0.5 top-1/2 -translate-y-1/2" onClick={() => setQuery("")}><X className="h-3.5 w-3.5" /></Button> : null}
        </div>
        {summary.blocked ? (
          <Badge variant="destructive" title="Missing CAD files or failed validation"><CircleAlert className="h-3 w-3" />{summary.blocked} blocked</Badge>
        ) : null}
        <Button size="icon-sm" variant="outline" className="ml-auto" aria-label="Refresh release queue" title="Refresh" disabled={loading} onClick={refresh}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        {error ? (
          <Alert variant="destructive" className="max-w-xl self-center">
            <CircleAlert />
            <AlertTitle>Release queue not loaded</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3"><span className="truncate" title={error}>{error}</span><Button size="sm" variant="outline" onClick={refresh}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></AlertDescription>
          </Alert>
        ) : loading && items.length === 0 ? (
          <div className="flex min-h-64 flex-1 items-center justify-center text-muted-foreground" aria-label="Loading"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="size-6" aria-hidden />
            {filtered ? "No matches" : "Queue is clear"}
          </div>
        ) : (
          <div className={cn("flex min-h-0 flex-1 flex-col border transition-opacity", loading && "pointer-events-none opacity-60")} aria-busy={loading}>
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="min-w-[880px]">
                <div className="sticky top-0 z-10 grid gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns: QUEUE_GRID_TEMPLATE }}>
                  <span>Component</span>
                  <span>Stage</span>
                  <span>Revision</span>
                  <span>CAD</span>
                  <span>Validation</span>
                  <span>Updated</span>
                </div>
                {items.map((component) => {
                  const stage = component.workflow_stage as Extract<WorkflowStage, "qa_review" | "done">;
                  return (
                    <button
                      key={component.id}
                      type="button"
                      className="grid h-10 w-full items-center gap-3 border-b px-3 text-left text-xs transition-colors last:border-b-0 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      style={{ gridTemplateColumns: QUEUE_GRID_TEMPLATE }}
                      onClick={() => onOpenComponent(component.id, "review")}
                    >
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-sm font-medium">{component.name}</span>
                        <span className="truncate text-muted-foreground" title={component.manufacturer || undefined}>{component.mpn || component.value}</span>
                      </span>
                      <span className="flex min-w-0"><Badge variant={WORKFLOW_BADGE_VARIANT[stage]} className="max-w-full" title={WORKFLOW_BADGE_TITLE[stage]}><span className="truncate">{STAGE_LABELS[stage]}</span></Badge></span>
                      <span className="truncate" title={component.created_by}>v{component.revision}<span className="text-muted-foreground"> · {component.created_by || "—"}</span></span>
                      <span className="flex min-w-0"><ReadinessBadge component={component} /></span>
                      <span className="flex min-w-0"><ValidationBadge component={component} /></span>
                      <span className="truncate text-muted-foreground">{formatDate(component.revision_updated_at)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <LibraryPager
              label="Release queue pagination"
              page={page}
              pages={pages}
              first={firstItem}
              last={lastItem}
              total={total}
              disabled={loading}
              onPage={(target) => updateQueueParams({ releaseQueuePage: target > 1 ? String(target) : null })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
