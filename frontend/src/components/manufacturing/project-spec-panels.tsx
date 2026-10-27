import {
    Factory,
    FileDown,
    MoreHorizontal,
    Pencil,
    Plus,
    PlusCircle,
    Settings2,
    Sparkles,
    Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getProjectSpec, getTemplate, previewSpecConfig, updateProjectSpec, updateTemplate } from "@/lib/manufacturing";
import {
    evaluateCondition,
    specProgress,
    type Manufacturer,
    type ManufacturingRun,
    type PcbRuleField,
    type ProjectManufacturer,
    type SpecTemplate,
} from "@/types/manufacturing";
import { CapabilityCheck } from "./capability-check";
import { SaveBar } from "./save-bar";
import { SchemaCapabilitiesDialog } from "./spec-config-editor";
import { SpecSection } from "./spec-form";
import { RunStatusBadge } from "./status-badge";
import type { SpecForm } from "./use-project-manufacturing";

// --- which manufacturer's spec is shown ------------------------------------------------------

interface ManufacturerBarProps {
    manufacturers: ProjectManufacturer[];
    manufacturerId: string;
    /** Manufacturers in the directory that this project does not have yet. */
    attachable: Manufacturer[];
    canEdit: boolean;
    hasSpec: boolean;
    onSelect: (id: string) => void;
    onAttach: (id: string) => void;
    onEditProcess: () => void;
    onRemove: (manufacturer: ProjectManufacturer) => void;
}

export function ManufacturerBar({
    manufacturers,
    manufacturerId,
    attachable,
    canEdit,
    hasSpec,
    onSelect,
    onAttach,
    onEditProcess,
    onRemove,
}: ManufacturerBarProps) {
    const selected = manufacturers.find((m) => m.id === manufacturerId) ?? null;
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            {manufacturers.length > 0 ? (
                <div role="tablist" aria-label="Manufacturers" className="flex flex-wrap gap-1">
                    {manufacturers.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            role="tab"
                            aria-selected={m.id === manufacturerId}
                            onClick={() => onSelect(m.id)}
                            className={cn(
                                "border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                m.id === manufacturerId
                                    ? "border-primary bg-secondary font-medium"
                                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                            )}
                        >
                            {m.name}
                        </button>
                    ))}
                </div>
            ) : (
                <span />
            )}
            <div className="flex items-center gap-2">
                {canEdit && attachable.length > 0 && (
                    <Select
                        value=""
                        onValueChange={(id) => {
                            if (id) onAttach(id);
                        }}
                    >
                        <SelectTrigger size="sm" aria-label="Add a manufacturer" className="w-auto">
                            <Plus className="h-3.5 w-3.5" />
                            <SelectValue placeholder="Add manufacturer" />
                        </SelectTrigger>
                        <SelectContent>
                            {attachable.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                    {m.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                {selected && canEdit && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon-sm" aria-label={`Actions for ${selected.name}`}>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {hasSpec && (
                                <DropdownMenuItem onSelect={onEditProcess}>
                                    <Pencil className="h-4 w-4" />
                                    Edit process
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => onRemove(selected)}
                            >
                                <Trash2 className="h-4 w-4" />
                                Remove from project
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </div>
    );
}

export function NoManufacturers({ canEdit, canAttach }: { canEdit: boolean; canAttach: boolean }) {
    return (
        <div className="flex flex-col items-center gap-2 border p-10 text-center text-muted-foreground">
            <Factory className="h-8 w-8 opacity-50" />
            <p className="text-sm">
                No manufacturers on this project yet.
                {canEdit
                    ? canAttach
                        ? " Add one above to set its fabrication specs."
                        : " None exist yet: add one from Manufacturing in the sidebar, then attach it here."
                    : ""}
            </p>
        </div>
    );
}

// --- the process and the actions on this manufacturer's spec ---------------------------------

interface SpecHeaderProps {
    manufacturerName: string;
    templates: SpecTemplate[];
    templateId: string | null;
    canEdit: boolean;
    hasSpec: boolean;
    busy: SpecForm["busy"];
    onPickProcess: (id: string) => void;
    onDownload: () => void;
    onExtract: () => void;
}

export function SpecHeader({
    manufacturerName,
    templates,
    templateId,
    canEdit,
    hasSpec,
    busy,
    onPickProcess,
    onDownload,
    onExtract,
}: SpecHeaderProps) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Process</span>
                {templates.length > 0 ? (
                    <Select
                        value={templateId ?? ""}
                        onValueChange={(id) => {
                            if (hasSpec && id && id !== templateId) onPickProcess(id);
                        }}
                        disabled={!canEdit || !hasSpec || busy === "applying"}
                    >
                        <SelectTrigger size="sm" aria-label="Process" className="w-auto min-w-[12rem]">
                            <SelectValue placeholder="Custom (no process)" />
                        </SelectTrigger>
                        <SelectContent>
                            {templates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                    {t.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <span className="text-sm text-muted-foreground">No processes defined for {manufacturerName}.</span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onDownload} disabled={busy === "downloading"}>
                    <FileDown className="mr-1.5 h-3.5 w-3.5" />
                    PDF spec sheet
                </Button>
                {canEdit && hasSpec && (
                    <Button variant="outline" size="sm" onClick={onExtract} disabled={busy === "extracting"}>
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        {busy === "extracting" ? "Reading..." : "Fill from board"}
                    </Button>
                )}
            </div>
        </div>
    );
}

// --- the spec form ---------------------------------------------------------------------------

interface SpecFormPanelProps {
    form: SpecForm;
    manufacturerName: string;
    hasSpec: boolean;
    canEdit: boolean;
}

export function SpecFormPanel({ form, manufacturerName, hasSpec, canEdit }: SpecFormPanelProps) {
    const hasFields = form.schema.sections.some((s) => s.fields.length > 0);

    let body;
    if (!hasSpec) {
        body = (
            <div className="flex flex-col items-center gap-3 border p-10 text-center text-muted-foreground">
                <Settings2 className="h-8 w-8 opacity-50" />
                <p className="text-sm">Loading {manufacturerName}&rsquo;s spec...</p>
            </div>
        );
    } else if (form.loading) {
        body = <div className="border p-10 text-center text-sm text-muted-foreground">Loading spec...</div>;
    } else if (!hasFields) {
        body = (
            <div className="flex flex-col items-center gap-3 border p-10 text-center text-muted-foreground">
                <Settings2 className="h-8 w-8 opacity-50" />
                <p className="text-sm">
                    This process defines no fields yet.
                    {canEdit ? " Open “Edit process” to add some." : ""}
                </p>
            </div>
        );
    } else {
        body = (
            <>
                {form.schema.errors.length > 0 && (
                    <div className="border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
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
        <aside className="space-y-4 lg:sticky lg:top-2">
            <CapabilityCheck
                fields={ruleFields}
                capabilities={form.capabilities}
                meta={form.capabilityMeta}
                boardRules={boardRules}
                processName={form.templateName}
            />
            <section className="border">
                <div className="border-b bg-muted/30 px-4 py-2.5">
                    <h3 className="text-sm font-medium">Spec</h3>
                </div>
                <div className="space-y-3 px-4 py-3">
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
                    <div className="border-t pt-3">
                        <p className="mb-1.5 text-xs text-muted-foreground">Last production</p>
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
                        <Button size="sm" className="w-full" onClick={onStartProduction}>
                            <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
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
