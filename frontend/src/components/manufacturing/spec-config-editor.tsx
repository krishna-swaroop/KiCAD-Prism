import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    getSpecConfig,
    saveSpecConfig,
    previewSpecConfig,
    listSpecTemplates,
    getSpecTemplate,
} from "@/lib/manufacturing";
import type { ParsedSpecConfig } from "@/types/manufacturing";

interface SpecConfigEditorProps {
    projectId: string;
    onClose: () => void;
    onSaved: () => void;
}

const SYNTAX_HELP = `# Comment lines start with #
[Section name]
field_key: type
field_key: type = default
field_key: type | Nice Label

# types: text, int, number, bool, choice(A, B, C)`;

const EMPTY: ParsedSpecConfig = { sections: [], errors: [] };

export function SpecConfigEditor({ projectId, onClose, onSaved }: SpecConfigEditorProps) {
    const [text, setText] = useState("");
    const [parsed, setParsed] = useState<ParsedSpecConfig>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [templates, setTemplates] = useState<{ id: string; label: string }[]>([]);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const [{ spec_config, parsed: initial }, tmpls] = await Promise.all([
                    getSpecConfig(projectId),
                    listSpecTemplates().catch(() => []),
                ]);
                if (cancelled) return;
                setText(spec_config);
                setParsed(initial);
                setTemplates(tmpls);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load the schema.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    const handleLoadTemplate = async (templateId: string) => {
        if (!templateId) return;
        if (text.trim() && !window.confirm("Replace the current schema with this template?")) {
            return;
        }
        try {
            const config = await getSpecTemplate(templateId);
            handleChange(config);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load template.");
        }
    };

    // Re-parse as the user types, debounced, so errors and the field count update live.
    const runPreview = useCallback((value: string) => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => {
            void previewSpecConfig(value)
                .then(setParsed)
                .catch(() => {
                    /* preview is best-effort; a failed parse just leaves the last good one */
                });
        }, 250);
    }, []);

    const handleChange = (value: string) => {
        setText(value);
        runPreview(value);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { parsed: saved } = await saveSpecConfig(projectId, text);
            setParsed(saved);
            toast.success("Spec schema saved.");
            onSaved();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    const fieldCount = parsed.sections.reduce((sum, s) => sum + s.fields.length, 0);

    return (
        <Dialog open onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="w-[min(56rem,calc(100vw-2rem))] max-w-none">
                <DialogHeader>
                    <DialogTitle>Edit spec schema</DialogTitle>
                    <DialogDescription>
                        Define the fields the board-spec form shows, in a small config syntax.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="p-6 text-sm text-muted-foreground">Loading…</div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {/* Editor */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label htmlFor="spec-config-text" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    .config
                                </label>
                                {templates.length > 0 && (
                                    <select
                                        aria-label="Load a template"
                                        className="h-7 rounded-md border bg-background px-2 text-xs"
                                        value=""
                                        onChange={(e) => {
                                            void handleLoadTemplate(e.target.value);
                                            e.target.value = "";
                                        }}
                                    >
                                        <option value="">Load template…</option>
                                        {templates.map((t) => (
                                            <option key={t.id} value={t.id}>
                                                {t.label}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <textarea
                                id="spec-config-text"
                                className="h-[22rem] w-full resize-none rounded-md border bg-background p-3 font-mono text-xs leading-relaxed"
                                spellCheck={false}
                                value={text}
                                onChange={(e) => handleChange(e.target.value)}
                                placeholder={SYNTAX_HELP}
                            />
                            <details className="text-xs text-muted-foreground">
                                <summary className="cursor-pointer">Syntax</summary>
                                <pre className="mt-1 whitespace-pre-wrap rounded bg-muted/40 p-2">{SYNTAX_HELP}</pre>
                            </details>
                        </div>

                        {/* Live preview */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Preview
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {parsed.sections.length} section(s), {fieldCount} field(s)
                                </span>
                            </div>

                            <div className="h-[22rem] overflow-y-auto rounded-md border p-3">
                                {parsed.errors.length > 0 && (
                                    <ul className="mb-3 space-y-1">
                                        {parsed.errors.map((error, index) => (
                                            <li
                                                key={index}
                                                className="flex items-start gap-1.5 text-xs text-destructive"
                                            >
                                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                                {error}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {parsed.sections.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                        No fields yet. Add a <code>[Section]</code> and some <code>key: type</code> lines.
                                    </p>
                                ) : (
                                    <div className="space-y-4">
                                        {parsed.sections.map((section) => (
                                            <div key={section.title}>
                                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {section.title}
                                                </div>
                                                <ul className="mt-1.5 space-y-1">
                                                    {section.fields.map((field) => (
                                                        <li
                                                            key={field.key}
                                                            className="flex items-center justify-between gap-2 text-sm"
                                                        >
                                                            <span>{field.label}</span>
                                                            <Badge variant="outline" className="font-mono text-[10px]">
                                                                {field.type === "choice"
                                                                    ? `choice(${field.options.length})`
                                                                    : field.type}
                                                            </Badge>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {parsed.errors.length === 0 ? (
                            <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Schema is valid
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                                {parsed.errors.length} problem(s) — you can still save
                            </>
                        )}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={() => void handleSave()} disabled={saving || loading}>
                            {saving ? "Saving…" : "Save schema"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
