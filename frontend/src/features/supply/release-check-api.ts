import { fetchJson } from "@/lib/api";
import type { JobProgress, ReleaseBomKept, ReleaseCheck, ReleaseSnapshot } from "@/types/supply";

// Apart from supply-api so Release Studio does not pull in the whole supply client.

const base = (projectId: string) => `/api/supply/projects/${encodeURIComponent(projectId)}`;

/** The supply check of the BOM a release build exported: the run's variant and BOM preset, exactly what ships. */
export function getReleaseCheck(projectId: string, buildId: string, signal?: AbortSignal): Promise<ReleaseCheck> {
  return fetchJson<ReleaseCheck>(
    `${base(projectId)}/release-builds/${encodeURIComponent(buildId)}/check`,
    { signal },
    "Could not check the BOM",
  );
}

export type ReleaseSnapshotState = JobProgress;

/** Whether a published release has its supply snapshot, is waiting for it, or could not have one. */
export function getReleaseSnapshotState(projectId: string, buildId: string, signal?: AbortSignal): Promise<ReleaseSnapshotState> {
  return fetchJson<ReleaseSnapshotState>(
    `${base(projectId)}/releases/${encodeURIComponent(buildId)}/supply-status`,
    { signal },
    "Could not read the supply snapshot",
  );
}

/** What supply data said when the release was published. */
export function getReleaseSnapshot(projectId: string, buildId: string, signal?: AbortSignal): Promise<ReleaseSnapshot> {
  return fetchJson<ReleaseSnapshot>(
    `${base(projectId)}/releases/${encodeURIComponent(buildId)}/supply`,
    { signal },
    "Could not read the supply snapshot",
  );
}

export const releaseComplianceCsvUrl = (projectId: string, buildId: string) =>
  `${base(projectId)}/releases/${encodeURIComponent(buildId)}/compliance?format=csv`;

/** Keep the release's BOM lines as the project's usage. Asks no distributor and tracks nothing. */
export function readReleaseBom(projectId: string, buildId: string): Promise<ReleaseBomKept> {
  return fetchJson(
    `${base(projectId)}/release-builds/${encodeURIComponent(buildId)}/read-bom`,
    { method: "POST" },
    "Could not keep the release BOM",
  );
}

export function hasProjectUsage(projectId: string, signal?: AbortSignal): Promise<{ has_usage: boolean }> {
  return fetchJson(`/api/supply/tracking/projects/${encodeURIComponent(projectId)}`, { signal }, "Could not read the project");
}
