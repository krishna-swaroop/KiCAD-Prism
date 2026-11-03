import { useState, type CSSProperties } from "react";
import {
    CheckCircle,
    Circle,
    MessageSquareReply,
    Trash2,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { CommentAuthorKindBadge } from "@/components/comment-author-kind-badge";
import { CommentSeverityBadge } from "@/components/comment-severity-badge";
import { TrackerIssueAction } from "@/features/tracker-integration/tracker-issue-action";
import { formatCommentTimestamp } from "@/components/comment-date";
import { cn } from "@/lib/utils";
import { commentClassLabel, type Comment } from "@/types/comments";
import { ThreadMessage } from "@/features/rich-comments/thread-message";
import { RichComposer } from "@/features/rich-comments/rich-composer";
import { useReplyBox } from "@/features/rich-comments/use-reply-box";

interface CommentCardProps {
    projectId: string;
    comment: Comment;
    screenPosition: { x: number; y: number } | null;
    canModify: boolean;
    onClose: () => void;
    onResolve: (commentId: string, resolved: boolean) => void;
    onReply: (commentId: string, content: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    onPromote?: (commentId: string) => Promise<void>;
    onRetrySync?: (commentId: string) => Promise<void>;
}

/**
 * Compact floating card shown when a canvas comment marker is clicked.
 */
export function CommentCard({
    projectId,
    comment,
    screenPosition,
    canModify,
    onClose,
    onResolve,
    onReply,
    onDelete,
    onPromote,
    onRetrySync,
}: CommentCardProps) {
    const replyBox = useReplyBox();
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const isResolved = comment.status === "RESOLVED";
    const canSendReply = Boolean(replyBox.draft.markdown) && !replyBox.draft.uploading && !busy;

    // The card never runs past the bottom of the viewport; its thread scrolls
    // between the fixed header and action bar instead.
    const top = screenPosition ? Math.min(Math.max(screenPosition.y - 8, 8), window.innerHeight - 200) : null;
    const style: CSSProperties = screenPosition && top !== null
        ? {
              left: Math.min(Math.max(screenPosition.x + 12, 8), window.innerWidth - 320),
              top,
              maxHeight: `calc(100vh - ${top + 8}px)`,
          }
        : {
              left: "50%",
              top: "20%",
              transform: "translateX(-50%)",
              maxHeight: "calc(80vh - 8px)",
          };

    const submitReply = async () => {
        if (!canSendReply) return;
        setBusy(true);
        try {
            await onReply(comment.id, replyBox.draft.markdown);
            replyBox.close();
        } finally {
            setBusy(false);
        }
    };

    const canInteract = canModify && comment.permissions?.canReply !== false;

    return (
        <dialog
            open
            className={cn(
                "fixed z-float m-0 flex w-80 flex-col overflow-hidden rounded-md border bg-background p-0 text-foreground shadow-lg",
                isResolved && "opacity-80",
            )}
            style={style}
            aria-label="Comment details"
        >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2">
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1">
                        <span className="truncate text-sm font-medium">{comment.author}</span>
                        <CommentAuthorKindBadge
                            authorKind={comment.authorKind}
                            authorClientId={comment.authorClientId}
                            authorClientName={comment.authorClientName}
                        />
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        {formatCommentTimestamp(comment.timestamp)}
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

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-wrap gap-1 px-3 pt-2">
                <Badge variant="secondary" className="h-5 text-[10px]">
                    {commentClassLabel(comment.commentClass ?? "general")}
                </Badge>
                <CommentSeverityBadge severity={comment.severity ?? "info"} />
            </div>

            <ThreadMessage
                projectId={projectId}
                thread={comment}
                canInteract={canInteract}
                onQuote={replyBox.quote}
                className="px-3 py-2"
            />

            {(comment.tracker?.linkState || comment.permissions?.canPublish) && (
                <div className="px-3 pb-2">
                    <TrackerIssueAction comment={comment} onPromote={onPromote} onRetry={onRetrySync} />
                </div>
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

            {comment.replies.length > 0 && (
                <div className="space-y-2 border-t bg-muted/30 px-3 py-2">
                    {comment.replies.slice(-3).map((item) => (
                        <div key={item.id ?? `${item.timestamp}-${item.author}-${item.content}`} className="text-xs">
                            <span className="flex items-center gap-1">
                                <span className="font-medium">{item.author}</span>
                                <CommentAuthorKindBadge
                                    authorKind={item.authorKind}
                                    authorClientId={item.authorClientId}
                                    authorClientName={item.authorClientName}
                                />
                            </span>
                            <ThreadMessage
                                projectId={projectId}
                                thread={comment}
                                reply={item}
                                canInteract={canInteract}
                                onQuote={replyBox.quote}
                                bodyClassName="text-xs text-muted-foreground"
                            />
                        </div>
                    ))}
                </div>
            )}

            {replyBox.open && canModify && (
                <div className="border-t px-3 py-2">
                    <span className="mb-1 block text-xs font-medium">Reply</span>
                    {/* Opening the reply box is a deliberate request to type in it, so
                        focus follows the reveal. The card itself never takes focus. */}
                    <RichComposer
                        ref={replyBox.ref}
                        projectId={projectId}
                        ariaLabel="Reply"
                        autoFocus
                        placeholder="Write a reply…"
                        initialMarkdown={replyBox.seed}
                        onChange={replyBox.setDraft}
                        onSubmit={() => void submitReply()}
                        onCancel={replyBox.close}
                        disabled={busy}
                        minHeightClassName="min-h-16"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={replyBox.close}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={!canSendReply}
                            onClick={() => void submitReply()}
                        >
                            Reply
                        </Button>
                    </div>
                </div>
            )}

            </div>

            {canModify && (
                <div className="flex shrink-0 items-center justify-end gap-1 border-t px-2 py-1.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Reply"
                        onClick={replyBox.toggle}
                    >
                        <MessageSquareReply className="h-4 w-4" />
                    </Button>
                    {comment.permissions?.canResolve !== false && (
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
                    {comment.permissions?.canDelete !== false && (
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
