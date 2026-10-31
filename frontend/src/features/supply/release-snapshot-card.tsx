import { useCallback } from "react";

import type { ReleaseSnapshot } from "@/types/supply";
import { getReleaseSnapshot, getReleaseSnapshotState, releaseComplianceCsvUrl, type ReleaseSnapshotState } from "./release-check-api";
import { StatusDot } from "./status-dot";
import { formatDateTime, STATUS_LABEL } from "./supply-format";
import { isRunning, useLoaded } from "./use-loaded";

/** How often a queued snapshot is asked about while the card is open. */
export const QUEUED_POLL_MS = 5000;

const WAITING: Record<string, string> = {
  running: "The supply snapshot is being taken.",
  none: "No supply snapshot was asked for when this release was published.",
};

/** What supply data said when a release was published: its health then, the parts that needed a look, and the compliance draft. */
export function ReleaseSnapshotCard({ projectId, buildId }: { projectId: string; buildId: string }) {
  const stateFetcher = useCallback((signal: AbortSignal) => getReleaseSnapshotState(projectId, buildId, signal), [projectId, buildId]);
  // A queued snapshot is taken by a worker: ask again until it is taken or has failed, and stop when the card goes.
  const state = useLoaded<ReleaseSnapshotState>(
    `releases/${projectId}/${buildId}/state`, stateFetcher, "Could not read the supply snapshot", { refreshEvery: QUEUED_POLL_MS, refreshWhile: isRunning },
  );
  const taken = state.status === "ready" && state.data?.state === "done";
  const snapshotFetcher = useCallback((signal: AbortSignal) => getReleaseSnapshot(projectId, buildId, signal), [projectId, buildId]);
  const snapshot = useLoaded<ReleaseSnapshot>(taken ? `releases/${projectId}/${buildId}/snapshot` : null, snapshotFetcher, "Could not read the supply snapshot");

  if (state.status !== "ready" || !state.data) return null;
  if (state.data.state === "failed") {
    return <p className="text-xs text-muted-foreground">No supply snapshot was taken: {state.data.reason || "it failed"}</p>;
  }
  if (!taken) return <p className="text-xs text-muted-foreground">{WAITING[state.data.state]}</p>;
  if (snapshot.status !== "ready" || !snapshot.data) return null;
  const data = snapshot.data;
  return (
    <section aria-label="Supply when published" className="space-y-1 border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot status={data.status} />
        <span className="font-medium">{data.health === null ? "No supply data then" : `Supply health ${data.health.toFixed(1)} of 10 when published`}</span>
        <span className="text-xs text-muted-foreground">{STATUS_LABEL[data.status]}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {data.assessment.tracked} of {data.assessment.parts} parts tracked, {data.assessment.needing_a_look} needed a look. Taken {formatDateTime(data.created_at)}.
      </p>
      {data.compliance ? (
        <a className="text-xs underline" href={releaseComplianceCsvUrl(projectId, buildId)}>Compliance draft (CSV, a working document)</a>
      ) : null}
    </section>
  );
}
