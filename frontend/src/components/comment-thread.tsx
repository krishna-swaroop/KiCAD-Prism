/**
 * Shared pieces of a review-thread surface: identity header, one meta line,
 * a tracker strip that shows only what applies, the reply list and the
 * pinned composer. The floating canvas card and the side panel compose these
 * so both read the same way.
 */

import { useState, type ReactNode } from "react";
import { Check, Cloud, ExternalLink, History, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    commentClassLabel,
    commentSeverityLabel,
    type Comment,
    type CommentPermissions,
    type CommentReply,
    type CommentSeverity,
} from "@/types/comments";
import type { CommentTrackerProjection, ProjectTrackerSettings } from "@/types/trackers";
import { CommentEditor, actionAllowed } from "@/components/tracker-integration/comment-editor";
import { PromotionControl } from "@/components/tracker-integration/promotion-control";
import {
    RemoteReply,
    remoteAttributionLabel,
    remoteAttributionLink,
    type DiscussionReply,
} from "@/components/tracker-integration/remote-reply";
import { SyncHistory } from "@/components/tracker-integration/sync-history";
import {
    bodyAuthorityNotice,
    compactStatusLabel,
    notPromotableLabel,
    pausedReasonNotice,
} from "@/components/tracker-integration/tracked-thread-chip";

export type CommentTrackerHostSettings = Pick<
    ProjectTrackerSettings,
    "destination" | "acknowledgement" | "promoteMinRole" | "autoMinSeverity" | "autoTaskClass"
>;

export function relativeTime(iso: string, now: Date = new Date()): string {
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return "";
    const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
    if (seconds < 45) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return then.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: then.getFullYear() === now.getFullYear() ? undefined : "numeric",
    });
}

export function authorInitials(name: string): string {
    const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_HUES = [210, 262, 330, 20, 150, 45];

function avatarHue(seed: string): number {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    return AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
}

function Avatar({ name, remote = false, size = "md" }: { name: string; remote?: boolean; size?: "sm" | "md" }) {
    const hue = avatarHue(name);
    return (
        <span
            aria-hidden="true"
            className={cn(
                "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white",
                size === "md" ? "h-7 w-7 text-[11px]" : "h-5 w-5 text-[9px]",
            )}
            style={{ backgroundColor: `hsl(${hue} 45% 48%)` }}
        >
            {remote ? <Cloud className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} /> : authorInitials(name)}
        </span>
    );
}

const SEVERITY_DOT: Record<CommentSeverity, string> = {
    info: "bg-primary",
    minor: "bg-success",
    major: "bg-warning",
    critical: "bg-destructive",
};

export function IconAction({
    label,
    onClick,
    className,
    children,
}: {
    label: string;
    onClick: () => void;
    className?: string;
    children: ReactNode;
}) {
    return (
        <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", className)}
            aria-label={label}
            title={label}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
        >
            {children}
        </Button>
    );
}

function ResolvedPill() {
    return (
        <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success"
            data-testid="comment-status-pill"
        >
            <Check className="h-3 w-3" aria-hidden="true" />
            Resolved
        </span>
    );
}

