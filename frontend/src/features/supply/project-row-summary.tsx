import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { SupplyGroupStats, SupplyPartGroup, SupplyStatus } from "@/types/supply";
import { formatAgo, formatPrice, STATUS_FILL } from "./supply-format";

const ORDER: readonly SupplyStatus[] = ["fatal", "error", "warning", "ok", "unknown"];
/** The parts of a project by status, as one thin bar. */
export function StatusBar({ group, className = "w-56" }: { group: Pick<SupplyPartGroup, "statuses" | "count">; className?: string }) {
  return (
    <span role="img" aria-label="Parts by status" className={`flex h-1.5 overflow-hidden bg-muted ${className}`}>
      {ORDER.map((status) => {
        const count = group.statuses[status] ?? 0;
        return count > 0 ? <span key={status} className={STATUS_FILL[status]} style={{ width: `${(count / group.count) * 100}%` }} /> : null;
      })}
    </span>
  );
}

/** "29 of 56 lines" when the cost leaves lines unpriced (a subtotal); empty when it covers the whole BOM. */
export function partial(stats: Pick<SupplyGroupStats, "lines" | "lines_priced"> | null | undefined): string {
  return stats?.lines != null && stats.lines_priced != null && stats.lines_priced < stats.lines ? `${stats.lines_priced} of ${stats.lines} lines` : "";
}

/** The second line of a project row: cost, boards, BOM age and alerts. */
export function ProjectRowSummary({ group }: { group: SupplyPartGroup }) {
  const stats = group.stats;
  const cost = stats?.cost_per_board && stats.currency ? formatPrice(stats.cost_per_board, stats.currency) : null;
  const change = stats?.cost_change_percent;
  const third = [
    cost ? `${cost} a board${partial(stats) ? ` for ${partial(stats)}` : ""}${change ? ` ${change > 0 ? "▲" : "▼"} ${Math.abs(change)}% in 30 d` : ""}` : "",
    // A line that can't be checked makes the count a bound, not an answer: say so, as the project page does.
    stats?.unchecked ? `unconfirmed · ${stats.unchecked.toLocaleString()} unchecked`
      : stats?.boards !== undefined && stats.boards !== null ? `can build ${stats.boards.toLocaleString()}` : "",
    stats?.bom_read_at ? `BOM read ${formatAgo(stats.bom_read_at)}` : "",
    stats?.alerts ? `${stats.alerts} open ${stats.alerts === 1 ? "alert" : "alerts"}` : "",
  ].filter(Boolean);
  return third.length > 0 ? <span className="text-xs text-muted-foreground">{third.join(" · ")}</span> : null;
}

/** The usual icon button that opens the project's supply page. */
export function OpenProjectButton({ group }: { group: SupplyPartGroup }) {
  return (
    <Button asChild size="icon" variant="outline" className="h-8 w-8">
      <Link to={`/project/${encodeURIComponent(group.project_id)}?section=supply`} aria-label={`Open ${group.project_name}'s supply`} title={`Open ${group.project_name}'s supply`}>
        <ExternalLink className="h-4 w-4" />
      </Link>
    </Button>
  );
}
