import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, Paperclip, Trash2, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
    getRun,
    updateRun,
    logDefect,
    updateDefect,
    deleteDefect,
    uploadEvidence,
    deleteEvidence,
    evidenceUrl,
} from "@/lib/manufacturing";
import {
    DEFECT_CATEGORIES,
    RUN_STATUSES,
    RUN_STATUS_LABELS,
    defectCategoryLabel,
    type DefectSeverity,
    type Manufacturer,
    type ManufacturingRun,
    type RunDefect,
} from "@/types/manufacturing";
import { SELECT_CLASS } from "./ui";

interface RunDetailProps {
    runId: string;
    canEdit: boolean;
    canLogDefects: boolean;
    manufacturers: Manufacturer[];
    onBack: () => void;
}

const SEVERITY_VARIANT: Record<DefectSeverity, "secondary" | "default" | "destructive"> = {
    minor: "secondary",
    major: "default",
    critical: "destructive",
};

export function RunDetail({ runId, canEdit, canLogDefects, manufacturers, onBack }: RunDetailProps) {
    const [run, setRun] = useState<ManufacturingRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [addDefectOpen, setAddDefectOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            setRun(await getRun(runId));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load run.");
        } finally {
            setLoading(false);
        }
    }, [runId]);

    useEffect(() => {
        void load();
    }, [load]);

    const patch = async (body: Parameters<typeof updateRun>[1]) => {
        try {
            await updateRun(runId, body);
            await load();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update run.");
        }
    };

    if (loading) {
        return <div className="p-6 text-sm text-muted-foreground">Loading run...</div>;
    }
    if (!run) {
        return (
            <div className="p-6">
                <Button variant="ghost" onClick={onBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <p className="mt-4 text-sm text-muted-foreground">Run not found.</p>
            </div>
        );
    }

    const defects = run.defects ?? [];

    return (
        <div className="flex h-full min-h-0 flex-col p-6">
            <div>
                <Button variant="ghost" size="sm" onClick={onBack} className="mb-3 -ml-2">
                    <ArrowLeft className="mr-2 h-4 w-4" /> All runs
                </Button>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold">{run.project_name || run.project_id}</h1>
                        <p className="text-sm text-muted-foreground">
                            {run.manufacturer_name || "No manufacturer"}
                            {run.commit_sha ? ` · ${run.commit_sha.slice(0, 7)}` : ""}
                            {" · "}
                            {new Date(run.created_at).toLocaleDateString()}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="run-status" className="text-sm text-muted-foreground">
                            Status
                        </Label>
                        <select
                            id="run-status"
                            className={`h-8 w-auto ${SELECT_CLASS}`}
                            value={run.status}
                            disabled={!canEdit}
                            onChange={(e) => void patch({ status: e.target.value })}
                        >
                            {RUN_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                    {RUN_STATUS_LABELS[status]}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Quantities */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Ordered" value={run.quantity_ordered} />
                <EditableStat
                    label="Good"
                    value={run.quantity_good}
                    max={run.quantity_ordered}
                    canEdit={canEdit}
                    onCommit={(v) => void patch({ quantity_good: v })}
                />
                <Stat label="Defects" value={defects.length} />
                <Stat
                    label="Affected units"
                    value={defects.reduce((sum, d) => sum + d.quantity_affected, 0)}
                />
            </div>

            {/* Manufacturer + notes (editable) */}
            {canEdit && (
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label htmlFor="run-mfr-edit">Manufacturer</Label>
                        <select
                            id="run-mfr-edit"
                            className={`h-8 w-full ${SELECT_CLASS}`}
                            value={run.manufacturer_id ?? ""}
                            onChange={(e) => void patch({ manufacturer_id: e.target.value || null })}
                        >
                            <option value="">No manufacturer</option>
                            {manufacturers.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Defects */}
            <section className="mt-8 min-h-0 flex-1">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium">Defects</h2>
                    {canLogDefects && (
                        <Button size="sm" onClick={() => setAddDefectOpen(true)}>
                            <Plus className="mr-1.5 h-4 w-4" /> Log defect
                        </Button>
                    )}
                </div>

                {defects.length === 0 ? (
                    <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border p-10 text-center text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 text-success opacity-70" />
                        <p className="text-sm">No defects logged. Mark units good above as they pass.</p>
                    </div>
                ) : (
                    <ul className="mt-4 space-y-3">
                        {defects.map((defect) => (
                            <DefectCard
                                key={defect.id}
                                runId={run.id}
                                defect={defect}
                                canEdit={canLogDefects}
                                onChanged={() => void load()}
                            />
                        ))}
                    </ul>
                )}
            </section>

            {addDefectOpen && (
                <AddDefectDialog
                    runId={run.id}
                    onClose={() => setAddDefectOpen(false)}
                    onLogged={() => {
                        setAddDefectOpen(false);
                        void load();
                    }}
                />
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        </div>
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
    const [draft, setDraft] = useState(String(value));
    useEffect(() => setDraft(String(value)), [value]);

    if (!canEdit) {
        return <Stat label={label} value={value} />;
    }
    return (
        <div className="rounded-lg border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <Input
                type="number"
                min={0}
                max={max || undefined}
                className="mt-1 h-9 text-lg font-semibold tabular-nums"
                value={draft}
                aria-label={label}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                    const next = Number(draft) || 0;
                    if (next !== value) onCommit(next);
                }}
            />
        </div>
    );
}

interface DefectCardProps {
    runId: string;
    defect: RunDefect;
    canEdit: boolean;
    onChanged: () => void;
}

function DefectCard({ runId, defect, canEdit, onChanged }: DefectCardProps) {
    const fileInput = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const resolved = defect.status !== "open";

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                await uploadEvidence(defect.id, file);
            }
            toast.success("Evidence attached.");
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Upload failed.");
        } finally {
            setUploading(false);
            if (fileInput.current) fileInput.current.value = "";
        }
    };

    return (
        <li className="rounded-lg border">
            <div className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{defectCategoryLabel(defect.category)}</span>
                        <Badge variant={SEVERITY_VARIANT[defect.severity]}>{defect.severity}</Badge>
                        <Badge variant="outline">{defect.quantity_affected} affected</Badge>
                        {resolved && <Badge variant="secondary">{defect.status}</Badge>}
                    </div>
                    {defect.description && (
                        <p className="mt-1.5 text-sm text-muted-foreground">{defect.description}</p>
                    )}
                </div>
                {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                        {!resolved && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void updateDefect(defect.id, { status: "resolved" }).then(onChanged)}
                            >
                                Resolve
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            aria-label="Delete defect"
                            onClick={() => setConfirmDelete(true)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Evidence */}
            {(defect.evidence.length > 0 || canEdit) && (
                <div className="flex flex-wrap items-center gap-3 border-t p-4">
                    {defect.evidence.map((item) => (
                        <EvidenceThumb
                            key={item.digest}
                            runId={runId}
                            defectId={defect.id}
                            item={item}
                            canDelete={canEdit}
                            onDeleted={onChanged}
                        />
                    ))}
                    {canEdit && (
                        <>
                            <input
                                ref={fileInput}
                                type="file"
                                accept="image/*,application/pdf"
                                multiple
                                className="hidden"
                                onChange={(e) => void handleUpload(e.target.files)}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={uploading}
                                onClick={() => fileInput.current?.click()}
                            >
                                <Paperclip className="mr-1.5 h-4 w-4" />
                                {uploading ? "Uploading…" : "Attach evidence"}
                            </Button>
                        </>
                    )}
                </div>
            )}

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete defect?"
                description="This removes the defect and its attached evidence."
                confirmLabel="Delete"
                busy={deleting}
                onConfirm={async () => {
                    setDeleting(true);
                    try {
                        await deleteDefect(defect.id);
                        setConfirmDelete(false);
                        onChanged();
                    } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to delete.");
                    } finally {
                        setDeleting(false);
                    }
                }}
            />
        </li>
    );
}

function EvidenceThumb({
    runId,
    defectId,
    item,
    canDelete,
    onDeleted,
}: {
    runId: string;
    defectId: string;
    item: RunDefect["evidence"][number];
    canDelete: boolean;
    onDeleted: () => void;
}) {
    const url = evidenceUrl(runId, item.digest);
    const isPdf = item.media_type === "application/pdf";
    return (
        <div className="group relative">
            <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted"
                title={item.filename}
            >
                {isPdf ? (
                    <FileText className="h-8 w-8 text-muted-foreground" />
                ) : (
                    <img src={url} alt={item.filename} className="h-full w-full object-cover" />
                )}
            </a>
            {canDelete && (
                <button
                    type="button"
                    aria-label={`Remove ${item.filename}`}
                    className="absolute -right-2 -top-2 hidden rounded-full border bg-background p-1 text-destructive group-hover:block"
                    onClick={() =>
                        void deleteEvidence(defectId, item.digest)
                            .then(onDeleted)
                            .catch((error) =>
                                toast.error(error instanceof Error ? error.message : "Failed to remove."),
                            )
                    }
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            )}
        </div>
    );
}

interface AddDefectDialogProps {
    runId: string;
    onClose: () => void;
    onLogged: () => void;
}

function AddDefectDialog({ runId, onClose, onLogged }: AddDefectDialogProps) {
    const [category, setCategory] = useState("soldering");
    const [severity, setSeverity] = useState<DefectSeverity>("minor");
    const [quantity, setQuantity] = useState(1);
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await logDefect(runId, {
                category,
                severity,
                quantity_affected: quantity,
                description: description.trim(),
            });
            toast.success("Defect logged.");
            onLogged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to log defect.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Log a defect</DialogTitle>
                    <DialogDescription>Record what went wrong and how many units it affected.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2.5 py-1">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="def-category">Category</Label>
                            <select
                                id="def-category"
                                className={`h-8 w-full ${SELECT_CLASS}`}
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                            >
                                {DEFECT_CATEGORIES.map((c) => (
                                    <option key={c.value} value={c.value}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="def-severity">Severity</Label>
                            <select
                                id="def-severity"
                                className={`h-8 w-full ${SELECT_CLASS}`}
                                value={severity}
                                onChange={(e) => setSeverity(e.target.value as DefectSeverity)}
                            >
                                <option value="minor">Minor</option>
                                <option value="major">Major</option>
                                <option value="critical">Critical</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="def-qty">Units affected</Label>
                        <Input
                            id="def-qty"
                            type="number"
                            min={1}
                            value={quantity || ""}
                            onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="def-desc">Description</Label>
                        <Textarea
                            id="def-desc"
                            rows={3}
                            placeholder="What went wrong, and where"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={saving}>
                        {saving ? "Logging…" : "Log defect"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
