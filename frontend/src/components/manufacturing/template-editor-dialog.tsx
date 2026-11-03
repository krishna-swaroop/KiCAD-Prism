import { useState } from "react";

import { Input } from "@/components/ui/input";
import { createTemplate, getTemplate, previewSpecConfig, updateTemplate } from "@/lib/manufacturing";
import type { Manufacturer, SpecTemplate } from "@/types/manufacturing";
import { SchemaCapabilitiesDialog, type ConfigTab } from "./spec-config-editor";

export type TemplateEdit = { mode: "create" } | { mode: "edit"; template: SpecTemplate } | null;

interface TemplateEditorDialogProps {
    manufacturer: Manufacturer;
    edit: Exclude<TemplateEdit, null>;
    onClose: () => void;
    onSaved: () => void;
}

/** A process's fields and capabilities, edited together as two config texts. */
export function TemplateEditorDialog({ manufacturer, edit, onClose, onSaved }: TemplateEditorDialogProps) {
    const existing = edit.mode === "edit" ? edit.template : null;
    // The name is edited alongside the .config; keep it in state the save closures read.
    const [name, setName] = useState(existing?.name ?? "");

    const preview = previewSpecConfig;
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
            <Input
                aria-label="Process name"
                className="h-7 w-40 text-xs"
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
        disabledNote: existing ? undefined : "Save the process first, then reopen it to define its capabilities.",
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
            description="A fabrication tier: the spec fields a project fills in, and its capabilities."
            saveLabel="Save process"
            tabs={[schemaTab, capabilitiesTab]}
            onClose={onClose}
            onSaved={onSaved}
        />
    );
}
