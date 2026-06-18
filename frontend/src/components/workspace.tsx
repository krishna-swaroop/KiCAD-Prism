import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";

import type { User } from "@/types/auth";
import type { FolderTreeItem, Project } from "@/types/project";
import { Button } from "@/components/ui/button";
import { useWorkspaceData } from "@/hooks/use-workspace-data";
import { useWorkspaceSearch } from "@/hooks/use-workspace-search";
import { canManageProjects as roleCanManageProjects, canOpenLibraryManager } from "@/lib/roles";
import { WorkspaceBreadcrumbs } from "./workspace/workspace-breadcrumbs";
import { WorkspaceGalleryView } from "./workspace/workspace-gallery-view";
import { WorkspaceListView } from "./workspace/workspace-list-view";
import { LibraryManagerPanel } from "./workspace/library-manager-panel";
import { WorkspaceAppsPlaceholder } from "./workspace/workspace-apps-placeholder";
import { WorkspaceLoadingState } from "./workspace/workspace-loading-state";
import { WorkspaceProjectPropertiesSheet } from "./workspace/workspace-project-properties-sheet";
import { WorkspaceProjectToolbar } from "./workspace/workspace-project-toolbar";
import { WorkspaceSidebar } from "./workspace/workspace-sidebar";
import { WorkspaceSection, ViewMode } from "./workspace/workspace-types";

const WORKSPACE_PAGE_SIZE = 25;

const ImportDialog = lazy(() =>
  import("./import-dialog").then((module) => ({ default: module.ImportDialog }))
);
const SettingsDialog = lazy(() =>
  import("./settings-dialog").then((module) => ({ default: module.SettingsDialog }))
);
const CreateFolderDialog = lazy(() =>
  import("./workspace/create-folder-dialog").then((module) => ({ default: module.CreateFolderDialog }))
);
const DeleteFolderDialog = lazy(() =>
  import("./workspace/delete-folder-dialog").then((module) => ({ default: module.DeleteFolderDialog }))
);
const DeleteProjectDialog = lazy(() =>
  import("./workspace/delete-project-dialog").then((module) => ({ default: module.DeleteProjectDialog }))
);
const MoveProjectDialog = lazy(() =>
  import("./workspace/move-project-dialog").then((module) => ({ default: module.MoveProjectDialog }))
);
const RenameFolderDialog = lazy(() =>
  import("./workspace/rename-folder-dialog").then((module) => ({ default: module.RenameFolderDialog }))
);

interface WorkspaceProps {
  searchQuery: string;
  user: User | null;
}

