import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Factory, Sparkles, Save, Plus, PlusCircle, Settings2, ChevronDown, ChevronRight, FileDown, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    extractBoardSpec,
    listRuns,
    listManufacturers,
    listProjectManufacturers,
    attachManufacturer,
    detachManufacturer,
    listProjectSpecs,
    getProjectSpec,
    createProjectSpec,
    updateProjectSpec,
    deleteProjectSpec,
    getTemplate,
    listTemplates,
    downloadSpecSheet,
    getPcbRuleFields,
    extractPcbRules,
} from "@/lib/manufacturing";
import {
    RUN_STATUS_LABELS,
    EXTRACTABLE_KEYS,
    evaluateCondition,
    type Manufacturer,
    type ManufacturingRun,
    type ParsedSpecConfig,
    type PcbRuleField,
    type ProjectManufacturer,
    type ProjectSpec,
    type SpecFieldDef,
    type SpecSectionDef,
    type SpecTemplate,
} from "@/types/manufacturing";
import { SpecConfigEditor } from "./spec-config-editor";
import { CompactSelect, FIELD_GAP, GROUP_GRID, FIELD_WRAP } from "./ui";

interface ProjectManufacturingProps {
    projectId: string;
    canEdit: boolean;
    onOpenRun?: (runId: string) => void;
    onNewRun?: () => void;
}

type SpecValues = Record<string, unknown>;

