import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SupplyFinding } from "@/types/supply";

const SEVERITY_LABEL = { fatal: "Critical", error: "Error", warning: "Warning", ok: "Note" } as const;

interface FindingRowProps {
  finding: SupplyFinding;
  canPropose: boolean;
  canApprove: boolean;
  /** Asks for a waiver with a reason. Without it the row offers no way to start one (the part sheet's outlook). */
  onPropose?: (reason: string) => void | Promise<void>;
  onDecide: (waiverId: string, approve: boolean) => void | Promise<void>;
  onRevoke: (waiverId: string) => void | Promise<void>;
}

/** One finding, its severity tag above it, and what has been decided about it. */
export function FindingRow({ finding, canPropose, canApprove, onPropose, onDecide, onRevoke }: FindingRowProps) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const waiver = finding.waiver;
  const holds = waiver?.holds === true;
  const mayAsk = canPropose && onPropose !== undefined;

  const submit = async () => {
    await onPropose?.(reason.trim());
    setAsking(false);
    setReason("");
  };

  return (
    <li className="space-y-1 p-2 text-sm">
      <Badge variant={holds ? "outline" : "warning"}>{SEVERITY_LABEL[finding.severity]}</Badge>
      <p className={holds ? "text-muted-foreground line-through" : undefined}>{finding.text}</p>
      {waiver ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{waiverText(finding)}</span>
          <span className="flex gap-1">
            {canApprove && waiver.state === "proposed" ? (
              <>
                <Button size="sm" variant="outline" className="h-6" onClick={() => void onDecide(waiver.id, true)}>Approve</Button>
                <Button size="sm" variant="outline" className="h-6" onClick={() => void onDecide(waiver.id, false)}>Reject</Button>
              </>
            ) : null}
            {mayAsk && waiver.outdated ? (
              <Button size="sm" variant="outline" className="h-6" onClick={() => setAsking(true)}>Waive again</Button>
            ) : null}
            {canPropose ? (
              <Button size="sm" variant="ghost" className="h-6" onClick={() => void onRevoke(waiver.id)}>
                {waiver.state === "proposed" ? "Withdraw" : "Revoke"}
              </Button>
            ) : null}
          </span>
        </div>
      ) : mayAsk && !asking ? (
        <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => setAsking(true)}>Waive</Button>
      ) : null}
      {asking ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim()) void submit();
          }}
        >
          <Input
            aria-label={`Why ${finding.check.replace(/_/g, " ")} is acceptable`}
            className="h-7"
            placeholder="Why this is acceptable"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button type="submit" size="sm" className="h-7" disabled={!reason.trim()}>{canApprove ? "Waive" : "Ask QA"}</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setAsking(false)}>Cancel</Button>
        </form>
      ) : null}
    </li>
  );
}

function waiverText(finding: SupplyFinding): string {
  const waiver = finding.waiver;
  if (!waiver) return "";
  if (waiver.outdated) return `Waived for an earlier condition: ${waiver.reason}`;
  if (waiver.state === "proposed") return `Waiting for QA, asked by ${waiver.proposed_by}: ${waiver.reason}`;
  return `Waived by ${waiver.decided_by}: ${waiver.reason}`;
}
