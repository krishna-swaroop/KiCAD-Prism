import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Database, DownloadCloud, PackageCheck, Plug, Table2, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { User } from "@/types/auth";
import type { Project } from "@/types/project";
import { LibraryCatalogWorkspace } from "./library-catalog-workspace";

const LibraryBulkEditWorkspace = lazy(() => import("./library-bulk-edit-workspace").then((module) => ({ default: module.LibraryBulkEditWorkspace })));
const LibraryComponentWorkspace = lazy(() => import("./library-component-workspace").then((module) => ({ default: module.LibraryComponentWorkspace })));
const LibraryImportCenter = lazy(() => import("./library-import-center").then((module) => ({ default: module.LibraryImportCenter })));
const LibraryReleaseQueue = lazy(() => import("./library-release-queue").then((module) => ({ default: module.LibraryReleaseQueue })));

type LibraryView = "catalog" | "bulk-edit" | "imports" | "releases" | "connectors";

const VIEW_LABELS: Record<LibraryView, string> = {
  catalog: "Catalog",
  "bulk-edit": "Bulk Edit",
  imports: "Import Center",
  releases: "Release Queue",
  connectors: "Connectors",
};

const VIEW_ICONS: Record<LibraryView, LucideIcon> = {
  catalog: Database,
  "bulk-edit": Table2,
  imports: DownloadCloud,
  releases: PackageCheck,
  connectors: Plug,
};

export function LibraryManagerWorkspace({ user, projects }: { user: User | null; projects: Project[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const componentId = searchParams.get("component") || "";
  const requestedView = searchParams.get("libraryView") as LibraryView | null;
  const view: LibraryView = requestedView && ["catalog", "bulk-edit", "imports", "releases", "connectors"].includes(requestedView) ? requestedView : "catalog";

  const setView = (next: LibraryView) => {
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("section", "library-manager");
      updated.set("libraryView", next);
      updated.delete("component");
      updated.delete("componentTab");
      updated.delete("revision");
      updated.delete("compare");
      return updated;
    });
  };

  const openComponent = (id: string, tab = "overview", returnView: LibraryView = "catalog") => {
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("section", "library-manager");
      updated.set("libraryView", returnView);
      updated.set("component", id);
      updated.set("componentTab", tab);
      updated.delete("revision");
      updated.delete("compare");
      return updated;
    });
  };

  const closeComponent = () => {
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      updated.delete("component");
      updated.delete("componentTab");
      updated.delete("revision");
      updated.delete("compare");
      updated.set("section", "library-manager");
      if (!updated.get("libraryView")) updated.set("libraryView", "catalog");
      return updated;
    });
  };

  if (componentId) {
    return <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Opening component workspace…</div>}><LibraryComponentWorkspace componentId={componentId} user={user} projects={projects} onBack={closeComponent} /></Suspense>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Ghost buttons in a row did not read as switchable sections. These use the
          shadcn Tabs component in its "line" variant, so the selected section is
          marked the same way tabs are marked everywhere else in the design system. */}
      <Tabs
        value={view}
        onValueChange={(next) => setView(next as LibraryView)}
        className="shrink-0 gap-0 border-b bg-card px-3"
      >
        <TabsList variant="line" className="h-10 gap-2" aria-label="Library Manager sections">
          {(["catalog", "bulk-edit", "imports", "releases", "connectors"] as LibraryView[]).map((item) => {
            const Icon = VIEW_ICONS[item];
            return (
              <TabsTrigger key={item} value={item} className="gap-2 px-2 text-sm">
                <Icon className="h-4 w-4" />
                {VIEW_LABELS[item]}
                {item === "connectors" ? (
                  <Badge variant="outline" className="px-1 text-[10px] font-normal text-muted-foreground">
                    Coming soon
                  </Badge>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading library workspace…</div>}>
      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "catalog" && <LibraryCatalogWorkspace user={user} onOpenComponent={(id) => openComponent(id, "overview", "catalog")} />}
        {view === "bulk-edit" && <LibraryBulkEditWorkspace user={user} />}
        {view === "imports" && <LibraryImportCenter projects={projects} user={user} initialSessionId={searchParams.get("session") || undefined} />}
        {view === "releases" && <LibraryReleaseQueue onOpenComponent={(id) => openComponent(id, "review", "releases")} />}
        {view === "connectors" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <Plug className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Connectors are not available yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              PLM and MRP integrations will be configured here. Machine access is already
              possible today through OAuth2 service clients.
            </p>
          </div>
        )}
      </div>
      </Suspense>
    </div>
  );
}
