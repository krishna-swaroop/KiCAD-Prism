/**
 * Remote reply rendering — attribution, tombstones and unsynced_local badges
 * (TR-40, C6/D4/D8).
 */

import { Cloud, Share2, Trash2, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PermissionHint } from "@/components/ui/permission-hint";
import { cn } from "@/lib/utils";
import type { CommentPermissions, CommentReply, RemoteAttribution } from "@/types/comments";

import { unlinkedAssignmentHint } from "./connected-accounts";

export interface ReplySyncProjection {
    state: string;
    reason?: string | null;
    externalCommentId?: string | null;
    externalUrl?: string | null;
}

export type DiscussionReply = CommentReply & { sync?: ReplySyncProjection | null };

export interface RemoteReplyProps {
    reply: DiscussionReply;
    permissions?: CommentPermissions | null;
    assignmentHints?: string[];
    providerLabel?: string;
    onShare?: () => void | Promise<void>;
    shareBusy?: boolean;
    className?: string;
}

export function replySyncBadgeVariant(state: string): "success" | "warning" | "destructive" | "info" | "secondary" {
    if (state === "confirmed" || state === "linked") return "success";
    if (state === "unsynced_local") return "warning";
    if (state === "failed") return "destructive";
    if (state === "sent" || state === "pending") return "info";
    return "secondary";
}

export function replySyncLabel(sync?: ReplySyncProjection | null): string | null {
    if (!sync) return null;
    if (sync.state === "unsynced_local") {
        return sync.reason === "publication_required"
            ? "Not shared to GitHub — viewer"
            : "Not shared to tracker";
    }
    if (sync.state === "confirmed" || sync.state === "linked") return "Shared to tracker";
    return sync.state.replace(/_/g, " ");
}

export function remoteAttributionLabel(
    reply: Pick<DiscussionReply, "author" | "authorKind" | "remoteAttribution">,
    providerLabel = "GitHub",
): string {
    if (reply.authorKind === "remote" && reply.remoteAttribution?.login) {
        return `${reply.remoteAttribution.login} on ${providerLabel}`;
    }
    if (reply.authorKind === "legacy") {
        return `${reply.author} (Prism, unverified)`;
    }
    return reply.author;
}

export function remoteAttributionLink(attribution?: RemoteAttribution | null): string | null {
    return attribution?.url?.trim() || null;
}

export function tombstoneMessage(reply: Pick<DiscussionReply, "deletedAt" | "origin">): string | null {
    if (!reply.deletedAt) return null;
    if (reply.origin === "remote") return "Deleted on the forge. History is retained locally.";
    return "Deleted in Prism. A deletion note may still sync when publication allows.";
}

export function canShareReply(
    reply: DiscussionReply,
    permissions?: CommentPermissions | null,
): boolean {
    return reply.sync?.state === "unsynced_local" && Boolean(permissions?.canPublish) && !reply.deletedAt;
}

export function RemoteReply({
    reply,
    permissions,
    assignmentHints = [],
    providerLabel = "GitHub",
    onShare,
    shareBusy = false,
    className,
}: RemoteReplyProps) {
    const tombstone = tombstoneMessage(reply);
    const syncLabel = replySyncLabel(reply.sync);
    const attribution = remoteAttributionLabel(reply, providerLabel);
    const attributionUrl = remoteAttributionLink(reply.remoteAttribution);
    const shareAllowed = canShareReply(reply, permissions);

    return (
        <article
            className={cn("space-y-2 rounded-md border border-border bg-muted/10 p-3", className)}
            data-reply-id={reply.id}
            data-reply-origin={reply.origin}
            data-reply-sync={reply.sync?.state ?? "none"}
            aria-label={`Reply by ${attribution}`}
        >
            <header className="flex flex-wrap items-center gap-2">
                {reply.origin === "remote" ? (
                    <Cloud className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                    <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
                {attributionUrl ? (
                    <a
                        href={attributionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                        data-testid="reply-attribution-link"
                    >
                        {attribution}
                    </a>
                ) : (
                    <span className="text-sm font-medium" data-testid="reply-attribution">
                        {attribution}
                    </span>
                )}
                {syncLabel ? (
                    <Badge variant={replySyncBadgeVariant(reply.sync?.state ?? "")} data-testid="reply-sync-badge">
                        {syncLabel}
                    </Badge>
                ) : null}
            </header>

            {tombstone ? (
                <p className="flex items-start gap-2 text-sm text-muted-foreground" role="note" data-testid="reply-tombstone">
                    <Trash2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{tombstone}</span>
                </p>
            ) : (
                <p className="text-sm whitespace-pre-wrap" data-testid="reply-content">{reply.content}</p>
            )}

            {assignmentHints.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground" data-testid="assignment-hints">
                    {assignmentHints.map((hint) => (
                        <li key={hint}>Assignment hint: {hint}</li>
                    ))}
                    <li>{unlinkedAssignmentHint()}</li>
                </ul>
            ) : null}

            {shareAllowed ? (
                <PermissionHint blocked={!permissions?.canPublish} action="share replies to the tracker" allowedRoles={["designer", "admin"]}>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={shareBusy}
                        onClick={() => void onShare?.()}
                        data-testid="share-reply-button"
                        aria-label="Share to GitHub"
                    >
                        <Share2 className="mr-1 h-4 w-4" aria-hidden="true" />
                        Share to GitHub
                    </Button>
                </PermissionHint>
            ) : null}
        </article>
    );
}
