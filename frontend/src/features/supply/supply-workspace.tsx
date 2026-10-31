import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Boxes, FolderKanban, LayoutDashboard, LineChart, ListChecks, Plug, ShieldAlert, type LucideIcon } from "lucide-react";

import { StudioTabsList, StudioTabsTrigger } from "@/components/ui/studio-tabs";
import { Tabs } from "@/components/ui/tabs";
import { canOpenSupply } from "@/lib/roles";
import type { User } from "@/types/auth";
import { getLibraryComponentOf } from "./supply-api";
import { useReviewWaiting } from "./review-page";
import { resolvePlace, type SupplyTab } from "./supply-views";

const DashboardView = lazy(() => import("./dashboard-view").then((module) => ({ default: module.DashboardView })));
const PartsView = lazy(() => import("./parts-view").then((module) => ({ default: module.PartsView })));
const InsightsView = lazy(() => import("./insights-view").then((module) => ({ default: module.InsightsView })));
const ProjectsView = lazy(() => import("./projects-view").then((module) => ({ default: module.ProjectsView })));
const ReviewPage = lazy(() => import("./review-page").then((module) => ({ default: module.ReviewPage })));
const SourcesView = lazy(() => import("./sources-view").then((module) => ({ default: module.SourcesView })));

const VIEWS: ReadonlyArray<{ id: SupplyTab; label: string; title: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", title: "Supply Dashboard", icon: LayoutDashboard },
  { id: "tracking", label: "Tracking", title: "Tracking", icon: Boxes },
  { id: "projects", label: "Projects", title: "Projects", icon: FolderKanban },
  { id: "insights", label: "Insights", title: "Supply Insights", icon: LineChart },
  { id: "review", label: "Review", title: "Review", icon: ListChecks },
  { id: "sources", label: "Sources", title: "Sources", icon: Plug },
];

function isSupplyView(value: string): value is SupplyTab {
  return VIEWS.some((view) => view.id === value);
}

/** The Supply section: stock, matching and sourcing. Tabs are added as they ship. */
export function SupplyWorkspace({ user }: { user: User | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Old addresses (overview, inbox, market, planning, bom-file) lead to the tab that took them over.
  const place = resolvePlace(searchParams.get("supplyView"), searchParams.get("tool"));
  const view = place.tab;
  const current = VIEWS.find((item) => item.id === view) ?? VIEWS[0];
  // The Parts tab puts its buttons here, on the right of the page title.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  // Counted again whenever the tab changes, so a decision made on Review shows when leaving it.
  const reviewWaiting = useReviewWaiting(canOpenSupply(user?.role));
  // A link to one part opens the component it counts for, on its Supply tab; a part the library has no component for opens its
  // sheet on Tracking.
  const linkedPart = searchParams.get("supplyView") === "part" ? searchParams.get("part") : null;
  const navigate = useNavigate();
  useEffect(() => {
    if (!linkedPart) return undefined;
    const controller = new AbortController();
    const toTracking = () => setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("supplyView", "tracking");
      return updated;
    }, { replace: true });
    getLibraryComponentOf(linkedPart, controller.signal).then(({ component_id: componentId }) => {
      if (componentId) navigate(`/?section=library-manager&libraryView=catalog&component=${encodeURIComponent(componentId)}&componentTab=sourcing`, { replace: true });
      else toTracking();
    }, () => { if (!controller.signal.aborted) toTracking(); });
    return () => controller.abort();
  }, [linkedPart, navigate, setSearchParams]);

  if (!canOpenSupply(user?.role)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Supply data is not available to your role</p>
        <p className="max-w-md text-sm text-muted-foreground">Designers, QA and administrators can open it.</p>
      </div>
    );
  }

  const setView = (next: SupplyTab) => {
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("section", "supply");
      updated.set("supplyView", next);
      // The open part is drawn by whichever tab is shown; the search and scope stay with the Parts tab, which keeps them.
      updated.delete("part");
      updated.delete("tool");
      return updated;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b bg-card pr-3">
      <Tabs
        value={view}
        onValueChange={(next) => { if (isSupplyView(next)) setView(next); }}
        className="gap-0 px-3 py-1.5"
      >
        <StudioTabsList aria-label="Supply sections">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <StudioTabsTrigger key={id} value={id} className="gap-1.5">
              <Icon className="h-4 w-4" />
              {label}
              {id === "review" && reviewWaiting ? <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground" aria-label={`${reviewWaiting} waiting`}>{reviewWaiting}</span> : null}
            </StudioTabsTrigger>
          ))}
        </StudioTabsList>
      </Tabs>
      </div>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <current.icon className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{current.title}</h2>
        </div>
        <div ref={setHeaderSlot} className="flex items-center gap-2" />
      </header>
      <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
        <div className="min-h-0 flex-1 overflow-hidden">
          {/* Only the shown tab is mounted; a return to a tab starts from what the store kept and reads again behind it. */}
          <div key={view} className="h-full">
            {view === "dashboard" && <DashboardView user={user} />}
            {view === "tracking" && <PartsView user={user} headerSlot={headerSlot} />}
            {view === "projects" && <ProjectsView user={user} />}
            {view === "insights" && <InsightsView user={user} />}
            {view === "review" && <ReviewPage user={user} />}
            {view === "sources" && <SourcesView user={user} />}
          </div>
        </div>
      </Suspense>
    </div>
  );
}
