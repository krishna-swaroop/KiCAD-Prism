import { useCallback, useEffect, useMemo, useState } from "react";
import { Factory, Plus, Building2, Filter } from "lucide-react";
import { toast } from "sonner";

import type { User } from "@/types/auth";
import type { Project } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canManageProjects } from "@/lib/roles";
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
import { ManufacturersPanel } from "./manufacturers-panel";
import { CompactSelect } from "./ui";

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
                manufacturers={manufacturers}
                onBack={() => {
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

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
                {view === "manufacturers" ? (
                    <ManufacturersPanel
                        manufacturers={manufacturers}
                        canEdit={canEdit}
                        onChanged={() => void load()}
                    />
                ) : loading ? (
                    <div className="text-sm text-muted-foreground">Loading runs...</div>
                ) : (
                    <div className="space-y-4">
                        {canEdit && (
                            <div className="flex justify-end">
                                <Button size="sm" onClick={() => setWizardOpen(true)}>
                                    <Plus className="mr-1.5 h-4 w-4" />
                                    New run
                                </Button>
                            </div>
                        )}
                        <RunTable
                            runs={filtered}
                            totalCount={runs.length}
                            statusFilter={statusFilter}
                            onStatusFilter={setStatusFilter}
                            onOpen={(id) => setOpenRunId(id)}
                        />
                    </div>
                )}
            </div>

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
    statusFilter: RunStatus | "all";
    onStatusFilter: (status: RunStatus | "all") => void;
    onOpen: (runId: string) => void;
}

function RunTable({ runs, totalCount, statusFilter, onStatusFilter, onOpen }: RunTableProps) {
    return (
        <div className="rounded-lg border">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/30 p-3">
                <span className="text-sm font-medium">{runs.length} run(s)</span>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Filter className="h-3.5 w-3.5" />
                    <CompactSelect
                        widthClass="w-auto"
                        value={statusFilter}
                        onChange={(e) => onStatusFilter(e.target.value as RunStatus | "all")}
                        aria-label="Filter by status"
                    >
                        <option value="all">All statuses</option>
                        {RUN_STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {RUN_STATUS_LABELS[status]}
                            </option>
                        ))}
                    </CompactSelect>
                </label>
            </div>

            {totalCount === 0 ? (
                <div className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
                    <Factory className="h-8 w-8 opacity-50" />
                    <p className="text-sm">No production runs yet. Start one with &ldquo;New run&rdquo;.</p>
                </div>
            ) : runs.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                    No runs match this filter.
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="p-3 font-medium">Project</th>
                            <th className="p-3 font-medium">Manufacturer</th>
                            <th className="p-3 font-medium">Status</th>
                            <th className="p-3 text-right font-medium">Good / Ordered</th>
                            <th className="p-3 text-right font-medium">Defects</th>
                            <th className="p-3 font-medium">Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        {runs.map((run) => (
                            <tr
                                key={run.id}
                                className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40"
                                onClick={() => onOpen(run.id)}
                            >
                                <td className="p-3">
                                    <div className="font-medium">{run.project_name || run.project_id}</div>
                                    {run.relative_path && run.relative_path !== "." && (
                                        <div className="text-xs text-muted-foreground">{run.relative_path}</div>
                                    )}
                                </td>
                                <td className="p-3">{run.manufacturer_name || "—"}</td>
                                <td className="p-3">
                                    <Badge variant="secondary">{RUN_STATUS_LABELS[run.status]}</Badge>
                                </td>
                                <td className="p-3 text-right tabular-nums">
                                    {run.quantity_good}/{run.quantity_ordered}
                                </td>
                                <td className="p-3 text-right tabular-nums">{run.defect_count ?? 0}</td>
                                <td className="p-3 text-muted-foreground">
                                    {new Date(run.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
