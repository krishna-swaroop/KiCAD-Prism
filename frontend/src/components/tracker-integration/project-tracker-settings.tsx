/**
 * Project destination and publication policy settings (TR-38, C4/C8).
 *
 * Administrators edit destination overrides and publication rules. Other roles
 * receive a safe read-only projection.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Settings2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PermissionHint } from "@/components/ui/permission-hint";
import { Skeleton } from "@/components/ui/skeleton";

import { destinationPolicyAlerts, visibilityAckState } from "./destination-disclosure";
import {
    TrackerApiError,
    acknowledgeDestination,
    getProjectTracker,
    listConnectors,
    updateProjectTracker,
} from "@/lib/trackers-client";
import { cn } from "@/lib/utils";
import type { ProjectTrackerSettings, TrackerConnector, UpdateProjectTrackerRequest } from "@/types/trackers";
import { ProjectTrackerDestinationSection } from "./project-tracker-destination";
import { buildUpdatePayload, destinationChanged, draftFromSettings, type TrackerSettingsDraft } from "./project-tracker-settings-model";
import { ProjectTrackerPolicySection } from "./project-tracker-policy";

export { autoPromoteSummary, promoteRoleExplanation } from "./project-tracker-policy";

export { destinationIsProjectRepo } from "./project-tracker-settings-model";

export type ProjectTrackerSettingsPhase = "loading" | "ready" | "offline";

export interface ProjectTrackerSettingsPanelProps {
    projectId: string;
    isAdmin: boolean;
    /** Render sections without the Card shell (the project dialog supplies its own title). */
    chromeless?: boolean;
    className?: string;
    onSettingsChange?: (settings: ProjectTrackerSettings) => void;
}

