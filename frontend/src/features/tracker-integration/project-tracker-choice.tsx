import type { Dispatch, SetStateAction } from "react";
import { Check, Github, Gitlab, SquareKanban, Workflow, type LucideIcon } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TrackerConnector } from "@/types/trackers";

import type { TrackerSettingsDraft } from "./project-tracker-settings-model";

interface TrackerOption {
    id: string;
    name: string;
    icon: LucideIcon;
    /** Prism can publish there once a connection exists. */
    supported: boolean;
}

/**
 * Issue trackers a project can publish to. Jira and Linear are listed so the
 * dialog does not read as "git hosts only"; they are not available yet.
 */
const TRACKERS: TrackerOption[] = [
    { id: "github", name: "GitHub Issues", icon: Github, supported: true },
    { id: "gitlab", name: "GitLab Issues", icon: Gitlab, supported: true },
    { id: "jira", name: "Jira", icon: SquareKanban, supported: false },
    { id: "linear", name: "Linear", icon: Workflow, supported: false },
];

interface ProjectTrackerChoiceProps {
    draft: TrackerSettingsDraft;
    setDraft: Dispatch<SetStateAction<TrackerSettingsDraft | null>>;
    /** Connections that can publish; empty for people who cannot manage them. */
    connectors: TrackerConnector[];
    /** Provider of the saved connection, for people who cannot list connections. */
    savedProvider?: string;
    /** Puts the saved connection and destination back in the draft. */
    onRestoreSaved?: () => void;
    isAdmin: boolean;
}

export function ProjectTrackerChoice({
    draft,
    setDraft,
    connectors,
    savedProvider,
    onRestoreSaved,
    isAdmin,
}: ProjectTrackerChoiceProps) {
    const current = connectors.find((connector) => connector.id === draft.connectorId);
    const selectedProvider = current?.provider ?? savedProvider ?? "github";
    const sameProvider = connectors.filter((connector) => connector.provider === selectedProvider);

    const choose = (provider: string) => {
        const first = connectors.find((connector) => connector.provider === provider);
        if (!first || provider === selectedProvider) return;
        if (provider === savedProvider && onRestoreSaved) {
            onRestoreSaved();
            return;
        }
        // A repository on one host means nothing on another, and the project's
        // own repository is only known for the saved host: pick one explicitly.
        setDraft((prev) => prev && { ...prev, connectorId: first.id, useOverride: true, containerPath: "", remoteContainerId: "" });
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Issue tracker">
                {TRACKERS.map((tracker) => {
                    const selected = tracker.id === selectedProvider;
                    const connected = connectors.some((connector) => connector.provider === tracker.id);
                    const selectable = isAdmin && tracker.supported && connected;
                    const Icon = tracker.icon;
                    const note = !tracker.supported ? "Soon" : !connected && !selected ? "Not set up" : null;
                    return (
                        <button
                            key={tracker.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={!selectable && !selected}
                            onClick={() => choose(tracker.id)}
                            data-tracker-option={tracker.id}
                            className={cn(
                                "relative flex flex-col gap-1.5 px-3 py-2.5 text-left ring-1 ring-foreground/10 transition-colors",
                                selected && "bg-primary/5 ring-primary/40",
                                selectable && !selected && "hover:bg-muted/40",
                                !selectable && !selected && "cursor-default text-muted-foreground",
                            )}
                        >
                            <span className="flex items-center justify-between">
                                <Icon className="size-4" aria-hidden="true" />
                                {selected ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
                                {note ? <span className="text-[10px] uppercase tracking-wide">{note}</span> : null}
                            </span>
                            <span className="text-xs font-medium">{tracker.name}</span>
                        </button>
                    );
                })}
            </div>
            {isAdmin && sameProvider.length > 1 ? (
                <div className="flex items-center gap-3">
                    <Label htmlFor="tracker-connector" className="shrink-0 text-xs text-muted-foreground">Connection</Label>
                    <Select value={draft.connectorId} onValueChange={(connectorId) => setDraft((prev) => {
                        if (!prev || prev.connectorId === connectorId) return prev;
                        // An override must be picked again from the new installation.
                        return prev.useOverride
                            ? { ...prev, connectorId, containerPath: "", remoteContainerId: "" }
                            : { ...prev, connectorId };
                    })}>
                        <SelectTrigger id="tracker-connector" size="sm" className="w-full max-w-64"><SelectValue placeholder="Select a connection" /></SelectTrigger>
                        <SelectContent>
                            {sameProvider.map((connector) => <SelectItem key={connector.id} value={connector.id}>{connector.displayName}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            ) : current ? (
                <p className="text-xs text-muted-foreground" data-testid="tracker-connection">Via {current.displayName}</p>
            ) : null}
        </div>
    );
}
