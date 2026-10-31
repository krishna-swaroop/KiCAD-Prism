import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { SupplyToApprove } from "@/types/supply";
import { partHref } from "./supply-views";
import { CollapsibleSection } from "./collapsible-section";
import { decideAlternate } from "./component-supply-api";
import { decideDismissal } from "./ending-api";
import { decideMute } from "./tracking-api";
import { decideWaiver } from "./supply-api";
import { formatAgo } from "./supply-format";
import { useConnectorSubmit } from "./use-connector-submit";

function Row({ kind, title, detail, to, decide, canDecide, onDecided }: {
  kind: string; title: string; detail: string; to: string; decide: (approve: boolean) => Promise<void>; canDecide: boolean; onDecided: () => Promise<void>;
}) {
  const { busy, error, run } = useConnectorSubmit();
  const act = (approve: boolean) => void run(async () => { await decide(approve); await onDecided(); });
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <span className="bg-secondary px-2 py-0.5 text-xs">{kind}</span>
      <div className="min-w-0 flex-1">
        <Link to={to} className="truncate text-sm font-medium text-primary hover:underline">{title}</Link>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      {canDecide ? (
        <div className="flex shrink-0 gap-2">
          <Button size="sm" disabled={busy} onClick={() => act(true)}>Approve</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(false)}>Reject</Button>
        </div>
      ) : null}
      {error ? <p role="alert" className="basis-full text-xs text-destructive">{error}</p> : null}
    </li>
  );
}

function componentHref(componentId: string): string {
  return `/?section=library-manager&libraryView=catalog&component=${encodeURIComponent(componentId)}&componentTab=sourcing`;
}

/** Waivers, alternates and dismissals people proposed and QA decides on, with a link to where each lives. */
export function ToApprove({ items, canDecide, onDecided }: { items: SupplyToApprove | undefined; canDecide: boolean; onDecided: () => Promise<void> }) {
  const waivers = items?.waivers ?? [];
  const alternates = items?.alternates ?? [];
  const dismissals = items?.dismissals ?? [];
  const mutes = items?.mutes ?? [];
  const count = waivers.length + alternates.length + dismissals.length + mutes.length;
  if (count === 0) return null;
  return (
    <CollapsibleSection id="review-to-approve" title="To approve" count={count}>
      <ul className="divide-y">
        {alternates.map((item) => (
          <Row
            key={`${item.component_id}:${item.part_id}`} kind="Alternate"
            title={`${item.mpn}, ${item.manufacturer} for ${item.component_name || item.component_mpn}`}
            detail={[item.main_mpn ? `vs ${item.main_mpn}` : "", `${item.proposed_by}, ${formatAgo(item.proposed_at)}`].filter(Boolean).join(" · ")}
            to={componentHref(item.component_id)}
            decide={async (approve) => { await decideAlternate(item.component_id, item.part_id, approve, item.main_part_id); }} canDecide={canDecide} onDecided={onDecided}
          />
        ))}
        {dismissals.map((item) => (
          <Row
            key={item.id} kind="Dismissal" title={item.component_name || item.component_mpn}
            detail={`${item.reasons.map((reason) => reason.replace(/_/g, " ")).join(", ")} (${item.proposed_by}, ${formatAgo(item.proposed_at)})`}
            to={componentHref(item.component_id)}
            decide={(approve) => decideDismissal(item.id, approve)} canDecide={canDecide} onDecided={onDecided}
          />
        ))}
        {mutes.map((item) => (
          <Row
            key={item.id} kind="Alert off" title={`${item.mpn}, ${item.manufacturer}`}
            detail={`${item.kind.replace(/_/g, " ")} (${item.proposed_by}, ${formatAgo(item.proposed_at)})`}
            to={partHref(item.part_id)}
            decide={(approve) => decideMute(item.id, approve)} canDecide={canDecide} onDecided={onDecided}
          />
        ))}
        {waivers.map((item) => (
          <Row
            key={item.id} kind="Waiver" title={`${item.mpn}, ${item.manufacturer}`} detail={`${item.reason} (${item.proposed_by}, ${formatAgo(item.proposed_at)})`}
            to={partHref(item.part_id)}
            decide={(approve) => decideWaiver(item.id, approve)} canDecide={canDecide} onDecided={onDecided}
          />
        ))}
      </ul>
    </CollapsibleSection>
  );
}
