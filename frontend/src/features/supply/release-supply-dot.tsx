import { StatusDot } from "./status-dot";
import { useReleaseCheck } from "./release-supply-check";

/** The status of a release build's BOM as a dot, for a stage rail. Nothing when there is nothing to say. */
export function ReleaseSupplyDot({ projectId, buildId }: { projectId: string; buildId: string }) {
  const check = useReleaseCheck(projectId, buildId);
  if (check.status !== "ready" || !check.data || !check.data.available) return null;
  return <StatusDot status={check.data.status} />;
}
