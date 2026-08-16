import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Loader2, Maximize2, X } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getRun } from "@/lib/manufacturing";
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
    onClose,
    onOpenFull,
}: {
    runId: string;
    onClose: () => void;
    onOpenFull: () => void;
}) {
    const [run, setRun] = useState<ManufacturingRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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

                    <div className="shrink-0 border-t p-3">
                        <Button size="sm" className="w-full" onClick={onOpenFull}>
                            <Maximize2 className="mr-2 h-4 w-4" />
                            Open full view
                        </Button>
                    </div>
                </>
            ) : null}
        </aside>
    );
}
