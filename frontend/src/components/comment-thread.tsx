/**
 * Shared pieces of a review-thread surface: identity header, one meta line,
 * a tracker strip that shows only what applies, the reply list and the
 * pinned composer. The floating canvas card and the side panel compose these
 * so both read the same way.
 */

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Cloud, ExternalLink, History, Link2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { commentSeverityBadgeVariant } from "@/components/comment-severity-badge";
import { cn } from "@/lib/utils";
import {
    commentClassLabel,
    commentSeverityLabel,
    type Comment,
    type CommentPermissions,
    type CommentReply,
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

const AVATAR_TONES = [
    "bg-primary/15 text-primary",
    "bg-success/15 text-success",
    "bg-warning/15 text-warning",
    "bg-destructive/10 text-destructive",
    "bg-secondary text-secondary-foreground",
];

function avatarTone(seed: string): string {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

function AuthorAvatar({ name, remote = false, size = "md" }: { name: string; remote?: boolean; size?: "sm" | "md" }) {
    return (
        <Avatar className={size === "md" ? "size-7" : "size-5"} aria-hidden="true">
            <AvatarFallback className={cn(avatarTone(name), size === "sm" && "text-[9px]")}>
                {remote ? <Cloud className={size === "md" ? "size-3.5" : "size-3"} /> : authorInitials(name)}
            </AvatarFallback>
        </Avatar>
    );
}

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
            size="icon-sm"
            className={cn("text-muted-foreground hover:text-foreground", className)}
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

/** `R12 · Major · Task` — the whole classification in one line. */
function CommentMetaLine({ comment, className }: { comment: Comment; className?: string }) {
    const severity = comment.severity ?? "info";
    return (
        <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)} data-testid="comment-meta-line">
            {comment.elementRef ? (
                <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
                    {comment.elementRef}
                </Badge>
            ) : null}
            <Badge variant={commentSeverityBadgeVariant(severity)} className="h-5 px-1.5 text-[10px]">
                {commentSeverityLabel(severity)}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{commentClassLabel(comment.commentClass ?? "general")}</span>
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
            <AuthorAvatar name={comment.author} />
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium leading-5">{comment.author}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground" title={new Date(comment.timestamp).toLocaleString()}>
                        {relativeTime(comment.timestamp)}
                    </span>
                    {comment.status === "RESOLVED" ? (
                        <Badge variant="success" className="ml-auto h-5 px-1.5 text-[10px]" data-testid="comment-status-pill">
                            <Check aria-hidden="true" />
                            Resolved
                        </Badge>
                    ) : null}
                </div>
                <CommentMetaLine comment={comment} />
            </div>
            {actions ? <div className="-mr-1 -mt-1 flex shrink-0 items-center">{actions}</div> : null}
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
    const problem = status === "sync failed" || status === "Inaccessible";
    return (
        <div
            className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}
            data-testid="comment-tracker-strip"
            data-tracker-chip
            data-link-state={tracker.linkState ?? "none"}
            data-sync-state={tracker.syncState ?? "none"}
            data-pending-intent={tracker.pendingIntent ?? ""}
            onClick={(event) => event.stopPropagation()}
        >
            {tracker.linkState && linkedNumber ? (
                <Badge variant="outline" asChild>
                    <a
                        href={tracker.externalUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        data-testid="thread-link-chip"
                        aria-label={`Linked to GitHub #${linkedNumber}`}
                    >
                        <Link2 aria-hidden="true" />
                        GitHub #{linkedNumber}
                        <ExternalLink aria-hidden="true" />
                    </a>
                </Badge>
            ) : (
                <span className="text-xs text-muted-foreground" data-testid="thread-link-chip" title={notPromotable ?? undefined}>
                    {tracker.linkState
                        ? tracker.linkState
                        : tracker.notPromotableReason === "unpinned_anchor"
                          ? "Not linked · unpinned"
                          : "Not linked"}
                </span>
            )}
            {status ? (
                <Badge variant={problem ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]" data-testid="thread-sync-chip">
                    {status}
                </Badge>
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
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        aria-pressed={historyOpen}
                        aria-label="Sync history"
                        title="Sync history"
                        data-testid="sync-history-disclosure"
                        onClick={onToggleHistory}
                    >
                        <History aria-hidden="true" />
                    </Button>
                ) : null}
            </span>
            {notice ? (
                <p
                    className={cn("basis-full text-xs", tracker.pausedReason ? "text-destructive" : "text-warning")}
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
    const list = (
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
                        <AuthorAvatar name={reply.author} remote={reply.origin === "remote"} size="sm" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-1.5 text-[11px]">
                                {attributionUrl ? (
                                    <a
                                        href={attributionUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="truncate font-medium text-foreground underline-offset-2 hover:underline"
                                        data-testid="reply-attribution-link"
                                    >
                                        {attribution}
                                    </a>
                                ) : (
                                    <span className="truncate font-medium" data-testid="reply-attribution">
                                        {attribution}
                                    </span>
                                )}
                                <span className="shrink-0 text-muted-foreground" title={new Date(reply.timestamp).toLocaleString()}>
                                    {relativeTime(reply.timestamp)}
                                </span>
                                {!isEditing && (replyCanEdit || replyCanDelete) ? (
                                    <span className="ml-auto inline-flex shrink-0 items-center gap-0.5">
                                        {replyCanEdit ? (
                                            <Button variant="link" size="xs" className="h-5 px-1 text-[11px] text-muted-foreground" onClick={() => onStartEdit(reply)}>
                                                Edit
                                            </Button>
                                        ) : null}
                                        {replyCanDelete ? (
                                            <Button variant="link" size="xs" className="h-5 px-1 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => onDeleteReply?.(reply)}>
                                                Delete
                                            </Button>
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
    );
    return (
        <div className={cn("px-3 py-2", className)} data-testid="comment-replies" onClick={(event) => event.stopPropagation()}>
            {collapsible ? (
                <Collapsible open={expanded} onOpenChange={setExpanded}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="xs" className="-ml-2 mb-1 h-6 text-[10px] font-medium uppercase tracking-wide text-muted-foreground" aria-expanded={expanded}>
                            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                            {label}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>{list}</CollapsibleContent>
                </Collapsible>
            ) : (
                <>
                    <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                    {list}
                </>
            )}
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
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start font-normal text-muted-foreground"
                    aria-label="Reply"
                    onClick={onOpen}
                >
                    Write a reply…
                </Button>
            )}
        </div>
    );
}
