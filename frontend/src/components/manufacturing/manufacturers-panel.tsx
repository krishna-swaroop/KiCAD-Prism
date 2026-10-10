import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ExternalLink, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/relative-time";
import {
    createManufacturer,
    updateManufacturer,
    deleteManufacturer,
    getPcbRuleFields,
    listTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
} from "@/lib/manufacturing";
import type { Manufacturer, ManufacturingRun, PcbRuleField, SpecTemplate } from "@/types/manufacturing";
import { SchemaCapabilitiesDialog, type ConfigTab } from "./spec-config-editor";
import { keyMinimums, manufacturerScorecard } from "./manufacturer-stats";
import { RunStatusBadge } from "./status-badge";
import { YieldBar } from "./yield-bar";

interface ManufacturersPanelProps {
    manufacturers: Manufacturer[];
    /** Every production, for each manufacturer's scorecard and recent list. */
    runs?: ManufacturingRun[];
    canEdit: boolean;
    /** The "Add manufacturer" action lives in the parent header; it drives this. */
    addOpen?: boolean;
    onAddOpenChange?: (open: boolean) => void;
    onChanged: () => void;
    /** Open a production (the Production page shows it in its drawer). */
    onOpenRun?: (runId: string) => void;
}

export type EditTarget = { mode: "create" } | { mode: "edit"; manufacturer: Manufacturer } | null;

const CREATE_TARGET: EditTarget = { mode: "create" };

// Parse a config for the live preview in the process editor.
async function previewConfig(text: string) {
    const { previewSpecConfig } = await import("@/lib/manufacturing");
    return previewSpecConfig(text);
}

