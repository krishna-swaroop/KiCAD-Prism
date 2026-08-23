import { useCallback, useEffect, useState } from "react";
import { Building2, Pencil, Plus, Trash2, FileCode2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
    createManufacturer,
    updateManufacturer,
    deleteManufacturer,
    listTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
} from "@/lib/manufacturing";
import type { Manufacturer, SpecTemplate } from "@/types/manufacturing";
import { SchemaCapabilitiesDialog, type ConfigTab } from "./spec-config-editor";

interface ManufacturersPanelProps {
    manufacturers: Manufacturer[];
    canEdit: boolean;
    /** The "Add manufacturer" action lives in the parent header; it drives this. */
    addOpen?: boolean;
    onAddOpenChange?: (open: boolean) => void;
    onChanged: () => void;
}

type EditTarget = { mode: "create" } | { mode: "edit"; manufacturer: Manufacturer } | null;

export function ManufacturersPanel({ manufacturers, canEdit, addOpen, onAddOpenChange, onChanged }: ManufacturersPanelProps) {
    const [editing, setEditing] = useState<EditTarget>(null);
    const [deleteTarget, setDeleteTarget] = useState<Manufacturer | null>(null);
    const [deleting, setDeleting] = useState(false);

    // The add action is triggered from the parent header.
    useEffect(() => {
        if (addOpen) setEditing({ mode: "create" });
    }, [addOpen]);

    const closeEditing = () => {
        setEditing(null);
        onAddOpenChange?.(false);
    };

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
            <div className="flex min-h-0 flex-1 flex-col border">
            {manufacturers.length === 0 ? (
                <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                    <Building2 className="h-8 w-8 opacity-50" />
                    <p className="text-sm">No manufacturers yet. Add the fab houses you order from.</p>
                </div>
            ) : (
                <ul className="min-h-0 flex-1 divide-y overflow-auto">
                    {manufacturers.map((m) => (
                        <li key={m.id} className="px-3 py-4 transition-colors hover:bg-muted/30">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="font-medium">{m.name}</div>
                                    <div className="mt-0.5 space-y-0.5 text-sm text-muted-foreground">
                                        {m.contact && <div>{m.contact}</div>}
                                        {m.website && <div className="truncate">{m.website}</div>}
                                        {m.notes && <div className="text-xs">{m.notes}</div>}
                                    </div>
                                </div>
                                {canEdit && (
                                    <div className="flex shrink-0 gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            aria-label={`Edit ${m.name}`}
                                            onClick={() => setEditing({ mode: "edit", manufacturer: m })}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive"
                                            aria-label={`Delete ${m.name}`}
                                            onClick={() => setDeleteTarget(m)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <ManufacturerTemplates manufacturer={m} canEdit={canEdit} />
                        </li>
                    ))}
                </ul>
            )}
            </div>

            {editing && (
                <ManufacturerDialog
                    target={editing}
                    onClose={closeEditing}
                    onSaved={() => {
                        closeEditing();
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

interface ManufacturerDialogProps {
    target: Exclude<EditTarget, null>;
    onClose: () => void;
    onSaved: () => void;
}

function ManufacturerDialog({ target, onClose, onSaved }: ManufacturerDialogProps) {
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
            if (existing) {
                await updateManufacturer(existing.id, body);
            } else {
                await createManufacturer(body);
            }
            toast.success(existing ? "Manufacturer updated." : "Manufacturer added.");
            onSaved();
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

interface ManufacturerTemplatesProps {
    manufacturer: Manufacturer;
    canEdit: boolean;
}

type TemplateEdit =
    | { mode: "create" }
    | { mode: "edit"; template: SpecTemplate }
    | null;

function ManufacturerTemplates({ manufacturer, canEdit }: ManufacturerTemplatesProps) {
    const [expanded, setExpanded] = useState(false);
    const [templates, setTemplates] = useState<SpecTemplate[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [editing, setEditing] = useState<TemplateEdit>(null);
    const [deleteTarget, setDeleteTarget] = useState<SpecTemplate | null>(null);

    const load = useCallback(async () => {
        try {
            setTemplates(await listTemplates(manufacturer.id));
            setLoaded(true);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load templates.");
        }
    }, [manufacturer.id]);

    useEffect(() => {
        if (expanded && !loaded) void load();
    }, [expanded, loaded, load]);

    return (
        <div className="mt-3 border-t pt-3">
            <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setExpanded((v) => !v)}
            >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <FileCode2 className="h-3.5 w-3.5" />
                Spec templates{loaded ? ` (${templates.length})` : ""}
            </button>

            {expanded && (
                <div className="mt-2 space-y-2 pl-5">
                    {templates.length === 0 && loaded && (
                        <p className="text-xs text-muted-foreground">No templates yet.</p>
                    )}
                    {templates.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2">
                            <span className="text-sm">{t.name}</span>
                            {canEdit && (
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        aria-label={`Edit ${t.name}`}
                                        onClick={() => setEditing({ mode: "edit", template: t })}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive"
                                        aria-label={`Delete ${t.name}`}
                                        onClick={() => setDeleteTarget(t)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                    {canEdit && (
                        <Button variant="outline" size="sm" onClick={() => setEditing({ mode: "create" })}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            New template
                        </Button>
                    )}
                </div>
            )}

            {editing && (
                <TemplateEditorDialog
                    manufacturer={manufacturer}
                    edit={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        void load();
                    }}
                />
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title="Delete template?"
                description={<>{deleteTarget?.name} will be removed. Projects that already applied it keep their copy.</>}
                confirmLabel="Delete"
                onConfirm={async () => {
                    if (!deleteTarget) return;
                    try {
                        await deleteTemplate(deleteTarget.id);
                        setDeleteTarget(null);
                        void load();
                    } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to delete.");
                    }
                }}
            />
        </div>
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

    const preview = async (text: string) => {
        const { previewSpecConfig } = await import("@/lib/manufacturing");
        return previewSpecConfig(text);
    };
    const baseName = (existing?.name ?? "template").toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const schemaTab: ConfigTab = {
        id: "schema",
        label: "Schema",
        fileBaseName: `${baseName}-schema`,
        load: async () => {
            if (existing) {
                const full = await getTemplate(existing.id);
                return { text: full.spec_config, parsed: await preview(full.spec_config) };
            }
            return { text: "", parsed: { sections: [], errors: [] } };
        },
        save: async (text) => {
            const finalName = name.trim() || (existing ? existing.name : "Untitled template");
            if (existing) {
                await updateTemplate(existing.id, { name: finalName, spec_config: text });
            } else {
                await createTemplate(manufacturer.id, { name: finalName, spec_config: text });
            }
            return preview(text);
        },
        headerSlot: () => (
            <input
                aria-label="Template name"
                className="h-7 w-40 rounded-md border bg-background px-2 text-xs"
                placeholder="Template name"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
        ),
    };

    const capabilitiesTab: ConfigTab = {
        id: "capabilities",
        label: "Capabilities",
        fileBaseName: `${baseName}-capabilities`,
        // Capabilities live on a saved template; a brand-new one has none yet.
        disabledNote: existing
            ? undefined
            : "Save the template first, then reopen it to define its capabilities.",
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
            title={existing ? `Edit template: ${existing.name}` : `New ${manufacturer.name} template`}
            description="A named spec schema and its fabrication capabilities. Projects copy the schema when applied and read the capabilities live."
            saveLabel="Save template"
            tabs={[schemaTab, capabilitiesTab]}
            onClose={onClose}
            onSaved={onSaved}
        />
    );
}
