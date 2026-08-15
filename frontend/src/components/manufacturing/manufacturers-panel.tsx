import { useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
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
} from "@/lib/manufacturing";
import type { Manufacturer } from "@/types/manufacturing";

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
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{manufacturers.length} manufacturer(s).</p>
                {canEdit && (
                    <Button size="sm" onClick={() => setEditing({ mode: "create" })}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add manufacturer
                    </Button>
                )}
            </div>

            {manufacturers.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border p-12 text-center text-muted-foreground">
                    <Building2 className="h-8 w-8 opacity-50" />
                    <p className="text-sm">No manufacturers yet. Add the fab houses you order from.</p>
                </div>
            ) : (
                <ul className="divide-y rounded-lg border">
                    {manufacturers.map((m) => (
                        <li key={m.id} className="flex items-start justify-between gap-4 p-4">
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
                        </li>
                    ))}
                </ul>
            )}

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
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="mfr-name">Name</Label>
                        <Input id="mfr-name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="mfr-contact">Contact</Label>
                        <Input id="mfr-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="mfr-website">Website</Label>
                        <Input id="mfr-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
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
