import { useState, type CSSProperties } from "react";
import { Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { Comment, CommentReply } from "@/types/comments";
import type { CommentTrackerProjection, LegacyForgeProjection, ProjectTrackerSettings } from "@/types/trackers";
import {
    CommentEditor,
    actionAllowed,
    describeMutationError,
} from "@/components/tracker-integration/comment-editor";
import { projectionFromComment } from "@/lib/trackers-client";
import {
    CommentBody,
    CommentHeader,
    CommentMentions,
    IconAction,
    ReplyComposer,
    ReplyList,
    SyncHistorySection,
    TrackerStrip,
    type CommentTrackerHostSettings,
} from "@/components/comment-thread";

export { authorInitials, relativeTime, type CommentTrackerHostSettings } from "@/components/comment-thread";

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

const CARD_WIDTH = 336;
const CARD_MAX_HEIGHT = 640;
/** Smallest card we will accept before flipping/clamping so the footer stays reachable. */
const CARD_MIN_HEIGHT = 260;
const VIEWPORT_MARGIN = 8;
const PIN_OFFSET = 12;

/**
 * Place the card beside the clicked marker and cap its height to the space
 * below its own top edge, so the inner scroll region is always on-screen.
 */
export function cardPlacement(
    screenPosition: { x: number; y: number } | null,
    viewport: { width: number; height: number },
): { left: number; top: number; maxHeight: number } {
    const usableHeight = Math.max(viewport.height - VIEWPORT_MARGIN * 2, CARD_MIN_HEIGHT);
    if (!screenPosition) {
        const top = Math.max(VIEWPORT_MARGIN, Math.round(viewport.height * 0.15));
        return {
            left: Math.max(VIEWPORT_MARGIN, Math.round((viewport.width - CARD_WIDTH) / 2)),
            top,
            maxHeight: Math.min(CARD_MAX_HEIGHT, viewport.height - top - VIEWPORT_MARGIN, usableHeight),
        };
    }
    const rightEdge = screenPosition.x + PIN_OFFSET + CARD_WIDTH + VIEWPORT_MARGIN;
    const flipLeft = rightEdge > viewport.width && screenPosition.x - PIN_OFFSET - CARD_WIDTH >= VIEWPORT_MARGIN;
    const left = flipLeft
        ? screenPosition.x - PIN_OFFSET - CARD_WIDTH
        : Math.min(
              Math.max(screenPosition.x + PIN_OFFSET, VIEWPORT_MARGIN),
              Math.max(VIEWPORT_MARGIN, viewport.width - CARD_WIDTH - VIEWPORT_MARGIN),
          );
    const lowestTop = Math.max(VIEWPORT_MARGIN, viewport.height - CARD_MIN_HEIGHT - VIEWPORT_MARGIN);
    const top = Math.min(Math.max(screenPosition.y - VIEWPORT_MARGIN, VIEWPORT_MARGIN), lowestTop);
    return {
        left,
        top,
        maxHeight: Math.min(CARD_MAX_HEIGHT, viewport.height - top - VIEWPORT_MARGIN, usableHeight),
    };
}

/**
 * Floating card shown when a canvas comment marker is clicked: identity
 * header, one meta line, scrolling discussion, pinned reply composer.
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
    const tracker = projectionFromComment(comment as Comment & LegacyForgeProjection);
    const autoEligible = commentAutoEligible(comment, trackerSettings);
    const showTrackerStrip = Boolean(projectId && trackerSettings);

    const placement = cardPlacement(
        screenPosition,
        typeof window === "undefined" ? { width: 1280, height: 800 } : { width: window.innerWidth, height: window.innerHeight },
    );
    const style: CSSProperties = {
        left: placement.left,
        top: placement.top,
        maxHeight: placement.maxHeight,
        width: CARD_WIDTH,
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

    const clearErrors = () => {
        setError(null);
        setConflict(false);
    };
    const reload = onReload ? () => void onReload() : undefined;

    return (
        <dialog
            open
            className="fixed z-[110] m-0 flex flex-col overflow-hidden rounded-none bg-popover p-0 text-popover-foreground shadow-xl shadow-black/30 ring-1 ring-foreground/15"
            style={style}
            aria-label="Comment details"
            data-tracker-discussion-host="canvas-card"
            data-comment-status={comment.status}
        >
            <CommentHeader
                comment={comment}
                className="shrink-0 px-3 pt-3"
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
                        <IconAction label="Close comment card" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </IconAction>
                    </>
                }
            />

            {/* Discussion: the only part that scrolls. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="comment-card-scroll">
                <div className="px-3 pb-2.5 pt-2">
                    {editing && onEdit ? (
                        <CommentEditor
                            id={`comment-card-edit-${comment.id}`}
                            label="Edit comment"
                            hideLabel
                            compact
                            initialValue={comment.content}
                            submitLabel="Save"
                            busy={busy}
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
                    ) : (
                        <CommentBody content={comment.content} />
                    )}
                    <CommentMentions comment={comment} className="mt-1" />
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
                            className="mt-2"
                        />
                    ) : null}
                </div>

                {historyOpen && projectId && tracker.linkState ? (
                    <SyncHistorySection projectId={projectId} commentId={comment.id} />
                ) : null}

                <ReplyList
                    comment={comment}
                    replies={liveReplies}
                    permissions={comment.permissions}
                    editingReplyId={onEditReply ? editingReplyId : null}
                    busy={busy}
                    error={error}
                    conflict={conflict}
                    idPrefix="comment-card"
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
                    className="border-t border-border/50"
                />
            </div>

            {/* Composer: pinned so a long thread never hides it. */}
            {canReply ? (
                <ReplyComposer
                    id={`comment-card-reply-${comment.id}`}
                    open={replyOpen}
                    onOpen={() => { clearErrors(); setReplyOpen(true); }}
                    onCancel={() => { setReplyOpen(false); clearErrors(); }}
                    onSubmit={async (content) => {
                        if (await run(() => onReply(comment.id, content), "Failed to add reply")) {
                            setReplyOpen(false);
                        }
                    }}
                    busy={busy}
                    error={error}
                    conflict={conflict}
                    onReload={reload}
                    className="shrink-0 border-t border-border/50"
                />
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
        </dialog>
    );
}
