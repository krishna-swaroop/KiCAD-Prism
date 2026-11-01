import type { SupplyIndexBuild } from "./supply-api";

/** What queueing the BOMs did, in a sentence. */
export function indexBuildSummary(result: SupplyIndexBuild): string {
  if (result.missing === 0) return "Every project's BOM has been read already.";
  const rest = result.missing - result.queued;
  return `Reading ${result.queued} ${result.queued === 1 ? "project" : "projects"} in the background. Come back in a few minutes.${rest > 0 ? ` ${rest} more are waiting: click again after these finish.` : ""}`;
}
