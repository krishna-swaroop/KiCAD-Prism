import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createManufacturer, updateManufacturer } from "@/lib/manufacturing";
import type { Manufacturer } from "@/types/manufacturing";

export type EditTarget = { mode: "create" } | { mode: "edit"; manufacturer: Manufacturer } | null;

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

    const handleSave = async (event: FormEvent) => {
        event.preventDefault();
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
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{existing ? "Edit manufacturer" : "Add manufacturer"}</DialogTitle>
                    <DialogDescription>A fab house you can pick when creating a production.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
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
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving || !name.trim()}>
                            {saving ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
