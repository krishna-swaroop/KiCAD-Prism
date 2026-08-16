import { useCallback, useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    ChevronRight,
    Factory,
    Plus,
    Paperclip,
    Trash2,
    FileText,
    CheckCircle2,
    ClipboardList,
    ListChecks,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
    getRun,
    updateRun,
    updateRunStatus,
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
    type ManufacturingRun,
    type RunDefect,
} from "@/types/manufacturing";
import { CompactSelect } from "./ui";

interface RunDetailProps {
    runId: string;
    canEdit: boolean;
    canLogDefects: boolean;
    /** QA/admin only: advance the run through its status lifecycle. */
    canChangeStatus: boolean;
    onBack: () => void;
}

const SEVERITY_VARIANT: Record<DefectSeverity, "secondary" | "outline" | "default" | "destructive"> = {
    aesthetic: "outline",
    minor: "secondary",
    major: "default",
    critical: "destructive",
};

export function RunDetail({ runId, canEdit, canLogDefects, canChangeStatus, onBack }: RunDetailProps) {
    const [run, setRun] = useState<ManufacturingRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [addDefectOpen, setAddDefectOpen] = useState(false);
    const [tab, setTab] = useState<"overview" | "defects">("overview");

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

    const changeStatus = async (status: string) => {
        try {
            await updateRunStatus(runId, status);
            await load();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to change status.");
        }
    };

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
    const affected = defects.reduce((sum, d) => sum + d.quantity_affected, 0);

    const TABS = [
        { id: "overview" as const, label: "Overview", icon: ClipboardList },
        { id: "defects" as const, label: "Defects", icon: ListChecks },
    ];

    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            {/* Header, matching the Library component full-view. */}
            <header className="shrink-0 border-b bg-card">
                <div className="px-4 py-3">
                    <div className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onBack}>
                            <ArrowLeft className="h-3 w-3" /> All runs
                        </Button>
                        <ChevronRight className="h-3 w-3" />
                        <span className="truncate">{run.manufacturer_name || "No manufacturer"}</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="truncate text-foreground">{run.project_name || run.project_id}</span>
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Factory className="h-5 w-5 text-primary" />
                                <h2 className="text-xl font-semibold tracking-tight">
                                    {run.project_name || run.project_id}
                                </h2>
                                {run.relative_path && run.relative_path !== "." && (
                                    <Badge variant="outline">{run.relative_path}</Badge>
                                )}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {run.manufacturer_name || "No manufacturer"}
                                {run.commit_sha ? ` · ${run.commit_sha.slice(0, 7)}` : ""}
                                {" · "}
                                {new Date(run.created_at).toLocaleDateString()}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {canChangeStatus ? (
                                <CompactSelect
                                    aria-label="Status"
                                    widthClass="w-auto"
                                    value={run.status}
                                    onChange={(e) => void changeStatus(e.target.value)}
                                >
                                    {RUN_STATUSES.map((status) => (
                                        <option key={status} value={status}>
                                            {RUN_STATUS_LABELS[status]}
                                        </option>
                                    ))}
                                </CompactSelect>
                            ) : (
                                // Only QA/Admin can advance status; others see it read-only.
                                <Badge variant="secondary">{RUN_STATUS_LABELS[run.status]}</Badge>
                            )}
                        </div>
                    </div>
                </div>

                <nav className="flex overflow-x-auto border-t px-3" aria-label="Run sections">
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            className={cn(
                                "flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                tab === id && "border-primary text-foreground",
                            )}
                            aria-current={tab === id ? "page" : undefined}
                            onClick={() => setTab(id)}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                            {id === "defects" && defects.length > 0 && (
                                <Badge variant="outline" className="px-1 text-[10px]">
                                    {defects.length}
                                </Badge>
                            )}
                        </button>
                    ))}
                </nav>
            </header>

            <ScrollArea className="min-h-0 flex-1">
                <main className="mx-auto w-full max-w-screen-2xl p-4">
                    {tab === "overview" ? (
                        <div className="space-y-6">
                            {/* Quantities */}
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                <Stat label="Ordered" value={run.quantity_ordered} />
                                <EditableStat
                                    label="Good"
                                    value={run.quantity_good}
                                    max={run.quantity_ordered}
                                    canEdit={canEdit}
                                    onCommit={(v) => void patch({ quantity_good: v })}
                                />
                                <Stat label="Defects" value={defects.length} />
                                <Stat label="Affected units" value={affected} />
                            </div>
                        </div>
                    ) : null}

                    {tab === "defects" ? (
                        <div>
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-sm font-medium">
                                    {defects.length} defect(s){affected ? ` · ${affected} unit(s) affected` : ""}
                                </h3>
                                {canLogDefects && (
                                    <Button size="sm" onClick={() => setAddDefectOpen(true)}>
                                        <Plus className="mr-1.5 h-4 w-4" /> Log defect
                                    </Button>
                                )}
                            </div>

                            {defects.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 border border-dashed p-10 text-center text-muted-foreground">
                                    <CheckCircle2 className="h-8 w-8 text-success opacity-70" />
                                    <p className="text-sm">No defects logged. Mark units good in Overview as they pass.</p>
                                </div>
                            ) : (
                                <ul className="space-y-3">
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
                        </div>
                    ) : null}
                </main>
            </ScrollArea>

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
        <div className="border p-3">
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
        <div className="border p-3">
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
        <li className="border">
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
                            <CompactSelect
                                id="def-category"
                                className="h-8"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                            >
                                {DEFECT_CATEGORIES.map((c) => (
                                    <option key={c.value} value={c.value}>
                                        {c.label}
                                    </option>
                                ))}
                            </CompactSelect>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="def-severity">Severity</Label>
                            <CompactSelect
                                id="def-severity"
                                className="h-8"
                                value={severity}
                                onChange={(e) => setSeverity(e.target.value as DefectSeverity)}
                            >
                                <option value="aesthetic">Aesthetic</option>
                                <option value="minor">Minor</option>
                                <option value="major">Major</option>
                                <option value="critical">Critical</option>
                            </CompactSelect>
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
