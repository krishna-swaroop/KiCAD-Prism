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
import { promoteComment, retryThreadSync, TrackerApiError } from "@/lib/trackers-client";

export function canRepromoteThread(
    tracker: CommentTrackerProjection | null | undefined,
    permissions?: CommentPermissions | null,
): boolean {
    if (!permissions?.canPublish) return false;
    return tracker?.linkState === "deleted";
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
    className,
    onTrackerChange,
}: PromotionControlProps) {
    const [busy, setBusy] = useState<"promote" | "retry" | null>(null);
    const [confirmPromote, setConfirmPromote] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canPromote = canInitialPromote(tracker, permissions);
    const canRepromote = canRepromoteThread(tracker, permissions);
    const canRetry = canRetrySync(tracker) && Boolean(permissions?.canPublish);
    const deniedReason = publicationDeniedReason(tracker, permissions, settings.promoteMinRole);
    const promoteLabel = promotionActionLabel(tracker);

    const runPromote = useCallback(async () => {
        setBusy("promote");
        setError(null);
        try {
            const projection = await promoteComment(projectId, commentId);
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

    const showDestination = canPromote || canRepromote || autoEligible;

    return (
        <div className={className} data-tracker-promotion>
            {showDestination ? (
                <DestinationDisclosure
                    variant="compact"
                    destination={settings.destination}
                    acknowledgement={settings.acknowledgement ?? null}
                    className="mb-2"
                />
            ) : null}

            {autoEligible && !tracker?.linkState ? (
                <p className="mb-2 text-xs text-muted-foreground" data-testid="auto-promote-disclosure">
                    This comment meets auto-promotion rules and will publish to the destination above when allowed.
                </p>
            ) : null}

            {deniedReason && !permissions?.canPublish ? (
                <p className="mb-2 text-xs text-muted-foreground" role="note" data-testid="publication-denied-note">
                    {deniedReason} Local comment actions remain available.
                </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                <PermissionHint
                    blocked={!canPromote && !canRepromote && Boolean(promoteLabel)}
                    action="publish comments to the tracker"
                    allowedRoles={settings.promoteMinRole === "viewer" ? ["viewer", "designer", "admin"] : ["designer", "admin"]}
                >
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={(!canPromote && !canRepromote) || busy !== null || Boolean(tracker?.notPromotableReason)}
                        onClick={() => setConfirmPromote(true)}
                        data-testid="promote-button"
                        aria-label={promoteLabel}
                    >
                        {busy === "promote" ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
                        )}
                        {promoteLabel}
                    </Button>
                </PermissionHint>

                <PermissionHint
                    blocked={!canRetry}
                    action="retry tracker sync"
                    allowedRoles={settings.promoteMinRole === "viewer" ? ["viewer", "designer", "admin"] : ["designer", "admin"]}
                >
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canRetry || busy !== null}
                        onClick={() => void runRetry()}
                        data-testid="retry-sync-button"
                        aria-label="Retry sync"
                    >
                        {busy === "retry" ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
                        )}
                        Retry sync
                    </Button>
                </PermissionHint>
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
                        ? "Creates a new issue with lineage to the previous link. The deleted issue is not reopened."
                        : "Publishes this thread to the destination shown above. Review visibility and policy alerts before continuing."
                }
                confirmLabel={promoteLabel}
                onConfirm={() => void runPromote()}
            />
        </div>
    );
}
