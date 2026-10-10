import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AlertTriangle, Download, Upload } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { previewSpecConfig } from "@/lib/manufacturing";
import type { ParsedSpecConfig } from "@/types/manufacturing";

/** One editable .config document: how to load it, save it, and name its file. */
export interface ConfigTab {
    id: string;
    /** Tab label, e.g. "Schema" or "Capabilities". */
    label: string;
    /** Load the initial .config text and its parsed form. */
    load: () => Promise<{ text: string; parsed: ParsedSpecConfig }>;
    /** Persist the edited text; returns the re-parsed form. */
    save: (text: string) => Promise<ParsedSpecConfig>;
    /** Basename for download/upload, e.g. "jlcpcb-standard". */
    fileBaseName: string;
    /** Optional slot rendered next to the .config label (e.g. an apply-template picker). */
    headerSlot?: (setText: (value: string) => void, currentText: string) => React.ReactNode;
    /** Optional note shown in place of the editor (e.g. "link a template first"). */
    disabledNote?: string;
}

const SYNTAX_HELP = `# Comment lines start with #
[Section name]
field_key: type
field_key: type = default
field_key: type | Nice Label

# types: text, int, number, bool, choice(A, B, C)`;

const EMPTY: ParsedSpecConfig = { sections: [], errors: [] };

function downloadText(fileName: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}

/**
 * The text + live preview editor for one .config document, with download and
 * upload. Both the single-document dialog and each tab of the unified dialog
 * render this.
 */
/** What the dialog can ask of a pane: save its document, and learn whether that worked. */
export interface ConfigEditorHandle {
    save: () => Promise<boolean>;
}

const ConfigEditorPane = forwardRef<
    ConfigEditorHandle,
    {
        tab: ConfigTab;
        onValidityChange?: (errorCount: number) => void;
    }
