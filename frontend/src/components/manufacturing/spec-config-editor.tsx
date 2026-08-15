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
import { previewSpecConfig } from "@/lib/manufacturing";
import type { ParsedSpecConfig } from "@/types/manufacturing";

interface SpecConfigEditorProps {
    title: string;
    description: string;
    /** Load the initial .config text and its parsed form. */
    load: () => Promise<{ text: string; parsed: ParsedSpecConfig }>;
    /** Persist the edited text; returns the re-parsed form. */
    save: (text: string) => Promise<ParsedSpecConfig>;
    /** Optional slot rendered next to the .config label (e.g. an apply-template picker). */
    headerSlot?: (setText: (value: string) => void, currentText: string) => React.ReactNode;
    onClose: () => void;
    onSaved: () => void;
    saveLabel?: string;
}

const SYNTAX_HELP = `# Comment lines start with #
[Section name]
field_key: type
field_key: type = default
field_key: type | Nice Label

# types: text, int, number, bool, choice(A, B, C)`;

const EMPTY: ParsedSpecConfig = { sections: [], errors: [] };

export function SpecConfigEditor({
    title,
    description,
    load,
    save,
    headerSlot,
    onClose,
    onSaved,
    saveLabel = "Save",
}: SpecConfigEditorProps) {
    const [text, setText] = useState("");
    const [parsed, setParsed] = useState<ParsedSpecConfig>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const { text: initial, parsed: initialParsed } = await load();
                if (cancelled) return;
                setText(initial);
                setParsed(initialParsed);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load the schema.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // load is a stable closure from the caller; run once on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runPreview = useCallback((value: string) => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => {
            void previewSpecConfig(value)
                .then(setParsed)
                .catch(() => {
                    /* best-effort: keep the last good parse */
                });
        }, 250);
    }, []);

    const handleChange = useCallback(
        (value: string) => {
            setText(value);
            runPreview(value);
        },
        [runPreview],
    );

    const handleSave = async () => {
        setSaving(true);
        try {
            const saved = await save(text);
            setParsed(saved);
            toast.success("Saved.");
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
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="p-6 text-sm text-muted-foreground">Loading…</div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label htmlFor="spec-config-text" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    .config
                                </label>
                                {headerSlot?.(handleChange, text)}
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
                                            <li key={index} className="flex items-start gap-1.5 text-xs text-destructive">
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
                                                        <li key={field.key} className="flex items-center justify-between gap-2 text-sm">
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
                            {saving ? "Saving…" : saveLabel}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
