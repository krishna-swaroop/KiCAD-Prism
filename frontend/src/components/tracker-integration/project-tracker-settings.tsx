/**
 * Project destination and publication policy settings (TR-38, C4/C8).
 *
 * Administrators edit destination overrides and publication rules. Other roles
 * receive a safe read-only projection. Host integration mounts this in TR-42.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Settings2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermissionHint } from "@/components/ui/permission-hint";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

import {
    DestinationDisclosure,
    destinationPolicyAlerts,
    destinationSourceLabel,
    formatDestinationLine,
    isImportedDefaultDestination,
    visibilityAckState,
} from "./destination-disclosure";
import {
    TrackerApiError,
    acknowledgeDestination,
    getProjectTracker,
    listConnectors,
    updateProjectTracker,
} from "@/lib/trackers-client";
import type { ProjectTrackerSettings, TrackerConnector, UpdateProjectTrackerRequest } from "@/types/trackers";

export type ProjectTrackerSettingsPhase = "loading" | "ready" | "offline";

export interface ProjectTrackerSettingsPanelProps {
    projectId: string;
    isAdmin: boolean;
    className?: string;
    onSettingsChange?: (settings: ProjectTrackerSettings) => void;
}

const SEVERITY_OPTIONS = ["info", "minor", "major", "critical"] as const;
const PROMOTE_ROLE_OPTIONS = ["designer", "viewer"] as const;

type DraftState = {
    connectorId: string;
    useOverride: boolean;
    containerPath: string;
    remoteContainerId: string;
    autoMinSeverity: string;
    autoTaskClass: boolean;
    promoteMinRole: string;
    labels: ProjectTrackerSettings["labels"];
};

function draftFromSettings(settings: ProjectTrackerSettings): DraftState {
    const imported = isImportedDefaultDestination(settings.destination);
    return {
        connectorId: settings.connectorId,
        useOverride: !imported,
        containerPath: settings.destination.containerPath,
        remoteContainerId: settings.destination.remoteContainerId,
        autoMinSeverity: settings.autoMinSeverity,
        autoTaskClass: settings.autoTaskClass,
        promoteMinRole: settings.promoteMinRole,
        labels: { ...settings.labels },
    };
}

function destinationChanged(
    saved: ProjectTrackerSettings,
    draft: DraftState,
): boolean {
    if (draft.connectorId !== saved.connectorId) return true;
    if (draft.useOverride !== !isImportedDefaultDestination(saved.destination)) return true;
    if (draft.containerPath.trim() !== saved.destination.containerPath) return true;
    if (draft.remoteContainerId.trim() !== saved.destination.remoteContainerId) return true;
    return false;
}

function buildUpdatePayload(
    saved: ProjectTrackerSettings,
    draft: DraftState,
): UpdateProjectTrackerRequest {
    const destination = draft.useOverride
        ? {
              containerKind: saved.destination.containerKind,
              containerPath: draft.containerPath.trim(),
              remoteContainerId: draft.remoteContainerId.trim(),
              generation: saved.destination.generation,
              visibility: saved.destination.visibility,
          }
        : {
              containerKind: saved.destination.containerKind,
              containerPath: saved.destination.containerPath,
              remoteContainerId: saved.destination.remoteContainerId,
              generation: saved.destination.generation,
              visibility: saved.destination.visibility,
          };

    return {
        connectorId: draft.connectorId,
        destination,
        autoMinSeverity: draft.autoMinSeverity,
        autoTaskClass: draft.autoTaskClass,
        promoteMinRole: draft.promoteMinRole,
        labels: draft.labels,
    };
}

export function autoPromoteSummary(settings: Pick<ProjectTrackerSettings, "autoMinSeverity" | "autoTaskClass">): string {
    const severity = settings.autoMinSeverity;
    const taskPart = settings.autoTaskClass ? " and class task" : "";
    return `Auto-promote at severity ≥ ${severity}${taskPart}; question/info stay local.`;
}

export function promoteRoleExplanation(promoteMinRole: string): string {
    if (promoteMinRole === "viewer") {
        return "Viewers may publish when this project opts in. Default is designer-only publication.";
    }
    return "Only designers and administrators can publish. Viewers stay local-only unless you opt in below.";
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

// react-doctor-disable-next-line no-giant-component - destination, policy and acknowledgement share one settings draft
export function ProjectTrackerSettingsPanel({
    projectId,
    isAdmin,
    className,
    onSettingsChange,
}: ProjectTrackerSettingsPanelProps) {
    const [settings, setSettings] = useState<ProjectTrackerSettings | null>(null);
    const [connectors, setConnectors] = useState<TrackerConnector[]>([]);
    const [draft, setDraft] = useState<DraftState | null>(null);
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

    return (
        <>
            <Card className={className} data-tracker-phase="ready">
                <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                        <Settings2 className="h-4 w-4" aria-hidden="true" />
                        Tracker publication
                        {!isAdmin ? <Badge variant="secondary">Read-only</Badge> : null}
                    </CardTitle>
                    <CardDescription>
                        Destination and publication rules for this project. Existing linked threads keep their original
                        destination generation.
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5">
                    {formError ? (
                        <p
                            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                            role="alert"
                        >
                            {formError}
                        </p>
                    ) : null}

                    <section className="space-y-2">
                        <h3 className="text-sm font-medium">Current destination</h3>
                        <DestinationDisclosure
                            destination={settings.destination}
                            acknowledgement={settings.acknowledgement}
                        />
                        {!isAdmin ? (
                            <p className="text-xs text-muted-foreground">
                                {formatDestinationLine(settings.destination)} —{" "}
                                {destinationSourceLabel(settings.destination) === "imported"
                                    ? "imported from the project repository"
                                    : "administrator override"}
                                .
                            </p>
                        ) : null}
                    </section>

                    {isAdmin ? (
                        <fieldset className="space-y-3 rounded-md border border-border p-3">
                            <legend className="px-1 text-sm font-medium">Destination configuration</legend>

                            <div className="space-y-1.5">
                                <Label htmlFor="tracker-connector">Connector</Label>
                                <Select
                                    value={draft.connectorId}
                                    onValueChange={(value) => setDraft((prev) => (prev ? { ...prev, connectorId: value } : prev))}
                                >
                                    <SelectTrigger id="tracker-connector" className="w-full max-w-md">
                                        <SelectValue placeholder="Select connector" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {connectors.map((connector) => (
                                            <SelectItem key={connector.id} value={connector.id}>
                                                {connector.displayName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-start gap-2">
                                <Checkbox
                                    id="tracker-use-override"
                                    checked={draft.useOverride}
                                    onCheckedChange={(checked) =>
                                        setDraft((prev) =>
                                            prev
                                                ? {
                                                      ...prev,
                                                      useOverride: checked === true,
                                                      remoteContainerId:
                                                          checked === true && isImportedDefaultDestination(settings.destination)
                                                              ? ""
                                                              : prev.remoteContainerId,
                                                  }
                                                : prev,
                                        )
                                    }
                                />
                                <div className="space-y-1">
                                    <Label htmlFor="tracker-use-override">Override imported destination</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Leave unchecked to keep the server-resolved repository default (
                                        {settings.destination.containerPath || "not configured"}).
                                    </p>
                                </div>
                            </div>

                            {draft.useOverride ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="tracker-container-path">Container path</Label>
                                        <Input
                                            id="tracker-container-path"
                                            value={draft.containerPath}
                                            onChange={(event) =>
                                                setDraft((prev) =>
                                                    prev ? { ...prev, containerPath: event.target.value } : prev,
                                                )
                                            }
                                            placeholder="acme/hardware-issues"
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="tracker-remote-id">Remote container id</Label>
                                        <Input
                                            id="tracker-remote-id"
                                            value={draft.remoteContainerId}
                                            onChange={(event) =>
                                                setDraft((prev) =>
                                                    prev ? { ...prev, remoteContainerId: event.target.value } : prev,
                                                )
                                            }
                                            placeholder="987654321"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground" data-testid="imported-default-note">
                                    Using imported default: {formatDestinationLine(settings.destination)}
                                </p>
                            )}
                        </fieldset>
                    ) : null}

                    <section className="space-y-3 rounded-md border border-border p-3">
                        <h3 className="text-sm font-medium">Publication policy</h3>
                        <p className="text-xs text-muted-foreground">{autoPromoteSummary(settings)}</p>
                        <p className="text-xs text-muted-foreground">{promoteRoleExplanation(settings.promoteMinRole)}</p>

                        {isAdmin ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="tracker-auto-severity">Auto-promote minimum severity</Label>
                                    <Select
                                        value={draft.autoMinSeverity}
                                        onValueChange={(value) =>
                                            setDraft((prev) => (prev ? { ...prev, autoMinSeverity: value } : prev))
                                        }
                                    >
                                        <SelectTrigger id="tracker-auto-severity">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SEVERITY_OPTIONS.map((severity) => (
                                                <SelectItem key={severity} value={severity}>
                                                    {severity}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="tracker-promote-role">Minimum role to publish</Label>
                                    <Select
                                        value={draft.promoteMinRole}
                                        onValueChange={(value) =>
                                            setDraft((prev) => (prev ? { ...prev, promoteMinRole: value } : prev))
                                        }
                                    >
                                        <SelectTrigger id="tracker-promote-role">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PROMOTE_ROLE_OPTIONS.map((role) => (
                                                <SelectItem key={role} value={role}>
                                                    {roleLabel(role as "designer" | "viewer")}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        ) : (
                            <dl className="grid gap-2 text-sm sm:grid-cols-2">
                                <div>
                                    <dt className="text-muted-foreground">Auto-promote</dt>
                                    <dd>{autoPromoteSummary(settings)}</dd>
                                </div>
                                <div>
                                    <dt className="text-muted-foreground">Publish role</dt>
                                    <dd>{roleLabel(settings.promoteMinRole as "designer" | "viewer")} minimum</dd>
                                </div>
                            </dl>
                        )}

                        {isAdmin ? (
                            <div className="flex items-start gap-2">
                                <Checkbox
                                    id="tracker-auto-task"
                                    checked={draft.autoTaskClass}
                                    onCheckedChange={(checked) =>
                                        setDraft((prev) =>
                                            prev ? { ...prev, autoTaskClass: checked === true } : prev,
                                        )
                                    }
                                />
                                <Label htmlFor="tracker-auto-task">Auto-promote class task comments</Label>
                            </div>
                        ) : null}

                        <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            Labels: {settings.labels.base}, {settings.labels.severityPrefix}
                            {settings.labels.classPrefix}, {settings.labels.boardPrefix}
                        </div>
                    </section>

                    {policyAlerts.length > 0 ? (
                        <section className="space-y-2" data-testid="policy-alerts-section">
                            <h3 className="text-sm font-medium text-destructive">Publication paused</h3>
                            <ul className="space-y-1">
                                {policyAlerts.map((alert) => (
                                    <li key={alert} className="text-xs text-destructive">
                                        {alert}
                                    </li>
                                ))}
                            </ul>
                            {isAdmin && ackState !== "valid" && settings.destination.visibility === "public" ? (
                                <PermissionHint
                                    blocked={!isAdmin}
                                    action="acknowledge public destination"
                                    allowedRoles={["admin"]}
                                >
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        disabled={acking}
                                        onClick={() => setConfirmAckOpen(true)}
                                    >
                                        Acknowledge public visibility
                                    </Button>
                                </PermissionHint>
                            ) : null}
                        </section>
                    ) : null}

                    {!isAdmin ? (
                        <div
                            className="flex items-start gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
                            data-testid="viewer-readonly-note"
                        >
                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>
                                Destination overrides and publication policy changes require an administrator. Your role
                                can read the active destination before promoting comments.
                            </span>
                        </div>
                    ) : null}
                </CardContent>

                {isAdmin ? (
                    <CardFooter className="flex flex-wrap gap-2 border-t">
                        <PermissionHint
                            blocked={!isAdmin}
                            action="change project tracker settings"
                            allowedRoles={["admin"]}
                        >
                            <Button type="button" disabled={saving || !isAdmin} onClick={handleSave}>
                                {saving ? "Saving…" : "Save publication settings"}
                            </Button>
                        </PermissionHint>
                    </CardFooter>
                ) : null}
            </Card>

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
