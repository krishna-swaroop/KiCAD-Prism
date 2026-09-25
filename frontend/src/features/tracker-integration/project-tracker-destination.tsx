import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AlertTriangle, Check, Globe } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listConnectorRepositories } from "@/lib/trackers-client";
import { cn } from "@/lib/utils";
import type { ProjectTrackerSettings, TrackerRepository, TrackerVisibility } from "@/types/trackers";

import {
    isImportedDefaultDestination,
    sameRepoPath,
    visibilityBadgeVariant,
    visibilityLabel,
    type VisibilityAckState,
} from "./destination-disclosure";
import { destinationIsProjectRepo, type TrackerSettingsDraft } from "./project-tracker-settings-model";

/** How each host names its containers and what fixes Prism's access. */
export const HOST_WORDS: Record<string, {
    noun: string;
    noRemote: string;
    notReachable: (path: string) => string;
    listFailed: string;
    listEmpty: string;
    grantAccess: string;
}> = {
    github: {
        noun: "repository",
        noRemote: "This project has no GitHub remote",
        notReachable: (path) => `The GitHub App is not installed on ${path}.`,
        listFailed: "Could not list the App's repositories. ",
        listEmpty: "The GitHub App is not installed on any repository yet. ",
        grantAccess: "Install the GitHub App on it.",
    },
    gitlab: {
        noun: "project",
        noRemote: "This project has no remote on this GitLab",
        notReachable: (path) => `Prism's bot is not a member of ${path}.`,
        listFailed: "Could not list the bot's projects. ",
        listEmpty: "The bot is not a member of any project yet. ",
        grantAccess: "Add the bot to it as a Developer.",
    },
};

export function hostWords(provider: string | undefined) {
    return HOST_WORDS[provider ?? "github"] ?? HOST_WORDS.github;
}

type RepositoryState =
    | { status: "loading"; repositories: null }
    | { status: "ready"; repositories: TrackerRepository[] }
    | { status: "failed"; repositories: null };

interface DestinationSectionProps {
    settings: ProjectTrackerSettings;
    draft: TrackerSettingsDraft;
    setDraft: Dispatch<SetStateAction<TrackerSettingsDraft | null>>;
    projectRepoPath: string | null;
    isAdmin: boolean;
    /** Provider of the connection being edited. */
    provider?: string;
    ackState: VisibilityAckState;
    onAcknowledge?: () => void;
}

