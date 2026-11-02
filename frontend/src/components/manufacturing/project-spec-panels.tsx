import { Factory, PlusCircle, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { getProjectSpec, getTemplate, previewSpecConfig, updateProjectSpec, updateTemplate } from "@/lib/manufacturing";
import {
    evaluateCondition,
    specProgress,
    type ManufacturingRun,
    type PcbRuleField,
} from "@/types/manufacturing";
import { CapabilityCheck } from "./capability-check";
import { EmptyState } from "./empty-state";
import { SaveBar } from "./save-bar";
import { SchemaCapabilitiesDialog } from "./spec-config-editor";
import { SpecSection } from "./spec-form";
import { RunStatusBadge } from "./status-badge";
import type { SpecForm } from "./use-project-manufacturing";

export function NoManufacturers({ canEdit, canAttach }: { canEdit: boolean; canAttach: boolean }) {
    return (
        <EmptyState icon={Factory}>
            No manufacturers on this project yet.
            {canEdit
                ? canAttach
                    ? " Add one above to set its fabrication specs."
                    : " None exist yet: add one from Manufacturing in the sidebar, then attach it here."
                : ""}
        </EmptyState>
    );
}

// --- the spec form ---------------------------------------------------------------------------

interface SpecFormPanelProps {
    form: SpecForm;
    manufacturerName: string;
    hasSpec: boolean;
    canEdit: boolean;
}

function SpecSkeleton({ label }: { label: string }) {
    return (
        <div className="space-y-3" role="status" aria-label={label}>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
        </div>
    );
}

export function SpecFormPanel({ form, manufacturerName, hasSpec, canEdit }: SpecFormPanelProps) {
    const hasFields = form.schema.sections.some((s) => s.fields.length > 0);

    let body;
    if (!hasSpec) {
        body = <SpecSkeleton label={`Loading ${manufacturerName}\u2019s spec`} />;
    } else if (form.loading) {
        body = <SpecSkeleton label="Loading spec" />;
    } else if (!hasFields) {
        body = (
            <EmptyState icon={Settings2}>
                This process defines no fields yet.
                {canEdit ? " Open “Edit process” to add some." : ""}
            </EmptyState>
        );
    } else {
        body = (
            <>
                {form.schema.errors.length > 0 && (
                    <div className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        The process has {form.schema.errors.length} problem(s). Some fields may be missing until you fix
                        it.
                    </div>
                )}
                {form.schema.sections.map((section) =>
                    evaluateCondition(section.when, form.values) ? (
                        <SpecSection
                            key={section.title}
                            section={section}
                            values={form.values}
                            source={form.source}
                            collapsed={form.collapsed.has(section.title)}
                            active={!section.optional || form.activeSections.has(section.title)}
                            canEdit={canEdit}
                            onToggleCollapsed={() => form.toggleCollapsed(section.title)}
                            onToggleActive={(on) => form.toggleSectionActive(section.title, on)}
                            onChange={form.setField}
                        />
                    ) : null,
                )}
            </>
        );
    }

    return (
        <section className="min-w-0 space-y-3">
            {body}
            {canEdit && hasSpec && form.dirty && (
                <SaveBar
                    saving={form.busy === "saving"}
                    onSave={() => void form.save()}
                    onDiscard={() => void form.discard()}
                />
            )}
        </section>
    );
}

// --- the summary column ----------------------------------------------------------------------

interface SpecSidebarProps {
    form: SpecForm;
    ruleFields: PcbRuleField[];
    boardRules: Record<string, unknown> | null;
    manufacturerName: string;
    /** The latest production with this manufacturer that went ahead, if any. */
    lastRun: ManufacturingRun | null;
    canEdit: boolean;
    onOpenRun: (runId: string) => void;
    onStartProduction: () => void;
}

export function SpecSidebar({
    form,
    ruleFields,
    boardRules,
    manufacturerName,
    lastRun,
    canEdit,
    onOpenRun,
    onStartProduction,
}: SpecSidebarProps) {
    const progress = specProgress(form.schema.sections, form.values, form.activeSections);
    return (
        <aside className="space-y-6 lg:sticky lg:top-2">
            <CapabilityCheck
                fields={ruleFields}
                capabilities={form.capabilities}
                meta={form.capabilityMeta}
                boardRules={boardRules}
                processName={form.templateName}
            />
            <section aria-label="Spec" className="space-y-2">
                <SectionHeading title="Spec" />
                <div className="space-y-3 border p-3">
                    {progress.total > 0 ? (
                        <div className="space-y-1.5">
                            <p className="text-sm">
                                <span className="font-medium tabular-nums">{progress.set}</span> of{" "}
                                <span className="tabular-nums">{progress.total}</span> fields set
                            </p>
                            <div
                                className="h-1.5 bg-muted"
                                role="progressbar"
                                aria-label="Spec completeness"
                                aria-valuemin={0}
                                aria-valuemax={progress.total}
                                aria-valuenow={progress.set}
                            >
                                <div
                                    className="h-full bg-primary"
                                    style={{ width: `${(progress.set / progress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No fields to fill in.</p>
                    )}
                    <div className="space-y-1.5 border-t pt-3">
                        <p className="text-xs text-muted-foreground">Last production</p>
                        {lastRun ? (
                            <button
                                type="button"
                                onClick={() => onOpenRun(lastRun.id)}
                                className="flex w-full items-center justify-between gap-2 text-left hover:underline"
                            >
                                <span className="min-w-0 truncate text-sm">
                                    {lastRun.job_number || new Date(lastRun.created_at).toLocaleDateString()}
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                    <RunStatusBadge status={lastRun.status} />
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                        {lastRun.quantity_good}/{lastRun.quantity_ordered}
                                    </span>
                                </span>
                            </button>
                        ) : (
                            <p className="text-sm text-muted-foreground">None with {manufacturerName} yet.</p>
                        )}
                    </div>
                    {canEdit && (
                        <Button size="sm" onClick={onStartProduction}>
                            <PlusCircle />
                            Start production
                        </Button>
                    )}
                </div>
            </section>
        </aside>
    );
}

// --- editing the process's fields and capabilities -------------------------------------------

interface ProcessEditorDialogProps {
    specId: string;
    /** The linked process; without one there are no capabilities to edit. */
    templateId: string | null;
    onClose: () => void;
    onSaved: () => void;
}

const NO_CONFIG = { text: "", parsed: { sections: [], errors: [] } };

export function ProcessEditorDialog({ specId, templateId, onClose, onSaved }: ProcessEditorDialogProps) {
    return (
        <SchemaCapabilitiesDialog
            title="Edit process"
            description="Fields are shown on this spec's form. Capabilities belong to the process and are shared by every spec using it."
            saveLabel="Save"
            tabs={[
                {
                    id: "schema",
                    label: "Fields",
                    fileBaseName: "spec-schema",
                    load: async () => {
                        const spec = await getProjectSpec(specId);
                        return { text: spec.spec_config, parsed: spec.parsed };
                    },
                    save: async (text) => {
                        await updateProjectSpec(specId, { spec_config: text });
                        return previewSpecConfig(text);
                    },
                    // No in-editor "apply process" picker: it overwrote the open spec's fields.
                    // To switch process, use the Process selector instead.
                },
                {
                    id: "capabilities",
                    label: "Capabilities",
                    fileBaseName: "spec-capabilities",
                    // Capabilities belong to the linked process.
                    disabledNote: templateId
                        ? undefined
                        : "This spec is not linked to a process, so it has no capabilities to edit. Pick a process from the selector to get one.",
                    load: async () => {
                        if (!templateId) return NO_CONFIG;
                        const tmpl = await getTemplate(templateId);
                        const text = tmpl.capability_config ?? "";
                        return { text, parsed: await previewSpecConfig(text) };
                    },
                    save: async (text) => {
                        if (templateId) await updateTemplate(templateId, { capability_config: text });
                        return previewSpecConfig(text);
                    },
                },
            ]}
            onClose={onClose}
            onSaved={onSaved}
        />
    );
}
