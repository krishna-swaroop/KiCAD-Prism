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
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Same shadcn Tabs "line" variant the Library Manager uses, so switching
                sections is marked the way tabs are everywhere else in the design system. */}
            <div className="shrink-0 border-b bg-card px-6">
                <Tabs value={view} onValueChange={(next) => setView(next as View)}>
                    <TabsList variant="line" className="h-10 gap-2" aria-label="Manufacturing sections">
                        <TabsTrigger value="runs" className="gap-2 px-2 text-sm">
                            <Factory className="h-4 w-4" />
                            Runs
                        </TabsTrigger>
                        <TabsTrigger value="manufacturers" className="gap-2 px-2 text-sm">
                            <Building2 className="h-4 w-4" />
                            Manufacturers
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {view === "manufacturers" ? (
                <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-3">
                    <ManufacturersPanel
                        manufacturers={manufacturers}
                        canEdit={canEdit}
                        onChanged={() => void load()}
                    />
                </div>
            ) : loading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading runs...</div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-6 pt-3">
                    <div className="flex shrink-0 items-center gap-2">
                        {canEdit && (
                            <Button size="sm" onClick={() => setWizardOpen(true)}>
                                <Plus className="mr-1.5 h-4 w-4" />
                                New run
                            </Button>
                        )}
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
                    </div>
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
                                onClose={() => setQuickRunId(null)}
                                onOpenFull={() => setOpenRunId(quickRunId)}
                            />
                        )}
                    </div>
                </div>
            )}

            {wizardOpen && (
                <NewRunWizard
                    open={wizardOpen}
                    projects={projects}
                    manufacturers={manufacturers}
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

// Column widths for the runs table, matching the Library catalog's grid idiom.
const RUN_GRID = "minmax(0,2fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 7rem 5rem 7rem";

function RunTable({ runs, totalCount, selectedId, onOpen }: RunTableProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col border">
            {totalCount === 0 ? (
                <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                    <Factory className="h-8 w-8 opacity-50" />
                    <p className="text-sm">No production runs yet. Start one with &ldquo;New run&rdquo;.</p>
                </div>
            ) : runs.length === 0 ? (
                <div className="flex min-h-64 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                    No runs match this filter.
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
                                    <p className="truncate text-sm font-medium">{run.project_name || run.project_id}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {run.relative_path && run.relative_path !== "." ? run.relative_path : "—"}
                                    </p>
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-xs">{run.manufacturer_name || "—"}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {run.commit_sha ? run.commit_sha.slice(0, 7) : ""}
                                    </p>
                                </div>
                                <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                                    {run.release_tag && run.commit_sha ? (
                                        <Link
                                            to={`/project/${run.project_id}?section=history&commit=${encodeURIComponent(run.commit_sha)}`}
                                            className="inline-flex items-center gap-1 truncate text-xs font-medium text-primary hover:underline"
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
