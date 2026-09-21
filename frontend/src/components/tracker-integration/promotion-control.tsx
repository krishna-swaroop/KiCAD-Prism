/**
 * Manual/auto promotion, retry and re-promotion controls (TR-40, C4/C8).
 *
 * Destination is always disclosed before a promote action. Capabilities come
 * from comment permissions — the UI never re-derives publication policy.
 */

import { useCallback, useState } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PermissionHint } from "@/components/ui/permission-hint";
import type { CommentPermissions } from "@/types/comments";
import type { CommentTrackerProjection, ProjectTrackerSettings } from "@/types/trackers";

import { DestinationDisclosure } from "./destination-disclosure";
import {
    promoteComment,
    repromoteComment,
    retryThreadSync,
    TrackerApiError,
    unlinkThread,
} from "@/lib/trackers-client";

export function canRepromoteThread(
    tracker: CommentTrackerProjection | null | undefined,
    permissions?: CommentPermissions | null,
): boolean {
    if (!permissions?.canPublish) return false;
    return tracker?.linkState === "deleted";
}

export function canUnlinkThread(
    tracker: CommentTrackerProjection | null | undefined,
    permissions?: CommentPermissions | null,
): boolean {
    if (!permissions?.canPublish) return false;
    if (!tracker?.linkState) return false;
    if (tracker.linkState === "deleted") return false;
    return true;
}

export function promotionActionLabel(tracker: CommentTrackerProjection | null | undefined): string {
    if (tracker?.linkState === "deleted") return "Promote again";
    return "Promote";
}

export function publicationDeniedReason(
    tracker: CommentTrackerProjection | null | undefined,
    permissions?: CommentPermissions | null,
    promoteMinRole = "designer",
): string | null {
    if (permissions?.canPublish) return null;
    if (tracker?.linkState === "inaccessible") {
        return "This linked issue is inaccessible. Promote again is not available until access is restored or the issue is confirmed deleted.";
    }
    if (tracker?.linkState === "transferred") {
        return "The linked issue moved to another repository. An administrator must approve the new destination.";
    }
    const role = promoteMinRole === "viewer" ? "viewer (when opted in)" : "designer";
    return `Not shared to GitHub — ${role} publication required.`;
}

export interface PromotionControlProps {
    projectId: string;
    commentId: string;
    tracker: CommentTrackerProjection | null | undefined;
    permissions?: CommentPermissions | null;
    settings: Pick<ProjectTrackerSettings, "destination" | "acknowledgement" | "promoteMinRole">;
    /** When true the thread would auto-promote under current policy (disclosure only). */
    autoEligible?: boolean;
    /**
     * `compact` renders only the actions that apply right now (a floating card
     * has no room for disabled buttons) and folds the destination into one line
     * plus the confirm dialog.
     */
    variant?: "full" | "compact";
    className?: string;
    onTrackerChange?: (tracker: CommentTrackerProjection) => void;
}

export function canRetrySync(tracker: CommentTrackerProjection | null | undefined): boolean {
    if (!tracker || tracker.linkState !== "linked") return false;
    const syncState = tracker.syncState ?? "";
    if (syncState === "failed" || syncState === "quarantine") return true;
    const lastError = tracker.lastError;
    return Boolean(lastError?.retryable);
}

export function canInitialPromote(
    tracker: CommentTrackerProjection | null | undefined,
    permissions?: CommentPermissions | null,
): boolean {
    if (!permissions?.canPublish) return false;
    if (tracker?.notPromotableReason) return false;
    if (!tracker?.linkState) return true;
    return false;
}

