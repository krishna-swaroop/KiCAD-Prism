import { useCallback } from "react";

import type { ReleaseCheck } from "@/types/supply";
import { CheckOnceButton } from "./check-once-button";
import { getReleaseCheck } from "./release-check-api";
import { HeartPulse, TriangleAlert } from "lucide-react";

import { StatusDot } from "./status-dot";
import { StatChip } from "./supply-icons";
import { STATUS_LABEL } from "./supply-format";
import { useLoaded } from "./use-loaded";

/** The supply check of a release build, loaded once for whoever shows it. Someone who cannot read supply data sees nothing. */
export function useReleaseCheck(projectId: string, buildId: string) {
  const fetcher = useCallback((signal: AbortSignal) => getReleaseCheck(projectId, buildId, signal), [projectId, buildId]);
  return useLoaded<ReleaseCheck>(`releases/${projectId}/${buildId}/check`, fetcher, "Could not check the BOM");
}

/** One line: the status as a dot, the health, and how many parts need a look. */
export function ReleaseSupplySummary({ projectId, buildId }: { projectId: string; buildId: string }) {
  const check = useReleaseCheck(projectId, buildId);
  if (check.status !== "ready" || !check.data || !check.data.available) return null;
  const data = check.data;
  return (
    <p className="flex items-center gap-2 text-xs" aria-label="Supply check summary">
      <StatusDot status={data.status} />
      <StatChip icon={HeartPulse} value={data.health === null ? "?" : data.health.toFixed(1)} text={data.health === null ? "No supply data on this BOM yet" : `Supply health ${data.health.toFixed(1)} of 10`} />
      {data.needing_a_look > 0 ? <StatChip icon={TriangleAlert} value={String(data.needing_a_look)} text={`${data.needing_a_look} to look at`} className="text-warning" /> : null}
    </p>
  );
}

/**
 * What supply data says about the BOM being released: the one the build exported. It informs the release and blocks
 * nothing. A failed check shows no card: this is not the release's problem.
 */
export function ReleaseSupplyCheck({ projectId, buildId }: { projectId: string; buildId: string }) {
  const check = useReleaseCheck(projectId, buildId);
  if (check.status === "loading") return <p className="text-xs text-muted-foreground">Checking the BOM against supply data...</p>;
  if (check.status === "error" || !check.data) return null;
  const data = check.data;
  if (!data.available) return <p className="text-xs text-muted-foreground">{data.reason}</p>;
  // Parts on the release BOM nobody reads: a check once gives the verdict fresh figures.
  const unread = data.lines.filter((line) => line.manufacturer && line.mpn && (line.state === "unknown" || line.status === null));

  return (
    <section aria-label="Supply check" className="space-y-2 border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot status={data.status} />
        <span className="font-medium">{data.health === null ? "No supply data on this BOM yet" : `BOM health ${data.health.toFixed(1)} of 10`}</span>
        <span className="text-xs text-muted-foreground">{STATUS_LABEL[data.status]}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {data.tracked} of {data.parts} parts tracked
        {data.not_tracked > 0 ? `, ${data.not_tracked} not yet` : ""}
        {data.without_number > 0 ? `, ${data.without_number} lines without a part number` : ""}. This is a note for the release; it does not block
        publishing.
      </p>
      {unread.length > 0 ? <CheckOnceButton projectId={projectId} lines={unread} onFinished={check.refresh} /> : null}
      {data.attention.length > 0 ? (
        <ul aria-label="Parts that need a look" className="divide-y border">
          {data.attention.map((line) => (
            <li key={`${line.manufacturer}|${line.mpn}`} className="space-y-0.5 p-2 text-xs">
              <div className="font-medium">{line.mpn}{line.manufacturer ? `, ${line.manufacturer}` : ""}</div>
              {line.findings.map((finding) => (
                <div key={finding.check} className="text-muted-foreground">{finding.text}</div>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
