import { useState } from "react";
import { createPortal } from "react-dom";
import { Factory, PlusCircle, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StudioTabsList, StudioTabsTrigger } from "@/components/ui/studio-tabs";
import { Tabs } from "@/components/ui/tabs";
import type { ManufacturingRun } from "@/types/manufacturing";
import { NewProductionDialog } from "./new-production-dialog";
import { DEFAULT_FILTERS, type ProductionFilters } from "./production-filters";
import { ProductionList } from "./production-list";
import { NoManufacturers, ProcessEditorDialog, SpecFormPanel, SpecSidebar } from "./project-spec-panels";
import { RunDrawer } from "./run-drawer";
import { useBeforeUnloadWhen } from "./save-bar";
import { ProjectConfirmDialogs, type ProjectDialog } from "./project-confirm-dialogs";
import { SpecToolbar } from "./spec-toolbar";
import {
    useBoardRules,
    useProjectData,
    useSpecForm,
    useSpecIdentity,
} from "./use-project-manufacturing";

interface ProjectManufacturingProps {
    projectId: string;
    canEdit: boolean;
    /** QA can act on defects even without edit rights. Defaults to `canEdit`. */
    canLogDefects?: boolean;
    /** QA and admin advance a production's status. */
    canChangeStatus?: boolean;
    /** Shown in the new-production dialog; falls back to the id. */
    projectName?: string;
    /**
     * Where the page's heading row wants the Specs/Production tabs and the New production
     * button (it portals them in). Left out, they sit on a row of their own; `null` means
     * the slot is not mounted yet.
     */
    tabsSlot?: HTMLElement | null;
    actionsSlot?: HTMLElement | null;
}

type SubTab = "specs" | "production";

