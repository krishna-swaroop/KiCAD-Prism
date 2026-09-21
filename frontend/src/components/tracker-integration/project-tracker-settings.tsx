/**
 * Project destination and publication policy settings (TR-38, C4/C8).
 *
 * Administrators edit destination overrides and publication rules. Other roles
 * receive a safe read-only projection. Host integration mounts this in TR-42.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Settings2, ShieldAlert, Tag } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
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
    /** Render sections without the Card shell (the project dialog supplies its own title). */
    chromeless?: boolean;
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
    chromeless = false,
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

    const destinationSection = (
        <section className="space-y-3" data-testid="destination-section">
            <SectionHeading
                title="Destination"
                description="Where promoted comments become issues."
            />
            <DestinationDisclosure destination={settings.destination} acknowledgement={settings.acknowledgement} />
            {!isAdmin ? (
                <p className="text-xs text-muted-foreground">
                    {formatDestinationLine(settings.destination)} —{" "}
                    {destinationSourceLabel(settings.destination) === "imported"
                        ? "the project repository, resolved when an administrator saves"
                        : destinationIsProjectRepo(settings.destination, projectRepoPath)
                          ? "the project repository"
                          : "a separate issue-tracking repository"}
                    .
                </p>
            ) : null}
            {isAdmin ? (
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="tracker-connector">Connection</Label>
                        <Select
                            value={draft.connectorId}
                            onValueChange={(value) => {
                                setDraft((prev) => (prev ? { ...prev, connectorId: value } : prev));
                                setRepositories(null);
                                setRepositoriesState("idle");
                                setManualRepository(false);
                            }}
                        >
                            <SelectTrigger id="tracker-connector" className="w-full max-w-md">
                                <SelectValue placeholder="Select a connection" />
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

                    <div className="space-y-1.5">
                        <p id="tracker-repository-label" className="text-xs font-medium">Repository</p>
                        <RadioGroup
                            aria-labelledby="tracker-repository-label"
                            value={draft.useOverride ? "other" : "project"}
                            onValueChange={(value) =>
                                setDraft((prev) => {
                                    if (!prev) return prev;
                                    if (value === "project") return { ...prev, useOverride: false };
                                    const ownRepo = destinationIsProjectRepo(settings.destination, projectRepoPath);
                                    return {
                                        ...prev,
                                        useOverride: true,
                                        containerPath: ownRepo ? "" : prev.containerPath,
                                        remoteContainerId: ownRepo ? "" : prev.remoteContainerId,
                                    };
                                })
                            }
                            className="gap-2"
                        >
                            <RepositoryOption
                                value="project"
                                selected={!draft.useOverride}
                                disabled={!projectRepoPath}
                                label="This project's repository"
                                aria-label="This project's repository"
                                description={
                                    <span data-testid="project-repo-option">
                                        {projectRepoPath
                                            ? `Issues are created in ${projectRepoPath}, next to the design files.`
                                            : "This project has no GitHub remote, so a separate repository is required."}
                                    </span>
                                }
                            >
                                {projectRepoInstalled === false ? (
                                    <Alert variant="warning" className="mt-2" data-testid="project-repo-not-installed">
                                        <AlertTriangle />
                                        <AlertDescription>
                                            The GitHub App is not installed on {projectRepoPath}. Install it there (GitHub → Settings →
                                            Applications) or pick another repository; otherwise publishing pauses as “visibility unknown”.
                                        </AlertDescription>
                                    </Alert>
                                ) : null}
                            </RepositoryOption>
                            <RepositoryOption
                                value="other"
                                selected={draft.useOverride}
                                label="Another repository"
                                aria-label="Another repository"
                                description="A dedicated issue-tracking repository the GitHub App is installed on."
                            >
                                {draft.useOverride ? (
                                    <div className="mt-2 space-y-2">
                                        {!manualRepository && repositoriesState === "loading" ? (
                                            <Skeleton className="h-8 w-full max-w-md" />
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
                                                <SelectTrigger className="w-full max-w-md" aria-label="Repository" data-testid="repository-picker">
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
                                                            setDraft((prev) => (prev ? { ...prev, containerPath: event.target.value } : prev))
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
                                                            setDraft((prev) => (prev ? { ...prev, remoteContainerId: event.target.value } : prev))
                                                        }
                                                        placeholder="987654321"
                                                        autoComplete="off"
                                                    />
                                                </div>
                                            </div>
                                        ) : null}
                                        <p className="text-[11px] text-muted-foreground">
                                            {repositoriesState === "failed" && !repositories
                                                ? "Could not list the installation's repositories; enter the repository by hand. "
                                                : null}
                                            {repositoriesState === "ready" && repositories && repositories.length === 0
                                                ? "The GitHub App is not installed on any repository yet. "
                                                : null}
                                            {repositoriesState === "ready" && repositories && repositories.length > 0 ? (
                                                <Button
                                                    type="button"
                                                    variant="link"
                                                    size="xs"
                                                    className="h-auto p-0 text-[11px]"
                                                    onClick={() => setManualRepository((value) => !value)}
                                                >
                                                    {manualRepository ? "Choose from the list instead" : "Enter a repository id by hand"}
                                                </Button>
                                            ) : null}
                                        </p>
                                    </div>
                                ) : null}
                            </RepositoryOption>
                        </RadioGroup>
                    </div>
                    {!draft.useOverride ? (
                        <p className="text-[11px] text-muted-foreground" data-testid="imported-default-note">
                            {isImportedDefaultDestination(settings.destination)
                                ? `Resolved on save: ${settings.destination.containerPath || projectRepoPath}`
                                : `Using ${formatDestinationLine(settings.destination)}`}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </section>
    );

    const policySection = (
        <section className="space-y-3" data-testid="policy-section">
            <SectionHeading title="Publishing rules" description="Which comments become issues on their own, and who may publish the rest." />
            {isAdmin ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="tracker-auto-severity">Auto-publish from severity</Label>
                            <Select
                                value={draft.autoMinSeverity}
                                onValueChange={(value) => setDraft((prev) => (prev ? { ...prev, autoMinSeverity: value } : prev))}
                            >
                                <SelectTrigger id="tracker-auto-severity" className="w-full">
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
                            <Label htmlFor="tracker-promote-role">Who may publish</Label>
                            <Select
                                value={draft.promoteMinRole}
                                onValueChange={(value) => setDraft((prev) => (prev ? { ...prev, promoteMinRole: value } : prev))}
                            >
                                <SelectTrigger id="tracker-promote-role" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PROMOTE_ROLE_OPTIONS.map((role) => (
                                        <SelectItem key={role} value={role}>
                                            {roleLabel(role as "designer" | "viewer")} and above
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <Checkbox
                            id="tracker-auto-task"
                            checked={draft.autoTaskClass}
                            onCheckedChange={(checked) => setDraft((prev) => (prev ? { ...prev, autoTaskClass: checked === true } : prev))}
                        />
                        <Label htmlFor="tracker-auto-task" className="font-normal">
                            Also auto-publish comments classed as <span className="font-medium">task</span>, whatever their severity
                        </Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        <span>{autoPromoteSummary({ autoMinSeverity: draft.autoMinSeverity, autoTaskClass: draft.autoTaskClass })}</span>{" "}
                        <span>{promoteRoleExplanation(draft.promoteMinRole)}</span>
                    </p>
                </>
            ) : (
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                        <dt className="text-muted-foreground">Auto-publish</dt>
                        <dd>{autoPromoteSummary(settings)}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Who may publish</dt>
                        <dd>{promoteRoleExplanation(settings.promoteMinRole)}</dd>
                    </div>
                </dl>
            )}
            <Collapsible>
                <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="xs" className="-ml-2 text-muted-foreground">
                        <Tag aria-hidden="true" />
                        Issue labels
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
                        <div>
                            <dt className="text-muted-foreground">Base</dt>
                            <dd className="font-mono">{settings.labels.base}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Severity</dt>
                            <dd className="font-mono">{settings.labels.severityPrefix}…</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Class</dt>
                            <dd className="font-mono">{settings.labels.classPrefix}…</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Board</dt>
                            <dd className="font-mono">{settings.labels.boardPrefix}…</dd>
                        </div>
                    </dl>
                </CollapsibleContent>
            </Collapsible>
        </section>
    );

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

            {destinationSection}
            <Separator />
            {policySection}

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


function SectionHeading({ title, description }: { title: string; description: string }) {
    return (
        <div>
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
    );
}

function RepositoryOption({
    value,
    selected,
    disabled = false,
    label,
    description,
    children,
    ...aria
}: {
    value: string;
    selected: boolean;
    disabled?: boolean;
    label: string;
    description: ReactNode;
    children?: ReactNode;
    "aria-label": string;
}) {
    const id = `tracker-repo-${value}`;
    return (
        <div
            className={cn(
                "px-3 py-2.5 ring-1 ring-foreground/10 transition-colors",
                selected && "bg-primary/5 ring-primary/40",
                disabled && "opacity-60",
            )}
        >
            <div className="flex items-start gap-2.5">
                <RadioGroupItem id={id} value={value} disabled={disabled} aria-label={aria["aria-label"]} className="mt-0.5" />
                <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 font-normal">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-[11px] text-muted-foreground">{description}</span>
                </Label>
            </div>
            {children ? <div className="pl-6">{children}</div> : null}
        </div>
    );
}
