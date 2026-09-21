/**
 * Thread-level tracker chip — link state, sync state and pending intent stay
 * separate so the UI never collapses inaccessible/deleted/transferred/paused
 * into one ambiguous badge (TR-40, C6/C7/C8).
 */

import { AlertTriangle, ExternalLink, Link2, Unlink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CommentTrackerProjection, LinkState } from "@/types/trackers";

export type ThreadChipVariant = "inline" | "stacked" | "compact";

export interface TrackedThreadChipProps {
    tracker: CommentTrackerProjection | null | undefined;
    /** Provider label for external links, e.g. "GitHub". */
    providerLabel?: string;
    variant?: ThreadChipVariant;
    className?: string;
}

const LINK_LABELS: Record<LinkState, string> = {
    linked: "Linked",
    inaccessible: "Inaccessible",
    deleted: "Deleted on forge",
    transferred: "Transferred",
};

export function isWorkPending(tracker: CommentTrackerProjection | null | undefined): boolean {
    if (!tracker) return false;
    const sync = tracker.syncState ?? "";
    if (sync === "pending" || sync === "sent" || sync === "quarantine") return true;
    return Boolean(tracker.pendingIntent);
}

export function notPromotableLabel(reason?: string | null): string | null {
    if (!reason) return null;
    if (reason === "unpinned_anchor") return "Not promotable — unpinned anchor";
    if (reason === "below_auto_threshold") return "Not promoted — ask a designer";
    return `Not promotable — ${reason.replace(/_/g, " ")}`;
}

export function linkStateBadgeVariant(
    linkState: LinkState | null | undefined,
): "success" | "warning" | "destructive" | "secondary" {
    if (linkState === "linked") return "success";
    if (linkState === "deleted") return "warning";
    if (linkState === "inaccessible" || linkState === "transferred") return "destructive";
    return "secondary";
}

export function syncStateBadgeVariant(
    syncState?: string | null,
): "success" | "warning" | "destructive" | "info" | "secondary" {
    if (syncState === "confirmed") return "success";
    if (syncState === "failed") return "destructive";
    if (syncState === "quarantine") return "warning";
    if (syncState === "sent" || syncState === "pending") return "info";
    return "secondary";
}

export function trackedThreadChipLabel(
    tracker: CommentTrackerProjection | null | undefined,
    providerLabel = "forge",
): string {
    if (!tracker) return "Not linked";

    const notPromotable = notPromotableLabel(tracker.notPromotableReason);
    if (!tracker.linkState && notPromotable) return notPromotable;
    if (!tracker.linkState) return "Not linked";

    const base = LINK_LABELS[tracker.linkState] ?? tracker.linkState;
    if (tracker.linkState === "linked" && (tracker.externalNumber || tracker.externalId)) {
        return `Linked to ${providerLabel} #${tracker.externalNumber ?? tracker.externalId}`;
    }
    return base;
}

const PENDING_INTENT_LABELS: Record<string, string> = {
    add_comment: "Sending reply…",
    edit_comment: "Updating reply…",
    delete_comment: "Removing reply…",
    update_issue: "Updating issue…",
    post_note: "Posting note…",
    create_issue: "Publishing…",
};

/** What the queued outbound work is about to do, in progress tense. */
export function pendingIntentLabel(pendingIntent?: string | null): string | null {
    if (!pendingIntent) return null;
    if (pendingIntent.startsWith("set_state:")) {
        const target = pendingIntent.slice("set_state:".length);
        return target === "open" ? "Reopening issue…" : target === "closed" ? "Closing issue…" : `Setting ${target}…`;
    }
    return PENDING_INTENT_LABELS[pendingIntent] ?? `${pendingIntent.replace(/_/g, " ")}…`;
}

export function remoteStateLabel(
    remoteState?: string | null,
    pendingIntent?: string | null,
): string | null {
    if (!remoteState) return null;
    const pending = pendingIntentLabel(pendingIntent);
    if (pending) {
        return `Remote ${remoteState} (${pending.replace(/…$/, "")})`;
    }
    return `Remote ${remoteState}`;
}

export function bodyAuthorityNotice(bodyAuthority?: string | null): string | null {
    if (bodyAuthority === "forge") {
        return "Issue body edited on GitHub; Prism no longer updates it.";
    }
    return null;
}

export function pausedReasonNotice(pausedReason?: string | null): string | null {
    if (!pausedReason) return null;
    if (pausedReason === "visibility") {
        return "Publication paused until an administrator acknowledges the current destination visibility.";
    }
    if (pausedReason === "auth") {
        return "Connector credentials need attention. Sync is paused until an administrator reconnects.";
    }
    return `Sync paused: ${pausedReason.replace(/_/g, " ")}`;
}

