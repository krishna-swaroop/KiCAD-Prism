import { useState } from "react";
import {
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Circle,
    MessageSquare,
    Reply as ReplyIcon,
    Send,
    Trash2,
    X,
} from "lucide-react";
import { commentClassLabel, type Comment } from "@/types/comments";
import { CommentSeverityBadge } from "@/components/comment-severity-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CommentPanelProps {
    comments: Comment[];
    onClose: () => void;
    onResolve: (commentId: string, resolved: boolean) => void;
    onReply: (commentId: string, content: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    onCommentClick: (comment: Comment) => void;
    canModify: boolean;
    highlightedId?: string | null;
    embedded?: boolean;
}

export function CommentPanel({
    comments,
    onClose,
    onResolve,
    onReply,
    onDelete,
    onCommentClick,
    canModify,
    highlightedId = null,
    embedded = false,
}: CommentPanelProps) {
    const [filter, setFilter] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");

    const filteredComments = comments.filter((c) => {
        if (filter === "ALL") return true;
        return c.status === filter;
    });

    return (
        <div
            className={cn(
                "flex h-full flex-col bg-background",
                embedded ? "w-full" : "z-50 w-80 border-l shadow-xl",
            )}
        >
            {!embedded && (
            <div className="flex items-center justify-between border-b p-4">
                <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    <h2 className="font-semibold">Comments</h2>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        {comments.length}
                    </Badge>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close comments panel">
                    <X className="h-4 w-4" />
                </Button>
            </div>
            )}

            <div className="flex gap-2 border-b bg-muted/30 p-2">
                {(["ALL", "OPEN", "RESOLVED"] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setFilter(value)}
                        className={`rounded-full px-3 py-1 text-xs transition-colors ${
                            filter === value
                                ? "bg-primary font-medium text-primary-foreground"
                                : "bg-transparent text-muted-foreground hover:bg-muted"
                        }`}
                    >
                        {value === "ALL" ? "All" : value === "OPEN" ? "Open" : "Resolved"}
                    </button>
                ))}
            </div>

            <ScrollArea className="flex-1 p-4">
                <div className="space-y-6">
                    {filteredComments.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            No comments found.
                        </div>
                    ) : (
                        (["SCH", "PCB"] as const).map((context) => {
                            const group = filteredComments.filter((c) => c.context === context);
                            if (!group.length) return null;
                            return (
                                <div key={context} className="space-y-3">
                                    <div className="rounded bg-muted/30 px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                        {context === "SCH" ? "Schematic" : "PCB Layout"}
                                    </div>
                                    <div className="space-y-3">
                                        {group.map((comment) => (
                                            <PanelCommentCard
                                                key={comment.id}
                                                comment={comment}
                                                highlighted={highlightedId === comment.id}
                                                onResolve={onResolve}
                                                onReply={onReply}
                                                onDelete={onDelete}
                                                onClick={() => onCommentClick(comment)}
                                                canModify={canModify}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

function PanelCommentCard({
    comment,
    highlighted,
    onResolve,
    onReply,
    onDelete,
    onClick,
    canModify,
}: {
    comment: Comment;
    highlighted: boolean;
    onResolve: (id: string, resolved: boolean) => void;
    onReply: (id: string, content: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onClick: () => void;
    canModify: boolean;
}) {
    const [isReplying, setIsReplying] = useState(false);
    const [replyContent, setReplyContent] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const isResolved = comment.status === "RESOLVED";

    const handleReply = async () => {
        if (!replyContent.trim()) return;
        setIsSubmitting(true);
        try {
            await onReply(comment.id, replyContent.trim());
            setReplyContent("");
            setIsReplying(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className={`rounded-lg border bg-card text-card-foreground shadow-sm transition-all ${
                isResolved ? "opacity-70" : ""
            } ${highlighted ? "ring-2 ring-primary" : ""}`}
        >
            <div
                className="cursor-pointer rounded-t-lg p-3 hover:bg-muted/50"
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    onClick();
                }}
            >
                <div className="mb-2 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{comment.author}</span>
                        {comment.elementRef && (
                            <Badge variant="outline" className="h-5 px-1 text-[10px]">
                                {comment.elementRef}
                            </Badge>
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                        {new Date(comment.timestamp).toLocaleDateString()}
                    </span>
                </div>

                <div className="mb-2 flex flex-wrap gap-1">
                    <Badge variant="secondary">{commentClassLabel(comment.commentClass ?? "general")}</Badge>
                    <CommentSeverityBadge severity={comment.severity ?? "info"} />
                </div>

                <p className="mb-3 whitespace-pre-wrap text-sm">{comment.content}</p>

                {comment.mentions && comment.mentions.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1">
                        {comment.mentions.map((email) => (
                            <Badge key={email} variant="outline" className="max-w-full truncate text-[10px]">
                                @{email}
                            </Badge>
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between">
                    {canModify ? (
                        <>
                            <div className="flex gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setIsReplying(!isReplying)}
                                >
                                    <ReplyIcon className="mr-1 h-3 w-3" />
                                    Reply
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmDelete(true);
                                    }}
                                >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    Delete
                                </Button>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`h-6 px-2 text-xs ${isResolved ? "text-success" : "text-muted-foreground"}`}
                                onClick={() => onResolve(comment.id, !isResolved)}
                            >
                                {isResolved ? (
                                    <>
                                        <CheckCircle className="mr-1 h-3 w-3" />
                                        Resolved
                                    </>
                                ) : (
                                    <>
                                        <Circle className="mr-1 h-3 w-3" />
                                        Resolve
                                    </>
                                )}
                            </Button>
                        </>
                    ) : (
                        <div className="text-xs text-muted-foreground">Read-only</div>
                    )}
                </div>
            </div>

            {(comment.replies.length > 0 || (isReplying && canModify)) && (
                <div className="space-y-3 border-t bg-muted/20 p-3">
                    {comment.replies.length > 0 && (
                        <div className="space-y-3">
                            <div
                                className="flex cursor-pointer select-none items-center gap-1 text-xs text-muted-foreground"
                                onClick={() => setExpanded(!expanded)}
                            >
                                {expanded ? (
                                    <ChevronDown className="h-3 w-3" />
                                ) : (
                                    <ChevronRight className="h-3 w-3" />
                                )}
                                {comment.replies.length} replies
                            </div>
                            {expanded &&
                                comment.replies.map((reply, idx) => (
                                    <div key={idx} className="relative border-l-2 border-muted pl-2 text-sm">
                                        <div className="mb-1 flex items-center justify-between">
                                            <span className="text-xs font-medium">{reply.author}</span>
                                            <span className="text-[10px] text-muted-foreground">
                                                {new Date(reply.timestamp).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="text-muted-foreground">{reply.content}</p>
                                    </div>
                                ))}
                        </div>
                    )}

                    {isReplying && canModify && (
                        <div className="mt-2 flex items-end gap-2 pt-2">
                            <textarea
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                placeholder="Write a reply..."
                                className="min-h-[60px] flex-1 resize-none rounded border bg-background p-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault();
                                        void handleReply();
                                    }
                                }}
                            />
                            <Button
                                size="icon"
                                className="mb-0.5 h-8 w-8"
                                disabled={isSubmitting || !replyContent.trim()}
                                onClick={() => void handleReply()}
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
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
        </div>
    );
}
