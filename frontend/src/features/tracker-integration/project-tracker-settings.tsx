/**
 * Project destination and publication policy settings (TR-38, C4/C8).
 *
 * Administrators edit destination overrides and publication rules. Other roles
 * receive a safe read-only projection.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Settings2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PermissionHint } from "@/components/ui/permission-hint";
import { Skeleton } from "@/components/ui/skeleton";

import { visibilityAckState } from "./destination-disclosure";
import { FormSection } from "./connector-settings-section";
import { ProjectTrackerChoice } from "./project-tracker-choice";
import {
    TrackerApiError,
    acknowledgeDestination,
    getProjectTracker,
    listConnectors,
    updateProjectTracker,
} from "@/lib/trackers-client";
import { cn } from "@/lib/utils";
import type { ProjectTrackerSettings, TrackerConnector, UpdateProjectTrackerRequest } from "@/types/trackers";
import { ProjectTrackerDestinationSection, hostWords } from "./project-tracker-destination";

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
import { buildUpdatePayload, destinationChanged, draftFromSettings, type TrackerSettingsDraft } from "./project-tracker-settings-model";
import { ProjectTrackerPolicySection } from "./project-tracker-policy";

export { autoPromoteSummary, promoteRoleExplanation } from "./project-tracker-policy";

export { destinationIsProjectRepo } from "./project-tracker-settings-model";

export type ProjectTrackerSettingsPhase = "loading" | "ready" | "offline" | "unconfigured";

export interface ProjectTrackerSettingsPanelProps {
    projectId: string;
    isAdmin: boolean;
    /** Render sections without the Card shell (the project dialog supplies its own title). */
    chromeless?: boolean;
    className?: string;
    onSettingsChange?: (settings: ProjectTrackerSettings) => void;
    /** Opens Settings → Code hosts, where connections are managed. */
    onManageCodeHosts?: () => void;
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

/** No destination yet and no GitHub host to default to. */
function IssuePublishingNotSetUp({ isAdmin, className, onManageCodeHosts }: {
    isAdmin: boolean;
    className?: string;
    onManageCodeHosts?: () => void;
}) {
    return (
        <div className={cn("rounded-lg border border-dashed p-6 text-center text-sm", className)} data-tracker-phase="unconfigured">
            <p className="font-medium">No issue tracker connected</p>
            {!isAdmin && <p className="mt-1 text-muted-foreground">An admin needs to connect GitHub or GitLab first.</p>}
            {isAdmin && onManageCodeHosts && (
                <Button type="button" size="sm" className="mt-4" onClick={onManageCodeHosts}>
                    Connect a code host
                </Button>
            )}
        </div>
    );
}

export function ProjectTrackerSettingsPanel({
    projectId,
    isAdmin,
    chromeless = false,
    className,
    onSettingsChange,
    onManageCodeHosts,
}: ProjectTrackerSettingsPanelProps) {
    const [settings, setSettings] = useState<ProjectTrackerSettings | null>(null);
    const [connectors, setConnectors] = useState<TrackerConnector[]>([]);
    const [draft, setDraft] = useState<TrackerSettingsDraft | null>(null);
    const [loading, setLoading] = useState(true);
    const [offline, setOffline] = useState(false);
    const [unconfigured, setUnconfigured] = useState(false);
    const [saving, setSaving] = useState(false);
    const [acking, setAcking] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [confirmDestinationOpen, setConfirmDestinationOpen] = useState(false);
    const [confirmAckOpen, setConfirmAckOpen] = useState(false);
    const pendingPayloadRef = useRef<UpdateProjectTrackerRequest | null>(null);

    const phase: ProjectTrackerSettingsPhase = loading
        ? "loading" : unconfigured ? "unconfigured" : offline ? "offline" : "ready";

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
        setUnconfigured(false);
        setFormError(null);
        try {
            const [loaded, connectorList] = await Promise.all([
                getProjectTracker(projectId),
                isAdmin ? listConnectors().catch(() => []) : Promise.resolve([]),
            ]);
            applySettings(loaded);
            // Only hosts set up to publish belong in a project destination.
            setConnectors(connectorList.filter((row) => Boolean(row.capabilities?.issues && row.credentialConfigured)));
        } catch (error) {
            // 404: no destination yet and no GitHub host to default to.
            if (error instanceof TrackerApiError && error.status === 404) {
                setSettings(null);
                setDraft(null);
                setUnconfigured(true);
                return;
            }
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

    // The project's own repository was resolved for the saved connection's host.
    const draftProvider = connectors.find((row) => row.id === draft?.connectorId)?.provider;
    const projectRepoPath = draftProvider && settings?.provider && draftProvider !== settings.provider
        ? null
        : settings?.projectRepoPath ?? null;

    const ackState = settings
        ? visibilityAckState(settings.destination, settings.acknowledgement)
        : "not_required";

    const submitSave = async (payload: UpdateProjectTrackerRequest) => {
        setSaving(true);
        setFormError(null);
        try {
            const updated = await updateProjectTracker(projectId, payload);
            applySettings(updated);
            toast.success("Issue publishing saved.");
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
            toast.success("Public issues allowed.");
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

    if (phase === "unconfigured") {
        return <IssuePublishingNotSetUp isAdmin={isAdmin} className={className} onManageCodeHosts={onManageCodeHosts} />;
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

            <FormSection step={1} title="Tracker">
                <ProjectTrackerChoice
                    draft={draft}
                    setDraft={setDraft}
                    connectors={connectors}
                    savedProvider={settings.provider}
                    onRestoreSaved={() => setDraft(draftFromSettings(settings))}
                    isAdmin={isAdmin}
                />
            </FormSection>
            <Separator />
            <FormSection step={2} title={capitalize(hostWords(draftProvider ?? settings.provider).noun)}>
                <ProjectTrackerDestinationSection
                    key={`${projectId}:${draft.connectorId}`}
                    settings={settings}
                    draft={draft}
                    setDraft={setDraft}
                    projectRepoPath={projectRepoPath}
                    provider={draftProvider ?? settings.provider}
                    isAdmin={isAdmin}
                    ackState={ackState}
                    onAcknowledge={isAdmin && !acking ? () => setConfirmAckOpen(true) : undefined}
                />
            </FormSection>
            <Separator />
            <FormSection step={3} title="Rules">
                <ProjectTrackerPolicySection settings={settings} draft={draft} setDraft={setDraft} isAdmin={isAdmin} />
            </FormSection>

            {!isAdmin ? (
                <p className="text-xs text-muted-foreground" data-testid="viewer-readonly-note">Set by a workspace admin.</p>
            ) : null}
        </div>
    );

    const footer = isAdmin ? (
        <div className="flex w-full items-center gap-2">
            {onManageCodeHosts ? (
                <Button type="button" size="sm" variant="ghost" className="-ml-2 text-muted-foreground" onClick={onManageCodeHosts}>
                    <Settings2 aria-hidden="true" />
                    Connections
                </Button>
            ) : null}
            <PermissionHint blocked={!isAdmin} action="change project tracker settings" allowedRoles={["admin"]}>
                <Button type="button" size="sm" className="ml-auto" disabled={saving || !isAdmin} onClick={handleSave}>
                    {saving ? "Saving…" : "Save"}
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
                title="Change repository?"
                description="New issues go to the new repository. Issues already published stay where they are."
                confirmLabel="Change repository"
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
                title="Allow public issues?"
                description={`Published comments become issues anyone can read in ${settings.destination.containerPath}.`}
                confirmLabel="Allow public issues"
                destructive={false}
                busy={acking}
                onConfirm={() => void handleAcknowledge()}
            />
        </>
    );
}