/** Short status suffix for the compact chip; empty when everything is nominal. */
export function compactStatusLabel(tracker: CommentTrackerProjection | null | undefined): string | null {
    if (!tracker?.linkState) return null;
    if (tracker.linkState !== "linked") return LINK_LABELS[tracker.linkState] ?? tracker.linkState;
    const pending = pendingIntentLabel(tracker.pendingIntent);
    if (pending) return pending;
    const sync = tracker.syncState ?? "";
    if (sync === "pending" || sync === "sent") return "Syncing…";
    if (sync === "quarantine" || sync === "failed") return "sync failed";
    if (tracker.remoteState && tracker.remoteState !== "open") return tracker.remoteState;
    return null;
}

function CompactThreadChip({
    tracker,
    providerLabel,
    className,
}: {
    tracker: CommentTrackerProjection | null | undefined;
    providerLabel: string;
    className?: string;
}) {
    const notPromotable = notPromotableLabel(tracker?.notPromotableReason);
    const status = compactStatusLabel(tracker);
    const paused = pausedReasonNotice(tracker?.pausedReason);
    const authority = bodyAuthorityNotice(tracker?.bodyAuthority);
    const number = tracker?.externalNumber ?? tracker?.externalId;

    return (
        <div
            className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs", className)}
            data-tracker-chip
            data-link-state={tracker?.linkState ?? "none"}
            data-sync-state={tracker?.syncState ?? "none"}
            data-pending-intent={tracker?.pendingIntent ?? ""}
        >
            {tracker?.linkState && number ? (
                <a
                    href={tracker.externalUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 font-medium text-foreground hover:underline"
                    data-testid="thread-link-chip"
                    aria-label={`Linked to ${providerLabel} #${number}`}
                >
                    <Link2 className="h-3 w-3" aria-hidden="true" />
                    {providerLabel} #{number}
                    <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
                </a>
            ) : (
                <span
                    className="text-muted-foreground"
                    data-testid="thread-link-chip"
                    title={notPromotable ?? undefined}
                >
                    {tracker?.linkState
                        ? LINK_LABELS[tracker.linkState]
                        : tracker?.notPromotableReason === "unpinned_anchor"
                          ? "Unpinned · not promotable"
                          : notPromotable ?? "Not linked"}
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
            {paused ? (
                <p className="flex basis-full items-start gap-1 text-destructive" role="alert" data-testid="paused-reason">
                    <Unlink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    {paused}
                </p>
            ) : null}
            {authority ? (
                <p className="flex basis-full items-start gap-1 text-warning" role="note" data-testid="body-authority-note">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    {authority}
                </p>
            ) : null}
        </div>
    );
}

export function TrackedThreadChip({
    tracker,
    providerLabel = "GitHub",
    variant = "inline",
    className,
}: TrackedThreadChipProps) {
    if (variant === "compact") {
        return <CompactThreadChip tracker={tracker} providerLabel={providerLabel} className={className} />;
    }
    const label = trackedThreadChipLabel(tracker, providerLabel);
    const pending = pendingIntentLabel(tracker?.pendingIntent);
    const remote = remoteStateLabel(tracker?.remoteState, tracker?.pendingIntent);
    const authority = bodyAuthorityNotice(tracker?.bodyAuthority);
    const paused = pausedReasonNotice(tracker?.pausedReason);
    const misleadingSuccess =
        tracker?.linkState === "linked" && isWorkPending(tracker) && tracker?.syncState === "confirmed";

    return (
        <div
            className={cn(
                variant === "stacked" ? "space-y-1" : "flex flex-wrap items-center gap-2",
                className,
            )}
            data-tracker-chip
            data-link-state={tracker?.linkState ?? "none"}
            data-sync-state={tracker?.syncState ?? "none"}
            data-pending-intent={tracker?.pendingIntent ?? ""}
        >
            <Badge
                variant={linkStateBadgeVariant(tracker?.linkState)}
                data-testid="thread-link-chip"
                aria-label={label}
                tabIndex={0}
            >
                <Link2 className="mr-1 h-3 w-3" aria-hidden="true" />
                {label}
            </Badge>

            {tracker?.syncState ? (
                <Badge
                    variant={syncStateBadgeVariant(tracker.syncState)}
                    data-testid="thread-sync-chip"
                >
                    {tracker.syncState}
                </Badge>
            ) : null}

            {pending ? (
                <Badge variant="info" data-testid="thread-pending-chip">
                    {pending}
                </Badge>
            ) : null}

            {remote ? (
                <span className="text-xs text-muted-foreground" data-testid="thread-remote-state">
                    {remote}
                </span>
            ) : null}

            {tracker?.externalUrl ? (
                <a
                    href={tracker.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                    data-testid="thread-external-link"
                >
                    Open on {providerLabel}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
            ) : null}

            {authority ? (
                <p className="flex items-start gap-1 text-xs text-warning" role="note" data-testid="body-authority-note">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {authority}
                </p>
            ) : null}

            {paused ? (
                <p className="flex items-start gap-1 text-xs text-destructive" role="alert" data-testid="paused-reason">
                    <Unlink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {paused}
                </p>
            ) : null}

            {misleadingSuccess ? (
                <p className="text-xs text-destructive" role="alert" data-testid="misleading-success-guard">
                    Sync still in progress — remote state may change when the worker finishes.
                </p>
            ) : null}
        </div>
    );
}
