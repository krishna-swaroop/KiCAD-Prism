import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative } from "@/lib/relative-time";
import { deleteRun, getRun, previewSpecConfig, updateRun, updateRunStatus } from "@/lib/manufacturing";
import {
    evaluateCondition,
    type ManufacturingRun,
    type ParsedSpecConfig,
    type SpecFieldDef,
} from "@/types/manufacturing";
import { DefectsSection } from "./run-defects";
import { RunHeader } from "./run-view-header";
import { RunReleaseLink } from "./run-release-link";

interface RunViewProps {
    runId: string;
    canEdit: boolean;
    canLogDefects: boolean;
    /** QA/admin only: move the run through its status lifecycle. */
    canChangeStatus: boolean;
    /** Called after the run is deleted, so the host can leave this view. */
    onDeleted: () => void;
    /** Called after any change, so a list behind this view can refresh. */
    onChanged?: () => void;
    /** Show a link to the project's Manufacturing page (leave off where that is the page). */
    projectLink?: boolean;
}

export function RunView({
    runId,
    canEdit,
    canLogDefects,
    canChangeStatus,
    onDeleted,
    onChanged,
    projectLink = true,
}: RunViewProps) {
    const [run, setRun] = useState<ManufacturingRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        try {
            setRun(await getRun(runId));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load production.");
        } finally {
            setLoading(false);
        }
    }, [runId]);

    useEffect(() => {
        setLoading(true);
        void load();
    }, [load]);

    // Reload this run, then tell the host something changed.
    const refresh = useCallback(async () => {
        await load();
        onChanged?.();
    }, [load, onChanged]);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await deleteRun(runId);
            toast.success("Production deleted.");
            setConfirmDelete(false);
            onDeleted();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete production.");
        } finally {
            setDeleting(false);
        }
    };

    const changeStatus = async (status: string) => {
        try {
            await updateRunStatus(runId, status);
            await refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to change status.");
        }
    };

    const patch = async (body: Parameters<typeof updateRun>[1]) => {
        try {
            await updateRun(runId, body);
            await refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update production.");
        }
    };

    if (loading) {
        return <div className="p-6 text-sm text-muted-foreground">Loading production...</div>;
    }
    if (!run) {
        return (
            <div className="p-6">
                <p className="text-sm text-muted-foreground">Production not found.</p>
            </div>
        );
    }

    const affected = (run.defects ?? []).reduce((sum, d) => sum + d.quantity_affected, 0);
    const yieldPct = run.quantity_ordered > 0 ? Math.round((run.quantity_good / run.quantity_ordered) * 100) : null;

    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            <RunHeader
                run={run}
                canEdit={canEdit}
                canChangeStatus={canChangeStatus}
                projectLink={projectLink}
                onChangeStatus={(status) => void changeStatus(status)}
                onRequestDelete={() => setConfirmDelete(true)}
            />

            <ScrollArea className="themed-scrollbar min-h-0 flex-1">
                <main className="grid w-full gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
                    <div className="min-w-0 space-y-6">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Stat label="Ordered" value={run.quantity_ordered} />
                            <EditableStat
                                label="Good"
                                value={run.quantity_good}
                                max={run.quantity_ordered}
                                canEdit={canEdit}
                                onCommit={(v) => void patch({ quantity_good: v })}
                            />
                            <Stat label="Affected units" value={affected} />
                            <Stat label="Yield" value={yieldPct === null ? "—" : `${yieldPct}%`} />
                        </div>

                        <SpecSnapshot snapshot={run.spec_snapshot} />

                        <DefectsSection run={run} canLogDefects={canLogDefects} onChanged={() => void refresh()} />

                    </div>

                    <aside className="min-w-0 space-y-6">
                        <section aria-label="Details" className="border">
                            <div className="border-b bg-muted/30 px-4 py-2.5">
                                <h3 className="text-sm font-medium">Details</h3>
                            </div>
                            <dl className="divide-y text-sm">
                                <Fact label="Manufacturer" value={run.manufacturer_name || "—"} />
                                <Fact label="Process" value={run.spec_name || "—"} />
                                <Fact
                                    label="Release"
                                    value={
                                        run.release_tag && run.commit_sha ? (
                                            <RunReleaseLink
                                                projectId={run.project_id}
                                                tag={run.release_tag}
                                                commitSha={run.commit_sha}
                                            />
                                        ) : (
                                            run.release_tag || "—"
                                        )
                                    }
                                />
                                <Fact
                                    label="Commit"
                                    value={run.commit_sha ? <span className="font-mono">{run.commit_sha.slice(0, 7)}</span> : "—"}
                                />
                                <Fact
                                    label="Created"
                                    value={`${new Date(run.created_at).toLocaleDateString()}${run.created_by ? ` by ${run.created_by}` : ""}`}
                                />
                                <Fact
                                    label="Updated"
                                    value={<span title={new Date(run.updated_at).toLocaleString()}>{formatRelative(run.updated_at)}</span>}
                                />
                            </dl>
                        </section>

                        <RunNotes key={run.notes} notes={run.notes} canEdit={canEdit} onCommit={(notes) => void patch({ notes })} />
                    </aside>
                </main>
            </ScrollArea>

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete production?"
                description={
                    <>
                        This production and its defects and evidence will be permanently removed. This cannot be undone.
                    </>
                }
                confirmLabel="Delete production"
                requireHold
                busy={deleting}
                onConfirm={() => void handleDelete()}
            />
        </div>
    );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-4 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        </div>
    );
}

