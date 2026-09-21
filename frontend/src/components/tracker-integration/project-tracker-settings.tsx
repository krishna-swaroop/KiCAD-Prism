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

import {
    DestinationDisclosure,
    destinationPolicyAlerts,
    destinationSourceLabel,
    formatDestinationLine,
    isImportedDefaultDestination,
    sameRepoPath,
    visibilityAckState,
} from "./destination-disclosure";
import {
    TrackerApiError,
    acknowledgeDestination,
    getProjectTracker,
    listConnectorRepositories,
    listConnectors,
    updateProjectTracker,
} from "@/lib/trackers-client";
import { cn } from "@/lib/utils";
import type { ProjectTrackerSettings, TrackerConnector, TrackerRepository, UpdateProjectTrackerRequest } from "@/types/trackers";

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
    /** false = the project's own repository; true = another repository. */
    useOverride: boolean;
    containerPath: string;
    remoteContainerId: string;
    autoMinSeverity: string;
    autoTaskClass: boolean;
    promoteMinRole: string;
    labels: ProjectTrackerSettings["labels"];
};

/**
 * Is the saved destination the project's own repository? True for the
 * server-seeded placeholder and for a resolved id whose path matches the
 * imported remote.
 */
export function destinationIsProjectRepo(
    destination: Pick<ProjectTrackerSettings["destination"], "containerPath" | "remoteContainerId">,
    projectRepoPath: string | null,
): boolean {
    if (isImportedDefaultDestination(destination)) return true;
    return sameRepoPath(destination.containerPath, projectRepoPath);
}

function draftFromSettings(settings: ProjectTrackerSettings, projectRepoPath: string | null): DraftState {
    const ownRepo = destinationIsProjectRepo(settings.destination, projectRepoPath);
    return {
        connectorId: settings.connectorId,
        useOverride: !ownRepo,
        containerPath: settings.destination.containerPath,
        remoteContainerId: settings.destination.remoteContainerId,
        autoMinSeverity: settings.autoMinSeverity,
        autoTaskClass: settings.autoTaskClass,
        promoteMinRole: settings.promoteMinRole,
        labels: { ...settings.labels },
    };
}

/** Destination payload for "this project's repository": reuse the resolved id when we already have it. */
function projectRepoDestination(
    saved: ProjectTrackerSettings,
    projectRepoPath: string | null,
): UpdateProjectTrackerRequest["destination"] {
    const path = projectRepoPath ?? saved.destination.containerPath;
    const alreadyResolved = sameRepoPath(saved.destination.containerPath, path);
    return {
        containerKind: saved.destination.containerKind,
        containerPath: path,
        // The server resolves the placeholder to the numeric id on save.
        remoteContainerId: alreadyResolved ? saved.destination.remoteContainerId : `pending:${path}`,
        generation: saved.destination.generation,
        visibility: alreadyResolved ? saved.destination.visibility : null,
    };
}

function destinationChanged(
    saved: ProjectTrackerSettings,
    draft: DraftState,
    projectRepoPath: string | null,
): boolean {
    if (draft.connectorId !== saved.connectorId) return true;
    const target = draft.useOverride
        ? { containerPath: draft.containerPath.trim(), remoteContainerId: draft.remoteContainerId.trim() }
        : projectRepoDestination(saved, projectRepoPath);
    if (target.containerPath !== saved.destination.containerPath) return true;
    if (target.remoteContainerId !== saved.destination.remoteContainerId) return true;
    return false;
}

