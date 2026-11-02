import { useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, Factory, Search, SlidersHorizontal, StickyNote, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StudioTabsList, StudioTabsTrigger } from "@/components/ui/studio-tabs";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/relative-time";
import { ALL_RUN_STATUSES, RUN_STATUS_LABELS, type ManufacturingRun } from "@/types/manufacturing";
import {
    DEFAULT_FILTERS,
    GROUP_LABELS,
    SORT_LABELS,
    applyFilters,
    boardName,
    groupRuns,
    statusCounts,
    type GroupBy,
    type ProductionFilters,
    type SortKey,
    type StatusFilter,
} from "./production-filters";
import { DefectSummary } from "./defect-summary";
import { EmptyState } from "./empty-state";
import { RunReleaseLink } from "./run-release-link";
import { RunStatusBadge } from "./status-badge";
import { YieldBar } from "./yield-bar";

const CHIPS: { value: StatusFilter; label: string }[] = [
    { value: "active", label: "Active" },
    ...ALL_RUN_STATUSES.map((s) => ({ value: s as StatusFilter, label: RUN_STATUS_LABELS[s] })),
    { value: "all", label: "All" },
];

// Column widths: job and project, manufacturer, status, yield, open defects, updated.
// Job and project, manufacturer, status, ordered, yield, defects, [created,] updated. The
// created column only appears on wide screens; the whole string must stay literal for Tailwind.
const GRID_LG = "lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_8.5rem_4.5rem_minmax(0,1.2fr)_9rem_5.5rem_2.25rem]";
const GRID_XL =
    "xl:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_8.5rem_4.5rem_minmax(0,1.2fr)_9rem_8rem_5.5rem_2.25rem]";

interface ProductionListProps {
    runs: ManufacturingRun[];
    loading?: boolean;
    filters: ProductionFilters;
    onFiltersChange: (next: ProductionFilters) => void;
    selectedId?: string | null;
    onOpen: (runId: string) => void;
    /** Leave out the project name: the list already is one project's. */
    hideProject?: boolean;
    /** Shown in the "no production yet" state, e.g. a New production button. */
    emptyAction?: ReactNode;
    /** Actions at the right end of the filter row (e.g. New production). */
    actions?: ReactNode;
    /**
     * Draw the list as a page: one toolbar band under the section tabs, like the Library
     * tabs. Without it the list is an inline block, as in a project's tab.
     */
    page?: boolean;
    className?: string;
}

/**
 * Productions as a work-order list: status chips with counts (defaulting to the
 * active ones), a search box, a view menu, and rows that open the run. Used by
 * the global Production page and by a project's own Production tab.
 */
