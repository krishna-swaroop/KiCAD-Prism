import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Ban, BellRing, Eye, Hourglass, PackageX } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { canOpenLibraryManager } from "@/lib/roles";
import type { User } from "@/types/auth";
import type { PartsFilter, SupplyDashboard } from "@/types/supply";
import { AdminStrip } from "./admin-strip";
import { AlertList } from "./dashboard-alerts";
import { EndingNotifications } from "./ending-notifications";
import { RunwayCard } from "./dashboard-charts";
import { ComingUpCard, likelyOutTile } from "./dashboard-forecast";
import { DeadlinesCard, ProjectsTableCard, RiskGridCard } from "./dashboard-risk-cards";
import { TileButton, type Tile } from "./dashboard-tiles";
import { RecentChanges } from "./recent-changes";
import { getSupplyDashboard } from "./supply-api";
import { useLoaded } from "./use-loaded";
import { OpenPartSheet } from "./open-part-sheet";
import { useSupplyNavigation } from "./use-supply-navigation";

const RUNWAY_FILTER: Record<keyof SupplyDashboard["runway"], PartsFilter> = {
  out_now: "out_of_stock", runs_out_2w: "runs_out_2w", runs_out_8w: "runs_out_8w", runs_out_later: "runs_out_later", steady: "steady", few_readings: "few_readings",
};

/** Opens one of the Dashboard's folded lists and brings it into view. */
function showDetails(id: string) {
  const section = document.getElementById(id);
  if (section instanceof HTMLDetailsElement) section.open = true;
  section?.scrollIntoView?.();
}

function showAlerts() {
  showDetails("dashboard-alerts");
}

/** What across the workspace needs a person: counts with their trend, charts that open the parts behind them, then the alerts. */
export function DashboardView({ user }: { user: User | null }) {
  const dashboardFetcher = useCallback((signal: AbortSignal) => getSupplyDashboard(signal), []);
  const dashboard = useLoaded<SupplyDashboard>("dashboard", dashboardFetcher, "Could not load the dashboard");
  const { go, openPart } = useSupplyNavigation();
  const navigate = useNavigate();
  const [alertKind, setAlertKind] = useState("");
  const data = dashboard.data;
  const parts = (only: PartsFilter, scope?: string) => () => go("tracking", { ...(only ? { partsOnly: only } : {}), ...(scope ? { partsScope: scope } : {}) });
  const history = (name: string) => data?.figure_history[name];
  const likely = likelyOutTile(data?.forecast);
  const tiles: Tile[] = [
    { label: "Tracked", value: data?.figures.watched, icon: Eye, history: history("watched"), onClick: parts("") },
    { label: "At risk", value: data?.figures.at_risk, icon: AlertTriangle, bad: true, history: history("at_risk"), onClick: parts("at_risk") },
    { label: "Out of stock", value: data?.figures.out_of_stock, icon: PackageX, bad: true, history: history("out_of_stock"), onClick: parts("out_of_stock") },
    { label: "End of life", value: data?.figures.lifecycle, icon: Ban, bad: true, history: history("lifecycle"), onClick: parts("lifecycle") },
    { label: "Open alerts", value: data?.figures.open_alerts, icon: BellRing, bad: true, history: history("open_alerts"), onClick: showAlerts },
    { label: "Queued for calls", value: data?.figures.waiting, icon: Hourglass, history: history("waiting"), onClick: parts("", "waiting") },
    ...(likely ? [{ ...likely, icon: Hourglass, bad: true, onClick: parts("likely_out_4w") }] : []),
  ];
  const openComponent = (componentId: string) =>
    navigate(`/?section=library-manager&libraryView=catalog&component=${encodeURIComponent(componentId)}&componentTab=sourcing`);
  return (
    <div className="themed-scrollbar relative h-full overflow-y-auto px-4 pb-4 pt-2">
      <div className="space-y-4">
        {user?.role === "admin" ? <AdminStrip waiting={data?.figures.waiting ?? 0} /> : null}
        {dashboard.status === "loading" ? <Skeleton className="h-24 w-full" aria-label="Loading the dashboard" /> : null}
        {dashboard.status === "error" ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-3">
              {dashboard.error}
              <Button size="sm" variant="outline" onClick={dashboard.retry}>Retry</Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {dashboard.status === "ready" && data ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
              {tiles.filter((tile) => tile.value !== undefined).map((tile) => <TileButton key={tile.label} tile={tile} />)}
            </div>
            {canOpenLibraryManager(user?.role) ? <EndingNotifications role={user?.role} onOpenComponent={openComponent} /> : null}
            <div className="grid gap-3 lg:grid-cols-2">
              <RiskGridCard grid={data.risk_grid} onOpen={(filter) => parts(filter)()} />
              <DeadlinesCard deadlines={data.deadlines} onOpenPart={openPart} />
              <RunwayCard runway={data.runway} onOpen={(key) => parts(RUNWAY_FILTER[key])()} />
              <ProjectsTableCard projects={data.projects} />
              {data.forecast && data.forecast.state.state === "shown" ? (
                <ComingUpCard events={data.forecast.coming_up} today={new Date().toISOString().slice(0, 10)} onOpenPart={openPart} />
              ) : null}
            </div>
          </>
        ) : null}
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <AlertList user={user} dashboard={data} feedsFailing={(data?.failing_feeds?.length ?? 0) > 0} kind={alertKind} onKind={setAlertKind} onOpenPart={openPart} />
          {data && data.recent_changes.length > 0 ? (
            <details open>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent changes</summary>
              <div className="mt-2"><RecentChanges changes={data.recent_changes} onOpenPart={openPart} /></div>
            </details>
          ) : null}
        </div>
      </div>
      <OpenPartSheet user={user} />
    </div>
  );
}
