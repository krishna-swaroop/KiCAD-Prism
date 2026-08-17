import { useCallback, useEffect, useState } from "react";
import { Building2, Pencil, Plus, Trash2, FileCode2, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
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
    getPcbRuleFields,
} from "@/lib/manufacturing";
import type { Manufacturer, ParsedSpecConfig, PcbRuleField, SpecTemplate } from "@/types/manufacturing";
import { SpecConfigEditor } from "./spec-config-editor";

interface ManufacturersPanelProps {
    manufacturers: Manufacturer[];
    canEdit: boolean;
    onChanged: () => void;
}

type EditTarget = { mode: "create" } | { mode: "edit"; manufacturer: Manufacturer } | null;

export function ManufacturersPanel({ manufacturers, canEdit, onChanged }: ManufacturersPanelProps) {
    const [editing, setEditing] = useState<EditTarget>(null);
    const [deleteTarget, setDeleteTarget] = useState<Manufacturer | null>(null);
    const [deleting, setDeleting] = useState(false);

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
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* Action bar, positioned like the Runs "New run" bar. */}
            {canEdit && (
                <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" onClick={() => setEditing({ mode: "create" })}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add manufacturer
                    </Button>
                </div>
            )}

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
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
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
                        {deleteTarget?.name} will be removed. Runs that reference it keep their history but
                        show no manufacturer.
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
                    <DialogDescription>A reusable fab-house record you can pick when creating a run.</DialogDescription>
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

// Edit one capability: a single number = the manufacturer minimum (mm). The board
// must meet it. Empty clears the field.
function CapabilityInput({
    field,
    value,
    onChange,
}: {
    field: PcbRuleField;
    value: number | undefined;
    onChange: (value: number | undefined) => void;
}) {
    const id = `cap-${field.key}`;
    const label = field.unit ? `${field.label} (${field.unit})` : field.label;
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <Label htmlFor={id} className="text-xs text-muted-foreground">
                {label}
            </Label>
            <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">≥</span>
                <Input
                    id={id}
                    aria-label={field.label}
                    type="number"
                    step={field.type === "int" ? 1 : "any"}
                    className="h-7 w-24 text-xs"
                    value={value ?? ""}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange(v === "" ? undefined : Number(v));
                    }}
                />
            </div>
        </div>
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
    const [capsTarget, setCapsTarget] = useState<SpecTemplate | null>(null);
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
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => setCapsTarget(t)}
                                    >
                                        <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                                        Capabilities
                                    </Button>
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

            {capsTarget && (
                <TemplateCapabilitiesDialog
                    template={capsTarget}
                    onClose={() => setCapsTarget(null)}
                    onSaved={() => {
                        setCapsTarget(null);
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
    // The name is edited alongside the .config; keep it in a ref-like state the save closure reads.
    const [name, setName] = useState(existing?.name ?? "");

    return (
        <SpecConfigEditor
            title={existing ? `Edit template: ${existing.name}` : `New ${manufacturer.name} template`}
            description="A named spec schema for this manufacturer. Projects copy it when applied."
            saveLabel="Save template"
            load={async (): Promise<{ text: string; parsed: ParsedSpecConfig }> => {
                if (existing) {
                    const full = await getTemplate(existing.id);
                    const { previewSpecConfig } = await import("@/lib/manufacturing");
                    return { text: full.spec_config, parsed: await previewSpecConfig(full.spec_config) };
                }
                return { text: "", parsed: { sections: [], errors: [] } };
            }}
            save={async (text) => {
                const { previewSpecConfig } = await import("@/lib/manufacturing");
                const finalName = name.trim() || (existing ? existing.name : "Untitled template");
                if (existing) {
                    await updateTemplate(existing.id, { name: finalName, spec_config: text });
                } else {
                    await createTemplate(manufacturer.id, { name: finalName, spec_config: text });
                }
                return previewSpecConfig(text);
            }}
            headerSlot={() => (
                <input
                    aria-label="Template name"
                    className="h-7 w-48 rounded-md border bg-background px-2 text-xs"
                    placeholder="Template name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            )}
            onClose={onClose}
            onSaved={onSaved}
        />
    );
}

interface TemplateCapabilitiesDialogProps {
    template: SpecTemplate;
    onClose: () => void;
    onSaved: () => void;
}

// Edit a fabrication method's capabilities: a grid of the PCB rule fields bound
// to the template's capabilities. Reused live by every project spec built from it.
function TemplateCapabilitiesDialog({ template, onClose, onSaved }: TemplateCapabilitiesDialogProps) {
    const [capabilities, setCapabilities] = useState<Record<string, number>>(template.capabilities ?? {});
    const [ruleFields, setRuleFields] = useState<PcbRuleField[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        void getPcbRuleFields()
            .then(({ fields }) => setRuleFields(fields))
            .catch(() => setRuleFields([]));
    }, []);

    const setCap = (key: string, value: number | undefined) => {
        setCapabilities((current) => {
            const next = { ...current };
            if (value === undefined) delete next[key];
            else next[key] = value;
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateTemplate(template.id, { capabilities });
            toast.success("Capabilities saved.");
            onSaved();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Capabilities: {template.name}</DialogTitle>
                    <DialogDescription>
                        What this fabrication method can build. Projects using it see these live.
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[70vh] space-y-1.5 overflow-y-auto py-1 pr-1">
                    {ruleFields.map((field) => (
                        <CapabilityInput
                            key={field.key}
                            field={field}
                            value={capabilities[field.key]}
                            onChange={(v) => setCap(field.key, v)}
                        />
                    ))}
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
