import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, FileDown, Loader2, Maximize2, Tag, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteRun, downloadRunReport, getRun } from "@/lib/manufacturing";
import {
    RUN_STATUS_LABELS,
    defectCategoryLabel,
    type ManufacturingRun,
} from "@/types/manufacturing";

function DefinitionRow({ label, value }: { label: string; value?: ReactNode }) {
    return (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 border-b py-2.5 text-xs last:border-b-0">
            <span className="text-muted-foreground">{label}</span>
            <span className="break-words text-right font-medium">{value || "—"}</span>
        </div>
    );
}

export function RunQuickView({
    runId,
    canDelete = false,
    onClose,
    onOpenFull,
    onDeleted,
}: {
    runId: string;
    canDelete?: boolean;
    onClose: () => void;
    onOpenFull: () => void;
    onDeleted?: () => void;
}) {
    const [run, setRun] = useState<ManufacturingRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const handleDownloadReport = useCallback(async () => {
        setDownloading(true);
        try {
            await downloadRunReport(runId);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to download the report.");
        } finally {
            setDownloading(false);
        }
    }, [runId]);

    const handleDelete = useCallback(async () => {
        setDeleting(true);
        try {
            await deleteRun(runId);
            toast.success("Run deleted.");
            setConfirmDelete(false);
            onDeleted?.();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete run.");
        } finally {
            setDeleting(false);
        }
    }, [runId, onDeleted]);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setRun(await getRun(runId));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load run.");
        } finally {
            setLoading(false);
        }
    }, [runId]);

    useEffect(() => {
        void load();
    }, [load]);

    const defects = run?.defects ?? [];
    const affected = defects.reduce((sum, d) => sum + d.quantity_affected, 0);

    return (
        <aside className="flex h-full w-96 shrink-0 flex-col border-l bg-card" aria-label="Run quick view">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">
                        {run?.project_name || run?.project_id || "Run"}
                    </h3>
                    <p className="truncate text-xs text-muted-foreground">
                        {run?.manufacturer_name || "No manufacturer"}
                        {run?.relative_path && run.relative_path !== "." ? ` · ${run.relative_path}` : ""}
                    </p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label="Close run quick view" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {loading ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading run…
                </div>
            ) : error ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                    <CircleAlert className="h-6 w-6 text-destructive" />
                    <p className="text-sm font-medium">Could not load run</p>
                    <p className="text-xs text-muted-foreground">{error}</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => void load()}>
                        Retry
                    </Button>
                </div>
            ) : run ? (
                <>
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Badge variant="secondary">{RUN_STATUS_LABELS[run.status]}</Badge>
                                {defects.length > 0 && (
                                    <Badge variant="outline">{defects.length} defect(s)</Badge>
                                )}
                            </div>

                            <dl>
                                <DefinitionRow label="Manufacturer" value={run.manufacturer_name || "—"} />
                                <DefinitionRow label="Quantity ordered" value={run.quantity_ordered} />
                                <DefinitionRow label="Good units" value={`${run.quantity_good} / ${run.quantity_ordered}`} />
                                <DefinitionRow label="Defects" value={defects.length} />
                                <DefinitionRow label="Units affected" value={affected} />
                                <DefinitionRow
                                    label="Release"
                                    value={
                                        run.release_tag && run.commit_sha ? (
                                            <Link
                                                to={`/project/${run.project_id}?section=history&commit=${encodeURIComponent(run.commit_sha)}`}
                                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                                title={`Open ${run.release_tag} in History`}
                                            >
                                                <Tag className="h-3 w-3" />
                                                {run.release_tag}
                                            </Link>
                                        ) : (
                                            run.release_tag || "—"
                                        )
                                    }
                                />
                                <DefinitionRow
                                    label="Commit"
                                    value={run.commit_sha ? run.commit_sha.slice(0, 7) : "—"}
                                />
                                <DefinitionRow
                                    label="Created"
                                    value={new Date(run.created_at).toLocaleDateString()}
                                />
                            </dl>

                            {defects.length > 0 && (
                                <div className="mt-5">
                                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Defects
                                    </h4>
                                    <ul className="space-y-2">
                                        {defects.slice(0, 5).map((d) => (
                                            <li key={d.id} className="rounded-md border p-2 text-xs">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-medium">{defectCategoryLabel(d.category)}</span>
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {d.severity}
                                                    </Badge>
                                                </div>
                                                {d.description && (
                                                    <p className="mt-1 text-muted-foreground">{d.description}</p>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                    {defects.length > 5 && (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            and {defects.length - 5} more…
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    <div className="flex shrink-0 flex-col gap-2 border-t p-3">
                        <div className="flex items-center gap-2">
                            <Button size="sm" className="flex-1" onClick={onOpenFull}>
                                <Maximize2 className="mr-2 h-4 w-4" />
                                Open full view
                            </Button>
                            {canDelete && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive hover:text-destructive"
                                    aria-label="Delete run"
                                    onClick={() => setConfirmDelete(true)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => void handleDownloadReport()}
                            disabled={downloading}
                        >
                            <FileDown className="mr-2 h-4 w-4" />
                            {downloading ? "Preparing report..." : "Download report"}
                        </Button>
                    </div>
                </>
            ) : null}

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete run?"
                description={
                    <>
                        This run and its defects and evidence will be permanently removed. This cannot be undone.
                    </>
                }
                confirmLabel="Delete run"
                requireHold
                busy={deleting}
                onConfirm={() => void handleDelete()}
            />
        </aside>
    );
}
