import { useState } from "react";
import {
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Circle,
    MessageSquare,
    Pencil,
    Reply as ReplyIcon,
    Trash2,
    X,
} from "lucide-react";
import { commentClassLabel, type Comment, type CommentReply } from "@/types/comments";
import type { CommentTrackerProjection, LegacyForgeProjection } from "@/types/trackers";
import { CommentSeverityBadge } from "@/components/comment-severity-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import {
    commentAutoEligible,
    type CommentTrackerHostSettings,
} from "@/components/comment-card";

interface CommentPanelProps {
    comments: Comment[];
    onClose: () => void;
    onResolve: (commentId: string, resolved: boolean) => void | Promise<void>;
    onReply: (commentId: string, content: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    onCommentClick: (comment: Comment) => void;
    canModify?: boolean;
    highlightedId?: string | null;
    embedded?: boolean;
    projectId?: string;
    trackerSettings?: CommentTrackerHostSettings | null;
    onEdit?: (commentId: string, content: string, expectedRevision: number) => Promise<void>;
    onEditReply?: (commentId: string, reply: CommentReply, content: string) => Promise<void>;
    onDeleteReply?: (commentId: string, reply: CommentReply) => Promise<void>;
    onReload?: () => void | Promise<void>;
    onTrackerChange?: (commentId: string, tracker: CommentTrackerProjection) => void;
}

export function CommentPanel({
    comments,
    onClose,
    onResolve,
    onReply,
    onDelete,
    onCommentClick,
    canModify = false,
    highlightedId = null,
    embedded = false,
    projectId,
    trackerSettings = null,
    onEdit,
    onEditReply,
    onDeleteReply,
    onReload,
    onTrackerChange,
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
            data-tracker-discussion-host="canvas-panel"
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
                                                projectId={projectId}
                                                trackerSettings={trackerSettings}
                                                onEdit={onEdit}
                                                onEditReply={onEditReply}
                                                onDeleteReply={onDeleteReply}
                                                onReload={onReload}
                                                onTrackerChange={onTrackerChange}
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

// react-doctor-disable-next-line no-giant-component - panel thread card mirrors canvas promote/reply/sync chrome
function PanelCommentCard({
    comment,
    highlighted,
    onResolve,
    onReply,
    onDelete,
    onClick,
    canModify,
    projectId,
    trackerSettings,
    onEdit,
    onEditReply,
    onDeleteReply,
    onReload,
    onTrackerChange,
}: {
    comment: Comment;
    highlighted: boolean;
    onResolve: (id: string, resolved: boolean) => void | Promise<void>;
    onReply: (id: string, content: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onClick: () => void;
    canModify: boolean;
    projectId?: string;
    trackerSettings?: CommentTrackerHostSettings | null;
    onEdit?: (commentId: string, content: string, expectedRevision: number) => Promise<void>;
    onEditReply?: (commentId: string, reply: CommentReply, content: string) => Promise<void>;
    onDeleteReply?: (commentId: string, reply: CommentReply) => Promise<void>;
    onReload?: () => void | Promise<void>;
    onTrackerChange?: (commentId: string, tracker: CommentTrackerProjection) => void;
}) {
    const [isReplying, setIsReplying] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);
    const isResolved = comment.status === "RESOLVED";
    const canReply = actionAllowed(comment.permissions, "canReply", canModify);
    const canEdit = actionAllowed(comment.permissions, "canEdit", canModify);
    const canDelete = actionAllowed(comment.permissions, "canDelete", canModify);
    const canResolve = actionAllowed(comment.permissions, "canResolve", canModify);
    const liveReplies = comment.replies.filter((reply) => !reply.deletedAt);
    const tracker = projectionFromComment(comment as Comment & LegacyForgeProjection);
    const autoEligible = commentAutoEligible(comment, trackerSettings);

    const run = async (work: () => Promise<void>, fallback: string) => {
        setIsSubmitting(true);
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
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className={`rounded-lg border bg-card text-card-foreground shadow-sm transition-all ${
                isResolved ? "opacity-70" : ""
            } ${highlighted ? "ring-2 ring-primary" : ""}`}
        >
            <button
                type="button"
                className="block w-full cursor-pointer rounded-t-lg p-3 pb-0 text-left hover:bg-muted/50"
                onClick={onClick}
                aria-label={`Open comment from ${comment.author}`}
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

                <div className="mb-2">
                    <TrackedThreadChip tracker={tracker} variant="stacked" />
                </div>

                {!editing && (
                    <p className="mb-3 whitespace-pre-wrap text-sm">{comment.content}</p>
                )}

                {comment.mentions && comment.mentions.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1">
                        {comment.mentions.map((mention) => (
                            <Badge key={mention.userId} variant="outline" className="max-w-full truncate text-[10px]">
                                @{mention.displayName}
                            </Badge>
                        ))}
                    </div>
                )}

            </button>

            {editing && onEdit && (
                <div className="px-3 pb-2">
                    <CommentEditor
                        id={`panel-edit-${comment.id}`}
                        label="Edit comment"
                        initialValue={comment.content}
                        busy={isSubmitting}
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
            )}

            {projectId && trackerSettings && (
                <div className="px-3 pb-2" onClick={(event) => event.stopPropagation()}>
                    <PromotionControl
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

            <div className="flex items-center justify-between px-3 pb-3 pt-2">
                {canReply || canEdit || canDelete || canResolve ? (
                    <>
                        <div className="flex gap-1">
                            {canReply && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setIsReplying(!isReplying)}
                                >
                                    <ReplyIcon className="mr-1 h-3 w-3" />
                                    Reply
                                </Button>
                            )}
                            {canEdit && onEdit && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setEditing(!editing)}
                                >
                                    <Pencil className="mr-1 h-3 w-3" />
                                    Edit
                                </Button>
                            )}
                            {canDelete && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => setConfirmDelete(true)}
                                >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    Delete
                                </Button>
                            )}
                        </div>
                        {canResolve && (
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
                        )}
                    </>
                ) : (
                    <div className="text-xs text-muted-foreground">Read-only</div>
                )}
            </div>

            {(liveReplies.length > 0 || (isReplying && canReply)) && (
                <div className="space-y-3 border-t bg-muted/20 p-3">
                    {liveReplies.length > 0 && (
                        <div className="space-y-3">
                            <button
                                type="button"
                                className="flex select-none items-center gap-1 text-xs text-muted-foreground"
                                onClick={() => setExpanded(!expanded)}
                                aria-expanded={expanded}
                            >
                                {expanded ? (
                                    <ChevronDown className="h-3 w-3" />
                                ) : (
                                    <ChevronRight className="h-3 w-3" />
                                )}
                                {liveReplies.length} replies
                            </button>
                            {expanded &&
                                liveReplies.map((reply) => {
                                    const replyCanEdit = actionAllowed(reply.permissions, "canEdit", false);
                                    const replyCanDelete = actionAllowed(reply.permissions, "canDelete", false);
                                    const discussionReply = reply as DiscussionReply;
                                    return (
                                    <div key={reply.id} className="relative border-l-2 border-muted pl-2 text-sm">
                                        {editingReplyId === reply.id && onEditReply ? (
                                            <CommentEditor
                                                id={`panel-edit-reply-${reply.id}`}
                                                label="Edit reply"
                                                initialValue={reply.content}
                                                busy={isSubmitting}
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
                                                    className="border-0 bg-transparent p-0"
                                                />
                                                {(replyCanEdit || replyCanDelete) && (
                                                    <div className="mt-1 flex gap-2 text-[11px]">
                                                        {replyCanEdit && onEditReply && (
                                                            <button type="button" className="underline" onClick={() => setEditingReplyId(reply.id)}>
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
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    );
                                })}
                        </div>
                    )}

                    {isReplying && canReply && (
                        <div className="mt-2 pt-2">
                            <CommentEditor
                                id={`panel-reply-${comment.id}`}
                                label="Reply"
                                submitLabel="Reply"
                                placeholder="Write a reply..."
                                busy={isSubmitting}
                                error={error}
                                conflict={conflict}
                                onReload={onReload ? () => void onReload() : undefined}
                                onCancel={() => { setIsReplying(false); setError(null); setConflict(false); }}
                                onSubmit={async (content) => {
                                    if (await run(() => onReply(comment.id, content), "Failed to add reply")) {
                                        setIsReplying(false);
                                    }
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {projectId && tracker.linkState && (
                <div className="border-t px-3 py-2">
                    <SyncHistory projectId={projectId} commentId={comment.id} />
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
