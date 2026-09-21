/**
 * Reusable destination disclosure for settings and promotion surfaces (TR-38, C4/C8).
 *
 * Renders the exact backend destination fields — never guesses a repository path.
 */

import { AlertTriangle, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DestinationAcknowledgement, ProjectTrackerSettings, TrackerDestination, TrackerVisibility } from "@/types/trackers";

export type DestinationDisclosureVariant = "compact" | "panel";

export interface DestinationDisclosureProps {
    destination: Omit<TrackerDestination, "connectorId"> & { connectorId?: string };
    acknowledgement?: DestinationAcknowledgement | null;
    variant?: DestinationDisclosureVariant;
    className?: string;
}

/** True when the server resolved the destination from the imported repository URL. */
export function isImportedDefaultDestination(
    destination: Pick<TrackerDestination, "remoteContainerId">,
): boolean {
    return destination.remoteContainerId.startsWith("pending:");
}

export function sameRepoPath(left?: string | null, right?: string | null): boolean {
    if (!left || !right) return false;
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Exact destination line from server fields — no client-side repo inference. */
export function formatDestinationLine(
    destination: Pick<TrackerDestination, "containerKind" | "containerPath" | "generation" | "remoteContainerId">,
): string {
    const path = destination.containerPath.trim() || "(not configured)";
    return `${destination.containerKind} · ${path} · generation ${destination.generation}`;
}

export function destinationSourceLabel(
    destination: Pick<TrackerDestination, "remoteContainerId">,
): "imported" | "override" {
    return isImportedDefaultDestination(destination) ? "imported" : "override";
}

export function visibilityLabel(visibility?: TrackerVisibility | null): string {
    if (!visibility || visibility === "unknown") return "Unknown visibility";
    return visibility.charAt(0).toUpperCase() + visibility.slice(1);
}

export function visibilityBadgeVariant(
    visibility?: TrackerVisibility | null,
): "success" | "secondary" | "warning" {
    if (visibility === "public") return "warning";
    if (visibility === "private") return "success";
    return "secondary";
}

export type VisibilityAckState = "not_required" | "valid" | "stale" | "missing";

export function visibilityAckState(
    destination: Pick<TrackerDestination, "visibility">,
    acknowledgement?: DestinationAcknowledgement | null,
): VisibilityAckState {
    if (destination.visibility !== "public") return "not_required";
    if (!acknowledgement) return "missing";
    if (!acknowledgement.valid) return "stale";
    return "valid";
}

export function destinationPolicyAlerts(
    settings: Pick<ProjectTrackerSettings, "destination" | "acknowledgement">,
): string[] {
    const alerts: string[] = [];
    const visibility = settings.destination.visibility;
    if (visibility === "unknown") {
        alerts.push("Destination visibility is unknown. Publication stays paused until visibility is observed.");
    }
    const ackState = visibilityAckState(settings.destination, settings.acknowledgement);
    if (ackState === "missing") {
        alerts.push("Public destination requires administrator acknowledgement before promotion can resume.");
    }
    if (ackState === "stale") {
        alerts.push(
            "Visibility acknowledgement is stale. Queued writes stay paused until an administrator re-acknowledges the current destination.",
        );
    }
    return alerts;
}

export function DestinationDisclosure({
    destination,
    acknowledgement,
    variant = "panel",
    className,
}: DestinationDisclosureProps) {
    const source = destinationSourceLabel(destination);
    const alerts = destinationPolicyAlerts({ destination, acknowledgement });
    const ackState = visibilityAckState(destination, acknowledgement);

    return (
        <div
            className={cn(
                variant === "compact" ? "space-y-1" : "space-y-2 rounded-md border border-border bg-muted/20 p-3",
                className,
            )}
            data-tracker-destination-source={source}
            data-tracker-visibility-ack={ackState}
        >
            <div className="flex flex-wrap items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium" data-testid="destination-line">
                    {formatDestinationLine(destination)}
                </p>
                <Badge variant={visibilityBadgeVariant(destination.visibility)} data-testid="destination-visibility">
                    {visibilityLabel(destination.visibility)}
                </Badge>
                <Badge variant="outline" data-testid="destination-source">
                    {source === "imported" ? "Imported default" : "Override"}
                </Badge>
                {destination.visibility === "public" ? (
                    <Badge
                        variant={ackState === "valid" ? "success" : "destructive"}
                        data-testid="destination-ack-badge"
                    >
                        {ackState === "valid" ? "Acknowledged" : ackState === "stale" ? "Stale ack" : "Ack required"}
                    </Badge>
                ) : null}
            </div>

            {variant === "panel" && destination.remoteContainerId ? (
                <p className="text-xs text-muted-foreground">
                    Remote container id: <code className="font-mono">{destination.remoteContainerId}</code>
                </p>
            ) : null}

            {alerts.length > 0 ? (
                <ul className="space-y-1" role="list">
                    {alerts.map((alert) => (
                        <li
                            key={alert}
                            className="flex items-start gap-2 text-xs text-destructive"
                            role="alert"
                            data-testid="destination-policy-alert"
                        >
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{alert}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