/** `R12 · Major · Task` — the whole classification in one muted line. */
function CommentMetaLine({ comment, className }: { comment: Comment; className?: string }) {
    const severity = comment.severity ?? "info";
    return (
        <div
            className={cn("flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground", className)}
            data-testid="comment-meta-line"
        >
            {comment.elementRef ? (
                <>
                    <span className="truncate font-mono text-foreground/80">{comment.elementRef}</span>
                    <span aria-hidden="true">·</span>
                </>
            ) : null}
            <span className="inline-flex items-center gap-1" title={`Severity: ${commentSeverityLabel(severity)}`}>
                <span className={cn("h-1.5 w-1.5 rounded-full", SEVERITY_DOT[severity])} aria-hidden="true" />
                {commentSeverityLabel(severity)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{commentClassLabel(comment.commentClass ?? "general")}</span>
        </div>
    );
}

export function CommentHeader({
    comment,
    actions,
    className,
}: {
    comment: Comment;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex items-start gap-2.5", className)}>
            <Avatar name={comment.author} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold leading-5">{comment.author}</span>
                    <span
                        className="shrink-0 text-[11px] text-muted-foreground"
                        title={new Date(comment.timestamp).toLocaleString()}
                    >
                        {relativeTime(comment.timestamp)}
                    </span>
                    {comment.status === "RESOLVED" ? <span className="ml-auto"><ResolvedPill /></span> : null}
                </div>
                <CommentMetaLine comment={comment} className="mt-0.5" />
            </div>
            {actions ? <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">{actions}</div> : null}
        </div>
    );
}

export function CommentMentions({ comment, className }: { comment: Comment; className?: string }) {
    if (!comment.mentions || comment.mentions.length === 0) return null;
    return (
        <p className={cn("text-[11px] text-muted-foreground", className)} data-testid="comment-mentions">
            {comment.mentions.map((mention) => `@${mention.displayName}`).join("  ")}
        </p>
    );
}

/**
 * One line of tracker state: the GitHub link (or "Not linked"), a status word
 * only when something is not nominal, and the actions that apply right now.
 */
export function TrackerStrip({
    projectId,
    comment,
    tracker,
    settings,
    autoEligible,
    historyOpen,
    onToggleHistory,
    onTrackerChange,
    className,
}: {
    projectId: string;
    comment: Comment;
    tracker: CommentTrackerProjection;
    settings: CommentTrackerHostSettings;
    autoEligible: boolean;
    historyOpen: boolean;
    onToggleHistory: () => void;
    onTrackerChange?: (commentId: string, tracker: CommentTrackerProjection) => void;
    className?: string;
}) {
    const linkedNumber = tracker.externalNumber ?? tracker.externalId;
    const status = compactStatusLabel(tracker);
    const notice = pausedReasonNotice(tracker.pausedReason) ?? bodyAuthorityNotice(tracker.bodyAuthority);
    const notPromotable = notPromotableLabel(tracker.notPromotableReason);
    return (
        <div
            className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]", className)}
            data-testid="comment-tracker-strip"
            data-tracker-chip
            data-link-state={tracker.linkState ?? "none"}
            data-sync-state={tracker.syncState ?? "none"}
            data-pending-intent={tracker.pendingIntent ?? ""}
            onClick={(event) => event.stopPropagation()}
        >
            {tracker.linkState && linkedNumber ? (
                <a
                    href={tracker.externalUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                    data-testid="thread-link-chip"
                    aria-label={`Linked to GitHub #${linkedNumber}`}
                >
                    <Link2 className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    GitHub #{linkedNumber}
                    <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                </a>
            ) : (
                <span className="text-muted-foreground" data-testid="thread-link-chip" title={notPromotable ?? undefined}>
                    {tracker.linkState
                        ? tracker.linkState
                        : tracker.notPromotableReason === "unpinned_anchor"
                          ? "Not linked · unpinned"
                          : "Not linked"}
                </span>
            )}
            {status ? (
                <span
                    className={cn(
                        "text-muted-foreground",
                        (status === "sync failed" || status === "Inaccessible") && "text-destructive",
                    )}
                    data-testid="thread-sync-chip"
                >
                    {status}
                </span>
            ) : null}
            <span className="ml-auto inline-flex items-center gap-1">
                <PromotionControl
                    variant="compact"
                    projectId={projectId}
                    commentId={comment.id}
                    tracker={tracker}
                    permissions={comment.permissions}
                    settings={settings}
                    autoEligible={autoEligible}
                    onTrackerChange={(next) => onTrackerChange?.(comment.id, next)}
                />
                {tracker.linkState ? (
                    <button
                        type="button"
                        className={cn(
                            "inline-flex h-6 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground",
                            historyOpen && "bg-muted text-foreground",
                        )}
                        aria-pressed={historyOpen}
                        aria-label="Sync history"
                        title="Sync history"
                        data-testid="sync-history-disclosure"
                        onClick={onToggleHistory}
                    >
                        <History className="h-3 w-3" aria-hidden="true" />
                    </button>
                ) : null}
            </span>
            {notice ? (
                <p
                    className={cn("basis-full", tracker.pausedReason ? "text-destructive" : "text-warning")}
                    role={tracker.pausedReason ? "alert" : "note"}
                    data-testid={tracker.pausedReason ? "paused-reason" : "body-authority-note"}
                >
                    {notice}
                </p>
            ) : null}
        </div>
    );
}

export function SyncHistorySection({ projectId, commentId }: { projectId: string; commentId: string }) {
    return (
        <div className="border-t bg-muted/30 px-3 py-2 text-xs" onClick={(event) => event.stopPropagation()}>
            <SyncHistory projectId={projectId} commentId={commentId} />
        </div>
    );
}

export interface ReplyListProps {
    comment: Comment;
    replies: CommentReply[];
    permissions?: CommentPermissions | null;
    editingReplyId: string | null;
    busy: boolean;
    error: string | null;
    conflict: boolean;
    idPrefix: string;
    onStartEdit: (reply: CommentReply) => void;
    onCancelEdit: () => void;
    onSubmitEdit: (reply: CommentReply, content: string) => Promise<void>;
    onDeleteReply?: (reply: CommentReply) => void;
    canEditReplies: boolean;
    onReload?: () => void;
    /** Collapsible list (side panel) vs always expanded (floating card). */
    collapsible?: boolean;
    className?: string;
}

export function ReplyList({
    replies,
    permissions,
    editingReplyId,
    busy,
    error,
    conflict,
    idPrefix,
    onStartEdit,
    onCancelEdit,
    onSubmitEdit,
    onDeleteReply,
    canEditReplies,
    onReload,
    collapsible = false,
    className,
}: ReplyListProps) {
    const [expanded, setExpanded] = useState(true);
    if (replies.length === 0) return null;
    const label = replies.length === 1 ? "1 reply" : `${replies.length} replies`;
    return (
        <div className={cn("px-3 py-2", className)} data-testid="comment-replies" onClick={(event) => event.stopPropagation()}>
            {collapsible ? (
                <button
                    type="button"
                    className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    onClick={() => setExpanded((open) => !open)}
                    aria-expanded={expanded}
                >
                    {expanded ? "▾" : "▸"} {label}
                </button>
            ) : (
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            )}
            {expanded ? (
                <ol className="space-y-2.5">
                    {replies.map((reply) => {
                        const replyCanEdit = canEditReplies && actionAllowed(reply.permissions, "canEdit", false);
                        const replyCanDelete = Boolean(onDeleteReply) && actionAllowed(reply.permissions, "canDelete", false);
                        const discussionReply = reply as DiscussionReply;
                        const attribution = remoteAttributionLabel(discussionReply);
                        const attributionUrl = remoteAttributionLink(discussionReply.remoteAttribution);
                        const isEditing = editingReplyId === reply.id;
                        return (
                            <li key={reply.id} className="flex gap-2">
                                <Avatar name={reply.author} remote={reply.origin === "remote"} size="sm" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-1.5 text-[11px]">
                                        {attributionUrl ? (
                                            <a
                                                href={attributionUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="truncate font-semibold text-foreground hover:underline"
                                                data-testid="reply-attribution-link"
                                            >
                                                {attribution}
                                            </a>
                                        ) : (
                                            <span className="truncate font-semibold" data-testid="reply-attribution">
                                                {attribution}
                                            </span>
                                        )}
                                        <span className="shrink-0 text-muted-foreground" title={new Date(reply.timestamp).toLocaleString()}>
                                            {relativeTime(reply.timestamp)}
                                        </span>
                                        {!isEditing && (replyCanEdit || replyCanDelete) ? (
                                            <span className="ml-auto inline-flex shrink-0 gap-2 text-muted-foreground">
                                                {replyCanEdit ? (
                                                    <button type="button" className="hover:text-foreground hover:underline" onClick={() => onStartEdit(reply)}>
                                                        Edit
                                                    </button>
                                                ) : null}
                                                {replyCanDelete ? (
                                                    <button type="button" className="hover:text-destructive hover:underline" onClick={() => onDeleteReply?.(reply)}>
                                                        Delete
                                                    </button>
                                                ) : null}
                                            </span>
                                        ) : null}
                                    </div>
                                    {isEditing ? (
                                        <CommentEditor
                                            id={`${idPrefix}-edit-reply-${reply.id}`}
                                            label="Edit reply"
                                            hideLabel
                                            compact
                                            className="mt-1"
                                            initialValue={reply.content}
                                            submitLabel="Save"
                                            busy={busy}
                                            error={error}
                                            conflict={conflict}
                                            onReload={onReload}
                                            onCancel={onCancelEdit}
                                            onSubmit={(content) => onSubmitEdit(reply, content)}
                                        />
                                    ) : (
                                        <RemoteReply reply={discussionReply} permissions={permissions} compact bare />
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            ) : null}
        </div>
    );
}

export function ReplyComposer({
    open,
    onOpen,
    onCancel,
    onSubmit,
    busy,
    error,
    conflict,
    onReload,
    id,
    className,
}: {
    open: boolean;
    onOpen: () => void;
    onCancel: () => void;
    onSubmit: (content: string) => Promise<void>;
    busy: boolean;
    error: string | null;
    conflict: boolean;
    onReload?: () => void;
    id: string;
    className?: string;
}) {
    return (
        <div className={cn("px-3 py-2", className)} onClick={(event) => event.stopPropagation()}>
            {open ? (
                <CommentEditor
                    id={id}
                    label="Reply"
                    hideLabel
                    compact
                    submitLabel="Reply"
                    placeholder="Write a reply…"
                    busy={busy}
                    error={error}
                    conflict={conflict}
                    onReload={onReload}
                    onCancel={onCancel}
                    onSubmit={onSubmit}
                />
            ) : (
                <button
                    type="button"
                    className="flex h-8 w-full items-center rounded-md border bg-muted/40 px-2.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Reply"
                    onClick={onOpen}
                >
                    Write a reply…
                </button>
            )}
        </div>
    );
}