export function describeProjectTrackerError(error: unknown, fallback = "Project tracker request failed"): string {
    if (error instanceof TrackerApiError) {
        if (error.isPermission) {
            return "Administrator access is required to change destination or publication policy.";
        }
        if (error.isConflict) {
            return "Project tracker settings changed elsewhere. Reload and try again.";
        }
        return error.message || fallback;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

export function ProjectTrackerSettingsPanel({
    projectId,
    isAdmin,
    chromeless = false,
    className,
    onSettingsChange,
}: ProjectTrackerSettingsPanelProps) {
    const [settings, setSettings] = useState<ProjectTrackerSettings | null>(null);
    const projectRepoPath = settings?.projectRepoPath ?? null;
    const [connectors, setConnectors] = useState<TrackerConnector[]>([]);
    const [draft, setDraft] = useState<TrackerSettingsDraft | null>(null);
    const [loading, setLoading] = useState(true);
    const [offline, setOffline] = useState(false);
    const [saving, setSaving] = useState(false);
    const [acking, setAcking] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [confirmDestinationOpen, setConfirmDestinationOpen] = useState(false);
    const [confirmAckOpen, setConfirmAckOpen] = useState(false);
    const pendingPayloadRef = useRef<UpdateProjectTrackerRequest | null>(null);

    const phase: ProjectTrackerSettingsPhase = loading ? "loading" : offline ? "offline" : "ready";

    const applySettings = useCallback(
        (next: ProjectTrackerSettings) => {
            setSettings(next);
            setDraft(draftFromSettings(next));
            onSettingsChange?.(next);
        },
        [onSettingsChange],
    );

    const loadSettings = useCallback(async () => {
        setLoading(true);
        setOffline(false);
        setFormError(null);
        try {
            const [loaded, connectorList] = await Promise.all([
                getProjectTracker(projectId),
                isAdmin ? listConnectors().catch(() => []) : Promise.resolve([]),
            ]);
            applySettings(loaded);
            setConnectors(connectorList);
        } catch (error) {
            setSettings(null);
            setDraft(null);
            setOffline(true);
            setFormError(describeProjectTrackerError(error));
        } finally {
            setLoading(false);
        }
    }, [applySettings, isAdmin, projectId]);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    const policyAlerts = useMemo(
        () => (settings ? destinationPolicyAlerts(settings) : []),
        [settings],
    );

    const ackState = settings
        ? visibilityAckState(settings.destination, settings.acknowledgement)
        : "not_required";

    const submitSave = async (payload: UpdateProjectTrackerRequest) => {
        setSaving(true);
        setFormError(null);
        try {
            const updated = await updateProjectTracker(projectId, payload);
            applySettings(updated);
            toast.success("Publication settings saved.");
        } catch (error) {
            setFormError(describeProjectTrackerError(error));
        } finally {
            setSaving(false);
            pendingPayloadRef.current = null;
            setConfirmDestinationOpen(false);
        }
    };

    const handleSave = () => {
        if (!isAdmin || !settings || !draft) return;
        const payload = buildUpdatePayload(settings, draft);
        if (destinationChanged(settings, draft)) {
            pendingPayloadRef.current = payload;
            setConfirmDestinationOpen(true);
            return;
        }
        void submitSave(payload);
    };

    const handleAcknowledge = async () => {
        if (!isAdmin || !settings || settings.destination.visibility !== "public") return;
        setAcking(true);
        setFormError(null);
        try {
            const updated = await acknowledgeDestination(projectId, "public");
            applySettings(updated);
            toast.success("Public destination acknowledged.");
        } catch (error) {
            setFormError(describeProjectTrackerError(error, "Failed to acknowledge destination"));
        } finally {
            setAcking(false);
            setConfirmAckOpen(false);
        }
    };

    if (phase === "loading") {
        return (
            <Card className={className} data-tracker-phase="loading" aria-busy="true">
                <CardHeader>
                    <Skeleton className="h-5 w-56" />
                    <Skeleton className="mt-2 h-4 w-full max-w-md" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                </CardContent>
            </Card>
        );
    }

    if (phase === "offline" || !settings || !draft) {
        return (
            <Card className={className} data-tracker-phase="offline">
                <CardHeader>
                    <CardTitle>Tracker publication</CardTitle>
                    <CardDescription>Could not load project destination settings.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-destructive" role="alert">
                        {formError}
                    </p>
                    <Button type="button" variant="outline" className="mt-3" onClick={() => void loadSettings()}>
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const body = (
        <div className="space-y-5">
            {formError ? (
                <Alert variant="destructive">
                    <ShieldAlert />
                    <AlertDescription>{formError}</AlertDescription>
                </Alert>
            ) : null}

            {policyAlerts.length > 0 ? (
                <Alert variant="warning" data-testid="policy-alerts-section">
                    <AlertTriangle />
                    <AlertTitle>Publishing is paused</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc space-y-0.5 pl-4">
                            {policyAlerts.map((alert) => (
                                <li key={alert}>{alert}</li>
                            ))}
                        </ul>
                        {isAdmin && ackState !== "valid" && settings.destination.visibility === "public" ? (
                            <PermissionHint blocked={!isAdmin} action="acknowledge public destination" allowedRoles={["admin"]}>
                                <Button type="button" size="sm" variant="destructive" disabled={acking} onClick={() => setConfirmAckOpen(true)}>
                                    Acknowledge public visibility
                                </Button>
                            </PermissionHint>
                        ) : null}
                    </AlertDescription>
                </Alert>
            ) : null}

            <ProjectTrackerDestinationSection
                key={`${projectId}:${draft.connectorId}`}
                settings={settings}
                draft={draft}
                setDraft={setDraft}
                projectRepoPath={projectRepoPath}
                connectors={connectors}
                isAdmin={isAdmin}
            />
            <Separator />
            <ProjectTrackerPolicySection settings={settings} draft={draft} setDraft={setDraft} isAdmin={isAdmin} />

            {!isAdmin ? (
                <Alert data-testid="viewer-readonly-note">
                    <ShieldAlert />
                    <AlertDescription>
                        Destination and publishing rules are set by an administrator. You can see where comments will be
                        published before promoting them.
                    </AlertDescription>
                </Alert>
            ) : null}
        </div>
    );

    const footer = isAdmin ? (
        <div className="flex items-center justify-end gap-2">
            <PermissionHint blocked={!isAdmin} action="change project tracker settings" allowedRoles={["admin"]}>
                <Button type="button" size="sm" disabled={saving || !isAdmin} onClick={handleSave}>
                    {saving ? "Saving…" : "Save publication settings"}
                </Button>
            </PermissionHint>
        </div>
    ) : null;

    return (
        <>
            {chromeless ? (
                <div className={cn("space-y-5", className)} data-tracker-phase="ready">
                    {body}
                    {footer ? (
                        <>
                            <Separator />
                            {footer}
                        </>
                    ) : null}
                </div>
            ) : (
                <Card className={cn("gap-0 py-0", className)} data-tracker-phase="ready">
                    <CardHeader className="border-b py-3">
                        <CardTitle className="flex flex-wrap items-center gap-2">
                            <Settings2 className="size-4" aria-hidden="true" />
                            Issue publishing
                            {!isAdmin ? <Badge variant="secondary">Read-only</Badge> : null}
                        </CardTitle>
                        <CardDescription>
                            Where this project&apos;s review comments become GitHub issues, and which ones do.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="py-4">{body}</CardContent>
                    {footer ? <CardFooter className="border-t py-3">{footer}</CardFooter> : null}
                </Card>
            )}

            <ConfirmDialog
                open={confirmDestinationOpen}
                onOpenChange={(open) => {
                    if (!open && !saving) {
                        setConfirmDestinationOpen(false);
                        pendingPayloadRef.current = null;
                    }
                }}
                title="Change tracker destination?"
                description={
                    <>
                        Changing the destination bumps its generation and invalidates any stale visibility
                        acknowledgement. Existing linked threads keep writing to their original destination; only new
                        promotions use the updated container.
                    </>
                }
                confirmLabel="Change destination"
                destructive
                busy={saving}
                onConfirm={() => {
                    const payload = pendingPayloadRef.current;
                    if (payload) void submitSave(payload);
                }}
            />

            <ConfirmDialog
                open={confirmAckOpen}
                onOpenChange={setConfirmAckOpen}
                title="Acknowledge public destination?"
                description="Confirm that new promotions may create publicly visible issues in this repository. Queued writes remain paused until this acknowledgement is recorded."
                confirmLabel="Acknowledge public visibility"
                destructive={false}
                busy={acking}
                onConfirm={() => void handleAcknowledge()}
            />
        </>
    );
}
