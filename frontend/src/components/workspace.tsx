import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FolderInput, FolderPlus, Image, LayoutGrid, PanelLeftClose, PanelLeftOpen, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";

import type { User } from "@/types/auth";
import type { FolderTreeItem, Project } from "@/types/project";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/error-boundary";
import { useWorkspaceData } from "@/hooks/use-workspace-data";
import { useWorkspaceSearch } from "@/hooks/use-workspace-search";
import { canManageProjects as roleCanManageProjects, canOpenLibraryManager } from "@/lib/roles";
import { registerPaletteCommands, type PaletteCommand } from "@/lib/command-registry";
import { fetchApi, readApiError } from "@/lib/api";
import { throwIfJobFailed, watchPrismJob } from "@/lib/jobs";
import { WorkspaceBreadcrumbs } from "./workspace/workspace-breadcrumbs";
import { WorkspaceGalleryView } from "./workspace/workspace-gallery-view";
import { WorkspaceListView } from "./workspace/workspace-list-view";
import { LibraryManagerWorkspace } from "./workspace/library-manager-workspace";
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

  const { projects, folders, loading, error, folderById, refresh, createFolder, renameFolder, deleteFolder, moveProjects, deleteProject } =
    useWorkspaceData();

  const requestedSection = searchParams.get("section") === "library-manager" ? "library-manager" : "projects";
  const [section, setSection] = useState<WorkspaceSection>(requestedSection);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [bulkSelectedProjectIds, setBulkSelectedProjectIds] = useState<Set<string>>(() => new Set());

  const [folderToRename, setFolderToRename] = useState<FolderTreeItem | null>(null);
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);

  const [folderToDelete, setFolderToDelete] = useState<FolderTreeItem | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  const [projectsToMove, setProjectsToMove] = useState<Project[]>([]);
  const [isMovingProject, setIsMovingProject] = useState(false);
  const [isRegeneratingThumbnails, setIsRegeneratingThumbnails] = useState(false);

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

  const handleSectionChange = useCallback((nextSection: WorkspaceSection) => {
    setSection(nextSection);
    setSearchParams((currentParams) => {
      const next = new URLSearchParams(currentParams);
      if (nextSection === "library-manager") {
        next.set("section", nextSection);
      } else {
        next.delete("section");
        next.delete("libraryView");
        next.delete("session");
      }
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    setSection(requestedSection);
  }, [requestedSection]);

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
  const visibleProjectIdsKey = listProjects.map((project) => project.id).join("\u0000");
  const selectedVisibleProjects = listProjects.filter((project) => bulkSelectedProjectIds.has(project.id));
  const allVisibleProjectsSelected =
    listProjects.length > 0 && selectedVisibleProjects.length === listProjects.length;
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

  useEffect(() => {
    const visibleIds = new Set(visibleProjectIdsKey ? visibleProjectIdsKey.split("\u0000") : []);
    setBulkSelectedProjectIds((current) => {
      const retained = new Set([...current].filter((projectId) => visibleIds.has(projectId)));
      if (retained.size === current.size && [...retained].every((projectId) => current.has(projectId))) {
        return current;
      }
      return retained;
    });
  }, [visibleProjectIdsKey]);

  const toggleProjectSelection = (projectId: string, selected: boolean) => {
    setBulkSelectedProjectIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(projectId);
      } else {
        next.delete(projectId);
      }
      return next;
    });
  };

  const toggleVisibleProjectSelection = () => {
    setBulkSelectedProjectIds(
      allVisibleProjectsSelected
        ? new Set()
        : new Set(listProjects.map((project) => project.id)),
    );
  };

  // Actions that need this screen's dialog state, published to the ⌘K palette
  // for as long as the workspace is mounted.
  useEffect(() => {
    const commands: PaletteCommand[] = [];
    if (canManageProjects) {
      commands.push(
        { id: "workspace:import", label: "Import project", group: "Workspace", icon: FolderPlus, keywords: "add new repository clone", run: () => setIsImportOpen(true) },
        { id: "workspace:new-folder", label: "New folder", group: "Workspace", icon: FolderPlus, keywords: "create directory", run: () => setIsCreateFolderOpen(true) },
      );
    }
    commands.push({
      id: "workspace:view-mode",
      label: "Toggle gallery / list view",
      group: "Workspace",
      icon: LayoutGrid,
      run: () => setViewMode((current) => (current === "gallery" ? "list" : "gallery")),
    });
    commands.push({ id: "workspace:refresh", label: "Refresh workspace", group: "Workspace", icon: RefreshCw, run: () => void refresh() });
    if (canOpenSettings) {
      commands.push({ id: "workspace:settings", label: "Open settings", group: "Workspace", icon: Settings, run: () => setIsSettingsOpen(true) });
    }
    return registerPaletteCommands(commands);
  }, [canManageProjects, canOpenSettings, refresh]);

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

  const handleMoveProjects = async (projectIds: string[], folderId: string | null) => {
    if (!canManageProjects) {
      toast.error("You do not have permission to move projects");
      return;
    }

    setIsMovingProject(true);
    try {
      const movedProjectName = projectsToMove.length === 1 ? getProjectDisplayName(projectsToMove[0]) : null;
      const result = await moveProjects(projectIds, folderId);
      if (!result.ok) {
        toast.error(result.error || (projectIds.length === 1 ? "Failed to move project" : "Failed to move projects"));
        return;
      }

      toast.success(movedProjectName ? `Moved "${movedProjectName}"` : `Moved ${projectIds.length} projects`);
      setProjectsToMove([]);
      setBulkSelectedProjectIds(new Set());
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

  const handleRegenerateThumbnail = async (project: Project) => {
    if (!canManageProjects) {
      toast.error("You do not have permission to regenerate thumbnails");
      return;
    }

    const toastId = toast.loading(`Rendering thumbnail for "${getProjectDisplayName(project)}"...`);
    try {
      const response = await fetchApi(`/api/projects/${project.id}/thumbnail/regenerate`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await readApiError(response, "Failed to render thumbnail");
        toast.error(error, { id: toastId });
        return;
      }

      // The render runs on a worker rather than in the request, so the result
      // arrives with the job rather than with this response.
      const { job_id: jobId } = (await response.json()) as { job_id?: string };
      if (jobId) {
        const job = await watchPrismJob(jobId);
        throwIfJobFailed(job, "Failed to render thumbnail");
      }

      toast.success("Thumbnail rendered", { id: toastId });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to render thumbnail", { id: toastId });
    }
  };

  const handleRegenerateThumbnails = async (projectsToRegenerate: Project[]) => {
    if (!canManageProjects) {
      toast.error("You do not have permission to regenerate thumbnails");
      return;
    }
    if (projectsToRegenerate.length === 0) return;

    setIsRegeneratingThumbnails(true);
    const count = projectsToRegenerate.length;
    const toastId = toast.loading(`Rendering thumbnails for ${count} projects...`);
    try {
      const response = await fetchApi("/api/projects/thumbnails/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_ids: projectsToRegenerate.map((project) => project.id) }),
      });

      if (!response.ok) {
        toast.error(await readApiError(response, "Failed to queue thumbnail renders"), { id: toastId });
        return;
      }

      const payload = (await response.json()) as { job_ids?: string[]; count?: number };
      const jobIds = payload.job_ids ?? [];
      const jobs = await Promise.all(jobIds.map((jobId) => watchPrismJob(jobId)));
      jobs.forEach((job) => throwIfJobFailed(job, "Failed to render thumbnail"));

      toast.success(`Rendered ${payload.count ?? count} thumbnail${(payload.count ?? count) === 1 ? "" : "s"}`, {
        id: toastId,
      });
      setBulkSelectedProjectIds(new Set());
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to render thumbnails", { id: toastId });
    } finally {
      setIsRegeneratingThumbnails(false);
    }
  };

  const handleUploadThumbnail = async (project: Project, file: File) => {
    if (!canManageProjects) {
      toast.error("You do not have permission to change thumbnails");
      return;
    }

    const toastId = toast.loading(`Uploading thumbnail for "${getProjectDisplayName(project)}"...`);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetchApi(`/api/projects/${project.id}/thumbnail`, {
        method: "PUT",
        body,
      });

      if (!response.ok) {
        toast.error(await readApiError(response, "Failed to upload thumbnail"), { id: toastId });
        return;
      }

      toast.success("Thumbnail updated", { id: toastId });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload thumbnail", { id: toastId });
    }
  };

  const handleRevertThumbnail = async (project: Project) => {
    if (!canManageProjects) {
      toast.error("You do not have permission to change thumbnails");
      return;
    }

    const toastId = toast.loading("Restoring the rendered board image...");
    try {
      const response = await fetchApi(`/api/projects/${project.id}/thumbnail`, {
        method: "DELETE",
      });

      if (!response.ok) {
        toast.error(await readApiError(response, "Failed to restore the rendered image"), { id: toastId });
        return;
      }

      // Nothing had been rendered for this project yet, so the server queued
      // the render this is reverting to.
      const { job_id: jobId } = (await response.json()) as { job_id?: string | null };
      if (jobId) {
        const job = await watchPrismJob(jobId);
        throwIfJobFailed(job, "Failed to render thumbnail");
      }

      toast.success("Using the rendered board image", { id: toastId });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore the rendered image", { id: toastId });
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
          onSectionChange={handleSectionChange}
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

          {/* Scoped to the content area so a crash here leaves the sidebar and
              the section switcher alive — the reviewer can navigate out of a
              broken section instead of reloading. Keyed to the section so
              switching away and back retries rather than staying broken. */}
          <main className="min-h-0 flex-1 overflow-hidden">
            <ErrorBoundary label="this section" resetKeys={[section]}>
              {loading ? (
                <WorkspaceLoadingState />
              ) : section === "library-manager" ? (
                canOpenLibrary ? (
                  <LibraryManagerWorkspace user={user} projects={projects} />
                ) : (
                  <WorkspaceAppsPlaceholder
                    canOpenLibraryManager={canOpenLibrary}
                    onOpenLibraryManager={() => {}}
                  />
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
                    <div
                      className={`h-full overflow-y-auto pr-1 ${
                        selectedProject !== null
                          ? "md:pr-[376px] lg:pr-[416px] xl:pr-[476px]"
                          : ""
                      }`}
                    >
                      <div className="mb-4 flex items-center justify-between rounded-lg border bg-card/30 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            {pageLabel}
                          </p>
                          {canManageProjects && listProjects.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={toggleVisibleProjectSelection}
                            >
                              {allVisibleProjectsSelected ? "Clear selection" : `Select visible (${listProjects.length})`}
                            </Button>
                          )}
                          {canManageProjects && selectedVisibleProjects.length > 0 && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setProjectsToMove(selectedVisibleProjects)}
                              >
                                <FolderInput className="mr-1.5 h-3.5 w-3.5" />
                                Move selected ({selectedVisibleProjects.length})
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px]"
                                disabled={isRegeneratingThumbnails}
                                onClick={() => void handleRegenerateThumbnails(selectedVisibleProjects)}
                              >
                                <Image className="mr-1.5 h-3.5 w-3.5" />
                                Regenerate thumbnails ({selectedVisibleProjects.length})
                              </Button>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                          >
                            Previous
                          </Button>
                          <span className="px-1 text-[11px] text-muted-foreground">
                            Page {currentPage} of {totalPages}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                      {viewMode === "gallery" ? (
                        <WorkspaceGalleryView
                          searchQuery={searchQuery}
                          isSearching={isSearching}
                          searchResults={listProjects}
                          selectedProjectId={selectedProjectId}
                          bulkSelectedProjectIds={bulkSelectedProjectIds}
                          currentFolderId={currentFolderId}
                          visibleFolders={visibleFolders}
                          visibleProjects={listProjects}
                          getProjectDisplayName={getProjectDisplayName}
                          onSelectProject={selectProject}
                          onToggleProjectSelection={toggleProjectSelection}
                          onOpenProject={openProject}
                          onOpenFolder={(folderId) => setFolderInUrl(folderId)}
                          onRenameFolder={setFolderToRename}
                          onDeleteFolder={setFolderToDelete}
                          onMoveProject={(project) => setProjectsToMove([project])}
                          onDeleteProject={setProjectToDelete}
                          onRegenerateThumbnail={handleRegenerateThumbnail}
                          canManageProjects={canManageProjects}
                        />
                      ) : (
                        <WorkspaceListView
                          isSearching={isSearching}
                          selectedProjectId={selectedProjectId}
                          bulkSelectedProjectIds={bulkSelectedProjectIds}
                          currentFolderId={currentFolderId}
                          breadcrumbs={breadcrumbs}
                          listFolders={listFolders}
                          listProjects={listProjects}
                          getProjectDisplayName={getProjectDisplayName}
                          onSelectProject={selectProject}
                          onToggleProjectSelection={toggleProjectSelection}
                          onOpenProject={openProject}
                          onOpenFolder={(folderId) => setFolderInUrl(folderId)}
                          onRenameFolder={setFolderToRename}
                          onDeleteFolder={setFolderToDelete}
                          onMoveProject={(project) => setProjectsToMove([project])}
                          onDeleteProject={setProjectToDelete}
                          onRegenerateThumbnail={handleRegenerateThumbnail}
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
                          canManageProjects={canManageProjects}
                          onRegenerateThumbnail={handleRegenerateThumbnail}
                          onUploadThumbnail={handleUploadThumbnail}
                          onRevertThumbnail={handleRevertThumbnail}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </ErrorBoundary>
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
      {projectsToMove.length > 0 && (
        <Suspense fallback={null}>
          <MoveProjectDialog
            projects={projectsToMove}
            folders={folders}
            isMoving={isMovingProject}
            onClose={() => setProjectsToMove([])}
            onConfirm={handleMoveProjects}
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
