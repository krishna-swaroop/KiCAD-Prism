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
import {
    CommentEditor,
    actionAllowed,
    describeMutationError,
} from "@/components/tracker-integration/comment-editor";

interface CommentCardProps {
    comment: Comment;
    screenPosition: { x: number; y: number } | null;
    /** Fallback when a legacy listing has no `permissions` block. */
    canModify?: boolean;
    onClose: () => void;
    onResolve: (commentId: string, resolved: boolean) => void | Promise<void>;
    onReply: (commentId: string, content: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    onEdit?: (commentId: string, content: string, expectedRevision: number) => Promise<void>;
    onEditReply?: (commentId: string, reply: CommentReply, content: string) => Promise<void>;
    onDeleteReply?: (commentId: string, reply: CommentReply) => Promise<void>;
    onReload?: () => void | Promise<void>;
}

/**
 * Compact floating card shown when a canvas comment marker is clicked.
 */
export function CommentCard({
    comment,
    screenPosition,
    canModify = false,
    onClose,
    onResolve,
    onReply,
    onDelete,
    onEdit,
    onEditReply,
    onDeleteReply,
    onReload,
}: CommentCardProps) {
    const [replyOpen, setReplyOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);
    const isResolved = comment.status === "RESOLVED";
    const canReply = actionAllowed(comment.permissions, "canReply", canModify);
    const canEdit = actionAllowed(comment.permissions, "canEdit", canModify);
    const canDelete = actionAllowed(comment.permissions, "canDelete", canModify);
    const canResolve = actionAllowed(comment.permissions, "canResolve", canModify);
    const liveReplies = comment.replies.filter((reply) => !reply.deletedAt);
    const showActions = canReply || canEdit || canDelete || canResolve;

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
                "fixed z-[110] m-0 w-72 rounded-md border bg-background p-0 text-foreground shadow-lg",
                isResolved && "opacity-80",
            )}
            style={style}
            aria-label="Comment details"
        >
            <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
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

            <div className="flex flex-wrap gap-1 px-3 pt-2">
                <Badge variant="secondary" className="h-5 text-[10px]">
                    {commentClassLabel(comment.commentClass ?? "general")}
                </Badge>
                <CommentSeverityBadge severity={comment.severity ?? "info"} />
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
                    {comment.mentions.map((email) => (
                        <Badge key={email} variant="outline" className="max-w-full truncate text-[10px]">
                            @{email}
                        </Badge>
                    ))}
                </div>
            )}

            {liveReplies.length > 0 && (
                <div className="space-y-2 border-t bg-muted/30 px-3 py-2">
                    {liveReplies.slice(-3).map((reply) => {
                        const replyCanEdit = actionAllowed(reply.permissions, "canEdit", false);
                        const replyCanDelete = actionAllowed(reply.permissions, "canDelete", false);
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
                                        <span className="font-medium">{reply.author}</span>
                                        <span className="text-muted-foreground"> · {reply.content}</span>
                                        {(replyCanEdit || replyCanDelete) && (
                                            <span className="ml-1 inline-flex gap-1">
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

            {showActions && (
                <div className="flex items-center justify-end gap-1 border-t px-2 py-1.5">
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
