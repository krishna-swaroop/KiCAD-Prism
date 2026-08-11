import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CircleAlert,
  ClipboardCheck,
  FileCheck2,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchJson } from "@/lib/api";
import {
  VALIDATION_BADGE_TITLE,
  VALIDATION_BADGE_VARIANT,
  WORKFLOW_BADGE_TITLE,
  WORKFLOW_BADGE_VARIANT,
} from "@/lib/catalog-badges";
import { cn } from "@/lib/utils";
import type { CatalogComponent, CatalogReleaseQueueResponse, WorkflowStage } from "@/types/catalog";

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

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

function QueueMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ReadinessCell({ component }: { component: CatalogComponent }) {
  if (component.missing_assets.length) {
    return (
      <div className="min-w-0">
        <Badge variant="destructive" className="min-w-0 max-w-full shrink"><CircleAlert className="h-3 w-3 shrink-0" /> Blocked</Badge>
        <p className="truncate text-xs text-muted-foreground" title={component.missing_assets.join(", ")}>Missing {component.missing_assets.join(", ")}</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <Badge variant="success" className="min-w-0 max-w-full shrink"><PackageCheck className="h-3 w-3 shrink-0" /> CAD complete</Badge>
      <p className="truncate text-xs text-muted-foreground">Symbol and footprint attached</p>
    </div>
  );
}

function ValidationCell({ component }: { component: CatalogComponent }) {
  const status = component.validation.status;
  return (
    <div className="min-w-0">
      <Badge variant={VALIDATION_BADGE_VARIANT[status]} className="min-w-0 max-w-full shrink" title={VALIDATION_BADGE_TITLE[status]}>
        {status === "failed" ? <CircleAlert className="h-3 w-3 shrink-0" /> : <ShieldCheck className="h-3 w-3 shrink-0" />}
        <span className="truncate">{VALIDATION_LABELS[status]}</span>
      </Badge>
      <p className="text-xs text-muted-foreground">{component.validation.error_count} errors · {component.validation.warning_count} warnings</p>
    </div>
  );
}

function QueueEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 border border-dashed p-6 text-center">
      <ClipboardCheck className="h-7 w-7 text-muted-foreground" />
      <p className="text-sm font-medium">{filtered ? "No matching release work" : "Release queue is clear"}</p>
      <p className="max-w-xl text-xs text-muted-foreground">{filtered ? "Try a different search or stage filter." : "Components submitted for QA or approved for release will appear here automatically."}</p>
    </div>
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
    void fetchJson<CatalogReleaseQueueResponse>(`/api/catalog/release-queue?${params.toString()}`, { signal: controller.signal })
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 space-y-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Release Queue</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Review immutable component revisions, resolve blockers, and release with auditable decisions.</p>
          </div>
          <Button size="sm" variant="outline" aria-label="Refresh release queue" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <QueueMetric label="Awaiting QA" value={summary.qa_review} detail="Needs an independent review decision" />
          <QueueMetric label="Ready to release" value={summary.done} detail="Approved revisions awaiting publication" />
          <QueueMetric label="Evidence blockers" value={summary.blocked} detail="Missing CAD files or failed validation" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 border bg-muted/20 p-1" role="group" aria-label="Release queue stage filter">
            {QUEUE_FILTERS.map((stage) => (
              <Button
                key={stage}
                size="sm"
                variant={filter === stage ? "secondary" : "ghost"}
                className="h-7"
                aria-pressed={filter === stage}
                onClick={() => updateQueueParams({ releaseQueueStage: stage === "all" ? null : stage, releaseQueuePage: null })}
              >
                {stage === "all" ? `All (${allCount})` : `${STAGE_LABELS[stage]} (${summary[stage]})`}
              </Button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input data-shortcut-search aria-label="Search release queue" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search part, MPN, package, author…" className="h-8 pl-8 pr-8 text-xs" />
            {query ? <button type="button" aria-label="Clear release queue search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setQuery("")}><X className="h-3.5 w-3.5" /></button> : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        {error ? (
          <div className="flex h-full min-h-64 items-center justify-center">
            <div className="max-w-xl border border-destructive bg-destructive/10 p-5 text-center">
              <CircleAlert className="mx-auto h-6 w-6 text-destructive" />
              <p className="mt-2 text-sm font-medium">Could not load release work</p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
            </div>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="flex h-full min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading release queue page…</div>
        ) : items.length === 0 ? <QueueEmpty filtered={filtered} /> : (
          <div className={cn("flex h-full min-h-0 flex-col border transition-opacity", loading && "pointer-events-none opacity-60")} aria-busy={loading}>
            <div className="hidden shrink-0 grid-cols-12 gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid">
              <span className="col-span-3">Component</span>
              <span className="col-span-2">Stage</span>
              <span className="col-span-2">Revision / author</span>
              <span className="col-span-2">CAD readiness</span>
              <span className="col-span-2">Validation</span>
              <span className="col-span-1 text-right">Review</span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {items.map((component) => {
                const stage = component.workflow_stage as Extract<WorkflowStage, "qa_review" | "done">;
                return (
                  <button
                    key={component.id}
                    type="button"
                    className="grid w-full gap-3 border-b px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid-cols-12 lg:items-center"
                    onClick={() => onOpenComponent(component.id, "review")}
                  >
                    <div className="min-w-0 lg:col-span-3">
                      <p className="truncate text-sm font-medium">{component.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{component.manufacturer || "Unspecified manufacturer"} · {component.mpn || component.value || "No MPN"}</p>
                    </div>
                    <div className="min-w-0 lg:col-span-2">
                      <Badge variant={WORKFLOW_BADGE_VARIANT[stage]} className="max-w-full truncate" title={WORKFLOW_BADGE_TITLE[stage]}>{STAGE_LABELS[stage]}</Badge>
                      <p className="mt-1 truncate text-xs text-muted-foreground">Updated {formatDate(component.revision_updated_at)}</p>
                    </div>
                    <div className="min-w-0 lg:col-span-2">
                      <p className="text-xs font-medium">v{component.revision}</p>
                      <p className="truncate text-xs text-muted-foreground" title={component.created_by}>{component.created_by || "Unknown author"}</p>
                    </div>
                    <div className="min-w-0 lg:col-span-2"><ReadinessCell component={component} /></div>
                    <div className="min-w-0 lg:col-span-2"><ValidationCell component={component} /></div>
                    <div className="flex items-center justify-end gap-2 text-xs font-medium text-primary lg:col-span-1">Open <ArrowRight className="h-3.5 w-3.5" /></div>
                  </button>
                );
              })}
            </ScrollArea>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2">
              <span className="text-xs text-muted-foreground" aria-live="polite">{firstItem.toLocaleString()}–{lastItem.toLocaleString()} of {total.toLocaleString()} queued revisions · Page {page.toLocaleString()} of {pages.toLocaleString()}</span>
              <nav className="flex items-center gap-1" aria-label="Release queue pagination">
                <Button size="sm" variant="outline" className="h-7" disabled={loading || page <= 1} onClick={() => updateQueueParams({ releaseQueuePage: null })}>First</Button>
                <Button size="sm" variant="outline" className="h-7" disabled={loading || page <= 1} onClick={() => updateQueueParams({ releaseQueuePage: page - 1 > 1 ? String(page - 1) : null })}>Previous</Button>
                <Button size="sm" variant="outline" className="h-7" disabled={loading || page >= pages} onClick={() => updateQueueParams({ releaseQueuePage: String(Math.min(pages, page + 1)) })}>Next</Button>
                <Button size="sm" variant="outline" className="h-7" disabled={loading || page >= pages} onClick={() => updateQueueParams({ releaseQueuePage: String(pages) })}>Last</Button>
              </nav>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
