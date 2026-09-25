import type { ProjectTrackerSettings, UpdateProjectTrackerRequest } from "@/types/trackers";

import { isImportedDefaultDestination, sameRepoPath } from "./destination-disclosure";

export type TrackerSettingsDraft = {
    connectorId: string;
    /** false = this project's repository; true = an administrator override. */
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

export function draftFromSettings(settings: ProjectTrackerSettings): TrackerSettingsDraft {
    const ownRepo = destinationIsProjectRepo(settings.destination, settings.projectRepoPath ?? null);
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

/** Reuse a resolved id only for the same repository on the same connection. */
function projectRepoDestination(
    saved: ProjectTrackerSettings,
    projectRepoPath: string | null,
    reuseResolved = true,
): UpdateProjectTrackerRequest["destination"] {
    const path = projectRepoPath ?? saved.destination.containerPath;
    const alreadyResolved = reuseResolved && sameRepoPath(saved.destination.containerPath, path);
    return {
        containerKind: saved.destination.containerKind,
        containerPath: path,
        remoteContainerId: alreadyResolved ? saved.destination.remoteContainerId : `pending:${path}`,
        generation: saved.destination.generation,
        visibility: alreadyResolved ? saved.destination.visibility : null,
    };
}

export function destinationChanged(
    saved: ProjectTrackerSettings,
    draft: TrackerSettingsDraft,
): boolean {
    if (draft.connectorId !== saved.connectorId) return true;
    const target = draft.useOverride
        ? { containerPath: draft.containerPath.trim(), remoteContainerId: draft.remoteContainerId.trim() }
        : projectRepoDestination(saved, saved.projectRepoPath ?? null, draft.connectorId === saved.connectorId);
    return target.containerPath !== saved.destination.containerPath
        || target.remoteContainerId !== saved.destination.remoteContainerId;
}

export function buildUpdatePayload(
    saved: ProjectTrackerSettings,
    draft: TrackerSettingsDraft,
): UpdateProjectTrackerRequest {
    const destination = draft.useOverride
        ? {
              containerKind: saved.destination.containerKind,
              containerPath: draft.containerPath.trim(),
              remoteContainerId: draft.remoteContainerId.trim(),
              generation: saved.destination.generation,
              visibility: saved.destination.visibility,
          }
        : projectRepoDestination(saved, saved.projectRepoPath ?? null, draft.connectorId === saved.connectorId);

    return {
        connectorId: draft.connectorId,
        destination,
        autoMinSeverity: draft.autoMinSeverity,
        autoTaskClass: draft.autoTaskClass,
        promoteMinRole: draft.promoteMinRole,
        labels: draft.labels,
    };
}
