import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Factory, Plus, Building2 } from "lucide-react";
import { toast } from "sonner";

import type { User } from "@/types/auth";
import type { Project } from "@/types/project";
import { Button } from "@/components/ui/button";
import { StudioTabsList, StudioTabsTrigger } from "@/components/ui/studio-tabs";
import { Tabs } from "@/components/ui/tabs";
import { canManageProjects } from "@/lib/roles";
import { listRuns, listManufacturers } from "@/lib/manufacturing";
import type { Manufacturer, ManufacturingRun } from "@/types/manufacturing";
import { NewProductionDialog, type ProjectOption } from "./new-production-dialog";
import { ProductionList } from "./production-list";
import { filtersFromParams, filtersToParams, type ProductionFilters } from "./production-filters";
import { RefreshIconButton } from "./refresh-icon-button";
import { RunDrawer } from "./run-drawer";
import { ManufacturersPanel } from "./manufacturers-panel";

interface ManufacturingDashboardProps {
    user: User | null;
    projects: Project[];
}

type View = "runs" | "manufacturers";

function projectLabel(p: Project): string {
    const name = p.display_name || p.name;
    return p.sub_path && p.sub_path !== "." ? `${name} (${p.sub_path})` : name;
}

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
    const [refreshing, setRefreshing] = useState(false);
    const [addManufacturer, setAddManufacturer] = useState(false);

    // The list's filters and the open run live in the URL, so a link, a refresh
    // and the Back button all land where the user was.
    const [searchParams, setSearchParams] = useSearchParams();
    const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
    const drawerRunId = searchParams.get("run");
    const [wizardOpen, setWizardOpen] = useState(false);

    const setFilters = useCallback(
        (next: ProductionFilters) =>
            setSearchParams((current) => filtersToParams(current, next), { replace: true }),
        [setSearchParams],
    );

    const openRun = useCallback(
        (runId: string | null) =>
            setSearchParams((current) => {
                const next = new URLSearchParams(current);
                if (runId) next.set("run", runId);
                else next.delete("run");
                return next;
            }),
        [setSearchParams],
    );

    const load = useCallback(async () => {
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

    const refresh = async () => {
        setRefreshing(true);
        try {
            await load();
        } finally {
            setRefreshing(false);
        }
    };

    const refreshButton = <RefreshIconButton refreshing={refreshing} onClick={() => void refresh()} />;

    const projectOptions: ProjectOption[] = useMemo(
        () => projects.map((p) => ({ id: p.id, name: projectLabel(p) })),
        [projects],
    );

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b bg-card px-2">
                <Tabs value={view} activationMode="manual" className="shrink-0">
                    <StudioTabsList aria-label="Manufacturing sections">
                        <StudioTabsTrigger value="runs" className="gap-1.5" onClick={() => setView("runs")}>
                            <Factory className="size-3.5" aria-hidden />
                            Production
                        </StudioTabsTrigger>
                        <StudioTabsTrigger value="manufacturers" className="gap-1.5" onClick={() => setView("manufacturers")}>
                            <Building2 className="size-3.5" aria-hidden />
                            Manufacturers
                        </StudioTabsTrigger>
                    </StudioTabsList>
                </Tabs>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    {refreshButton}
                    {view === "manufacturers" && canEdit && (
                        <Button size="sm" onClick={() => setAddManufacturer(true)}>
                            <Plus />
                            Add manufacturer
                        </Button>
                    )}
                </div>
            </header>

            {view === "manufacturers" ? (
                <div className="flex min-h-0 flex-1 flex-col bg-background px-4 pb-4 pt-3">
                    <ManufacturersPanel
                        manufacturers={manufacturers}
                        runs={runs}
                        canEdit={canEdit}
                        onOpenRun={(runId) => {
                            setView("runs");
                            openRun(runId);
                        }}
                        addOpen={addManufacturer}
                        onAddOpenChange={setAddManufacturer}
                        onChanged={() => void load()}
                    />
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col bg-background">
                    <ProductionList
                        page
                        runs={runs}
                        loading={loading}
                        filters={filters}
                        onFiltersChange={setFilters}
                        selectedId={drawerRunId}
                        onOpen={openRun}
                        actions={
                            canEdit ? (
                                <Button size="sm" onClick={() => setWizardOpen(true)}>
                                    <Plus />
                                    New production
                                </Button>
                            ) : undefined
                        }
                        emptyAction={
                            canEdit ? (
                                <Button size="sm" onClick={() => setWizardOpen(true)}>
                                    <Plus />
                                    New production
                                </Button>
                            ) : undefined
                        }
                    />
                </div>
            )}

            <RunDrawer
                runId={drawerRunId}
                canEdit={canEdit}
                canLogDefects={canLogDefects}
                canChangeStatus={canChangeStatus}
                onClose={() => openRun(null)}
                onDeleted={() => {
                    openRun(null);
                    void load();
                }}
                onChanged={() => void load()}
            />

            {wizardOpen && (
                <NewProductionDialog
                    open={wizardOpen}
                    projects={projectOptions}
                    onClose={() => setWizardOpen(false)}
                    onCreated={(runId) => {
                        setWizardOpen(false);
                        void load();
                        openRun(runId);
                    }}
                />
            )}
        </div>
    );
}
