import { useState, type CSSProperties } from "react";
import {
    CheckCircle,
    Circle,
    MessageSquareReply,
    Pencil,
    Trash2,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { CommentSeverityBadge } from "@/components/comment-severity-badge";
import { cn } from "@/lib/utils";
import { commentClassLabel, type Comment, type CommentReply } from "@/types/comments";
import type { CommentTrackerProjection, LegacyForgeProjection, ProjectTrackerSettings } from "@/types/trackers";
import {
    CommentEditor,
    actionAllowed,
    describeMutationError,
} from "@/components/tracker-integration/comment-editor";
import { PromotionControl } from "@/components/tracker-integration/promotion-control";
import { RemoteReply, type DiscussionReply } from "@/components/tracker-integration/remote-reply";
import { SyncHistory } from "@/components/tracker-integration/sync-history";
import { TrackedThreadChip } from "@/components/tracker-integration/tracked-thread-chip";
import { projectionFromComment } from "@/lib/trackers-client";

export type CommentTrackerHostSettings = Pick<
    ProjectTrackerSettings,
    "destination" | "acknowledgement" | "promoteMinRole" | "autoMinSeverity" | "autoTaskClass"
>;

interface CommentCardProps {
    comment: Comment;
    screenPosition: { x: number; y: number } | null;
    /** Fallback when a legacy listing has no `permissions` block. */
    canModify?: boolean;
    projectId?: string;
    trackerSettings?: CommentTrackerHostSettings | null;
    onClose: () => void;
    onResolve: (commentId: string, resolved: boolean) => void | Promise<void>;
    onReply: (commentId: string, content: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    onEdit?: (commentId: string, content: string, expectedRevision: number) => Promise<void>;
    onEditReply?: (commentId: string, reply: CommentReply, content: string) => Promise<void>;
    onDeleteReply?: (commentId: string, reply: CommentReply) => Promise<void>;
    onReload?: () => void | Promise<void>;
    onTrackerChange?: (commentId: string, tracker: CommentTrackerProjection) => void;
}

const SEVERITY_RANK: Record<string, number> = {
    info: 0,
    minor: 1,
    major: 2,
    critical: 3,
};

export function commentAutoEligible(
    comment: Pick<Comment, "severity" | "commentClass">,
    settings?: Pick<ProjectTrackerSettings, "autoMinSeverity" | "autoTaskClass"> | null,
): boolean {
    if (!settings) return false;
    const severity = comment.severity ?? "info";
    const min = settings.autoMinSeverity || "minor";
    if ((SEVERITY_RANK[severity] ?? 0) >= (SEVERITY_RANK[min] ?? 1)) return true;
    return Boolean(settings.autoTaskClass && comment.commentClass === "task");
}

/**
 * Compact floating card shown when a canvas comment marker is clicked.
 */
// react-doctor-disable-next-line no-giant-component - card owns edit/reply/promote/sync chrome for one pinned marker
export function CommentCard({
    comment,
    screenPosition,
    canModify = false,
    projectId,
    trackerSettings = null,
    onClose,
    onResolve,
    onReply,
    onDelete,
    onEdit,
    onEditReply,
    onDeleteReply,
    onReload,
    onTrackerChange,
}: CommentCardProps) {
    const [replyOpen, setReplyOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);
    const isResolved = comment.status === "RESOLVED";
    const canReply = actionAllowed(comment.permissions, "canReply", canModify);
    const canEdit = actionAllowed(comment.permissions, "canEdit", canModify);
    const canDelete = actionAllowed(comment.permissions, "canDelete", canModify);
    const canResolve = actionAllowed(comment.permissions, "canResolve", canModify);
    const liveReplies = comment.replies.filter((reply) => !reply.deletedAt);
    const showActions = canReply || canEdit || canDelete || canResolve;
    const tracker = projectionFromComment(comment as Comment & LegacyForgeProjection);
    const autoEligible = commentAutoEligible(comment, trackerSettings);

    const style: CSSProperties = screenPosition
        ? {
              left: Math.min(Math.max(screenPosition.x + 12, 8), window.innerWidth - 320),
              top: Math.min(Math.max(screenPosition.y - 8, 8), window.innerHeight - 200),
          }
        : {
              left: "50%",
              top: "20%",
              transform: "translateX(-50%)",
          };

    const run = async (work: () => Promise<void>, fallback: string) => {
        setBusy(true);
        setError(null);
        setConflict(false);
        try {
            await work();
            return true;
        } catch (caught) {
            const described = describeMutationError(caught, fallback);
            setError(described.message);
            setConflict(described.conflict);
            if (described.conflict) await onReload?.();
            return false;
        } finally {
            setBusy(false);
        }
    };

    return (
        <dialog
            open
            className={cn(
                // The card is a floating popover: cap it to the viewport and
                // scroll inside so long threads never push actions off-screen.
                "fixed z-[110] m-0 flex max-h-[min(80vh,640px)] w-80 flex-col overflow-hidden rounded-md border bg-background p-0 text-foreground shadow-lg",
                isResolved && "opacity-80",
            )}
            style={style}
            aria-label="Comment details"
            data-tracker-discussion-host="canvas-card"
        >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2">
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{comment.author}</div>
                    <div className="text-[10px] text-muted-foreground">
                        {new Date(comment.timestamp).toLocaleString()}
                        {comment.elementRef ? ` · ${comment.elementRef}` : ""}
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={onClose}
                    aria-label="Close comment card"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="comment-card-scroll">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2">
                <Badge variant="secondary" className="h-5 text-[10px]">
                    {commentClassLabel(comment.commentClass ?? "general")}
                </Badge>
                <CommentSeverityBadge severity={comment.severity ?? "info"} />
                <TrackedThreadChip tracker={tracker} variant="compact" />
            </div>

            {editing && onEdit ? (
                <div className="px-3 py-2">
                    <CommentEditor
                        id={`comment-card-edit-${comment.id}`}
                        label="Edit comment"
                        initialValue={comment.content}
                        submitLabel="Save"
                        busy={busy}
                        error={error}
                        conflict={conflict}
                        onReload={onReload ? () => void onReload() : undefined}
                        onCancel={() => { setEditing(false); setError(null); setConflict(false); }}
                        onSubmit={async (content) => {
                            if (await run(() => onEdit(comment.id, content, comment.revision), "Failed to update comment")) {
                                setEditing(false);
                            }
                        }}
                    />
                </div>
            ) : (
                <p className="whitespace-pre-wrap px-3 py-2 text-sm">{comment.content}</p>
            )}

            {comment.mentions && comment.mentions.length > 0 && (
                <div className="flex flex-wrap gap-1 px-3 pb-2">
                    {comment.mentions.map((mention) => (
                        <Badge key={mention.userId} variant="outline" className="max-w-full truncate text-[10px]">
                            @{mention.displayName}
                        </Badge>
                    ))}
                </div>
            )}

            {projectId && trackerSettings && (
                <div className="px-3 pb-2">
                    <PromotionControl
                        variant="compact"
                        projectId={projectId}
                        commentId={comment.id}
                        tracker={tracker}
                        permissions={comment.permissions}
                        settings={trackerSettings}
                        autoEligible={autoEligible}
                        onTrackerChange={(next) => onTrackerChange?.(comment.id, next)}
                    />
                </div>
            )}

            {liveReplies.length > 0 && (
                <div className="space-y-2 border-t bg-muted/30 px-3 py-2">
                    {liveReplies.map((reply) => {
                        const replyCanEdit = actionAllowed(reply.permissions, "canEdit", false);
                        const replyCanDelete = actionAllowed(reply.permissions, "canDelete", false);
                        const discussionReply = reply as DiscussionReply;
                        return (
                            <div key={reply.id} className="text-xs">
                                {editingReplyId === reply.id && onEditReply ? (
                                    <CommentEditor
                                        id={`comment-card-edit-reply-${reply.id}`}
                                        label="Edit reply"
                                        initialValue={reply.content}
                                        submitLabel="Save"
                                        busy={busy}
                                        error={error}
                                        conflict={conflict}
                                        onReload={onReload ? () => void onReload() : undefined}
                                        onCancel={() => { setEditingReplyId(null); setError(null); setConflict(false); }}
                                        onSubmit={async (content) => {
                                            if (await run(() => onEditReply(comment.id, reply, content), "Failed to update reply")) {
                                                setEditingReplyId(null);
                                            }
                                        }}
                                    />
                                ) : (
                                    <>
                                        <RemoteReply
                                            reply={discussionReply}
                                            permissions={comment.permissions}
                                            compact
                                        />
                                        {(replyCanEdit || replyCanDelete) && (
                                            <span className="mt-1 inline-flex gap-1">
                                                {replyCanEdit && onEditReply && (
                                                    <button
                                                        type="button"
                                                        className="underline"
                                                        onClick={() => setEditingReplyId(reply.id)}
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                                {replyCanDelete && onDeleteReply && (
                                                    <button
                                                        type="button"
                                                        className="underline text-destructive"
                                                        onClick={() => void onDeleteReply(comment.id, reply)}
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {replyOpen && canReply && (
                <div className="border-t px-3 py-2">
                    <CommentEditor
                        id={`comment-card-reply-${comment.id}`}
                        label="Reply"
                        submitLabel="Reply"
                        placeholder="Write a reply…"
                        busy={busy}
                        error={error}
                        conflict={conflict}
                        onReload={onReload ? () => void onReload() : undefined}
                        onCancel={() => { setReplyOpen(false); setError(null); setConflict(false); }}
                        onSubmit={async (content) => {
                            if (await run(() => onReply(comment.id, content), "Failed to add reply")) {
                                setReplyOpen(false);
                            }
                        }}
                    />
                </div>
            )}

            {projectId && tracker.linkState && (
                <details
                    className="border-t px-3 py-1.5 text-xs"
                    data-testid="sync-history-disclosure"
                    onToggle={(event) => setHistoryOpen((event.currentTarget as HTMLDetailsElement).open)}
                >
                    <summary className="cursor-pointer select-none text-muted-foreground">Sync history</summary>
                    {historyOpen ? <SyncHistory projectId={projectId} commentId={comment.id} className="mt-2" /> : null}
                </details>
            )}
            </div>

            {showActions && (
                <div className="flex shrink-0 items-center justify-end gap-1 border-t px-2 py-1.5">
                    {canReply && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Reply"
                            onClick={() => setReplyOpen((open) => !open)}
                        >
                            <MessageSquareReply className="h-4 w-4" />
                        </Button>
                    )}
                    {canEdit && onEdit && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Edit comment"
                            onClick={() => setEditing((open) => !open)}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}
                    {canResolve && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", isResolved && "text-success")}
                            aria-label={isResolved ? "Reopen comment" : "Resolve comment"}
                            onClick={() => onResolve(comment.id, !isResolved)}
                        >
                            {isResolved ? (
                                <CheckCircle className="h-4 w-4" />
                            ) : (
                                <Circle className="h-4 w-4" />
                            )}
                        </Button>
                    )}
                    {canDelete && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label="Delete comment"
                            onClick={() => setConfirmDelete(true)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            )}

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete comment"
                description="This removes the comment and its replies from the review thread. It cannot be undone."
                confirmLabel="Delete comment"
                onConfirm={() => {
                    setConfirmDelete(false);
                    void onDelete(comment.id);
                }}
            />
        </dialog>
    );
}
