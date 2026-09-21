import { useState } from "react";
import { Check, MessageSquare, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import type { Comment, CommentReply } from "@/types/comments";
import type { CommentTrackerProjection, LegacyForgeProjection } from "@/types/trackers";
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
import { projectionFromComment } from "@/lib/trackers-client";
import {
    commentAutoEligible,
    type CommentTrackerHostSettings,
} from "@/components/comment-card";
import {
    CommentHeader,
    CommentMentions,
    IconAction,
    ReplyComposer,
    ReplyList,
    SyncHistorySection,
    TrackerStrip,
} from "@/components/comment-thread";

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
    const [historyOpen, setHistoryOpen] = useState(false);
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
    const showTrackerStrip = Boolean(projectId && trackerSettings);

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

    const clearErrors = () => {
        setError(null);
        setConflict(false);
    };
    const reload = onReload ? () => void onReload() : undefined;

    return (
        <article
            className={cn(
                "rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow",
                highlighted && "ring-2 ring-primary",
            )}
            data-comment-id={comment.id}
            data-comment-status={comment.status}
        >
            {/* Header and body are the click target that focuses the marker on the canvas. */}
            <div
                role="button"
                tabIndex={0}
                className="cursor-pointer rounded-t-lg px-3 pt-3 pb-2 text-left hover:bg-muted/40"
                onClick={onClick}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onClick();
                    }
                }}
                aria-label={`Open comment from ${comment.author}`}
            >
                <CommentHeader
                    comment={comment}
                    actions={
                        <>
                            {canResolve ? (
                                <IconAction
                                    label={isResolved ? "Reopen comment" : "Resolve comment"}
                                    onClick={() => void onResolve(comment.id, !isResolved)}
                                    className={cn(!isResolved && "hover:text-success")}
                                >
                                    {isResolved ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
                                </IconAction>
                            ) : null}
                            {canEdit && onEdit ? (
                                <IconAction label="Edit comment" onClick={() => { clearErrors(); setEditing((open) => !open); }}>
                                    <Pencil className="h-3.5 w-3.5" />
                                </IconAction>
                            ) : null}
                            {canDelete ? (
                                <IconAction label="Delete comment" onClick={() => setConfirmDelete(true)} className="hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </IconAction>
                            ) : null}
                        </>
                    }
                />
                {editing && onEdit ? (
                    <div className="mt-2" onClick={(event) => event.stopPropagation()}>
                        <CommentEditor
                            id={`panel-edit-${comment.id}`}
                            label="Edit comment"
                            hideLabel
                            compact
                            initialValue={comment.content}
                            busy={isSubmitting}
                            error={error}
                            conflict={conflict}
                            onReload={reload}
                            onCancel={() => { setEditing(false); clearErrors(); }}
                            onSubmit={async (content) => {
                                if (await run(() => onEdit(comment.id, content, comment.revision), "Failed to update comment")) {
                                    setEditing(false);
                                }
                            }}
                        />
                    </div>
                ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{comment.content}</p>
                )}
                <CommentMentions comment={comment} className="mt-1.5" />
            </div>

            {showTrackerStrip ? (
                <TrackerStrip
                    projectId={projectId!}
                    comment={comment}
                    tracker={tracker}
                    settings={trackerSettings!}
                    autoEligible={autoEligible}
                    historyOpen={historyOpen}
                    onToggleHistory={() => setHistoryOpen((open) => !open)}
                    onTrackerChange={onTrackerChange}
                    className="border-t bg-muted/40 px-3 py-1.5"
                />
            ) : null}

            {historyOpen && projectId && tracker.linkState ? (
                <SyncHistorySection projectId={projectId} commentId={comment.id} />
            ) : null}

            <ReplyList
                comment={comment}
                replies={liveReplies}
                permissions={comment.permissions}
                editingReplyId={onEditReply ? editingReplyId : null}
                busy={isSubmitting}
                error={error}
                conflict={conflict}
                idPrefix="panel"
                canEditReplies={Boolean(onEditReply)}
                onStartEdit={(reply) => { clearErrors(); setEditingReplyId(reply.id); }}
                onCancelEdit={() => { setEditingReplyId(null); clearErrors(); }}
                onSubmitEdit={async (reply, content) => {
                    if (!onEditReply) return;
                    if (await run(() => onEditReply(comment.id, reply, content), "Failed to update reply")) {
                        setEditingReplyId(null);
                    }
                }}
                onDeleteReply={onDeleteReply ? (reply) => void onDeleteReply(comment.id, reply) : undefined}
                onReload={reload}
                collapsible
                className="border-t"
            />

            {canReply ? (
                <ReplyComposer
                    id={`panel-reply-${comment.id}`}
                    open={isReplying}
                    onOpen={() => { clearErrors(); setIsReplying(true); }}
                    onCancel={() => { setIsReplying(false); clearErrors(); }}
                    onSubmit={async (content) => {
                        if (await run(() => onReply(comment.id, content), "Failed to add reply")) {
                            setIsReplying(false);
                        }
                    }}
                    busy={isSubmitting}
                    error={error}
                    conflict={conflict}
                    onReload={reload}
                    className="border-t"
                />
            ) : !canEdit && !canDelete && !canResolve ? (
                <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">Read-only</div>
            ) : null}

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
        </article>
    );
}