export function Workspace({ searchQuery, user }: WorkspaceProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { projects, folders, loading, error, folderById, refresh, createFolder, renameFolder, deleteFolder, moveProject, deleteProject } =
    useWorkspaceData();

  const [section, setSection] = useState<WorkspaceSection>("projects");
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeApp, setActiveApp] = useState<"index" | "library-manager">("index");

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [folderToRename, setFolderToRename] = useState<FolderTreeItem | null>(null);
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);

  const [folderToDelete, setFolderToDelete] = useState<FolderTreeItem | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  const [projectToMove, setProjectToMove] = useState<Project | null>(null);
  const [isMovingProject, setIsMovingProject] = useState(false);

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const canManageProjects = roleCanManageProjects(user?.role);
  const canOpenSettings = user?.role === "admin";
  const canOpenLibrary = canOpenLibraryManager(user?.role);

  const getProjectDisplayName = (project: Project) => project.display_name || project.name;
  const folderFromUrl = searchParams.get("folder");
  const currentFolderId = folderFromUrl && folderById.has(folderFromUrl) ? folderFromUrl : null;

  const setFolderInUrl = useCallback(
    (folderId: string | null, replace = false) => {
      setSearchParams(
        (currentParams) => {
          const nextParams = new URLSearchParams(currentParams);
          if (folderId) {
            nextParams.set("folder", folderId);
          } else {
            nextParams.delete("folder");
          }
          return nextParams;
        },
        { replace }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (!loading && folderFromUrl && !folderById.has(folderFromUrl)) {
      setFolderInUrl(null, true);
    }
  }, [loading, folderFromUrl, folderById, setFolderInUrl]);

  const visibleFolders = useMemo(() => {
    return folders
      .filter((folder) => (folder.parent_id ?? null) === currentFolderId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, currentFolderId]);

  const visibleProjects = useMemo(() => {
    return projects
      .filter((project) => (project.folder_id ?? null) === currentFolderId)
      .sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name));
  }, [projects, currentFolderId]);

  const { isSearching, searchResults } = useWorkspaceSearch(projects, folderById, searchQuery);

  const breadcrumbs = useMemo(() => {
    const trail: FolderTreeItem[] = [];
    let activeId = currentFolderId;
    let guard = 0;

    while (activeId && guard < 64) {
      const folder = folderById.get(activeId);
      if (!folder) {
        break;
      }
      trail.unshift(folder);
      activeId = folder.parent_id ?? null;
      guard += 1;
    }

    return trail;
  }, [currentFolderId, folderById]);

  const listFolders = isSearching ? [] : visibleFolders;
  const allListProjects = isSearching ? searchResults : visibleProjects;
  const totalPages = Math.max(1, Math.ceil(allListProjects.length / WORKSPACE_PAGE_SIZE));
  const pageStart = (currentPage - 1) * WORKSPACE_PAGE_SIZE;
  const listProjects = allListProjects.slice(pageStart, pageStart + WORKSPACE_PAGE_SIZE);
  const pageLabel =
    allListProjects.length === 0
      ? "0 projects"
      : `${pageStart + 1}-${Math.min(pageStart + WORKSPACE_PAGE_SIZE, allListProjects.length)} / ${allListProjects.length}`;

  useEffect(() => {
    setCurrentPage(1);
  }, [currentFolderId, searchQuery, viewMode, section]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const openProject = (project: Project) => {
    navigate(`/project/${project.id}`);
  };

  const selectProject = (project: Project) => {
    setSelectedProjectId(project.id);
  };

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (section !== "apps") {
      setActiveApp("index");
    }
  }, [section]);

  const handleCreateFolder = async (name: string) => {
    if (!canManageProjects) {
      toast.error("You do not have permission to create folders");
      return;
    }

    setIsCreatingFolder(true);
    try {
      const result = await createFolder(name, currentFolderId);
      if (!result.ok) {
        toast.error(result.error || "Failed to create folder");
        return;
      }

      toast.success("Folder created");
      setIsCreateFolderOpen(false);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleRenameFolder = async (folderId: string, name: string) => {
    if (!canManageProjects) {
      toast.error("You do not have permission to rename folders");
      return;
    }

    setIsRenamingFolder(true);
    try {
      const result = await renameFolder(folderId, name);
      if (!result.ok) {
        toast.error(result.error || "Failed to rename folder");
        return;
      }

      toast.success("Folder renamed");
      setFolderToRename(null);
    } finally {
      setIsRenamingFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!canManageProjects) {
      toast.error("You do not have permission to delete folders");
      return;
    }

    setIsDeletingFolder(true);
    try {
      const deletedFolderName = folderToDelete?.name || "folder";
      const result = await deleteFolder(folderId);
      if (!result.ok) {
        toast.error(result.error || "Failed to delete folder");
        return;
      }

      toast.success(`Deleted folder "${deletedFolderName}"`);
      setFolderToDelete(null);
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const handleMoveProject = async (projectId: string, folderId: string | null) => {
    if (!canManageProjects) {
      toast.error("You do not have permission to move projects");
      return;
    }

    setIsMovingProject(true);
    try {
      const movedProjectName = projectToMove ? getProjectDisplayName(projectToMove) : "project";
      const result = await moveProject(projectId, folderId);
      if (!result.ok) {
        toast.error(result.error || "Failed to move project");
        return;
      }

      toast.success(`Moved "${movedProjectName}"`);
      setProjectToMove(null);
    } finally {
      setIsMovingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!canManageProjects) {
      toast.error("You do not have permission to delete projects");
      return;
    }

    setIsDeletingProject(true);
    try {
      const deletedProjectName = projectToDelete ? getProjectDisplayName(projectToDelete) : "project";
      const result = await deleteProject(projectId);
      if (!result.ok) {
        toast.error(result.error || "Failed to delete project");
        return;
      }

      toast.success(`Deleted "${deletedProjectName}"`);
      setProjectToDelete(null);
    } finally {
      setIsDeletingProject(false);
    }
  };

  if (error) {
    return <div className="flex h-64 items-center justify-center rounded-xl border text-destructive">{error}</div>;
  }

  return (
    <>
      <div className="flex h-full min-h-0 w-full overflow-hidden border bg-background">
        <WorkspaceSidebar
          section={section}
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed((previous) => !previous)}
          onSectionChange={setSection}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b">
            <div className="flex h-12 items-center gap-3 px-4 sm:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarCollapsed((previous) => !previous)}
                aria-label="Toggle sidebar"
              >
                {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </div>

            {section === "projects" && (
              <WorkspaceProjectToolbar
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onImport={() => canManageProjects && setIsImportOpen(true)}
                onCreateFolder={() => canManageProjects && setIsCreateFolderOpen(true)}
                onRefresh={() => void refresh()}
                onOpenSettings={() => canOpenSettings && setIsSettingsOpen(true)}
                canManageProjects={canManageProjects}
                canOpenSettings={canOpenSettings}
              />
            )}
          </header>

          <main className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <WorkspaceLoadingState />
            ) : section === "apps" ? (
              activeApp === "library-manager" ? (
                canOpenLibrary ? <LibraryManagerPanel user={user} /> : <WorkspaceAppsPlaceholder canOpenLibraryManager={canOpenLibrary} onOpenLibraryManager={() => setActiveApp("library-manager")} />
              ) : (
                <WorkspaceAppsPlaceholder canOpenLibraryManager={canOpenLibrary} onOpenLibraryManager={() => setActiveApp("library-manager")} />
              )
            ) : (
              <div className="flex h-full min-h-0 flex-col p-6">
                <WorkspaceBreadcrumbs
                  isSearching={isSearching}
                  breadcrumbs={breadcrumbs}
                  viewMode={viewMode}
                  onGoRoot={() => setFolderInUrl(null)}
                  onSelectFolder={(folderId) => setFolderInUrl(folderId)}
                />

                <div className="relative mt-6 min-h-0 flex-1 overflow-hidden">
                  <div className="h-full overflow-y-auto pr-1">
                    <div className="mb-4 flex items-center justify-between rounded-lg border bg-card/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        Page {currentPage} of {totalPages} · {pageLabel}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          disabled={currentPage <= 1}
                          onClick={() => setCurrentPage(1)}
                        >
                          First
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          disabled={currentPage <= 1}
                          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          disabled={currentPage >= totalPages}
                          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        >
                          Next
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          disabled={currentPage >= totalPages}
                          onClick={() => setCurrentPage(totalPages)}
                        >
                          Last
                        </Button>
                      </div>
                    </div>
                    {viewMode === "gallery" ? (
                      <WorkspaceGalleryView
                        searchQuery={searchQuery}
                        isSearching={isSearching}
                        searchResults={listProjects}
                        selectedProjectId={selectedProjectId}
                        currentFolderId={currentFolderId}
                        visibleFolders={visibleFolders}
                        visibleProjects={listProjects}
                        getProjectDisplayName={getProjectDisplayName}
                        onSelectProject={selectProject}
                        onOpenProject={openProject}
                        onOpenFolder={(folderId) => setFolderInUrl(folderId)}
                        onRenameFolder={setFolderToRename}
                        onDeleteFolder={setFolderToDelete}
                        onMoveProject={setProjectToMove}
                        onDeleteProject={setProjectToDelete}
                        canManageProjects={canManageProjects}
                      />
                    ) : (
                      <WorkspaceListView
                        isSearching={isSearching}
                        selectedProjectId={selectedProjectId}
                        currentFolderId={currentFolderId}
                        breadcrumbs={breadcrumbs}
                        listFolders={listFolders}
                        listProjects={listProjects}
                        getProjectDisplayName={getProjectDisplayName}
                        onSelectProject={selectProject}
                        onOpenProject={openProject}
                        onOpenFolder={(folderId) => setFolderInUrl(folderId)}
                        onRenameFolder={setFolderToRename}
                        onDeleteFolder={setFolderToDelete}
                        onMoveProject={setProjectToMove}
                        onDeleteProject={setProjectToDelete}
                        canManageProjects={canManageProjects}
                      />
                    )}
                  </div>

                  <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex justify-end">
                    <div className="pointer-events-auto h-full">
                      <WorkspaceProjectPropertiesSheet
                        open={selectedProject !== null}
                        project={selectedProject}
                        folderById={folderById}
                        onOpenChange={(open) => {
                          if (!open) {
                            setSelectedProjectId(null);
                          }
                        }}
                        onOpenProject={openProject}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {isImportOpen && (
        <Suspense fallback={null}>
          <ImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImportComplete={refresh} />
        </Suspense>
      )}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} user={user} />
        </Suspense>
      )}

      {isCreateFolderOpen && (
        <Suspense fallback={null}>
          <CreateFolderDialog
            open={isCreateFolderOpen}
            isSubmitting={isCreatingFolder}
            onOpenChange={setIsCreateFolderOpen}
            onSubmit={handleCreateFolder}
          />
        </Suspense>
      )}
      {folderToRename && (
        <Suspense fallback={null}>
          <RenameFolderDialog
            folder={folderToRename}
            isSubmitting={isRenamingFolder}
            onClose={() => setFolderToRename(null)}
            onSubmit={handleRenameFolder}
          />
        </Suspense>
      )}
      {folderToDelete && (
        <Suspense fallback={null}>
          <DeleteFolderDialog
            folder={folderToDelete}
            isDeleting={isDeletingFolder}
            onClose={() => setFolderToDelete(null)}
            onConfirm={handleDeleteFolder}
          />
        </Suspense>
      )}
      {projectToMove && (
        <Suspense fallback={null}>
          <MoveProjectDialog
            project={projectToMove}
            folders={folders}
            isMoving={isMovingProject}
            onClose={() => setProjectToMove(null)}
            onConfirm={handleMoveProject}
            getProjectDisplayName={getProjectDisplayName}
          />
        </Suspense>
      )}
      {projectToDelete && (
        <Suspense fallback={null}>
          <DeleteProjectDialog
            project={projectToDelete}
            isDeleting={isDeletingProject}
            onClose={() => setProjectToDelete(null)}
            onConfirm={handleDeleteProject}
            getProjectDisplayName={getProjectDisplayName}
          />
        </Suspense>
      )}

    </>
  );
}
