import { useState } from "react";
import { Factory, PlusCircle, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ManufacturingRun, ProjectManufacturer } from "@/types/manufacturing";
import { NewProductionDialog } from "./new-production-dialog";
import { DEFAULT_FILTERS, type ProductionFilters } from "./production-filters";
import { ProductionList } from "./production-list";
import {
    ManufacturerBar,
    NoManufacturers,
    ProcessEditorDialog,
    SpecFormPanel,
    SpecHeader,
    SpecSidebar,
} from "./project-spec-panels";
import { RunDrawer } from "./run-drawer";
import { useBeforeUnloadWhen } from "./save-bar";
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
}

type SubTab = "specs" | "production";

// The one dialog open at a time, with what it needs.
type Dialog =
    | { kind: "discard"; proceed: () => void }
    | { kind: "process"; id: string }
    | { kind: "detach"; manufacturer: ProjectManufacturer }
    | { kind: "editor" }
    | { kind: "new-run" }
    | null;

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
}: ProjectManufacturingProps) {
    const [subTab, setSubTab] = useState<SubTab>("specs");
    // Productions open in place: a drawer over the list, and the new-production dialog with
    // this project (and manufacturer) filled in.
    const [filters, setFilters] = useState<ProductionFilters>(DEFAULT_FILTERS);
    const [drawerRunId, setDrawerRunId] = useState<string | null>(null);
    const [dialog, setDialog] = useState<Dialog>(null);

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
        return <div className="text-sm text-muted-foreground">Loading manufacturing...</div>;
    }

    const attachedIds = new Set(data.manufacturers.map((m) => m.id));
    const attachable = data.allManufacturers.filter((m) => !attachedIds.has(m.id));
    const selected = data.manufacturers.find((m) => m.id === manufacturerId) ?? null;
    const lastRun = latestRun(data.runs.filter((r) => r.manufacturer_id === manufacturerId));
    const pendingProcess = dialog?.kind === "process" ? templates.find((t) => t.id === dialog.id) : undefined;
    const newProductionAction = canEdit ? (
        <Button size="sm" onClick={() => setDialog({ kind: "new-run" })}>
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
            New production
        </Button>
    ) : undefined;

    return (
        <div className="flex flex-col gap-4">
            <Tabs value={subTab} onValueChange={(next) => setSubTab(next as SubTab)} className="gap-0 border-b">
                <TabsList variant="line" className="h-10 gap-2" aria-label="Manufacturing sections">
                    <TabsTrigger value="specs" className="gap-2 px-2 text-sm">
                        <Settings2 className="h-4 w-4" />
                        Specs
                    </TabsTrigger>
                    <TabsTrigger value="production" className="gap-2 px-2 text-sm">
                        <Factory className="h-4 w-4" />
                        Production
                        {data.runs.length > 0 && (
                            <Badge variant="outline" className="px-1 text-[10px]">
                                {data.runs.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {subTab === "production" ? (
                <section className="flex min-h-[24rem] flex-col gap-3">
                    <ProductionList
                        runs={data.runs}
                        filters={filters}
                        onFiltersChange={setFilters}
                        selectedId={drawerRunId}
                        onOpen={setDrawerRunId}
                        hideProject
                        actions={newProductionAction}
                        emptyAction={newProductionAction}
                    />
                </section>
            ) : (
                <>
                    <ManufacturerBar
                        manufacturers={data.manufacturers}
                        manufacturerId={manufacturerId}
                        attachable={attachable}
                        canEdit={canEdit}
                        hasSpec={Boolean(specId)}
                        onSelect={selectManufacturer}
                        onAttach={(id) => void data.attach(id)}
                        onEditProcess={() => setDialog({ kind: "editor" })}
                        onRemove={(manufacturer) => setDialog({ kind: "detach", manufacturer })}
                    />

                    {!selected ? (
                        <NoManufacturers canEdit={canEdit} canAttach={attachable.length > 0} />
                    ) : (
                        <>
                            <SpecHeader
                                manufacturerName={selected.name}
                                templates={templates}
                                templateId={form.templateId}
                                canEdit={canEdit}
                                hasSpec={Boolean(specId)}
                                busy={form.busy}
                                onPickProcess={(id) => setDialog({ kind: "process", id })}
                                onDownload={() => void form.downloadPdf()}
                                onExtract={() => void form.extract()}
                            />
                            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
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

            <ConfirmDialog
                open={dialog?.kind === "discard"}
                onOpenChange={(open) => !open && setDialog(null)}
                title="Discard unsaved changes?"
                description="This spec has edits that are not saved. Switching now loses them."
                confirmLabel="Discard changes"
                onConfirm={() => {
                    const pending = dialog;
                    setDialog(null);
                    form.markClean();
                    if (pending?.kind === "discard") pending.proceed();
                }}
            />

            <ConfirmDialog
                open={dialog?.kind === "process"}
                onOpenChange={(open) => !open && setDialog(null)}
                title={`Switch to ${pendingProcess?.name ?? "this process"}?`}
                description={
                    <>
                        This spec&rsquo;s fields are replaced by the new process&rsquo;s fields, so any edits made to the
                        fields themselves are lost. Values for fields the new process does not have are hidden but kept.
                        {form.dirty ? " Your unsaved changes to this spec are also discarded." : ""}
                    </>
                }
                confirmLabel="Switch process"
                destructive={false}
                onConfirm={() => {
                    const pending = dialog;
                    setDialog(null);
                    if (pending?.kind === "process") void form.applyProcess(pending.id);
                }}
            />

            <ConfirmDialog
                open={dialog?.kind === "detach"}
                onOpenChange={(open) => !open && setDialog(null)}
                title="Remove manufacturer from this project?"
                description={
                    <>
                        {dialog?.kind === "detach" ? dialog.manufacturer.name : ""} is removed from this project. Its spec
                        and its production are kept and come back if you add it again.
                    </>
                }
                confirmLabel="Remove"
                busy={data.detaching}
                onConfirm={() => {
                    if (dialog?.kind !== "detach") return;
                    void data.detach(dialog.manufacturer.id).then((removed) => removed && setDialog(null));
                }}
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
