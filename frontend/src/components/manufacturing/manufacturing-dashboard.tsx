import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Factory, Plus, Building2, Tag } from "lucide-react";
import { toast } from "sonner";

import type { User } from "@/types/auth";
import type { Project } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { canManageProjects } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { listRuns, listManufacturers } from "@/lib/manufacturing";
import {
    RUN_STATUS_LABELS,
    RUN_STATUSES,
    type Manufacturer,
    type ManufacturingRun,
    type RunStatus,
} from "@/types/manufacturing";
import { NewRunWizard } from "./new-run-wizard";
import { RunDetail } from "./run-detail";
import { RunQuickView } from "./run-quick-view";
import { ManufacturersPanel } from "./manufacturers-panel";

interface ManufacturingDashboardProps {
    user: User | null;
    projects: Project[];
}

type View = "runs" | "manufacturers";

export function ManufacturingDashboard({ user, projects }: ManufacturingDashboardProps) {
    const canEdit = canManageProjects(user?.role);
    // QA can act on defects even though it can't create runs.
    const canLogDefects = canEdit || user?.role === "qa";
    // Advancing a run's status is a QA/Admin act, mirroring component QA.
    const canChangeStatus = user?.role === "qa" || user?.role === "admin";

    const [view, setView] = useState<View>("runs");
    const [runs, setRuns] = useState<ManufacturingRun[]>([]);
    const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<RunStatus | "all">("all");
    const [quickRunId, setQuickRunId] = useState<string | null>(null);
    const [openRunId, setOpenRunId] = useState<string | null>(null);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [addManufacturer, setAddManufacturer] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [runList, mfrs] = await Promise.all([listRuns(), listManufacturers()]);
            setRuns(runList);
            setManufacturers(mfrs);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load manufacturing.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const filtered = useMemo(
        () => (statusFilter === "all" ? runs : runs.filter((r) => r.status === statusFilter)),
        [runs, statusFilter],
    );

    if (openRunId) {
        return (
            <RunDetail
                runId={openRunId}
                canEdit={canEdit}
                canLogDefects={canLogDefects}
                canChangeStatus={canChangeStatus}
                onBack={() => {
                    setQuickRunId(openRunId);
                    setOpenRunId(null);
                    void load();
                }}
                onDeleted={() => {
                    setQuickRunId(null);
                    setOpenRunId(null);
                    void load();
                }}
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Selection bar: the shadcn Tabs "line" variant, matching the Library
                Manager. The active section's title with a blue icon sits below it. */}
            <Tabs
                value={view}
                onValueChange={(next) => setView(next as View)}
                className="shrink-0 gap-0 border-b bg-card px-6"
            >
                <TabsList variant="line" className="h-10 gap-2" aria-label="Manufacturing sections">
                    <TabsTrigger value="runs" className="gap-2 px-2 text-sm">
                        <Factory className="h-4 w-4" />
                        Production
                    </TabsTrigger>
                    <TabsTrigger value="manufacturers" className="gap-2 px-2 text-sm">
                        <Building2 className="h-4 w-4" />
                        Manufacturers
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3">
                <div className="flex items-center gap-2">
                    {view === "manufacturers" ? (
                        <>
                            <Building2 className="h-5 w-5 text-primary" />
                            <h2 className="text-lg font-semibold">Manufacturers</h2>
                        </>
                    ) : (
                        <>
                            <Factory className="h-5 w-5 text-primary" />
                            <h2 className="text-lg font-semibold">Production</h2>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {view === "manufacturers" ? (
                        canEdit && (
                            <Button size="sm" onClick={() => setAddManufacturer(true)}>
                                <Plus className="mr-1.5 h-4 w-4" />
                                Add manufacturer
                            </Button>
                        )
                    ) : (
                        <>
                            <Select
                                value={statusFilter}
                                onValueChange={(value) => setStatusFilter(value as RunStatus | "all")}
                            >
                                <SelectTrigger size="sm" aria-label="Filter by status">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    {RUN_STATUSES.map((status) => (
                                        <SelectItem key={status} value={status}>
                                            {RUN_STATUS_LABELS[status]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {canEdit && (
                                <Button size="sm" onClick={() => setWizardOpen(true)}>
                                    <Plus className="mr-1.5 h-4 w-4" />
                                    New production
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {view === "manufacturers" ? (
                <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-3">
                    <ManufacturersPanel
                        manufacturers={manufacturers}
                        canEdit={canEdit}
                        addOpen={addManufacturer}
                        onAddOpenChange={setAddManufacturer}
                        onChanged={() => void load()}
                    />
                </div>
            ) : loading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading production...</div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-6 pt-3">
                    <div className="flex min-h-0 flex-1">
                        <RunTable
                            runs={filtered}
                            totalCount={runs.length}
                            selectedId={quickRunId}
                            onOpen={(id) => setQuickRunId(id)}
                        />
                        {quickRunId && (
                            <RunQuickView
                                runId={quickRunId}
                                canDelete={canEdit}
                                onClose={() => setQuickRunId(null)}
                                onOpenFull={() => setOpenRunId(quickRunId)}
                                onDeleted={() => {
                                    setQuickRunId(null);
                                    void load();
                                }}
                            />
                        )}
                    </div>
                </div>
            )}

            {wizardOpen && (
                <NewRunWizard
                    open={wizardOpen}
                    projects={projects}
                    onClose={() => setWizardOpen(false)}
                    onCreated={(runId) => {
                        setWizardOpen(false);
                        void load();
                        setOpenRunId(runId);
                    }}
                />
            )}
        </div>
    );
}

interface RunTableProps {
    runs: ManufacturingRun[];
    totalCount: number;
    selectedId: string | null;
    onOpen: (runId: string) => void;
}

// The board a run is for: the .kicad_pcb file name (without extension), else the
// board's sub-path for a multi-board repo, else a dash.
function boardName(run: ManufacturingRun): string {
    if (run.pcb_rel) {
        const base = run.pcb_rel.split(/[\\/]/).pop() ?? run.pcb_rel;
        return base.replace(/\.kicad_pcb$/i, "");
    }
    if (run.relative_path && run.relative_path !== ".") return run.relative_path;
    return "—";
}

// Column widths for the runs table, matching the Library catalog's grid idiom.
const RUN_GRID = "minmax(0,2fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 7rem 5rem 7rem";

function RunTable({ runs, totalCount, selectedId, onOpen }: RunTableProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col border">
            {totalCount === 0 ? (
                <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                    <Factory className="h-8 w-8 opacity-50" />
                    <p className="text-sm">No production yet. Start one with &ldquo;New production&rdquo;.</p>
                </div>
            ) : runs.length === 0 ? (
                <div className="flex min-h-64 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                    No production matches this filter.
                </div>
            ) : (
                <>
                    {/* Column-header row */}
                    <div
                        className="hidden shrink-0 gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid"
                        style={{ gridTemplateColumns: RUN_GRID }}
                    >
                        <span className="min-w-0">Project / Board</span>
                        <span className="min-w-0">Manufacturer</span>
                        <span className="min-w-0">Release</span>
                        <span className="min-w-0">Status</span>
                        <span className="min-w-0 text-right">Good / Ordered</span>
                        <span className="min-w-0 text-right">Defects</span>
                        <span className="min-w-0">Created</span>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto">
                        {runs.map((run) => (
                            <div
                                key={run.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onOpen(run.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        onOpen(run.id);
                                    }
                                }}
                                aria-pressed={selectedId === run.id}
                                className={cn(
                                    "grid h-16 w-full cursor-pointer items-center gap-3 border-b px-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                    selectedId === run.id && "bg-secondary",
                                )}
                                style={{ gridTemplateColumns: RUN_GRID }}
                            >
                                <div className="min-w-0">
                                    {run.job_number && (
                                        <p className="truncate font-mono text-[10px] text-muted-foreground">{run.job_number}</p>
                                    )}
                                    <p className="truncate text-sm font-medium">{run.project_name || run.project_id}</p>
                                    <p className="truncate text-xs text-muted-foreground">{boardName(run)}</p>
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{run.manufacturer_name || "—"}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {run.spec_name || "—"}
                                    </p>
                                </div>
                                <div className="flex min-w-0" onClick={(e) => e.stopPropagation()}>
                                    {run.release_tag && run.commit_sha ? (
                                        <Link
                                            to={`/project/${run.project_id}?section=history&commit=${encodeURIComponent(run.commit_sha)}`}
                                            className="inline-flex min-w-0 max-w-full items-center gap-1 text-xs font-medium text-primary hover:underline"
                                            title={`Open ${run.release_tag} in History`}
                                        >
                                            <Tag className="h-3 w-3 shrink-0" />
                                            <span className="truncate">{run.release_tag}</span>
                                        </Link>
                                    ) : run.release_tag ? (
                                        <span className="truncate text-xs text-muted-foreground">{run.release_tag}</span>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                </div>
                                <div className="flex min-w-0">
                                    <Badge variant="secondary">{RUN_STATUS_LABELS[run.status]}</Badge>
                                </div>
                                <div className="min-w-0 text-right text-sm tabular-nums">
                                    {run.quantity_good}/{run.quantity_ordered}
                                </div>
                                <div className="min-w-0 text-right text-sm tabular-nums">{run.defect_count ?? 0}</div>
                                <div className="min-w-0 truncate text-xs text-muted-foreground">
                                    {new Date(run.created_at).toLocaleDateString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
