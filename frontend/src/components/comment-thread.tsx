/**
 * Shared pieces of a review-thread surface: identity header, one meta line,
 * a tracker strip that shows only what applies, the reply list and the
 * pinned composer. The floating canvas card and the side panel compose these
 * so both read the same way.
 */

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Cloud, ExternalLink, History, Pencil, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

const SEVERITY_TONE: Record<string, string> = {
    critical: "text-destructive",
    major: "text-warning",
    minor: "text-success",
};

/**
 * One quiet line under the author: `5h ago · Major · General · R12`. The
 * classification reads as metadata, so the comment body below it is the
 * only thing on the card set in body type.
 */
function CommentMetaLine({ comment, className }: { comment: Comment; className?: string }) {
    const severity = comment.severity ?? "info";
    return (
        <div
            className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-muted-foreground", className)}
            data-testid="comment-meta-line"
        >
            <span title={new Date(comment.timestamp).toLocaleString()}>{relativeTime(comment.timestamp)}</span>
            <span aria-hidden="true">·</span>
            <span className={cn("font-medium", SEVERITY_TONE[severity] ?? "text-foreground/80")}>
                {commentSeverityLabel(severity)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{commentClassLabel(comment.commentClass ?? "general")}</span>
            {comment.elementRef ? (
                <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{comment.elementRef}</span>
                </>
            ) : null}
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
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold leading-5">{comment.author}</span>
                    {comment.status === "RESOLVED" ? (
                        <Badge variant="success" className="h-4 gap-0.5 px-1 text-[10px]" data-testid="comment-status-pill">
                            <Check aria-hidden="true" className="size-2.5" />
                            Resolved
                        </Badge>
                    ) : null}
                </div>
                <CommentMetaLine comment={comment} />
            </div>
            {actions ? <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">{actions}</div> : null}
        </div>
    );
}

/** The root text: the one element on the card set in body type. */
export function CommentBody({ content, className }: { content: string; className?: string }) {
    return (
        <p className={cn("whitespace-pre-wrap text-sm leading-6 text-foreground", className)} data-testid="comment-body">
            {content}
        </p>
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

function GitHubMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-3.5 fill-current", className)}>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
    );
}

/**
 * One quiet line of tracker state under the body: a small `GitHub #12` link
 * (or "Not linked"), a status word only when something is not nominal, and
 * the actions that apply right now. No band, no box — it reads as a footnote
 * to the comment, not as a second header.
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
            className={cn("flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground", className)}
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
                    className="inline-flex items-center gap-1 font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
                    data-testid="thread-link-chip"
                    aria-label={`Linked to GitHub #${linkedNumber}`}
                >
                    <GitHubMark />
                    GitHub #{linkedNumber}
                    <ExternalLink aria-hidden="true" className="size-3 opacity-60" />
                </a>
            ) : (
                <span data-testid="thread-link-chip" title={notPromotable ?? undefined}>
                    {tracker.linkState
                        ? tracker.linkState
                        : tracker.notPromotableReason === "unpinned_anchor"
                          ? "Not linked · unpinned"
                          : "Not linked"}
                </span>
            )}
            {status ? (
                <Badge variant={problem ? "destructive" : "secondary"} className="h-4 px-1 text-[10px]" data-testid="thread-sync-chip">
                    {status}
                </Badge>
            ) : null}
            <span className="ml-auto inline-flex items-center gap-0.5">
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
                        className={cn("text-muted-foreground", historyOpen && "bg-accent text-foreground")}
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
                    className={cn("basis-full text-[11px] leading-4", tracker.pausedReason ? "text-destructive" : "text-warning")}
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
        <div className="border-t border-border/50 bg-muted/20 px-3 py-2 text-xs" onClick={(event) => event.stopPropagation()}>
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
        <ol className="divide-y divide-border/40">
            {replies.map((reply) => {
                const replyCanEdit = canEditReplies && actionAllowed(reply.permissions, "canEdit", false);
                const replyCanDelete = Boolean(onDeleteReply) && actionAllowed(reply.permissions, "canDelete", false);
                const discussionReply = reply as DiscussionReply;
                const attribution = remoteAttributionLabel(discussionReply);
                const attributionUrl = remoteAttributionLink(discussionReply.remoteAttribution);
                const isEditing = editingReplyId === reply.id;
                return (
                    <li key={reply.id} className="group/reply flex gap-2.5 px-3 py-2.5">
                        <AuthorAvatar name={reply.author} remote={reply.origin === "remote"} size="sm" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 leading-4">
                                {attributionUrl ? (
                                    <a
                                        href={attributionUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="truncate text-xs font-semibold text-foreground underline-offset-2 hover:underline"
                                        data-testid="reply-attribution-link"
                                    >
                                        {attribution}
                                    </a>
                                ) : (
                                    <span className="truncate text-xs font-semibold" data-testid="reply-attribution">
                                        {attribution}
                                    </span>
                                )}
                                <span className="shrink-0 text-[11px] text-muted-foreground" title={new Date(reply.timestamp).toLocaleString()}>
                                    {relativeTime(reply.timestamp)}
                                </span>
                                {!isEditing && (replyCanEdit || replyCanDelete) ? (
                                    <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/reply:opacity-100">
                                        {replyCanEdit ? (
                                            <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label="Edit reply" title="Edit reply" onClick={() => onStartEdit(reply)}>
                                                <Pencil aria-hidden="true" />
                                            </Button>
                                        ) : null}
                                        {replyCanDelete ? (
                                            <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive" aria-label="Delete reply" title="Delete reply" onClick={() => onDeleteReply?.(reply)}>
                                                <Trash2 aria-hidden="true" />
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
                                    className="mt-1.5"
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
                                <RemoteReply reply={discussionReply} permissions={permissions} compact bare className="mt-0.5 [&_[data-testid=reply-content]]:text-[13px] [&_[data-testid=reply-content]]:leading-5" />
                            )}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
    return (
        <div className={className} data-testid="comment-replies" onClick={(event) => event.stopPropagation()}>
            {collapsible ? (
                <Collapsible open={expanded} onOpenChange={setExpanded}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="xs" className="mx-1.5 mt-1 h-6 text-[11px] text-muted-foreground" aria-expanded={expanded}>
                            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                            {label}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>{list}</CollapsibleContent>
                </Collapsible>
            ) : (
                list
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
                    placeholder="Reply…"
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
                    className="flex h-8 w-full items-center border border-input bg-background/40 px-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-ring/50 hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Reply"
                    onClick={onOpen}
                >
                    Reply…
                </button>
            )}
        </div>
    );
}