export function ProductionList({
    runs,
    loading = false,
    filters,
    onFiltersChange,
    selectedId,
    onOpen,
    hideProject = false,
    emptyAction,
    actions,
    page = false,
    className,
}: ProductionListProps) {
    const counts = useMemo(() => statusCounts(runs, filters), [runs, filters]);
    const visible = useMemo(() => applyFilters(runs, filters), [runs, filters]);
    const groups = useMemo(() => groupRuns(visible, filters.group), [visible, filters.group]);
    const openDefectRuns = useMemo(() => runs.filter((r) => (r.open_defect_count ?? 0) > 0).length, [runs]);
    const bodyRef = useRef<HTMLDivElement>(null);

    const set = (patch: Partial<ProductionFilters>) => onFiltersChange({ ...filters, ...patch });
    const narrowed =
        filters.status !== DEFAULT_FILTERS.status || filters.query.trim() !== "" || filters.openDefectsOnly;

    // Up and Down walk the rows; Enter or Space on a row opens it (the row's own handler).
    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const rows = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>("[data-run-row]") ?? []);
        const index = rows.indexOf(document.activeElement as HTMLElement);
        if (index === -1 && event.key === "ArrowUp") return;
        event.preventDefault();
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
    };

    const chips = (
        <>
            <Tabs value={filters.status} activationMode="manual" className="shrink-0">
                <StudioTabsList aria-label="Filter by status">
                    {CHIPS.map((chip) => (
                        <StudioTabsTrigger
                            key={chip.value}
                            value={chip.value}
                            className="gap-1.5"
                            onClick={() => set({ status: chip.value })}
                        >
                            {chip.label}
                            <span className="tabular-nums opacity-70">{counts[chip.value]}</span>
                        </StudioTabsTrigger>
                    ))}
                </StudioTabsList>
            </Tabs>
            <button
                type="button"
                aria-pressed={filters.openDefectsOnly}
                onClick={() => set({ openDefectsOnly: !filters.openDefectsOnly })}
                className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filters.openDefectsOnly
                        ? "border-destructive bg-destructive/10 font-medium text-destructive"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
            >
                <AlertTriangle className="h-3.5 w-3.5" />
                Open defects
                <span className="tabular-nums opacity-70">{openDefectRuns}</span>
            </button>
        </>
    );

    const searchAndView = (
        <>
            <div className="relative min-w-48 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    data-shortcut-search
                    aria-label="Search production"
                    placeholder="Search"
                    className="h-8 pl-8 pr-8 text-xs"
                    value={filters.query}
                    onChange={(e) => set({ query: e.target.value })}
                />
                {filters.query ? (
                    <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Clear production search"
                        title="Clear"
                        className="absolute right-0.5 top-1/2 -translate-y-1/2"
                        onClick={() => set({ query: "" })}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                ) : null}
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                        <SlidersHorizontal />
                        View
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Group by</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                        value={filters.group}
                        onValueChange={(value) => set({ group: value as GroupBy })}
                    >
                        {(Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => (
                            <DropdownMenuRadioItem key={g} value={g}>
                                {GROUP_LABELS[g]}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                        value={filters.sort}
                        onValueChange={(value) => set({ sort: value as SortKey })}
                    >
                        {(Object.keys(SORT_LABELS) as SortKey[]).map((s) => (
                            <DropdownMenuRadioItem key={s} value={s}>
                                {SORT_LABELS[s]}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );

    const table = (
        <div className="flex min-h-0 flex-1 flex-col border">
            {loading ? (
                <div className="space-y-px p-3" role="status" aria-label="Loading production">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                    ))}
                </div>
            ) : runs.length === 0 ? (
                <EmptyState icon={Factory} className="min-h-64 flex-1 border-0" action={emptyAction}>
                    No production yet.
                </EmptyState>
            ) : visible.length === 0 ? (
                <EmptyState
                    className="min-h-64 flex-1 border-0"
                    action={
                        narrowed ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    onFiltersChange({
                                        ...filters,
                                        status: DEFAULT_FILTERS.status,
                                        query: "",
                                        openDefectsOnly: false,
                                    })
                                }
                            >
                                Clear filters
                            </Button>
                        ) : undefined
                    }
                >
                    No production matches these filters.
                </EmptyState>
            ) : (
                <>
                    <div
                        className={cn(
                            "hidden shrink-0 gap-3 border-b px-3 py-2 text-xs font-medium text-muted-foreground lg:grid",
                            GRID_LG,
                            GRID_XL,
                        )}
                    >
                        <span className="min-w-0">{hideProject ? "Job / Board" : "Job / Project"}</span>
                        <span className="min-w-0">Manufacturer</span>
                        <span className="min-w-0">Status</span>
                        <span className="min-w-0 text-right">Ordered</span>
                        <span className="min-w-0">Yield</span>
                        <span className="min-w-0">Defects</span>
                        <span className="hidden min-w-0 xl:block">Created</span>
                        <span className="min-w-0 text-right">Updated</span>
                        <span className="min-w-0" aria-hidden />
                    </div>

                    <div ref={bodyRef} className="themed-scrollbar min-h-0 flex-1 overflow-auto" onKeyDown={handleKeyDown}>
                        {groups.map((group) => (
                            <div key={group.key}>
                                {filters.group !== "none" && (
                                    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-muted/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                                        <span className="truncate">{group.label}</span>
                                        <span className="shrink-0 tabular-nums">{group.runs.length}</span>
                                    </div>
                                )}
                                {group.runs.map((run) => (
                                    <RunRow
                                        key={run.id}
                                        run={run}
                                        selected={selectedId === run.id}
                                        hideProject={hideProject}
                                        onOpen={onOpen}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );

    // A page: one toolbar band, then the table. Matches the Library tabs.
    if (page) {
        return (
            <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
                <header className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
                    {chips}
                    {searchAndView}
                    {actions && <div className="ml-auto">{actions}</div>}
                </header>
                <div className="flex min-h-0 flex-1 flex-col p-3">{table}</div>
            </div>
        );
    }

    return (
        <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
            <div className="flex flex-wrap items-center gap-2 border bg-card px-3 py-2">
                {chips}
                {searchAndView}
                {actions && <div className="ml-auto">{actions}</div>}
            </div>
            {table}
        </div>
    );
}

function RunRow({
    run,
    selected,
    hideProject,
    onOpen,
}: {
    run: ManufacturingRun;
    selected: boolean;
    hideProject: boolean;
    onOpen: (runId: string) => void;
}) {
    const notes = run.notes?.trim();
    return (
        <div
            role="button"
            tabIndex={0}
            data-run-row
            onClick={() => onOpen(run.id)}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(run.id);
                }
            }}
            aria-pressed={selected}
            className={cn(
                "flex min-h-14 w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid",
                GRID_LG,
                GRID_XL,
                selected && "bg-secondary",
            )}
        >
            <div className="min-w-0">
                {run.job_number && (
                    <p className="truncate font-mono text-xs text-muted-foreground">{run.job_number}</p>
                )}
                <p className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{hideProject ? boardName(run) : run.project_name || run.project_id}</span>
                    {notes && (
                        <span title={notes} aria-label="Has notes" className="shrink-0 text-muted-foreground">
                            <StickyNote className="h-3.5 w-3.5" aria-hidden />
                        </span>
                    )}
                </p>
                {!hideProject && <p className="truncate text-xs text-muted-foreground">{boardName(run)}</p>}
            </div>
            <div className="min-w-0">
                <p className="truncate text-sm">{run.manufacturer_name || "—"}</p>
                <p className="truncate text-xs text-muted-foreground">{run.spec_name || "—"}</p>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-1">
                <RunStatusBadge status={run.status} />
                {run.release_tag && run.commit_sha && (
                    <RunReleaseLink
                        projectId={run.project_id}
                        tag={run.release_tag}
                        commitSha={run.commit_sha}
                        className="text-xs"
                    />
                )}
            </div>
            <div className="min-w-0 text-right text-sm tabular-nums" title="Units ordered">
                {run.quantity_ordered}
            </div>
            <div className="min-w-0">
                <YieldBar good={run.quantity_good} ordered={run.quantity_ordered} format="percent" />
            </div>
            <div className="min-w-0">
                <DefectSummary run={run} />
            </div>
            <div className="hidden min-w-0 xl:block">
                <p className="text-sm">{new Date(run.created_at).toLocaleDateString()}</p>
                <p className="truncate text-xs text-muted-foreground" title={run.created_by || undefined}>
                    {run.created_by || "—"}
                </p>
            </div>
            <div
                className="min-w-0 truncate text-right text-xs text-muted-foreground"
                title={new Date(run.updated_at).toLocaleString()}
            >
                {formatRelative(run.updated_at)}
            </div>
            <div className="flex min-w-0 justify-end">
                {!hideProject && (
                    <Button
                        asChild
                        variant="outline"
                        size="icon"
                        title="Open this project's Manufacturing page"
                    >
                        <Link
                            to={`/project/${run.project_id}?section=manufacturing`}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            aria-label={`Open ${run.project_name || run.project_id} manufacturing page`}
                        >
                            <ExternalLink className="h-4 w-4" aria-hidden />
                        </Link>
                    </Button>
                )}
            </div>
        </div>
    );
}
