import type { SupplyAssessment, SupplySubScore } from "@/types/supply";
import { FindingRow } from "./finding-row";
import { decideWaiver, proposeWaiver, revokeWaiver } from "./supply-api";

const SCORE_LABEL: Record<SupplySubScore["name"], string> = {
  lifecycle: "Lifecycle", sourcing: "Sourcing", inventory: "Inventory", market: "Market", compliance: "Compliance",
};

/** The five scores and every finding behind a part's health, with the waivers people have asked for or approved. */
export function HealthBody({ partId, data, canPropose, canApprove, act }: {
  partId: string;
  data: SupplyAssessment;
  canPropose: boolean;
  canApprove: boolean;
  act: (action: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <ul aria-label="Risk" className="grid grid-cols-5 gap-1 text-center text-[11px]">
        {data.sub_scores.map((item) => (
          <li key={item.name} title={item.reasons.join(" ") || "Nothing to flag"} className="border p-1">
            <div className="text-muted-foreground">{SCORE_LABEL[item.name]}</div>
            <div className={item.score >= 4 ? "font-semibold text-destructive" : item.score >= 3 ? "font-semibold text-warning" : "font-semibold"}>
              {item.score}/5
            </div>
          </li>
        ))}
      </ul>
      {data.findings.length > 0 ? (
        <ul aria-label="Findings" className="divide-y border">
          {data.findings.map((finding) => (
            <FindingRow
              key={finding.check}
              finding={finding}
              canPropose={canPropose}
              canApprove={canApprove}
              onPropose={(reason) => act(() => proposeWaiver(partId, finding.check, reason))}
              onDecide={(waiverId, approve) => void act(() => decideWaiver(waiverId, approve))}
              onRevoke={(waiverId) => void act(() => revokeWaiver(waiverId))}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No findings.</p>
      )}
    </div>
  );
}
