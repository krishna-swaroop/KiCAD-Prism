/**
 * Sync operation history and superseded system notes (TR-40, C5/C6).
 */

import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CommentRevision } from "@/types/comments";
import type { ProviderErrorDto } from "@/types/trackers";

export interface SyncOpProjection {
    opId: string;
    trackedThreadId: string;
    op: string;
    state: string;
    createdAt?: string | null;
    sentAt?: string | null;
    localRevision?: number | null;
    destinationGeneration?: number | null;
    actorUserId?: string | null;
    expectedRemoteState?: string | null;
    attempts?: number | null;
    nextAttemptAt?: string | null;
    externalResultId?: string | null;
    lastError?: ProviderErrorDto | null;
}

export interface ThreadSyncHistoryResponse {
    commentId: string;
    trackedThreadId: string | null;
    operations: SyncOpProjection[];
}

export interface SyncHistoryProps {
    projectId: string;
    commentId: string;
    /** Root/reply revisions that include superseded system notes. */
    revisions?: CommentRevision[];
    className?: string;
}

function historyRoute(projectId: string, commentId: string): string {
    return `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/tracker/history`;
}

export async function fetchThreadSyncHistory(
    projectId: string,
    commentId: string,
): Promise<ThreadSyncHistoryResponse> {
    const response = await fetchApi(historyRoute(projectId, commentId));
    if (!response.ok) {
        throw new Error("Failed to load sync history");
    }
    return (await response.json()) as ThreadSyncHistoryResponse;
}

export function syncOpStateVariant(state: string): "success" | "warning" | "destructive" | "info" | "secondary" {
    if (state === "confirmed") return "success";
    if (state === "superseded") return "secondary";
    if (state === "failed") return "destructive";
    if (state === "sent" || state === "pending" || state === "recovering") return "info";
    if (state === "quarantine") return "warning";
    return "secondary";
}

export function syncOpSummary(op: SyncOpProjection): string {
    const kind = op.op.replace(/_/g, " ");
    if (op.state === "superseded") {
        return `${kind} superseded before it reached the forge`;
    }
    if (op.op === "set_state" && op.expectedRemoteState) {
        return `${kind} → ${op.expectedRemoteState}`;
    }
    return `${kind} (${op.state})`;
}

export function isSupersededSystemRevision(revision: CommentRevision): boolean {
    const mentionsSuperseded =
        revision.editorDisplay.toLowerCase().includes("superseded")
        || (revision.content?.toLowerCase().includes("superseded") ?? false);
    const systemStatus =
        revision.changeKind === "status"
        && revision.origin === "remote"
        && revision.editorKind.includes("system");
    return Boolean(systemStatus || mentionsSuperseded);
}

export function supersededNoteText(revision: CommentRevision): string {
    if (revision.content?.trim()) return revision.content.trim();
    return revision.editorDisplay || "Remote change superseded a pending local intent.";
}

export function SyncHistory({
    projectId,
    commentId,
    revisions = [],
    className,
}: SyncHistoryProps) {
    const [history, setHistory] = useState<ThreadSyncHistoryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [offline, setOffline] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setOffline(false);
        try {
            const payload = await fetchThreadSyncHistory(projectId, commentId);
            setHistory(payload);
        } catch {
            setOffline(true);
        } finally {
            setLoading(false);
        }
    }, [commentId, projectId]);

    useEffect(() => {
        void load();
    }, [load]);

    const supersededNotes = revisions.filter(isSupersededSystemRevision);

    return (
        <section
            className={cn("space-y-3 rounded-md border border-border bg-muted/10 p-3", className)}
            aria-label="Tracker sync history"
            data-testid="sync-history"
        >
            <div className="flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-medium">
                    <History className="h-4 w-4" aria-hidden="true" />
                    Sync history
                </h4>
                <Button type="button" size="sm" variant="ghost" onClick={() => void load()} aria-label="Reload sync history">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </Button>
            </div>

            {loading ? (
                <div className="space-y-2" data-testid="sync-history-loading">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-3/4" />
                </div>
            ) : null}

            {offline ? (
                <div className="space-y-2" data-testid="sync-history-offline">
                    <p className="text-sm text-destructive" role="alert">Could not load sync history.</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                        Retry
                    </Button>
                </div>
            ) : null}

            {!loading && !offline && history?.operations.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="sync-history-empty">No sync operations yet.</p>
            ) : null}

            {!loading && !offline && history && history.operations.length > 0 ? (
                <ol className="space-y-2" role="list">
                    {history.operations.map((op) => (
                        <li
                            key={op.opId}
                            className="rounded border border-border/70 bg-background/60 px-3 py-2"
                            data-op-id={op.opId}
                            data-op-state={op.state}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={syncOpStateVariant(op.state)}>{op.state}</Badge>
                                <span className="text-sm">{syncOpSummary(op)}</span>
                            </div>
                            {op.lastError ? (
                                <p className="mt-1 text-xs text-destructive" role="alert">
                                    {op.lastError.message}
                                </p>
                            ) : null}
                        </li>
                    ))}
                </ol>
            ) : null}

            {supersededNotes.length > 0 ? (
                <div className="space-y-2" data-testid="superseded-notes">
                    <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">System notes</h5>
                    <ul className="space-y-2" role="list">
                        {supersededNotes.map((revision) => (
                            <li
                                key={`${revision.targetId}:${revision.revision}`}
                                className="rounded border border-border/70 bg-background/60 px-3 py-2 text-sm"
                                data-testid="superseded-note"
                            >
                                <p>{supersededNoteText(revision)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {revision.editorDisplay} · {new Date(revision.editedAt).toLocaleString()}
                                </p>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {loading ? (
                <span className="sr-only">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                </span>
            ) : null}
        </section>
    );
}