/** Key this section by project and connector so an old repository response cannot replace the new selection. */
export function ProjectTrackerDestinationSection({ settings, draft, setDraft, projectRepoPath, isAdmin, provider, ackState, onAcknowledge }: DestinationSectionProps) {
    const words = hostWords(provider);
    const [repositoryState, setRepositoryState] = useState<RepositoryState>({ status: "loading", repositories: null });
    const [manualRepository, setManualRepository] = useState(false);

    useEffect(() => {
        if (!isAdmin || !draft.connectorId) return;
        let active = true;
        void listConnectorRepositories(draft.connectorId).then(
            (repositories) => {
                if (!active) return;
                setRepositoryState({ status: "ready", repositories });
                if (repositories.length === 0) setManualRepository(true);
            },
            () => {
                if (!active) return;
                setRepositoryState({ status: "failed", repositories: null });
                setManualRepository(true);
            },
        );
        return () => { active = false; };
    }, [draft.connectorId, isAdmin]);

    const repositories = repositoryState.repositories ?? [];
    const projectRepoInstalled = repositoryState.status === "ready" && projectRepoPath
        ? repositories.some((repository) => sameRepoPath(repository.fullName, projectRepoPath))
        : null;

    const savedPath = settings.destination.containerPath.trim();
    const visibility = settings.destination.visibility;

    return (
        <div className="space-y-3" data-testid="destination-section">
            {!isAdmin ? (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium" data-testid="destination-line">{savedPath || "Not set"}</span>
                    <Badge variant={visibilityBadgeVariant(visibility)}>{visibilityLabel(visibility)}</Badge>
                    <span className="text-xs text-muted-foreground">
                        {destinationIsProjectRepo(settings.destination, projectRepoPath) ? `This project's ${words.noun}` : `Separate ${words.noun}`}
                    </span>
                </p>
            ) : (
                <RadioGroup
                    aria-label="Publish to"
                    value={draft.useOverride ? "other" : "project"}
                    onValueChange={(value) => setDraft((prev) => {
                        if (!prev) return prev;
                        if (value === "project") return { ...prev, useOverride: false };
                        const ownRepo = destinationIsProjectRepo(settings.destination, projectRepoPath);
                        return {
                            ...prev,
                            useOverride: true,
                            containerPath: ownRepo ? "" : prev.containerPath,
                            remoteContainerId: ownRepo ? "" : prev.remoteContainerId,
                        };
                    })}
                    className="gap-2"
                >
                    <RepositoryOption value="project" selected={!draft.useOverride} disabled={!projectRepoPath} label={`This project's ${words.noun}`} description={
                        <span data-testid="project-repo-option">{projectRepoPath ?? words.noRemote}</span>
                    }>
                        {projectRepoInstalled === false ? (
                            <Alert variant="warning" className="mt-2" data-testid="project-repo-not-installed">
                                <AlertTriangle />
                                <AlertDescription>{words.notReachable(projectRepoPath ?? "")}</AlertDescription>
                            </Alert>
                        ) : null}
                    </RepositoryOption>
                    <RepositoryOption value="other" selected={draft.useOverride} label={`Another ${words.noun}`} description={`A dedicated issues ${words.noun}`}>
                        {draft.useOverride ? (
                            <div className="mt-2 space-y-2">
                                {!manualRepository && repositoryState.status === "loading" ? <Skeleton className="h-8 w-full max-w-md" /> : null}
                                {!manualRepository && repositoryState.status === "ready" ? (
                                    <Select value={draft.remoteContainerId || undefined} onValueChange={(value) => {
                                        const picked = repositories.find((item) => item.id === value);
                                        setDraft((prev) => prev && picked ? { ...prev, containerPath: picked.fullName, remoteContainerId: picked.id } : prev);
                                    }}>
                                        <SelectTrigger className="w-full max-w-md" aria-label="Repository" data-testid="repository-picker">
                                            <SelectValue placeholder={`Choose a ${words.noun}`} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {repositories.map((repository) => (
                                                <SelectItem key={repository.id} value={repository.id}>
                                                    {repository.fullName}{repository.private ? " · private" : " · public"}{repository.archived ? " · archived" : ""}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : null}
                                {manualRepository ? (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="tracker-container-path">Owner/name</Label>
                                            <Input id="tracker-container-path" value={draft.containerPath} onChange={(event) => setDraft((prev) => prev ? { ...prev, containerPath: event.target.value } : prev)} placeholder="owner/name" autoComplete="off" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="tracker-remote-id">Repository ID</Label>
                                            <Input id="tracker-remote-id" value={draft.remoteContainerId} onChange={(event) => setDraft((prev) => prev ? { ...prev, remoteContainerId: event.target.value } : prev)} placeholder="987654321" autoComplete="off" />
                                        </div>
                                    </div>
                                ) : null}
                                <p className="text-[11px] text-muted-foreground">
                                    {repositoryState.status === "failed" ? words.listFailed : null}
                                    {repositoryState.status === "ready" && repositories.length === 0 ? words.listEmpty : null}
                                    {repositoryState.status === "ready" && repositories.length > 0 ? (
                                        <Button type="button" variant="link" size="xs" className="h-auto p-0 text-[11px]" onClick={() => setManualRepository((value) => !value)}>
                                            {manualRepository ? "Choose from the list" : "Enter by hand"}
                                        </Button>
                                    ) : null}
                                </p>
                            </div>
                        ) : null}
                    </RepositoryOption>
                </RadioGroup>
            )}

            {isAdmin ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="imported-default-note">
                    <span>Publishing to</span>
                    <span className="font-medium text-foreground" data-testid="destination-line">{savedPath || "—"}</span>
                    {isImportedDefaultDestination(settings.destination)
                        ? <Badge variant="outline">Checked on save</Badge>
                        : <Badge variant={visibilityBadgeVariant(visibility)} data-testid="destination-visibility">{visibilityLabel(visibility)}</Badge>}
                </p>
            ) : null}

            <DestinationStatus
                visibility={visibility}
                ackState={ackState}
                imported={isImportedDefaultDestination(settings.destination)}
                isAdmin={isAdmin}
                words={words}
                onAcknowledge={onAcknowledge}
            />
        </div>
    );
}

/** Why publishing is held, right under the repository it is about. */
function DestinationStatus({ visibility, ackState, imported, isAdmin, words, onAcknowledge }: {
    visibility: TrackerVisibility | null | undefined;
    ackState: VisibilityAckState;
    imported: boolean;
    isAdmin: boolean;
    words: ReturnType<typeof hostWords>;
    onAcknowledge?: () => void;
}) {
    if (imported) return null;
    if (visibility === "unknown") {
        return (
            <Alert variant="warning" data-testid="policy-alerts-section">
                <AlertTriangle />
                <AlertDescription>Paused: Prism can't see this {words.noun}. {words.grantAccess}</AlertDescription>
            </Alert>
        );
    }
    if (visibility !== "public") return null;
    if (ackState === "valid") {
        return (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="destination-ack-badge">
                <Check className="size-3.5 text-success" aria-hidden="true" />
                Acknowledged: public issues allowed
            </p>
        );
    }
    return (
        <Alert variant="warning" data-testid="policy-alerts-section">
            <Globe />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span data-testid="destination-ack-badge">
                    {ackState === "stale"
                        ? `Paused: the destination changed and this ${words.noun} is public.`
                        : `Paused: this ${words.noun} is public.`}
                </span>
                {isAdmin && onAcknowledge ? (
                    <Button type="button" size="sm" variant="outline" onClick={onAcknowledge}>Allow public issues</Button>
                ) : null}
            </AlertDescription>
        </Alert>
    );
}

function RepositoryOption({ value, selected, disabled = false, label, description, children }: {
    value: string;
    selected: boolean;
    disabled?: boolean;
    label: string;
    description: ReactNode;
    children?: ReactNode;
}) {
    const id = `tracker-repo-${value}`;
    return (
        <div className={cn("px-3 py-2.5 ring-1 ring-foreground/10 transition-colors", selected && "bg-primary/5 ring-primary/40", disabled && "opacity-60")}>
            <div className="flex items-start gap-2.5">
                <RadioGroupItem id={id} value={value} disabled={disabled} aria-label={label} className="mt-0.5" />
                <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 font-normal">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-[11px] text-muted-foreground">{description}</span>
                </Label>
            </div>
            {children ? <div className="pl-6">{children}</div> : null}
        </div>
    );
}