/** The latest production that actually went ahead: a cancelled one says nothing about the fab. */
function latestRun(runs: ManufacturingRun[]): ManufacturingRun | null {
    return (
        runs
            .filter((r) => r.status !== "cancelled")
            .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
}

export function ProjectManufacturing({
    projectId,
    canEdit,
    canLogDefects = canEdit,
    canChangeStatus = false,
    projectName,
    tabsSlot,
    actionsSlot,
}: ProjectManufacturingProps) {
    const [subTab, setSubTab] = useState<SubTab>("specs");
    // Productions open in place: a drawer over the list, and the new-production dialog with
    // this project (and manufacturer) filled in.
    const [filters, setFilters] = useState<ProductionFilters>(DEFAULT_FILTERS);
    const [drawerRunId, setDrawerRunId] = useState<string | null>(null);
    const [dialog, setDialog] = useState<ProjectDialog>(null);

    const data = useProjectData(projectId);
    const { manufacturerId } = data;
    const { ruleFields, boardRules } = useBoardRules(projectId);
    const { specId, templates } = useSpecIdentity(projectId, manufacturerId);
    const form = useSpecForm(projectId, specId);
    useBeforeUnloadWhen(form.dirty);

    // Switching manufacturer while the form has unsaved edits asks first.
    const selectManufacturer = (id: string) => {
        if (id === manufacturerId) return;
        if (form.dirty) setDialog({ kind: "discard", proceed: () => data.setManufacturerId(id) });
        else data.setManufacturerId(id);
    };

    if (data.loading) {
        return <Skeleton className="h-48 w-full" role="status" aria-label="Loading manufacturing" />;
    }

    const attachedIds = new Set(data.manufacturers.map((m) => m.id));
    const attachable = data.allManufacturers.filter((m) => !attachedIds.has(m.id));
    const selected = data.manufacturers.find((m) => m.id === manufacturerId) ?? null;
    const lastRun = latestRun(data.runs.filter((r) => r.manufacturer_id === manufacturerId));
    const newProductionAction = canEdit ? (
        <Button size="sm" onClick={() => setDialog({ kind: "new-run" })}>
            <PlusCircle />
            New production
        </Button>
    ) : undefined;

    const tabs = (
        <Tabs value={subTab} activationMode="manual" className="shrink-0">
            <StudioTabsList aria-label="Manufacturing sections">
                <StudioTabsTrigger value="specs" className="gap-1.5" onClick={() => setSubTab("specs")}>
                    <Settings2 className="size-3.5" aria-hidden />
                    Specs
                </StudioTabsTrigger>
                <StudioTabsTrigger value="production" className="gap-1.5" onClick={() => setSubTab("production")}>
                    <Factory className="size-3.5" aria-hidden />
                    Production
                    {data.runs.length > 0 && <span className="tabular-nums opacity-70">{data.runs.length}</span>}
                </StudioTabsTrigger>
            </StudioTabsList>
        </Tabs>
    );

    return (
        <div className="flex flex-col gap-4">
            {tabsSlot === undefined && actionsSlot === undefined ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    {tabs}
                    {newProductionAction}
                </div>
            ) : (
                <>
                    {tabsSlot ? createPortal(tabs, tabsSlot) : null}
                    {actionsSlot && newProductionAction ? createPortal(newProductionAction, actionsSlot) : null}
                </>
            )}

            {subTab === "production" ? (
                <section className="flex min-h-[24rem] flex-col">
                    <ProductionList
                        runs={data.runs}
                        filters={filters}
                        onFiltersChange={setFilters}
                        selectedId={drawerRunId}
                        onOpen={setDrawerRunId}
                        hideProject
                        emptyAction={newProductionAction}
                    />
                </section>
            ) : (
                <>
                    <SpecToolbar
                        manufacturers={data.manufacturers}
                        manufacturerId={manufacturerId}
                        attachable={attachable}
                        canEdit={canEdit}
                        hasSpec={Boolean(specId)}
                        onSelect={selectManufacturer}
                        onAttach={(id) => void data.attach(id)}
                        onEditProcess={() => setDialog({ kind: "editor" })}
                        onRemove={(manufacturer) => setDialog({ kind: "detach", manufacturer })}
                        process={
                            selected
                                ? {
                                      manufacturerName: selected.name,
                                      templates,
                                      templateId: form.templateId,
                                      busy: form.busy,
                                      onPickProcess: (id) => setDialog({ kind: "process", id }),
                                      onDownload: () => void form.downloadPdf(),
                                      onExtract: () => void form.extract(),
                                  }
                                : null
                        }
                    />

                    {!selected ? (
                        <NoManufacturers canEdit={canEdit} canAttach={attachable.length > 0} />
                    ) : (
                        <>
                            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                                <SpecFormPanel
                                    form={form}
                                    manufacturerName={selected.name}
                                    hasSpec={Boolean(specId)}
                                    canEdit={canEdit}
                                />
                                <SpecSidebar
                                    form={form}
                                    ruleFields={ruleFields}
                                    boardRules={boardRules}
                                    manufacturerName={selected.name}
                                    lastRun={lastRun}
                                    canEdit={canEdit}
                                    onOpenRun={setDrawerRunId}
                                    onStartProduction={() => setDialog({ kind: "new-run" })}
                                />
                            </div>
                        </>
                    )}
                </>
            )}

            <ProjectConfirmDialogs
                dialog={dialog}
                onClose={() => setDialog(null)}
                templates={templates}
                form={form}
                detaching={data.detaching}
                onDetach={(id) => data.detach(id)}
            />

            <RunDrawer
                runId={drawerRunId}
                canEdit={canEdit}
                canLogDefects={canLogDefects}
                canChangeStatus={canChangeStatus}
                projectLink={false}
                onClose={() => setDrawerRunId(null)}
                onDeleted={() => {
                    setDrawerRunId(null);
                    void data.reloadRuns();
                }}
                onChanged={() => void data.reloadRuns()}
            />

            {dialog?.kind === "new-run" && (
                <NewProductionDialog
                    open
                    projects={[{ id: projectId, name: projectName ?? projectId }]}
                    initialProjectId={projectId}
                    initialManufacturerId={manufacturerId || undefined}
                    onClose={() => setDialog(null)}
                    onCreated={(runId) => {
                        setDialog(null);
                        void data.reloadRuns();
                        setSubTab("production");
                        setDrawerRunId(runId);
                    }}
                />
            )}

            {dialog?.kind === "editor" && specId && (
                <ProcessEditorDialog
                    specId={specId}
                    templateId={form.templateId}
                    onClose={() => setDialog(null)}
                    onSaved={() => {
                        setDialog(null);
                        // Reload the spec into the form so new fields and capabilities appear.
                        void form.reload();
                    }}
                />
            )}
        </div>
    );
}
