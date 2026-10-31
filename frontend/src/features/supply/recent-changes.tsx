import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { SupplyRecentChange } from "@/types/supply";
import { alertTitle } from "./alert-text";
import { StatusDot } from "./status-dot";
import { formatAgo } from "./supply-format";

function names(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return items.flatMap((item) => { const mpn = String((item as { mpn?: unknown }).mpn ?? ""); return mpn ? [mpn] : []; }).join(", ");
}

/** What a tracked project's new revision added to its BOM and took off it. */
export function bomChangeSentence(detail: Record<string, unknown>): string {
  const added = Number(detail.added_count ?? 0);
  const removed = Number(detail.removed_count ?? 0);
  const parts = [];
  if (added > 0) parts.push(`${added} added (${names(detail.added)}${added > 20 ? ", …" : ""})`);
  if (removed > 0) parts.push(`${removed} removed (${names(detail.removed)}${removed > 20 ? ", …" : ""})`);
  return `New BOM revision: ${parts.join("; ")}. Added parts are tracked; removed ones leave tracking unless something else keeps them.`;
}

function sentence(change: SupplyRecentChange): string {
  const detail = change.detail ?? {};
  if (change.type === "project_bom_changed") return bomChangeSentence(detail);
  if (change.type === "listing_gone") {
    const packaging = typeof detail.packaging === "string" && detail.packaging !== "unknown" ? `, ${detail.packaging.replace(/_/g, " ")}` : "";
    return `A distributor stopped listing it${change.sku ? ` (${change.sku}${packaging})` : ""}`;
  }
  if (change.type === "lifecycle_changed") return `Lifecycle changed from ${String(detail.from).replace(/_/g, " ")} to ${String(detail.to).replace(/_/g, " ")}${change.sku ? ` (${change.sku})` : ""}`;
  if (change.type === "normally_stocking_lost") return `A distributor no longer stocks it normally${change.sku ? ` (${change.sku})` : ""}`;
  if (change.type === "family_member_new") return `A new number turned up beside it: ${String(detail.mpn)}${detail.manufacturer ? ` (${String(detail.manufacturer)})` : ""}`;
  if (change.type === "param_changed") return `${String(detail.provider)} changed ${String(detail.name)} from ${String(detail.from)} to ${String(detail.to)} with no notice`;
  if (change.type === "moq_jump") return `Smallest order went from ${String(detail.from)} to ${String(detail.to)}${change.sku ? ` (${change.sku})` : ""}`;
  if (!change.alert) return "";
  return change.type === "alert_cleared" ? `Cleared: ${alertTitle(change.alert)}` : alertTitle(change.alert);
}

const PAGE_SIZE = 25;

/** Alerts that opened or cleared and listings that went in the last two weeks, newest first, 25 to a page. */
export function RecentChanges({ changes, onOpenPart }: { changes: SupplyRecentChange[]; onOpenPart: (partId: string) => void }) {
  const [requested, setPage] = useState(0);
  if (changes.length === 0) return null;
  const pages = Math.ceil(changes.length / PAGE_SIZE);
  const page = Math.min(requested, pages - 1);
  const shown = changes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <section aria-label="Recent changes">
      <ul className="border">
        {shown.map((change) => (
          <li key={`${change.type}-${change.part_id ?? String(change.detail?.project_id)}-${change.at}`} className="flex items-center gap-3 border-b px-3 py-2 last:border-0">
            <StatusDot status={change.type === "alert_cleared" || change.type === "project_bom_changed" ? "ok" : (change.alert?.severity ?? "warning")} />
            <div className="min-w-0 flex-1">
              {change.part_id === null ? (
                <Link to={`/project/${encodeURIComponent(String(change.detail?.project_id ?? ""))}?section=supply`} className="text-sm font-medium hover:underline">
                  {String(change.detail?.project_name ?? "Project")}
                </Link>
              ) : (
                <button type="button" className="text-left text-sm font-medium hover:underline" onClick={() => onOpenPart(change.part_id ?? "")}>
                  {change.mpn}
                </button>
              )}
              <span className="ml-2 text-xs text-muted-foreground">{change.manufacturer}</span>
              <p className="truncate text-xs text-muted-foreground">{sentence(change)}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{formatAgo(change.at)}</span>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <nav aria-label="Recent changes pages" className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span aria-live="polite">{page * PAGE_SIZE + 1}–{page * PAGE_SIZE + shown.length} of {changes.length}</span>
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
        </nav>
      ) : null}
    </section>
  );
}