export function ProjectManufacturing({
    projectId,
    canEdit,
    onOpenRun,
    onNewRun,
}: ProjectManufacturingProps) {
    // Navigation: which attached manufacturer and named spec are selected.
    const [manufacturers, setManufacturers] = useState<ProjectManufacturer[]>([]);
    const [manufacturerId, setManufacturerId] = useState<string>("");
    const [specs, setSpecs] = useState<ProjectSpec[]>([]);
    const [specId, setSpecId] = useState<string>("");

    // The selected spec's form state.
    const [values, setValues] = useState<SpecValues>({});
    const [source, setSource] = useState<Record<string, string>>({});
    const [schema, setSchema] = useState<ParsedSpecConfig>({ sections: [], errors: [] });
    const [runs, setRuns] = useState<ManufacturingRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [specLoading, setSpecLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [templates, setTemplates] = useState<SpecTemplate[]>([]);
    const [allManufacturers, setAllManufacturers] = useState<Manufacturer[]>([]);
    const [ruleFields, setRuleFields] = useState<PcbRuleField[]>([]);
    // The selected spec's linked-template capabilities (read live from getProjectSpec).
    const [templateCapabilities, setTemplateCapabilities] = useState<Record<string, number>>({});
    const [templateName, setTemplateName] = useState<string | null>(null);
    // The board's own extracted rules, read automatically for the capability comparison.
    const [boardRules, setBoardRules] = useState<Record<string, unknown> | null>(null);
    // Which optional sections are switched on (persisted with the spec).
    const [activeSections, setActiveSections] = useState<Set<string>>(new Set());
    // Which sections are collapsed in the UI (per-session, not persisted).
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    useEffect(() => {
        void getPcbRuleFields()
            .then(({ fields }) => setRuleFields(fields))
            .catch(() => setRuleFields([]));
    }, []);

    // Auto-extract the board's PCB rules once, so the capability table can show the
    // board's values without the user having to ask. Silent: a board with no
    // readable rules just leaves the column empty.
    useEffect(() => {
        let cancelled = false;
        void extractPcbRules(projectId)
            .then(({ rules }) => !cancelled && setBoardRules(rules))
            .catch(() => !cancelled && setBoardRules(null));
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    // Load the project-level pieces: attached manufacturers, the runs, templates,
    // and the global directory (for the "add manufacturer" picker).
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [attached, runList, tmpls, all] = await Promise.all([
                listProjectManufacturers(projectId),
                listRuns(projectId),
                listTemplates().catch(() => [] as SpecTemplate[]),
                listManufacturers().catch(() => [] as Manufacturer[]),
            ]);
            setManufacturers(attached);
            setRuns(runList);
            setTemplates(tmpls);
            setAllManufacturers(all);
            // Keep the current manufacturer selection if still attached, else pick the first.
            setManufacturerId((current) =>
                attached.some((m) => m.id === current) ? current : (attached[0]?.id ?? ""),
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load manufacturing data.");
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        void load();
    }, [load]);

    // When the manufacturer changes, load its specs and select the first.
    useEffect(() => {
        if (!manufacturerId) {
            setSpecs([]);
            setSpecId("");
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const list = await listProjectSpecs(projectId, manufacturerId);
                if (cancelled) return;
                setSpecs(list);
                setSpecId((current) =>
                    list.some((s) => s.id === current) ? current : (list[0]?.id ?? ""),
                );
            } catch {
                if (!cancelled) {
                    setSpecs([]);
                    setSpecId("");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId, manufacturerId]);

    // When the selected spec changes, load its schema and values into the form.
    useEffect(() => {
        if (!specId) {
            setValues({});
            setSource({});
            setSchema({ sections: [], errors: [] });
            setActiveSections(new Set());
            setTemplateCapabilities({});
            setTemplateName(null);
            setDirty(false);
            return;
        }
        let cancelled = false;
        setSpecLoading(true);
        void (async () => {
            try {
                const spec = await getProjectSpec(specId);
                if (cancelled) return;
                setValues(spec.specs ?? {});
                setSource(spec.source ?? {});
                setSchema(spec.parsed);
                setActiveSections(new Set(spec.active_sections ?? []));
                setTemplateCapabilities(spec.template_capabilities ?? {});
                setTemplateName(spec.template_name ?? null);
                setDirty(false);
            } catch (error) {
                if (!cancelled) toast.error(error instanceof Error ? error.message : "Failed to load the spec.");
            } finally {
                if (!cancelled) setSpecLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [specId]);

    const setField = (key: string, value: unknown, provenance: string = "manual") => {
        setValues((current) => ({ ...current, [key]: value }));
        setSource((current) => ({ ...current, [key]: provenance }));
        setDirty(true);
    };

    const handleExtract = async () => {
        setExtracting(true);
        try {
            const { suggested, reason } = await extractBoardSpec(projectId);
            const keys = Object.keys(suggested);
            if (keys.length === 0) {
                toast.info(reason ?? "Nothing could be read from the board.");
                return;
            }
            setValues((current) => ({ ...current, ...suggested }));
            setSource((current) => {
                const next = { ...current };
                for (const key of keys) next[key] = "extracted";
                return next;
            });
            setDirty(true);
            toast.success(`Filled ${keys.length} field(s) from the board. Review and save.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to read the board.");
        } finally {
            setExtracting(false);
        }
    };

    const handleSave = async () => {
        if (!specId) return;
        setSaving(true);
        try {
            await updateProjectSpec(specId, { specs: values, source, active_sections: [...activeSections] });
            setDirty(false);
            toast.success("Spec saved.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    const toggleCollapsed = (title: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            next.has(title) ? next.delete(title) : next.add(title);
            return next;
        });
    };

    const toggleSectionActive = (title: string, on: boolean) => {
        setActiveSections((prev) => {
            const next = new Set(prev);
            on ? next.add(title) : next.delete(title);
            return next;
        });
        setDirty(true);
    };

    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            await downloadSpecSheet(projectId);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to download the spec sheet.");
        } finally {
            setDownloading(false);
        }
    };

    const handleAttach = async (id: string) => {
        try {
            await attachManufacturer(projectId, id);
            await load();
            setManufacturerId(id);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to add manufacturer.");
        }
    };

    const handleDetach = async (id: string) => {
        try {
            await detachManufacturer(projectId, id);
            await load();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to remove manufacturer.");
        }
    };

    // Give a new spec a distinct name based on a starting label, so adding the same
    // template twice does not collide ("JLCPCB", "JLCPCB 2", ...).
    const uniqueSpecName = (base: string) => {
        const taken = new Set(specs.map((s) => s.name.toLowerCase()));
        if (!taken.has(base.toLowerCase())) return base;
        for (let n = 2; ; n += 1) {
            const candidate = `${base} ${n}`;
            if (!taken.has(candidate.toLowerCase())) return candidate;
        }
    };

    // Add a spec for the selected manufacturer. A template seeds its schema and
    // names the spec after the template; the blank option names it "Custom". No
    // naming step: the spec is created immediately and can be renamed later.
    const addSpecFromTemplate = async (templateId: string) => {
        if (!manufacturerId) return;
        let spec_config: string | undefined;
        let base = "Custom";
        if (templateId) {
            const tmpl = templates.find((t) => t.id === templateId);
            base = tmpl?.name || "Spec";
            try {
                spec_config = (await getTemplate(templateId)).spec_config;
            } catch {
                spec_config = undefined;
            }
        }
        try {
            const { id } = await createProjectSpec(projectId, {
                manufacturer_id: manufacturerId,
                name: uniqueSpecName(base),
                spec_config,
                template_id: templateId || null,
            });
            setSpecs(await listProjectSpecs(projectId, manufacturerId));
            setSpecId(id);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to add spec.");
        }
    };

    const handleRenameSpec = async () => {
        if (!specId) return;
        const current = specs.find((s) => s.id === specId)?.name ?? "";
        const name = window.prompt("Rename spec", current);
        if (!name || !name.trim() || name.trim() === current) return;
        try {
            await updateProjectSpec(specId, { name: name.trim() });
            setSpecs(await listProjectSpecs(projectId, manufacturerId));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to rename spec.");
        }
    };

    const handleDeleteSpec = async () => {
        if (!specId) return;
        const name = specs.find((s) => s.id === specId)?.name ?? "this spec";
        if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
        try {
            await deleteProjectSpec(specId);
            const list = await listProjectSpecs(projectId, manufacturerId);
            setSpecs(list);
            setSpecId(list[0]?.id ?? "");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete spec.");
        }
    };

    if (loading) {
        return <div className="text-sm text-muted-foreground">Loading manufacturing...</div>;
    }

    const hasFields = schema.sections.some((s) => s.fields.length > 0);
    const attachedIds = new Set(manufacturers.map((m) => m.id));
    const attachable = allManufacturers.filter((m) => !attachedIds.has(m.id));
    const selectedManufacturer = manufacturers.find((m) => m.id === manufacturerId) ?? null;
    const manufacturerTemplates = templates.filter((t) => t.manufacturer_id === manufacturerId);

    return (
        <div className="flex flex-col gap-4">
            {/* Manufacturers + named specs navigator */}
            <section className="border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Manufacturers
                    </span>
                    {canEdit && attachable.length > 0 && (
                        <Select
                            value=""
                            onValueChange={(id) => {
                                if (id) void handleAttach(id);
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
                </div>

                {manufacturers.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
                        <Factory className="h-8 w-8 opacity-50" />
                        <p className="text-sm">
                            No manufacturers yet.
                            {canEdit ? " Add one above to set its fabrication specs." : ""}
                        </p>
                    </div>
                ) : (
                    // Square, tab-like chips matching the design system's sharp corners.
                    <div className="flex flex-wrap gap-px bg-border p-px">
                        {manufacturers.map((m) => (
                            <div
                                key={m.id}
                                className={cn(
                                    "flex items-center gap-1 bg-card px-1 transition-colors",
                                    m.id === manufacturerId ? "bg-secondary" : "hover:bg-muted/40",
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => setManufacturerId(m.id)}
                                    className={cn(
                                        "px-2 py-1.5 text-sm",
                                        m.id === manufacturerId && "font-medium",
                                    )}
                                >
                                    {m.name}
                                </button>
                                {canEdit && (
                                    <button
                                        type="button"
                                        aria-label={`Remove ${m.name}`}
                                        title={`Remove ${m.name} from this project`}
                                        onClick={() => void handleDetach(m.id)}
                                        className="p-1 text-muted-foreground hover:text-destructive"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {selectedManufacturer && (
                    <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Spec
                        </span>
                        {specs.length > 0 && (
                            <Select value={specId} onValueChange={setSpecId}>
                                <SelectTrigger size="sm" aria-label="Select a spec" className="w-auto">
                                    <SelectValue placeholder="Spec" />
                                </SelectTrigger>
                                <SelectContent>
                                    {specs.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {canEdit && (
                            <>
                                {/* Quick-add: pick a schema for this manufacturer and the spec is
                                    created at once, named after it. No naming step. */}
                                <Select
                                    value=""
                                    onValueChange={(id) => {
                                        if (id === "__blank__") void addSpecFromTemplate("");
                                        else if (id) void addSpecFromTemplate(id);
                                    }}
                                >
                                    <SelectTrigger size="sm" aria-label="Add a schema" className="w-auto">
                                        <Plus className="h-3.5 w-3.5" />
                                        <SelectValue placeholder="Add schema" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {manufacturerTemplates.map((t) => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.name}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="__blank__">Blank (starter schema)</SelectItem>
                                    </SelectContent>
                                </Select>
                                {specId && (
                                    <>
                                        <Button variant="ghost" size="sm" onClick={() => void handleRenameSpec()}>
                                            Rename
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => void handleDeleteSpec()}
                                        >
                                            Delete
                                        </Button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}
            </section>

            {/* Capabilities of the selected spec's fabrication method, with the
                board's own extracted rules shown alongside for comparison. */}
            {selectedManufacturer && specId && (
                <section className="border">
                    <div className="border-b bg-muted/30 px-3 py-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Capabilities
                        </span>
                    </div>
                    {templateName ? (
                        <CapabilitiesTable
                            fields={ruleFields}
                            capabilities={templateCapabilities}
                            boardRules={boardRules}
                        />
                    ) : (
                        <p className="px-4 py-6 text-sm text-muted-foreground">
                            Add a spec from one of this manufacturer&rsquo;s schemas to see its capabilities.
                        </p>
                    )}
                </section>
            )}

            {/* Board specs for the selected spec */}
            {selectedManufacturer && (
            <section className="border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {specs.find((s) => s.id === specId)?.name || "Fabrication spec"}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="Download PDF spec sheet"
                            title="Download PDF spec sheet"
                            onClick={() => void handleDownloadPdf()}
                            disabled={downloading}
                        >
                            <FileDown className="h-4 w-4" />
                        </Button>
                        {canEdit && specId && (
                            <>
                                <Button
                                    variant="outline"
                                    size="icon-sm"
                                    aria-label="Edit schema"
                                    title="Edit schema"
                                    onClick={() => setEditorOpen(true)}
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => void handleExtract()} disabled={extracting}>
                                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                                    {extracting ? "Reading..." : "Extract from board"}
                                </Button>
                                <Button size="sm" onClick={() => void handleSave()} disabled={saving || !dirty}>
                                    <Save className="mr-1.5 h-3.5 w-3.5" />
                                    {saving ? "Saving..." : "Save"}
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {!specId ? (
                    <div className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
                        <Settings2 className="h-8 w-8 opacity-50" />
                        <p className="text-sm">
                            No specs for {selectedManufacturer.name} yet.
                            {canEdit ? " Use “Add spec” above to create one." : ""}
                        </p>
                    </div>
                ) : specLoading ? (
                    <div className="p-10 text-center text-sm text-muted-foreground">Loading spec...</div>
                ) : !hasFields ? (
                    <div className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
                        <Settings2 className="h-8 w-8 opacity-50" />
                        <p className="text-sm">
                            This schema defines no fields yet.
                            {canEdit ? " Open “Edit schema” to add some." : ""}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {schema.errors.length > 0 && (
                            <div className="m-4 border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
                                The schema has {schema.errors.length} problem(s). Some fields may be missing until you fix it.
                            </div>
                        )}
                        {schema.sections
                            .filter((section) => evaluateCondition(section.when, values))
                            .map((section) => (
                                <SpecSection
                                    key={section.title}
                                    section={section}
                                    values={values}
                                    collapsed={collapsed.has(section.title)}
                                    active={!section.optional || activeSections.has(section.title)}
                                    canEdit={canEdit}
                                    onToggleCollapsed={() => toggleCollapsed(section.title)}
                                    onToggleActive={(on) => toggleSectionActive(section.title, on)}
                                    renderField={(field) => (
                                        <SpecFieldInput
                                            key={field.key}
                                            field={field}
                                            value={values[field.key]}
                                            disabled={!canEdit}
                                            onChange={(v) => setField(field.key, v)}
                                        />
                                    )}
                                />
                            ))}
                    </div>
                )}
            </section>
            )}

            {/* Production for this project */}
            <section className="border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Production
                        {runs.length > 0 ? ` (${runs.length})` : ""}
                    </span>
                    {canEdit && onNewRun && (
                        <Button size="sm" onClick={onNewRun}>
                            <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                            New production
                        </Button>
                    )}
                </div>

                {runs.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
                        <Factory className="h-8 w-8 opacity-50" />
                        <p className="text-sm">Track a production to record quantity, manufacturer, and defects.</p>
                    </div>
                ) : (
                    <div>
                        {runs.map((run) => (
                            <button
                                key={run.id}
                                type="button"
                                onClick={() => onOpenRun?.(run.id)}
                                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-medium">
                                            {run.manufacturer_name || "No manufacturer"}
                                        </span>
                                        <Badge variant="secondary">{RUN_STATUS_LABELS[run.status]}</Badge>
                                    </div>
                                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {run.quantity_good}/{run.quantity_ordered} good
                                        {run.defect_count ? ` · ${run.defect_count} defect(s)` : ""}
                                        {run.commit_sha ? ` · ${run.commit_sha.slice(0, 7)}` : ""}
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(run.created_at).toLocaleDateString()}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {editorOpen && specId && (
                <SpecConfigEditor
                    title="Edit spec schema"
                    description="Define the fields this spec's form shows, or apply a manufacturer template."
                    saveLabel="Save schema"
                    load={async () => {
                        const spec = await getProjectSpec(specId);
                        return { text: spec.spec_config, parsed: spec.parsed };
                    }}
                    save={async (text) => {
                        await updateProjectSpec(specId, { spec_config: text });
                        const { previewSpecConfig } = await import("@/lib/manufacturing");
                        return previewSpecConfig(text);
                    }}
                    headerSlot={(setText) => {
                        // Prefer templates for the selected manufacturer; fall back to all.
                        const forMfr = templates.filter((t) => t.manufacturer_id === manufacturerId);
                        const options = forMfr.length > 0 ? forMfr : templates;
                        return options.length > 0 ? (
                            <CompactSelect
                                aria-label="Apply a template"
                                widthClass="w-auto"
                                value=""
                                onChange={async (e) => {
                                    const templateId = e.target.value;
                                    e.target.value = "";
                                    if (!templateId) return;
                                    try {
                                        // Copy-on-apply: fetch the template's config into the editor.
                                        const { getTemplate } = await import("@/lib/manufacturing");
                                        const tmpl = await getTemplate(templateId);
                                        setText(tmpl.spec_config);
                                    } catch (error) {
                                        toast.error(error instanceof Error ? error.message : "Failed to load template.");
                                    }
                                }}
                            >
                                <option value="">Apply template…</option>
                                {options.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.manufacturer_name} — {t.name}
                                    </option>
                                ))}
                            </CompactSelect>
                        ) : null;
                    }}
                    onClose={() => setEditorOpen(false)}
                    onSaved={() => {
                        setEditorOpen(false);
                        // Reload the spec into the form so new fields appear.
                        setSpecId((id) => id);
                        void (async () => {
                            const spec = await getProjectSpec(specId);
                            setValues(spec.specs ?? {});
                            setSource(spec.source ?? {});
                            setSchema(spec.parsed);
                            setActiveSections(new Set(spec.active_sections ?? []));
                        })();
                    }}
                />
            )}
        </div>
    );
}

function formatMinCapability(value: number | undefined, unit?: string | null): string {
    if (value === undefined || value === null) return "—";
    return unit ? `${value} ${unit}` : String(value);
}

function formatBoardValue(value: unknown, unit?: string | null): string {
    if (value === undefined || value === null || value === "") return "—";
    if (value === true) return "yes";
    if (value === false) return "no";
    return unit ? `${value} ${unit}` : String(value);
}

// Read-only table of the fabrication method's minimum capabilities, with the
// board's own extracted value for each field alongside so a user can eyeball
// whether the board meets the minimums. Rows with nothing on either side are hidden.
function CapabilitiesTable({
    fields,
    capabilities,
    boardRules,
}: {
    fields: PcbRuleField[];
    capabilities: Record<string, number>;
    boardRules: Record<string, unknown> | null;
}) {
    const rows = fields.filter((f) => {
        const hasCap = capabilities[f.key] !== undefined;
        const hasBoard = boardRules != null && boardRules[f.key] !== undefined;
        return hasCap || hasBoard;
    });

    if (rows.length === 0) {
        return (
            <p className="px-4 py-6 text-sm text-muted-foreground">
                No capabilities set for this method yet. Set them from the main Manufacturing page.
            </p>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">Rule</th>
                        <th className="px-4 py-2 text-right font-medium">Manufacturer min</th>
                        {boardRules != null && (
                            <th className="px-4 py-2 text-right font-medium">This board</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((field, i) => (
                        <tr key={field.key} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                            <td className="px-4 py-1.5 text-muted-foreground">{field.label}</td>
                            <td className="px-4 py-1.5 text-right font-medium tabular-nums">
                                {formatMinCapability(capabilities[field.key], field.unit)}
                            </td>
                            {boardRules != null && (
                                <td className="px-4 py-1.5 text-right tabular-nums">
                                    {formatBoardValue(boardRules[field.key], field.unit)}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

interface SpecSectionProps {
    section: SpecSectionDef;
    values: SpecValues;
    collapsed: boolean;
    active: boolean;
    canEdit: boolean;
    onToggleCollapsed: () => void;
    onToggleActive: (on: boolean) => void;
    renderField: (field: SpecFieldDef) => ReactNode;
}

function SpecSection({
    section,
    values,
    collapsed,
    active,
    canEdit,
    onToggleCollapsed,
    onToggleActive,
    renderField,
}: SpecSectionProps) {
    const showBody = active && !collapsed;
    // Fields whose gate is unsatisfied are hidden, so options only appear when
    // their controlling field has the right value.
    const visibleFields = section.fields.filter((f) => evaluateCondition(f.when, values));
    return (
        <div>
            <div className="flex items-center justify-between gap-3 bg-muted/20 px-4 py-2">
                <button
                    type="button"
                    onClick={onToggleCollapsed}
                    className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    aria-expanded={showBody}
                >
                    {showBody ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{section.title}</span>
                    {section.optional && (
                        <span className="rounded-none bg-muted px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-muted-foreground">
                            optional
                        </span>
                    )}
                </button>

                {section.optional && (
                    <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        aria-label={`Enable ${section.title}`}
                        disabled={!canEdit}
                        onClick={() => onToggleActive(!active)}
                        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            active ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                    >
                        <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-background shadow transition-transform ${
                                active ? "translate-x-3.5" : "translate-x-0.5"
                            }`}
                        />
                    </button>
                )}
            </div>

            {showBody && (
                <div className={`px-4 pb-3 ${GROUP_GRID}`}>
                    {visibleFields.map((field) => (
                        <div key={field.key} className={FIELD_WRAP}>
                            {renderField(field)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface SpecFieldInputProps {
    field: SpecFieldDef;
    value: unknown;
    disabled: boolean;
    onChange: (value: unknown) => void;
}

function SpecFieldInput({ field, value, disabled, onChange }: SpecFieldInputProps) {
    const inputId = `spec-${field.key}`;
    // A stored value wins; otherwise fall back to the schema's declared default.
    const effective = value === undefined || value === null ? field.default : value;

    const labelRow = (
        <div className="flex items-center gap-1.5">
            <Label htmlFor={inputId} className="text-xs">
                {field.label}
            </Label>
            {EXTRACTABLE_KEYS.has(field.key) && (
                <Sparkles
                    aria-label="Extract from board can fill this field"
                    className="h-3 w-3 text-muted-foreground"
                />
            )}
        </div>
    );

    if (field.type === "bool") {
        // Same stacked shape as the other fields (label on top, control below) so a
        // row of mixed fields lines up. The control slot is a fixed h-7 box holding
        // the checkbox, matching the height of an input/select.
        return (
            <div className={FIELD_GAP}>
                {labelRow}
                <label
                    htmlFor={inputId}
                    className="flex h-7 cursor-pointer items-center rounded-none border px-2"
                >
                    <input
                        id={inputId}
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={effective === true}
                        disabled={disabled}
                        onChange={(e) => onChange(e.target.checked)}
                    />
                </label>
            </div>
        );
    }

    if (field.type === "choice") {
        // Coerce to a string so a number (e.g. an extracted layer count) matches its
        // string option. An unset value stays "" (the — placeholder).
        const selected = effective === undefined || effective === null ? "" : String(effective);
        return (
            <div className={FIELD_GAP}>
                {labelRow}
                <CompactSelect
                    id={inputId}
                    value={field.options.includes(selected) ? selected : ""}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value || undefined)}
                >
                    <option value="">—</option>
                    {field.options.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </CompactSelect>
            </div>
        );
    }

    const isNumber = field.type === "int" || field.type === "number";
    return (
        <div className={FIELD_GAP}>
            {labelRow}
            <Input
                id={inputId}
                type={isNumber ? "number" : "text"}
                step={field.type === "int" ? 1 : "any"}
                className="h-7"
                value={effective === undefined || effective === null ? "" : String(effective)}
                disabled={disabled}
                onChange={(e) => {
                    const raw = e.target.value;
                    if (isNumber) {
                        onChange(raw === "" ? undefined : Number(raw));
                    } else {
                        onChange(raw || undefined);
                    }
                }}
            />
        </div>
    );
}
