import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Project, FolderTreeItem } from "@/types/project";
import { ProjectCard } from "./project-card";
import { FolderTree } from "./folder-tree";
import { FolderView } from "./folder-view";
import { FolderDialog } from "./folder-dialog";
import { MoveProjectMenu } from "./move-project-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, Search, Settings, RefreshCw, FolderPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "./import-dialog";
import { SettingsDialog } from "./settings-dialog";
import Fuse from "fuse.js";
import { toast } from "sonner";

export function Workspace() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<FolderTreeItem[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Folder navigation state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  // Helper function to get display name
  const getDisplayName = (project: Project) => {
    return project.display_name || project.name;
  };

  // Import Dialog State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Folder Dialog State
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<"create" | "rename">("create");
  const [selectedFolderForAction, setSelectedFolderForAction] = useState<FolderTreeItem | null>(null);
  const [projectToMoveAfterCreate, setProjectToMoveAfterCreate] = useState<string | null>(null);

  // Recent projects (last 3 opened) - stored in localStorage
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("recentProjects");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const fetchFolders = async () => {
    try {
      const res = await fetch("/api/folders/");
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch (err) {
      console.error("Failed to fetch folders:", err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projectsRes, foldersRes] = await Promise.all([
        fetch("/api/projects/"),
        fetch("/api/folders/"),
      ]);

      if (!projectsRes.ok) {
        throw new Error("Failed to fetch projects");
      }

      const projectsData = await projectsRes.json();
      setProjects(projectsData);

      if (foldersRes.ok) {
        const foldersData = await foldersRes.json();
        setFolders(foldersData);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fuse.js instance for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(projects, {
      keys: [
        { name: "name", weight: 2 },
        { name: "display_name", weight: 2 },
        { name: "description", weight: 1 },
        { name: "parent_repo", weight: 0.5 },
      ],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true,
    });
  }, [projects]);

  // Global fuzzy search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsSearching(true);
      try {
        const results = fuse.search(searchQuery);
        const mappedResults = results.map((result) => ({
          ...result.item,
          _score: result.score,
          thumbnail_url: `/api/projects/${result.item.id}/thumbnail`,
        }));
        setSearchResults(mappedResults);
      } catch (e) {
        console.error("Search error:", e);
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, fuse]);

  const handleSelectProject = (project: Project) => {
    // Update recent projects
    setRecentProjectIds((prev) => {
      const newRecent = [project.id, ...prev.filter((id) => id !== project.id)].slice(0, 3);
      localStorage.setItem("recentProjects", JSON.stringify(newRecent));
      return newRecent;
    });
    navigate(`/project/${project.id}`);
  };

  const handleGoHome = () => {
    setSelectedFolderId(null);
    setSearchQuery("");
  };

  // Folder operations
  const handleFolderClick = (folderId: string) => {
    setSelectedFolderId(folderId);
    setSearchQuery("");
  };

  const handleToggleFolderExpand = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const handleCreateFolder = () => {
    setFolderDialogMode("create");
    setSelectedFolderForAction(null);
    setIsFolderDialogOpen(true);
  };

  const handleCreateSubfolder = (parentFolderId: string) => {
    setFolderDialogMode("create");
    setSelectedFolderForAction(folders.find((f) => f.id === parentFolderId) || null);
    setIsFolderDialogOpen(true);
  };

  const handleRenameFolder = (folderId: string) => {
    setFolderDialogMode("rename");
    setSelectedFolderForAction(folders.find((f) => f.id === folderId) || null);
    setIsFolderDialogOpen(true);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;

    if (!confirm(`Delete folder "${folder.name}"? This will not delete projects, they will be moved to parent or root.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success(`Folder "${folder.name}" deleted successfully`);
        if (selectedFolderId === folderId) {
          setSelectedFolderId(null);
        }
        fetchFolders();
        fetchData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.message || "Unknown error";
        toast.error(`Failed to delete folder: ${errorMessage}`);
      }
    } catch (e: any) {
      console.error("Delete folder error:", e);
      toast.error(`Failed to delete folder: ${e.message || "Network error"}`);
    }
  };

  const handleFolderDialogSubmit = async (data: { name: string; parent_id?: string }) => {
    try {
      let res;
      if (folderDialogMode === "create") {
        res = await fetch("/api/folders/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            parent_id: selectedFolderForAction ? selectedFolderForAction.id : data.parent_id,
          }),
        });

        if (res.ok) {
          const newFolder = await res.json();
          toast.success("Folder created");
          fetchFolders();
          setIsFolderDialogOpen(false);

          // Move project to newly created folder if specified
          if (projectToMoveAfterCreate) {
            await handleMoveProject(projectToMoveAfterCreate, newFolder.id);
            setProjectToMoveAfterCreate(null);
          }
        } else {
          const errorData = await res.json().catch(() => ({}));
          const errorMessage = errorData.detail || errorData.message || "Unknown error";
          toast.error(`Failed: ${errorMessage}`);
        }
      } else {
        // Rename
        res = await fetch(`/api/folders/${selectedFolderForAction?.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: data.name }),
        });

        if (res.ok) {
          toast.success("Folder renamed");
          fetchFolders();
          setIsFolderDialogOpen(false);
        } else {
          const errorData = await res.json().catch(() => ({}));
          const errorMessage = errorData.detail || errorData.message || "Unknown error";
          toast.error(`Failed: ${errorMessage}`);
        }
      }
    } catch (e: any) {
      console.error("Folder operation error:", e);
      toast.error(`Failed: ${e.message || "Network error"}`);
    }
  };

  // Move project operations
  const handleMoveProject = async (projectId: string, folderId: string | null) => {
    try {
      const res = await fetch(`/api/folders/projects/${projectId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });

      if (res.ok) {
        const project = projects.find((p) => p.id === projectId);
        const folderName = folderId ? folders.find((f) => f.id === folderId)?.name : "root";
        toast.success(`Moved "${project?.name}" to ${folderName}`);
        fetchData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.message || "Unknown error";
        toast.error(`Failed to move: ${errorMessage}`);
      }
    } catch (e: any) {
      console.error("Move project error:", e);
      toast.error(`Failed to move: ${e.message || "Network error"}`);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    setProjectToDelete(project);
  };

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!projectToDelete) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setRecentProjectIds((prev) => prev.filter((id) => id !== projectToDelete.id));
        toast.success(`Deleted "${getDisplayName(projectToDelete)}" successfully`);
        fetchData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.message || "Unknown error";
        toast.error(`Failed to delete project: ${errorMessage}`);
      }
    } catch (e: any) {
      console.error("Delete error:", e);
      toast.error(`Failed to delete project: ${e.message || "Network error"}`);
    } finally {
      setIsDeleting(false);
      setProjectToDelete(null);
    }
  };

  // Get recent projects data
  const recentProjects = recentProjectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter(Boolean) as Project[];

  // Get selected folder data
  const selectedFolder = selectedFolderId ? folders.find((f) => f.id === selectedFolderId) || null : null;

  // Handle create folder from move menu
  const handleCreateFolderFromMenu = (projectId?: string) => {
    setFolderDialogMode("create");
    setSelectedFolderForAction(null);
    setProjectToMoveAfterCreate(projectId || null);
    setIsFolderDialogOpen(true);
  };

  // Filter projects based on search
  const filteredProjects = projects.filter((project) => {
    const query = searchQuery.toLowerCase();
    const displayName = getDisplayName(project);
    return displayName.toLowerCase().includes(query) || project.description.toLowerCase().includes(query);
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h1
            className="font-semibold text-lg cursor-pointer hover:text-primary transition-colors"
            onClick={handleGoHome}
          >
            KiCAD Prism
          </h1>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={fetchData} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Folder tree */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <div className="px-2 py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Folders</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCreateFolder}>
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <FolderTree
                folders={folders}
                selectedFolderId={selectedFolderId || undefined}
                expandedFolderIds={expandedFolderIds}
                onFolderClick={handleFolderClick}
                onToggleExpand={handleToggleFolderExpand}
                onRename={handleRenameFolder}
                onDelete={handleDeleteFolder}
                onCreateSubfolder={handleCreateSubfolder}
              />

              {/* All Projects link */}
              <div className="px-2 py-2 mt-2 border-t">
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                    selectedFolderId === null ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                  onClick={() => setSelectedFolderId(null)}
                >
                  <span className="text-sm font-medium">All Projects</span>
                  <span className="text-xs opacity-60">{projects.filter((p) => !p.folder_id).length}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-4">
            {selectedFolder ? (
              <>
                <h2 className="text-2xl font-bold tracking-tight">{selectedFolder.name}</h2>
                <Button variant="ghost" size="sm" onClick={() => setSelectedFolderId(null)}>
                  ← Back to All
                </Button>
              </>
            ) : (
              <h2 className="text-2xl font-bold tracking-tight">All Projects</h2>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => setIsSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button onClick={() => setIsImportOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Import
            </Button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <ImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImportComplete={fetchData} />
          <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
          <FolderDialog
            open={isFolderDialogOpen}
            onOpenChange={setIsFolderDialogOpen}
            onSubmit={handleFolderDialogSubmit}
            mode={folderDialogMode}
            folder={selectedFolderForAction}
            folders={folders}
          />

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-[280px] rounded-xl" />
              ))}
            </div>
          ) : searchQuery.trim() ? (
            // Search Results
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Search Results ({searchResults.length} found)
              </h3>
              {isSearching ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[280px] rounded-xl" />
                  ))}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                  <p>No projects found matching "{searchQuery}"</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {searchResults.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      searchQuery={searchQuery}
                      onClick={() => handleSelectProject(project)}
                      showDelete
                      onDelete={() => handleDeleteProject(project)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : selectedFolder ? (
            // Folder View
            <FolderView
              folder={selectedFolder}
              projects={projects}
              onProjectClick={(id) => {
                handleSelectProject(projects.find((p) => p.id === id)!);
              }}
              isLoading={loading}
            />
          ) : (
            // All Projects View
            <div className="space-y-8">
              {recentProjects.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">Recent</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentProjects.slice(0, 3).map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        compact
                        onClick={() => handleSelectProject(project)}
                        showDelete
                        onDelete={() => handleDeleteProject(project)}
                        renderActions={(project) => (
                          <MoveProjectMenu
                            projectId={project.id}
                            currentFolderId={project.folder_id}
                            folders={folders}
                            onMove={handleMoveProject}
                            onCreateFolder={handleCreateFolderFromMenu}
                          />
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">All Projects</h3>
                {filteredProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>No projects found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        searchQuery={searchQuery}
                        onClick={() => handleSelectProject(project)}
                        showDelete
                        onDelete={() => handleDeleteProject(project)}
                        renderActions={(project) => (
                          <MoveProjectMenu
                            projectId={project.id}
                            currentFolderId={project.folder_id}
                            folders={folders}
                            onMove={handleMoveProject}
                            onCreateFolder={handleCreateFolderFromMenu}
                          />
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!projectToDelete} onOpenChange={() => setProjectToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{projectToDelete ? getDisplayName(projectToDelete) : ""}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