>(function ConfigEditorPane({ tab, onValidityChange }, ref) {
    const [text, setText] = useState("");
    const [parsed, setParsed] = useState<ParsedSpecConfig>(EMPTY);
    const [loading, setLoading] = useState(true);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fileInput = useRef<HTMLInputElement | null>(null);
    const textId = `config-text-${tab.id}`;

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const { text: initial, parsed: initialParsed } = await tab.load();
                if (cancelled) return;
                setText(initial);
                setParsed(initialParsed);
                onValidityChange?.(initialParsed.errors.length);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // tab.load is a stable closure from the caller; run once on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runPreview = useCallback(
        (value: string) => {
            if (debounce.current) clearTimeout(debounce.current);
            debounce.current = setTimeout(() => {
                void previewSpecConfig(value)
                    .then((next) => {
                        setParsed(next);
                        onValidityChange?.(next.errors.length);
                    })
                    .catch(() => {
                        /* best-effort: keep the last good parse */
                    });
            }, 250);
        },
        [onValidityChange],
    );

    const handleChange = useCallback(
        (value: string) => {
            setText(value);
            runPreview(value);
        },
        [runPreview],
    );

    const handleSave = useCallback(async (): Promise<boolean> => {
        try {
            const saved = await tab.save(text);
            setParsed(saved);
            onValidityChange?.(saved.errors.length);
            toast.success("Saved.");
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save.");
            return false;
        }
        // tab.save is a stable closure from the caller; saving depends on the text.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text]);

    // The dialog's footer Save button asks each editable pane to save.
    useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

    const handleUpload = (file: File | undefined) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => handleChange(String(reader.result ?? ""));
        reader.onerror = () => toast.error("Could not read that file.");
        reader.readAsText(file);
    };

    const fieldCount = parsed.sections.reduce((sum, s) => sum + s.fields.length, 0);

    if (tab.disabledNote) {
        return <p className="p-6 text-sm text-muted-foreground">{tab.disabledNote}</p>;
    }
    if (loading) {
        return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    }

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <label htmlFor={textId} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        .config
                    </label>
                    <div className="flex items-center gap-1">
                        {tab.headerSlot?.(handleChange, text)}
                        <input
                            ref={fileInput}
                            type="file"
                            accept=".config,.txt,text/plain"
                            className="hidden"
                            onChange={(e) => {
                                handleUpload(e.target.files?.[0]);
                                e.target.value = "";
                            }}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => fileInput.current?.click()}
                            title="Upload a .config file"
                        >
                            <Upload className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => downloadText(`${tab.fileBaseName}.config`, text)}
                            title="Download this .config"
                        >
                            <Download className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
                <textarea
                    id={textId}
                    className="themed-scrollbar h-[clamp(22rem,calc(100vh-22rem),52rem)] w-full resize-none rounded-md border bg-background p-4 font-mono text-sm leading-relaxed"
                    spellCheck={false}
                    value={text}
                    onChange={(e) => handleChange(e.target.value)}
                    placeholder={SYNTAX_HELP}
                />
                <details className="text-sm text-muted-foreground">
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

                <div className="themed-scrollbar h-[clamp(22rem,calc(100vh-22rem),52rem)] overflow-y-auto rounded-md border p-4">
                    {parsed.errors.length > 0 && (
                        <ul className="mb-3 space-y-1">
                            {parsed.errors.map((error) => (
                                <li key={error} className="flex items-start gap-1.5 text-sm text-destructive">
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
                                    <div className="text-sm font-semibold text-muted-foreground">
                                        {section.title}
                                    </div>
                                    <ul className="mt-1.5 space-y-1">
                                        {section.fields.map((field) => (
                                            <li key={field.key} className="flex items-center justify-between gap-2 text-base">
                                                <span>{field.label}</span>
                                                <Badge variant="outline" className="font-mono text-xs">
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
    );
});

interface SpecConfigEditorProps {
    title: string;
    description: string;
    load: () => Promise<{ text: string; parsed: ParsedSpecConfig }>;
    save: (text: string) => Promise<ParsedSpecConfig>;
    headerSlot?: (setText: (value: string) => void, currentText: string) => React.ReactNode;
    onClose: () => void;
    onSaved: () => void;
    saveLabel?: string;
    /** Basename for the download file; defaults to "spec". */
    fileBaseName?: string;
}

/** Single-document .config editor (one text pane + preview). */
export function SpecConfigEditor({
    title,
    description,
    load,
    save,
    headerSlot,
    onClose,
    onSaved,
    saveLabel = "Save",
    fileBaseName = "spec",
}: SpecConfigEditorProps) {
    return (
        <SchemaCapabilitiesDialog
            title={title}
            description={description}
            onClose={onClose}
            onSaved={onSaved}
            saveLabel={saveLabel}
            tabs={[{ id: "schema", label: "Fields", load, save, headerSlot, fileBaseName }]}
        />
    );
}

interface SchemaCapabilitiesDialogProps {
    title: string;
    description: string;
    tabs: ConfigTab[];
    onClose: () => void;
    onSaved: () => void;
    saveLabel?: string;
}

/**
 * A .config editor dialog with one tab per document (Schema, Capabilities, …).
 * Each tab is a text editor with live preview and its own download/upload. The
 * footer Save button saves every editable tab at once.
 */
export function SchemaCapabilitiesDialog({
    title,
    description,
    tabs,
    onClose,
    onSaved,
    saveLabel = "Save",
}: SchemaCapabilitiesDialogProps) {
    const [active, setActive] = useState(tabs[0]?.id ?? "");
    const [saving, setSaving] = useState(false);
    const panes = useRef<Record<string, ConfigEditorHandle | null>>({});

    // Save every editable tab at once; close only if all of them worked.
    const requestSave = async () => {
        const editable = tabs.filter((t) => !t.disabledNote);
        if (editable.length === 0) {
            onClose();
            return;
        }
        setSaving(true);
        let saved = false;
        try {
            const results = await Promise.all(editable.map((t) => panes.current[t.id]?.save() ?? Promise.resolve(true)));
            saved = results.every(Boolean);
        } finally {
            setSaving(false);
        }
        if (saved) onSaved();
    };

    return (
        <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
            <DialogContent className="themed-scrollbar max-h-[calc(100vh-2rem)] w-[min(92rem,calc(100vw-2rem))] max-w-none overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                {tabs.length === 1 ? (
                    <ConfigEditorPane
                        tab={tabs[0]}
                        ref={(handle) => {
                            panes.current[tabs[0].id] = handle;
                        }}
                    />
                ) : (
                    <Tabs value={active} onValueChange={setActive}>
                        <TabsList className="h-9 gap-1">
                            {tabs.map((tab) => (
                                <TabsTrigger
                                    key={tab.id}
                                    value={tab.id}
                                    // The active tab is filled with the primary colour so it
                                    // reads clearly against the muted inactive tabs.
                                    className="px-3 text-sm data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                                >
                                    {tab.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        {tabs.map((tab) => (
                            <TabsContent key={tab.id} value={tab.id} forceMount>
                                <ConfigEditorPane
                                    tab={tab}
                                    ref={(handle) => {
                                        panes.current[tab.id] = handle;
                                    }}
                                />
                            </TabsContent>
                        ))}
                    </Tabs>
                )}

                <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void requestSave()} disabled={saving}>
                        {saving ? "Saving…" : saveLabel}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
