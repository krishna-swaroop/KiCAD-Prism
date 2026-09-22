import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listConnectorRepositories } from "@/lib/trackers-client";
import { cn } from "@/lib/utils";
import type { ProjectTrackerSettings, TrackerConnector, TrackerRepository } from "@/types/trackers";

import {
    DestinationDisclosure,
    destinationSourceLabel,
    formatDestinationLine,
    isImportedDefaultDestination,
    sameRepoPath,
} from "./destination-disclosure";

export type TrackerSettingsDraft = {
    connectorId: string;
    useOverride: boolean;
    containerPath: string;
    remoteContainerId: string;
    autoMinSeverity: string;
    autoTaskClass: boolean;
    promoteMinRole: string;
    labels: ProjectTrackerSettings["labels"];
};

export function destinationIsProjectRepo(
    destination: Pick<ProjectTrackerSettings["destination"], "containerPath" | "remoteContainerId">,
    projectRepoPath: string | null,
): boolean {
    return isImportedDefaultDestination(destination) || sameRepoPath(destination.containerPath, projectRepoPath);
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
    connectors: TrackerConnector[];
    isAdmin: boolean;
}

/** Key this section by project and connector so an old repository response cannot replace the new selection. */
export function ProjectTrackerDestinationSection({ settings, draft, setDraft, projectRepoPath, connectors, isAdmin }: DestinationSectionProps) {
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

    return (
        <section className="space-y-3" data-testid="destination-section">
            <div>
                <h3 className="text-sm font-medium">Destination</h3>
                <p className="text-[11px] text-muted-foreground">Where promoted comments become issues.</p>
            </div>
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
                        <Select value={draft.connectorId} onValueChange={(connectorId) => setDraft((prev) => {
                            if (!prev || prev.connectorId === connectorId) return prev;
                            // An override must be selected from the new installation.
                            return prev.useOverride
                                ? { ...prev, connectorId, containerPath: "", remoteContainerId: "" }
                                : { ...prev, connectorId };
                        })}>
                            <SelectTrigger id="tracker-connector" className="w-full max-w-md"><SelectValue placeholder="Select a connection" /></SelectTrigger>
                            <SelectContent>
                                {connectors.map((connector) => <SelectItem key={connector.id} value={connector.id}>{connector.displayName}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <p id="tracker-repository-label" className="text-xs font-medium">Repository</p>
                        <RadioGroup
                            aria-labelledby="tracker-repository-label"
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
                            <RepositoryOption value="project" selected={!draft.useOverride} disabled={!projectRepoPath} label="This project's repository" aria-label="This project's repository" description={
                                <span data-testid="project-repo-option">
                                    {projectRepoPath
                                        ? `Issues are created in ${projectRepoPath}, next to the design files.`
                                        : "This project has no GitHub remote, so a separate repository is required."}
                                </span>
                            }>
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
                            <RepositoryOption value="other" selected={draft.useOverride} label="Another repository" aria-label="Another repository" description="A dedicated issue-tracking repository the GitHub App is installed on.">
                                {draft.useOverride ? (
                                    <div className="mt-2 space-y-2">
                                        {!manualRepository && repositoryState.status === "loading" ? <Skeleton className="h-8 w-full max-w-md" /> : null}
                                        {!manualRepository && repositoryState.status === "ready" ? (
                                            <Select value={draft.remoteContainerId || undefined} onValueChange={(value) => {
                                                const picked = repositories.find((item) => item.id === value);
                                                setDraft((prev) => prev && picked ? { ...prev, containerPath: picked.fullName, remoteContainerId: picked.id } : prev);
                                            }}>
                                                <SelectTrigger className="w-full max-w-md" aria-label="Repository" data-testid="repository-picker">
                                                    <SelectValue placeholder="Choose a repository" />
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
                                                    <Label htmlFor="tracker-container-path">Container path</Label>
                                                    <Input id="tracker-container-path" value={draft.containerPath} onChange={(event) => setDraft((prev) => prev ? { ...prev, containerPath: event.target.value } : prev)} placeholder="acme/hardware-issues" autoComplete="off" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="tracker-remote-id">Remote container id</Label>
                                                    <Input id="tracker-remote-id" value={draft.remoteContainerId} onChange={(event) => setDraft((prev) => prev ? { ...prev, remoteContainerId: event.target.value } : prev)} placeholder="987654321" autoComplete="off" />
                                                </div>
                                            </div>
                                        ) : null}
                                        <p className="text-[11px] text-muted-foreground">
                                            {repositoryState.status === "failed" ? "Could not list the installation's repositories; enter the repository by hand. " : null}
                                            {repositoryState.status === "ready" && repositories.length === 0 ? "The GitHub App is not installed on any repository yet. " : null}
                                            {repositoryState.status === "ready" && repositories.length > 0 ? (
                                                <Button type="button" variant="link" size="xs" className="h-auto p-0 text-[11px]" onClick={() => setManualRepository((value) => !value)}>
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
}

function RepositoryOption({ value, selected, disabled = false, label, description, children, ...aria }: {
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
        <div className={cn("px-3 py-2.5 ring-1 ring-foreground/10 transition-colors", selected && "bg-primary/5 ring-primary/40", disabled && "opacity-60")}>
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