export function describePromotionError(error: unknown, fallback = "Tracker request failed"): string {
    if (error instanceof TrackerApiError) {
        if (error.isPermission) {
            return error.message || "Publication is not allowed for your role on this project.";
        }
        if (error.code === "visibility_ack_required") {
            return "Public destination requires administrator acknowledgement before promotion can resume.";
        }
        return error.message || fallback;
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}

export function PromotionControl({
    projectId,
    commentId,
    tracker,
    permissions,
    settings,
    autoEligible = false,
    variant = "full",
    className,
    onTrackerChange,
}: PromotionControlProps) {
    const compact = variant === "compact";
    const [busy, setBusy] = useState<"promote" | "retry" | "unlink" | null>(null);
    const [confirmPromote, setConfirmPromote] = useState(false);
    const [confirmUnlink, setConfirmUnlink] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canPromote = canInitialPromote(tracker, permissions);
    const canRepromote = canRepromoteThread(tracker, permissions);
    const canUnlink = canUnlinkThread(tracker, permissions);
    const canRetry = canRetrySync(tracker) && Boolean(permissions?.canPublish);
    const deniedReason = publicationDeniedReason(tracker, permissions, settings.promoteMinRole);
    const promoteLabel = promotionActionLabel(tracker);

    const runPromote = useCallback(async () => {
        setBusy("promote");
        setError(null);
        try {
            const projection = canRepromote
                ? await repromoteComment(projectId, commentId)
                : await promoteComment(projectId, commentId);
            onTrackerChange?.(projection);
            toast.success(canRepromote ? "Re-promotion queued" : "Promotion queued");
        } catch (reason) {
            const message = describePromotionError(reason);
            setError(message);
            toast.error(message);
        } finally {
            setBusy(null);
            setConfirmPromote(false);
        }
    }, [canRepromote, commentId, onTrackerChange, projectId]);

    const runRetry = useCallback(async () => {
        setBusy("retry");
        setError(null);
        try {
            const projection = await retryThreadSync(projectId, commentId);
            onTrackerChange?.(projection);
            toast.success("Retry queued");
        } catch (reason) {
            const message = describePromotionError(reason);
            setError(message);
            toast.error(message);
        } finally {
            setBusy(null);
        }
    }, [commentId, onTrackerChange, projectId]);

    const runUnlink = useCallback(async () => {
        setBusy("unlink");
        setError(null);
        try {
            const projection = await unlinkThread(projectId, commentId);
            onTrackerChange?.(projection);
            toast.success("Thread unlinked from tracker");
        } catch (reason) {
            const message = describePromotionError(reason, "Failed to unlink tracker thread");
            setError(message);
            toast.error(message);
        } finally {
            setBusy(null);
            setConfirmUnlink(false);
        }
    }, [commentId, onTrackerChange, projectId]);

    const showDestination = canPromote || canRepromote || autoEligible;
    const allowedRoles: Array<"viewer" | "designer" | "admin"> =
        settings.promoteMinRole === "viewer" ? ["viewer", "designer", "admin"] : ["designer", "admin"];
    // In the compact card a viewer still sees a (disabled) Promote with the
    // role hint on an unlinked thread; linked threads only show what applies.
    const showPromote = !compact || canPromote || canRepromote || (!tracker?.linkState && !tracker?.notPromotableReason);
    const showRetry = !compact || canRetry;
    const showUnlink = !compact || canUnlink;
    const destinationPath = settings.destination?.containerPath ?? "";

    return (
        <div className={className} data-tracker-promotion>
            {showDestination && !compact ? (
                <DestinationDisclosure
                    variant="compact"
                    destination={settings.destination}
                    acknowledgement={settings.acknowledgement ?? null}
                    className="mb-2"
                />
            ) : null}

            {showDestination && compact && !tracker?.linkState ? (
                <p className="mb-1.5 truncate text-xs text-muted-foreground" data-testid="destination-line">
                    {autoEligible ? "Auto-promotes to " : "Promotes to "}
                    <span className="font-medium text-foreground">{destinationPath}</span>
                    {settings.destination?.visibility === "public" ? " (public)" : ""}
                </p>
            ) : null}

            {autoEligible && !tracker?.linkState && !compact ? (
                <p className="mb-2 text-xs text-muted-foreground" data-testid="auto-promote-disclosure">
                    This comment meets auto-promotion rules and will publish to the destination above when allowed.
                </p>
            ) : null}

            {deniedReason && !permissions?.canPublish ? (
                <p className="mb-2 text-xs text-muted-foreground" role="note" data-testid="publication-denied-note">
                    {deniedReason}{compact ? "" : " Local comment actions remain available."}
                </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
                {showPromote ? (
                    <PermissionHint
                        blocked={!canPromote && !canRepromote && Boolean(promoteLabel)}
                        action="publish comments to the tracker"
                        allowedRoles={allowedRoles}
                    >
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className={compact ? "h-7 px-2 text-xs" : undefined}
                            disabled={(!canPromote && !canRepromote) || busy !== null || Boolean(tracker?.notPromotableReason)}
                            onClick={() => setConfirmPromote(true)}
                            data-testid="promote-button"
                            aria-label={promoteLabel}
                        >
                            {busy === "promote" ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                                <Upload className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            {promoteLabel}
                        </Button>
                    </PermissionHint>
                ) : null}

                {showRetry ? (
                    <PermissionHint blocked={!canRetry} action="retry tracker sync" allowedRoles={allowedRoles}>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={compact ? "h-7 px-2 text-xs" : undefined}
                            disabled={!canRetry || busy !== null}
                            onClick={() => void runRetry()}
                            data-testid="retry-sync-button"
                            aria-label="Retry sync"
                        >
                            {busy === "retry" ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                                <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Retry sync
                        </Button>
                    </PermissionHint>
                ) : null}

                {showUnlink ? (
                    <PermissionHint blocked={!canUnlink} action="unlink this thread from the tracker" allowedRoles={allowedRoles}>
                        <Button
                            type="button"
                            size="sm"
                            variant={compact ? "ghost" : "outline"}
                            className={compact ? "h-7 px-2 text-xs text-muted-foreground" : undefined}
                            disabled={!canUnlink || busy !== null}
                            onClick={() => setConfirmUnlink(true)}
                            data-testid="unlink-thread-button"
                            aria-label="Unlink from tracker"
                        >
                            {busy === "unlink" ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : null}
                            Unlink
                        </Button>
                    </PermissionHint>
                ) : null}
            </div>

            {error ? (
                <p className="mt-2 text-xs text-destructive" role="alert" data-testid="promotion-error">
                    {error}
                </p>
            ) : null}

            <ConfirmDialog
                open={confirmPromote}
                onOpenChange={setConfirmPromote}
                title={canRepromote ? "Promote again on forge" : "Promote to tracker"}
                description={
                    canRepromote
                        ? `Creates a new issue in ${destinationPath} with lineage to the previous link. The deleted issue is not reopened.`
                        : `Publishes this thread as an issue in ${destinationPath}${
                              settings.destination?.visibility === "public" ? " (a public repository)" : ""
                          }. Review visibility and policy alerts before continuing.`
                }
                confirmLabel={promoteLabel}
                onConfirm={() => void runPromote()}
            />

            <ConfirmDialog
                open={confirmUnlink}
                onOpenChange={setConfirmUnlink}
                title="Unlink from tracker?"
                description="Stops syncing this thread to the forge. History and lineage are kept; the remote issue is not deleted."
                confirmLabel="Unlink"
                onConfirm={() => void runUnlink()}
            />
        </div>
    );
}