function RunNotes({
    notes,
    canEdit,
    onCommit,
}: {
    notes: string;
    canEdit: boolean;
    onCommit: (notes: string) => void;
}) {
    // The parent keys this on the saved notes, so a change from outside starts a fresh draft.
    const [draft, setDraft] = useState(notes);

    if (!canEdit && !notes.trim()) return null;
    return (
        <section className="border">
            <div className="border-b bg-muted/30 px-4 py-2.5">
                <h3 className="text-sm font-medium">Notes</h3>
            </div>
            {canEdit ? (
                <Textarea
                    aria-label="Notes"
                    rows={4}
                    className="rounded-none border-0 shadow-none focus-visible:ring-0"
                    placeholder="Add notes about this production"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => draft !== notes && onCommit(draft.trim())}
                />
            ) : (
                <p className="whitespace-pre-wrap px-4 py-3 text-sm">{notes}</p>
            )}
        </section>
    );
}

/** Render one field's stored value the way it read on the form: booleans as
 *  Yes/No, numbers with their unit, and blanks as a dash. */
function displaySpecValue(field: SpecFieldDef, raw: unknown): string {
    if (field.type === "bool") {
        return raw === true || raw === "true" ? "Yes" : "No";
    }
    if (raw === undefined || raw === null || raw === "") return "—";
    return field.unit ? `${raw} ${field.unit}` : String(raw);
}

/**
 * The board spec as it stood when the run was created, read-only and folded away
 * until asked for. It reuses the run's frozen field text and values so it stays a
 * faithful picture even after the project's live spec moves on.
 */
function SpecSnapshot({ snapshot }: { snapshot: Record<string, unknown> | null | undefined }) {
    const specConfig = typeof snapshot?.spec_config === "string" ? snapshot.spec_config : "";
    const stored = (snapshot?.specs as Record<string, unknown> | undefined) ?? {};
    const activeSections = new Set(
        Array.isArray(snapshot?.active_sections) ? (snapshot.active_sections as string[]) : [],
    );
    const [open, setOpen] = useState(false);
    const [schema, setSchema] = useState<ParsedSpecConfig | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!specConfig.trim()) {
            setSchema({ sections: [], errors: [] });
            return;
        }
        void previewSpecConfig(specConfig)
            .then((parsed) => !cancelled && setSchema(parsed))
            .catch(() => !cancelled && setSchema({ sections: [], errors: [] }));
        return () => {
            cancelled = true;
        };
    }, [specConfig]);

    // Fill each field's schema default under the stored value, so gating and
    // display see the effective spec (the form's behaviour). This also completes
    // older runs whose snapshot only froze the few edited values.
    const values: Record<string, unknown> = {};
    for (const section of schema?.sections ?? []) {
        for (const field of section.fields) {
            const raw = stored[field.key];
            values[field.key] = raw === undefined || raw === null || raw === "" ? field.default : raw;
        }
    }
    // Keep any stored keys not present in the schema too.
    for (const [key, val] of Object.entries(stored)) {
        if (!(key in values)) values[key] = val;
    }

    // Sections in play: always-on sections whose gate is met, plus optional ones
    // that were switched on for this run.
    const sections = (schema?.sections ?? []).filter(
        (s) => (s.optional ? activeSections.has(s.title) : true) && evaluateCondition(s.when, values),
    );

    return (
        <section className="border">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 bg-muted/30 px-4 py-2.5 text-left"
            >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Spec at the time of order</h3>
            </button>
            {open &&
                (schema === null ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">Loading spec…</p>
                ) : sections.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">No spec was recorded for this run.</p>
                ) : (
                    <div className="divide-y border-t">
                        {sections.map((section) => {
                            const fields = section.fields.filter((f) => evaluateCondition(f.when, values));
                            if (fields.length === 0) return null;
                            return (
                                <div key={section.title} className="px-4 py-3">
                                    <div className="mb-2 text-sm font-medium">{section.title}</div>
                                    <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                                        {fields.map((field) => (
                                            <div key={field.key} className="flex items-baseline justify-between gap-3 py-0.5">
                                                <dt className="text-sm text-muted-foreground">{field.label}</dt>
                                                <dd className="text-right text-sm tabular-nums">
                                                    {displaySpecValue(field, values[field.key])}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </div>
                            );
                        })}
                    </div>
                ))}
        </section>
    );
}

function EditableStat({
    label,
    value,
    max,
    canEdit,
    onCommit,
}: {
    label: string;
    value: number;
    max: number;
    canEdit: boolean;
    onCommit: (value: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value));
    useEffect(() => setDraft(String(value)), [value]);

    const commit = () => {
        const next = Number(draft) || 0;
        if (next !== value) onCommit(next);
        setEditing(false);
    };

    // Read-only or not being edited: show the value as a plain stat. When
    // editable, a pencil reveals the input rather than always showing one.
    if (!canEdit || !editing) {
        return (
            <div className="border p-3">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    {canEdit && (
                        <button
                            type="button"
                            aria-label={`Edit ${label}`}
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setEditing(true)}
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
            </div>
        );
    }

    return (
        <div className="border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 flex items-center gap-1">
                <Input
                    type="number"
                    min={0}
                    max={max || undefined}
                    autoFocus
                    className="h-9 text-lg font-semibold tabular-nums"
                    value={draft}
                    aria-label={label}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commit();
                        if (e.key === "Escape") {
                            setDraft(String(value));
                            setEditing(false);
                        }
                    }}
                />
                <button
                    type="button"
                    aria-label={`Save ${label}`}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    // onMouseDown so it fires before the input's onBlur cancels it.
                    onMouseDown={(e) => {
                        e.preventDefault();
                        commit();
                    }}
                >
                    <Check className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
