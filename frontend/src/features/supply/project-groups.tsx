import type { SupplyPartGroup, SupplyStatus, PartsFilter, PartsScope } from "@/types/supply";
import { CollapsibleSection } from "./collapsible-section";
import { LoadMore } from "./load-more";
import type { PartsLayout } from "./parts-layout";
import { PartsTable } from "./parts-table";
import type { PartsSort } from "./parts-sort";
import { OpenProjectButton, ProjectRowSummary, StatusBar } from "./project-row-summary";
import { StatusDot } from "./status-dot";
import { useSupplyPartsFeed } from "./use-supply-parts";

interface ShownProps {
  scope: PartsScope;
  query: string;
  only: PartsFilter;
  vendor: string;
  layout: PartsLayout;
  sort: PartsSort;
  onSort: (sort: PartsSort) => void;
  selectedId: string | null;
  onOpen: (partId: string) => void;
}

const WORST_FIRST: readonly SupplyStatus[] = ["fatal", "error", "warning", "ok", "unknown"];

/** One group's parts, loaded as they scroll into view. Mounted only while its group is open. */
function GroupParts({ projectId, scope, query, only, vendor, layout, sort, onSort, selectedId, onOpen }: ShownProps & { projectId: string }) {
  const { items, hasMore, loadingMore, moreFailed, loadMore } = useSupplyPartsFeed(scope, query, only, projectId, vendor, sort);
  return (
    <>
      <PartsTable showProjects={false} layout={layout} items={items} selectedId={selectedId} onOpen={onOpen} sort={sort} onSort={onSort} />
      <LoadMore hasMore={hasMore} loading={loadingMore} failed={moreFailed} onLoad={() => void loadMore()} />
    </>
  );
}

function StatusChips({ group }: { group: SupplyPartGroup }) {
  return (
    <span className="flex items-center gap-2">
      <StatusBar group={group} />
      {WORST_FIRST.filter((status) => (group.statuses[status] ?? 0) > 0).map((status) => (
        <span key={status} className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
          <StatusDot status={status} className="h-2 w-2" />{group.statuses[status]}
        </span>
      ))}
    </span>
  );
}

/**
 * The parts grouped by the projects that use them, each group closed until opened, the parts in no project last.
 * Only when no project uses any of them is it one plain list.
 */
export function PartGroups({ groups, ...shown }: ShownProps & { groups: readonly SupplyPartGroup[] }) {
  if (groups.length === 1 && groups[0].project_id === "none") {
    return <GroupParts projectId="" {...shown} />;
  }
  const searching = shown.query.trim() !== "";
  return (
    <div className="space-y-2" aria-label="Parts by project">
      {groups.map((group) => (
        <CollapsibleSection
          // A search opens the groups it matches; without one the viewer's own choice stands.
          key={`${group.project_id}|${searching}`}
          id={`parts-group-${group.project_id}`}
          title={group.project_name}
          count={group.count}
          chips={<StatusChips group={group} />}
          summary={<ProjectRowSummary group={group} />}
          actions={group.project_id !== "none" ? <OpenProjectButton group={group} /> : null}
          stickyHeader
          startOpen={searching}
          remembers={!searching}
        >
          <GroupParts projectId={group.project_id} {...shown} />
        </CollapsibleSection>
      ))}
    </div>
  );
}