function buildUpdatePayload(
    saved: ProjectTrackerSettings,
    draft: DraftState,
    projectRepoPath: string | null,
): UpdateProjectTrackerRequest {
    const destination = draft.useOverride
        ? {
              containerKind: saved.destination.containerKind,
              containerPath: draft.containerPath.trim(),
              remoteContainerId: draft.remoteContainerId.trim(),
              generation: saved.destination.generation,
              visibility: saved.destination.visibility,
          }
        : projectRepoDestination(saved, projectRepoPath);

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
    const projectRepoPath = settings?.projectRepoPath ?? null;
    const [connectors, setConnectors] = useState<TrackerConnector[]>([]);
    const [draft, setDraft] = useState<DraftState | null>(null);
    const [repositories, setRepositories] = useState<TrackerRepository[] | null>(null);
    const [repositoriesState, setRepositoriesState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
    const [manualRepository, setManualRepository] = useState(false);
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
            setDraft(draftFromSettings(next, next.projectRepoPath ?? null));
            onSettingsChange?.(next);
        },
        [onSettingsChange],
    );

    // Admins get the installation's repository list once per connector: it
    // feeds the picker and tells us whether the project's own repository is
    // even reachable. A failed listing (GHES, offline) falls back to manual entry.
    const loadRepositories = useCallback(async (connectorId: string) => {
        setRepositoriesState("loading");
        try {
            const listed = await listConnectorRepositories(connectorId);
            setRepositories(listed);
            setRepositoriesState("ready");
            if (listed.length === 0) setManualRepository(true);
        } catch {
            setRepositories(null);
            setRepositoriesState("failed");
            setManualRepository(true);
        }
    }, []);

    useEffect(() => {
        if (!isAdmin || !draft?.connectorId) return;
        if (repositoriesState !== "idle") return;
        void loadRepositories(draft.connectorId);
    }, [draft?.connectorId, isAdmin, loadRepositories, repositoriesState]);

    const projectRepoInstalled =
        repositoriesState === "ready" && repositories && projectRepoPath
            ? repositories.some((repository) => sameRepoPath(repository.fullName, projectRepoPath))
            : null;

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
        const payload = buildUpdatePayload(settings, draft, projectRepoPath);
        if (destinationChanged(settings, draft, projectRepoPath)) {
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

                            <div className="space-y-2" role="radiogroup" aria-labelledby="tracker-repository-label">
                                <p id="tracker-repository-label" className="text-sm font-medium">Repository</p>
                                <div
                                    className={cn(
                                        "rounded-md border p-2.5",
                                        !draft.useOverride && "border-primary/50 bg-primary/5",
                                        !projectRepoPath && "opacity-60",
                                    )}
                                >
                                    <div className="flex items-start gap-2">
                                        <input
                                            id="tracker-repo-project"
                                            type="radio"
                                            name="tracker-repository-mode"
                                            className="mt-1"
                                            checked={!draft.useOverride}
                                            disabled={!projectRepoPath}
                                            onChange={() => setDraft((prev) => (prev ? { ...prev, useOverride: false } : prev))}
                                        />
                                        <label htmlFor="tracker-repo-project" className="min-w-0 cursor-pointer text-sm">
                                            <span className="font-medium">This project&apos;s repository</span>
                                            <span className="block text-xs text-muted-foreground" data-testid="project-repo-option">
                                                {projectRepoPath
                                                    ? `Issues are created in ${projectRepoPath}, next to the design files.`
                                                    : "This project has no GitHub remote, so a separate repository is required."}
                                            </span>
                                            {projectRepoInstalled === false ? (
                                                <span
                                                    className="mt-1 block text-xs text-warning"
                                                    role="note"
                                                    data-testid="project-repo-not-installed"
                                                >
                                                    The GitHub App is not installed on {projectRepoPath}. Install it there
                                                    (GitHub → Settings → Applications) or pick another repository; otherwise
                                                    publishing pauses as “visibility unknown”.
                                                </span>
                                            ) : null}
                                        </label>
                                    </div>
                                </div>
                                <div
                                    className={cn(
                                        "rounded-md border p-2.5",
                                        draft.useOverride && "border-primary/50 bg-primary/5",
                                    )}
                                >
                                    <div className="flex items-start gap-2">
                                        <input
                                            id="tracker-repo-other"
                                            type="radio"
                                            name="tracker-repository-mode"
                                            className="mt-1"
                                            checked={draft.useOverride}
                                            onChange={() =>
                                                setDraft((prev) => {
                                                    if (!prev) return prev;
                                                    const ownRepo = destinationIsProjectRepo(settings.destination, projectRepoPath);
                                                    return {
                                                        ...prev,
                                                        useOverride: true,
                                                        containerPath: ownRepo ? "" : prev.containerPath,
                                                        remoteContainerId: ownRepo ? "" : prev.remoteContainerId,
                                                    };
                                                })
                                            }
                                        />
                                        <label htmlFor="tracker-repo-other" className="min-w-0 cursor-pointer text-sm">
                                            <span className="font-medium">Another repository</span>
                                            <span className="block text-xs text-muted-foreground">
                                                A dedicated issue-tracking repository the GitHub App is installed on.
                                            </span>
                                        </label>
                                    </div>
                                    {draft.useOverride ? (
                                        <div className="mt-2 space-y-2 pl-6">
                                            {!manualRepository && repositoriesState === "loading" ? (
                                                <Skeleton className="h-9 w-full max-w-md" />
                                            ) : null}
                                            {!manualRepository && repositoriesState === "ready" && repositories ? (
                                                <Select
                                                    value={draft.remoteContainerId || undefined}
                                                    onValueChange={(value) => {
                                                        const picked = repositories.find((item) => item.id === value);
                                                        setDraft((prev) =>
                                                            prev && picked
                                                                ? { ...prev, containerPath: picked.fullName, remoteContainerId: picked.id }
                                                                : prev,
                                                        );
                                                    }}
                                                >
                                                    <SelectTrigger
                                                        className="w-full max-w-md"
                                                        aria-label="Repository"
                                                        data-testid="repository-picker"
                                                    >
                                                        <SelectValue placeholder="Choose a repository" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {repositories.map((repository) => (
                                                            <SelectItem key={repository.id} value={repository.id}>
                                                                {repository.fullName}
                                                                {repository.private ? " · private" : " · public"}
                                                                {repository.archived ? " · archived" : ""}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : null}
                                            {manualRepository ? (
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
                                            ) : null}
                                            <p className="text-xs text-muted-foreground">
                                                {repositoriesState === "failed" && !repositories
                                                    ? "Could not list the installation's repositories; enter the repository by hand. "
                                                    : null}
                                                {repositoriesState === "ready" && repositories && repositories.length === 0
                                                    ? "The GitHub App is not installed on any repository yet. "
                                                    : null}
                                                {repositoriesState === "ready" && repositories && repositories.length > 0 ? (
                                                    <button
                                                        type="button"
                                                        className="underline"
                                                        onClick={() => setManualRepository((value) => !value)}
                                                    >
                                                        {manualRepository ? "Choose from the list instead" : "Enter a repository id by hand"}
                                                    </button>
                                                ) : null}
                                            </p>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            {!draft.useOverride ? (
                                <p className="text-xs text-muted-foreground" data-testid="imported-default-note">
                                    {isImportedDefaultDestination(settings.destination)
                                        ? `Resolved on save: ${settings.destination.containerPath || projectRepoPath}`
                                        : `Using ${formatDestinationLine(settings.destination)}`}
                                </p>
                            ) : null}
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
