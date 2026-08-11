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
import { CommentSeverityBadge } from "@/components/comment-severity-badge";
import { cn } from "@/lib/utils";
import { commentClassLabel, type Comment } from "@/types/comments";

interface CommentCardProps {
    comment: Comment;
    screenPosition: { x: number; y: number } | null;
    canModify: boolean;
    onClose: () => void;
    onResolve: (commentId: string, resolved: boolean) => void;
    onReply: (commentId: string, content: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
}

/**
 * Compact floating card shown when a canvas comment marker is clicked.
 */
export function CommentCard({
    comment,
    screenPosition,
    canModify,
    onClose,
    onResolve,
    onReply,
    onDelete,
}: CommentCardProps) {
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyContent, setReplyContent] = useState("");
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const isResolved = comment.status === "RESOLVED";

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

    const submitReply = async () => {
        if (!replyContent.trim() || busy) return;
        setBusy(true);
        try {
            await onReply(comment.id, replyContent.trim());
            setReplyContent("");
            setReplyOpen(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className={cn(
                "fixed z-[110] w-72 rounded-md border bg-background shadow-lg",
                isResolved && "opacity-80",
            )}
            style={style}
            role="dialog"
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

            <p className="whitespace-pre-wrap px-3 py-2 text-sm">{comment.content}</p>

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
                    {comment.replies.slice(-3).map((reply, index) => (
                        <div key={`${reply.timestamp}-${index}`} className="text-xs">
                            <span className="font-medium">{reply.author}</span>
                            <span className="text-muted-foreground"> · {reply.content}</span>
                        </div>
                    ))}
                </div>
            )}

            {replyOpen && canModify && (
                <div className="border-t px-3 py-2">
                    <textarea
                        autoFocus
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Write a reply…"
                        className="h-16 w-full resize-none rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                void submitReply();
                            }
                        }}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setReplyOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={busy || !replyContent.trim()}
                            onClick={() => void submitReply()}
                        >
                            Reply
                        </Button>
                    </div>
                </div>
            )}

            {canModify && (
                <div className="flex items-center justify-end gap-1 border-t px-2 py-1.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Reply"
                        onClick={() => setReplyOpen((open) => !open)}
                    >
                        <MessageSquareReply className="h-4 w-4" />
                    </Button>
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
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label="Delete comment"
                        onClick={() => setConfirmDelete(true)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
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
        </div>
    );
}
