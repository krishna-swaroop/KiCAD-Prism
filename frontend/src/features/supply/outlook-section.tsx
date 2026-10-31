import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/types/auth";
import type { SupplyOutlook } from "@/types/supply";
import { HealthBody } from "./health-body";
import { HoverDetails } from "./hover-details";
import { StatusDot } from "./status-dot";
import { STATUS_LABEL } from "./supply-format";
import { useHealth } from "./use-health";

const TONE: Record<SupplyOutlook["band"], "outline" | "warning" | "destructive" | "success"> = {
  ended: "destructive",
  ending: "destructive",
  warning_signs: "warning",
  no_signs: "success",
  unknown: "outline",
};

/**
 * Whether the part is heading for its end, and how healthy it is, on one line: the outlook with every signal behind it, then the
 * health score. One info icon opens what both rest on: how the outlook is worked out, the five scores and the findings.
 */
export function OutlookSection({ outlook, partId = null, role, below = null }: { outlook: SupplyOutlook; partId?: string | null; role?: UserRole | null; below?: ReactNode }) {
  const { assessment, error, canPropose, canApprove, act } = useHealth(partId, role);
  const data = assessment.data;
  const scored = data ? data.status !== "unknown" : false;
  return (
    <section aria-label="Outlook" className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outlook</h3>
        <Badge variant={TONE[outlook.band]}>{outlook.label}</Badge>
        {data ? (
          <span className="flex items-center gap-2">
            <StatusDot status={data.status} />
            <span className="text-sm font-medium">{scored ? `${data.health.toFixed(1)} of 10` : "No data to assess yet"}</span>
            <span className="text-xs text-muted-foreground">{STATUS_LABEL[data.status]}</span>
          </span>
        ) : assessment.status === "loading" && partId ? <span className="text-xs text-muted-foreground">Assessing...</span> : null}
        <HoverDetails label="Show how the outlook and the health are worked out">
          <p className="text-xs text-muted-foreground">
            {outlook.band === "no_signs"
              ? "The outlook is rule-based. Nothing found points to an end. That is not a promise of a long life."
              : "The outlook is rule-based, from the signals below."}
          </p>
          {outlook.signals.length > 0 ? (
            <ul aria-label="Outlook signals" className="space-y-0.5 text-sm">
              {outlook.signals.map((signal) => (
                <li key={signal.text}>
                  {signal.text} <span className="text-xs text-muted-foreground">({signal.source})</span>
                </li>
              ))}
            </ul>
          ) : null}
          {data && scored && partId ? <HealthBody partId={partId} data={data} canPropose={canPropose} canApprove={canApprove} act={act} /> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </HoverDetails>
      </div>
      {assessment.status === "error" && !data && partId ? (
        <p className="text-xs text-muted-foreground">
          {assessment.error}{" "}
          <button type="button" className="underline" onClick={assessment.retry}>Retry</button>
        </p>
      ) : null}
      {outlook.signals.length === 0 && outlook.band === "unknown" ? (
        <p className="text-xs text-muted-foreground">Nothing has been read for this part yet.</p>
      ) : null}
      {below}
    </section>
  );
}