function websiteHref(website: string): string {
    return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

/**
 * The fab-house directory as a list and a detail: pick a manufacturer on the
 * left, see its contact, its processes (always visible, with their key minimums
 * and who uses them), how its productions have gone, and the projects using it.
 */
export function ManufacturersPanel({
    manufacturers,
    runs = [],
    canEdit,
    addOpen,
    onAddOpenChange,
    onChanged,
    onOpenRun,
}: ManufacturersPanelProps) {
    const [selectedId, setSelectedId] = useState<string>("");
    const [query, setQuery] = useState("");
    const [editTarget, setEditing] = useState<EditTarget>(null);
    const [deleteTarget, setDeleteTarget] = useState<Manufacturer | null>(null);
    const [deleting, setDeleting] = useState(false);

    // The add action is triggered from the parent header, so "add is open" there means the
    // create dialog is showing, without copying that prop into state.
    const editing: EditTarget = editTarget ?? (addOpen ? CREATE_TARGET : null);

    const closeEditing = () => {
        setEditing(null);
        onAddOpenChange?.(false);
    };

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return needle ? manufacturers.filter((m) => m.name.toLowerCase().includes(needle)) : manufacturers;
    }, [manufacturers, query]);

    // Keep a valid selection: the chosen one if it still exists, else the first listed.
    const selected =
        manufacturers.find((m) => m.id === selectedId) ?? visible[0] ?? manufacturers[0] ?? null;

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteManufacturer(deleteTarget.id);
            toast.success("Manufacturer deleted.");
            setDeleteTarget(null);
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete.");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col border md:flex-row">
                {manufacturers.length === 0 ? (
                    <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
                        <Building2 className="h-8 w-8 opacity-50" />
                        <p className="text-sm">No manufacturers yet. Add the fab houses you order from.</p>
                        {canEdit && (
                            <Button size="sm" onClick={() => setEditing({ mode: "create" })}>
                                <Plus className="mr-1.5 h-4 w-4" />
                                Add manufacturer
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        <nav
                            aria-label="Manufacturers"
                            className="flex max-h-64 shrink-0 flex-col border-b md:max-h-none md:w-72 md:border-b-0 md:border-r"
                        >
                            <div className="relative border-b p-2">
                                <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    type="search"
                                    aria-label="Search manufacturers"
                                    placeholder="Search manufacturers..."
                                    className="h-8 pl-8"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />
                            </div>
                            <ul className="themed-scrollbar min-h-0 flex-1 overflow-auto">
                                {visible.map((m) => (
                                    <li key={m.id}>
                                        <button
                                            type="button"
                                            aria-current={selected?.id === m.id ? "true" : undefined}
                                            onClick={() => setSelectedId(m.id)}
                                            className={cn(
                                                "w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                                selected?.id === m.id && "bg-secondary",
                                            )}
                                        >
                                            <span className="block truncate text-sm font-medium">{m.name}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {plural(m.process_count ?? 0, "process", "processes")} ·{" "}
                                                {plural(m.project_count ?? 0, "project")}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                                {visible.length === 0 && (
                                    <li className="p-4 text-center text-sm text-muted-foreground">No match.</li>
                                )}
                            </ul>
                        </nav>

                        {selected && (
                            <ManufacturerDetail
                                key={selected.id}
                                manufacturer={selected}
                                runs={runs.filter((r) => r.manufacturer_id === selected.id)}
                                canEdit={canEdit}
                                onEdit={() => setEditing({ mode: "edit", manufacturer: selected })}
                                onDelete={() => setDeleteTarget(selected)}
                                onChanged={onChanged}
                                onOpenRun={onOpenRun}
                            />
                        )}
                    </>
                )}
            </div>

            {editing && (
                <ManufacturerDialog
                    target={editing}
                    onClose={closeEditing}
                    onSaved={(id) => {
                        closeEditing();
                        setSelectedId(id);
                        onChanged();
                    }}
                />
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title="Delete manufacturer?"
                description={
                    <>
                        {deleteTarget?.name} will be removed. Production that references it keeps its history but
                        shows no manufacturer.
                    </>
                }
                confirmLabel="Delete"
                busy={deleting}
                onConfirm={() => void handleDelete()}
            />
        </div>
    );
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}

interface ManufacturerDetailProps {
    manufacturer: Manufacturer;
    runs: ManufacturingRun[];
    canEdit: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onChanged: () => void;
    onOpenRun?: (runId: string) => void;
}

type TemplateEdit = { mode: "create" } | { mode: "edit"; template: SpecTemplate } | null;

function ManufacturerDetail({
    manufacturer: m,
    runs,
    canEdit,
    onEdit,
    onDelete,
    onChanged,
    onOpenRun,
}: ManufacturerDetailProps) {
    const [templates, setTemplates] = useState<SpecTemplate[]>([]);
    const [loadedTemplates, setLoadedTemplates] = useState(false);
    const [ruleFields, setRuleFields] = useState<PcbRuleField[]>([]);
    const [editing, setEditing] = useState<TemplateEdit>(null);
    const [deleteTarget, setDeleteTarget] = useState<SpecTemplate | null>(null);

    const loadTemplates = useCallback(async () => {
        try {
            setTemplates(await listTemplates(m.id));
            setLoadedTemplates(true);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load processes.");
        }
    }, [m.id]);

    useEffect(() => {
        void loadTemplates();
    }, [loadTemplates]);

    useEffect(() => {
        let cancelled = false;
        void getPcbRuleFields()
            .then(({ fields }) => !cancelled && setRuleFields(fields))
            .catch(() => !cancelled && setRuleFields([]));
        return () => {
            cancelled = true;
        };
    }, []);

    const score = useMemo(() => manufacturerScorecard(runs), [runs]);
    const recent = useMemo(
        () => [...runs].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5),
        [runs],
    );
    const projects = m.projects ?? [];

    return (
        <div className="themed-scrollbar min-h-0 min-w-0 flex-1 overflow-auto">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
                <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{m.name}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {m.website && (
                            <a
                                href={websiteHref(m.website)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                                {m.website}
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                        {m.contact && <span>{m.contact}</span>}
                    </div>
                    {m.notes && <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm">{m.notes}</p>}
                </div>
                {canEdit && (
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={onEdit}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Edit
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon-sm" aria-label={`Actions for ${m.name}`}>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={onDelete}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Delete manufacturer
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </header>

            <div className="space-y-6 p-5">
                <section aria-label="Processes">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium">Processes</h3>
                        {canEdit && (
                            <Button variant="outline" size="sm" onClick={() => setEditing({ mode: "create" })}>
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                New process
                            </Button>
                        )}
                    </div>
                    {loadedTemplates && templates.length === 0 ? (
                        <p className="border border-dashed p-6 text-center text-sm text-muted-foreground">
                            No processes yet.
                            {canEdit ? " A process defines the spec fields and capabilities of one fabrication tier." : ""}
                        </p>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {templates.map((t) => (
                                <ProcessCard
                                    key={t.id}
                                    template={t}
                                    ruleFields={ruleFields}
                                    canEdit={canEdit}
                                    onEdit={() => setEditing({ mode: "edit", template: t })}
                                    onDelete={() => setDeleteTarget(t)}
                                />
                            ))}
                        </div>
                    )}
                </section>

                <section aria-label="Scorecard">
                    <h3 className="mb-3 text-sm font-medium">Scorecard</h3>
                    {score.productions === 0 ? (
                        <p className="border border-dashed p-6 text-center text-sm text-muted-foreground">
                            No productions with {m.name} yet.
                        </p>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <ScoreTile label="Productions" value={String(score.productions)} />
                            <ScoreTile label="Units ordered" value={String(score.units)} />
                            <ScoreTile
                                label="Yield"
                                value={score.yieldPct === null ? "—" : `${score.yieldPct}%`}
                                hint="Received and closed productions"
                            />
                            <ScoreTile
                                label="Defects"
                                value={String(score.defects.total)}
                                hint={
                                    score.defects.total === 0
                                        ? "None logged"
                                        : (["critical", "major", "minor", "aesthetic"] as const)
                                              .filter((s) => score.defects[s] > 0)
                                              .map((s) => `${score.defects[s]} ${s}`)
                                              .join(", ")
                                }
                            />
                        </div>
                    )}
                </section>

                <section aria-label="Recent production">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium">Recent production</h3>
                        {runs.length > recent.length && (
                            <Link
                                to={`/?section=manufacturing&status=all&q=${encodeURIComponent(m.name)}`}
                                className="text-xs text-primary hover:underline"
                            >
                                View all {runs.length}
                            </Link>
                        )}
                    </div>
                    {recent.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing yet.</p>
                    ) : (
                        <ul className="divide-y border">
                            {recent.map((run) => (
                                <li key={run.id}>
                                    <button
                                        type="button"
                                        onClick={() => onOpenRun?.(run.id)}
                                        className="grid w-full grid-cols-[minmax(0,1fr)_auto_8rem_5rem] items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                    >
                                        <span className="min-w-0 truncate">
                                            <span className="font-mono text-xs text-muted-foreground">{run.job_number}</span>{" "}
                                            {run.project_name || run.project_id}
                                        </span>
                                        <RunStatusBadge status={run.status} />
                                        <YieldBar good={run.quantity_good} ordered={run.quantity_ordered} />
                                        <span className="text-right text-xs text-muted-foreground">
                                            {formatRelative(run.updated_at)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section aria-label="Projects">
                    <h3 className="mb-3 text-sm font-medium">Projects</h3>
                    {projects.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No project has this manufacturer attached.</p>
                    ) : (
                        <ul className="flex flex-wrap gap-2">
                            {projects.map((p) => (
                                <li key={p.id}>
                                    <Link
                                        to={`/project/${p.id}?section=manufacturing`}
                                        className="inline-block border px-2.5 py-1 text-sm hover:bg-muted/40"
                                    >
                                        {p.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            {editing && (
                <TemplateEditorDialog
                    manufacturer={m}
                    edit={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        void loadTemplates();
                        onChanged();
                    }}
                />
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title="Delete process?"
                description={
                    <>
                        {deleteTarget?.name} will be removed. Projects using it keep their form fields but lose its
                        capabilities.
                    </>
                }
                confirmLabel="Delete"
                onConfirm={async () => {
                    if (!deleteTarget) return;
                    try {
                        await deleteTemplate(deleteTarget.id);
                        setDeleteTarget(null);
                        void loadTemplates();
                        onChanged();
                    } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to delete.");
                    }
                }}
            />
        </div>
    );
}

function ScoreTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
            {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
    );
}

interface ProcessCardProps {
    template: SpecTemplate;
    ruleFields: PcbRuleField[];
    canEdit: boolean;
    onEdit: () => void;
    onDelete: () => void;
}

// One fabrication tier: its name, its first few minimums, and how many projects use it.
function ProcessCard({ template: t, ruleFields, canEdit, onEdit, onDelete }: ProcessCardProps) {
    const minimums = keyMinimums(t, ruleFields);
    const used = t.project_count ?? 0;
    return (
        <article className="flex flex-col border">
            <div className="flex items-start justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                <h4 className="min-w-0 truncate text-sm font-medium">{t.name}</h4>
                {canEdit && (
                    <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${t.name}`} onClick={onEdit}>
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            aria-label={`Delete ${t.name}`}
                            onClick={onDelete}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}
            </div>
            {minimums.length > 0 ? (
                <dl className="flex-1 space-y-1 px-3 py-2 text-sm">
                    {minimums.map((row) => (
                        <div key={row.key} className="flex items-baseline justify-between gap-3">
                            <dt className="min-w-0 truncate text-muted-foreground">{row.label}</dt>
                            <dd className="shrink-0 tabular-nums">{row.unit ? `${row.value} ${row.unit}` : row.value}</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className="flex-1 px-3 py-2 text-sm text-muted-foreground">No capabilities set.</p>
            )}
            <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                {used === 0 ? "Not used by any project" : `Used by ${plural(used, "project")}`}
            </p>
        </article>
    );
}

interface ManufacturerDialogProps {
    target: Exclude<EditTarget, null>;
    onClose: () => void;
    /** Called with the saved manufacturer's id. */
    onSaved: (id: string) => void;
}

export function ManufacturerDialog({ target, onClose, onSaved }: ManufacturerDialogProps) {
    const existing = target.mode === "edit" ? target.manufacturer : null;
    const [name, setName] = useState(existing?.name ?? "");
    const [contact, setContact] = useState(existing?.contact ?? "");
    const [website, setWebsite] = useState(existing?.website ?? "");
    const [notes, setNotes] = useState(existing?.notes ?? "");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error("A name is required.");
            return;
        }
        setSaving(true);
        try {
            const body = { name: name.trim(), contact, website, notes };
            let savedId: string;
            if (existing) {
                await updateManufacturer(existing.id, body);
                savedId = existing.id;
            } else {
                savedId = (await createManufacturer(body)).id;
            }
            toast.success(existing ? "Manufacturer updated." : "Manufacturer added.");
            onSaved(savedId);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{existing ? "Edit manufacturer" : "Add manufacturer"}</DialogTitle>
                    <DialogDescription>A reusable fab-house record you can pick when creating a production.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2.5 py-1">
                    <div className="space-y-1">
                        <Label htmlFor="mfr-name">Name</Label>
                        <Input id="mfr-name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="mfr-contact">Contact</Label>
                        <Input id="mfr-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="mfr-website">Website</Label>
                        <Input id="mfr-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="mfr-notes">Notes</Label>
                        <Textarea id="mfr-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={saving || !name.trim()}>
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface TemplateEditorDialogProps {
    manufacturer: Manufacturer;
    edit: Exclude<TemplateEdit, null>;
    onClose: () => void;
    onSaved: () => void;
}

function TemplateEditorDialog({ manufacturer, edit, onClose, onSaved }: TemplateEditorDialogProps) {
    const existing = edit.mode === "edit" ? edit.template : null;
    // The name is edited alongside the .config; keep it in state the save closures read.
    const [name, setName] = useState(existing?.name ?? "");

    const preview = previewConfig;
    const baseName = (existing?.name ?? "process").toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const schemaTab: ConfigTab = {
        id: "schema",
        label: "Fields",
        fileBaseName: `${baseName}-schema`,
        load: async () => {
            if (existing) {
                const full = await getTemplate(existing.id);
                return { text: full.spec_config, parsed: await preview(full.spec_config) };
            }
            return { text: "", parsed: { sections: [], errors: [] } };
        },
        save: async (text) => {
            const finalName = name.trim() || (existing ? existing.name : "Untitled process");
            if (existing) {
                await updateTemplate(existing.id, { name: finalName, spec_config: text });
            } else {
                await createTemplate(manufacturer.id, { name: finalName, spec_config: text });
            }
            return preview(text);
        },
        headerSlot: () => (
            <input
                aria-label="Process name"
                className="h-7 w-40 rounded-md border bg-background px-2 text-xs"
                placeholder="Process name"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
        ),
    };

    const capabilitiesTab: ConfigTab = {
        id: "capabilities",
        label: "Capabilities",
        fileBaseName: `${baseName}-capabilities`,
        // Capabilities live on a saved process; a brand-new one has none yet.
        disabledNote: existing
            ? undefined
            : "Save the process first, then reopen it to define its capabilities.",
        load: async () => {
            if (!existing) return { text: "", parsed: { sections: [], errors: [] } };
            const full = await getTemplate(existing.id);
            const text = full.capability_config ?? "";
            return { text, parsed: await preview(text) };
        },
        save: async (text) => {
            if (existing) await updateTemplate(existing.id, { capability_config: text });
            return preview(text);
        },
    };

    return (
        <SchemaCapabilitiesDialog
            title={existing ? `Edit process: ${existing.name}` : `New ${manufacturer.name} process`}
            description="A fabrication tier: the spec fields a project fills in, and its capabilities. Projects copy the fields when they pick it and read the capabilities live."
            saveLabel="Save process"
            tabs={[schemaTab, capabilitiesTab]}
            onClose={onClose}
            onSaved={onSaved}
        />
    );
}
