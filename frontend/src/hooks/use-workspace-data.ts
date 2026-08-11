import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchApi, fetchJson, readApiError } from "@/lib/api";
import { FolderTreeItem, Project } from "@/types/project";

export interface WorkspaceActionResult {
  ok: boolean;
  error?: string;
}

interface WorkspaceDataState {
  projects: Project[];
  folders: FolderTreeItem[];
  loading: boolean;
  error: string | null;
  folderById: Map<string, FolderTreeItem>;
  refresh: () => Promise<void>;
  createFolder: (name: string, parentId: string | null) => Promise<WorkspaceActionResult>;
  renameFolder: (folderId: string, name: string) => Promise<WorkspaceActionResult>;
  deleteFolder: (folderId: string) => Promise<WorkspaceActionResult>;
  moveProject: (projectId: string, folderId: string | null) => Promise<WorkspaceActionResult>;
  moveProjects: (projectIds: string[], folderId: string | null) => Promise<WorkspaceActionResult>;
  deleteProject: (projectId: string) => Promise<WorkspaceActionResult>;
}

interface WorkspaceBootstrapResponse {
  projects: Project[];
  folders: FolderTreeItem[];
}

// Module-level cache so data persists across component mounts/unmounts
let _cachedData: WorkspaceBootstrapResponse | null = null;

export function useWorkspaceData(): WorkspaceDataState {
  const [projects, setProjects] = useState<Project[]>(_cachedData?.projects ?? []);
  const [folders, setFolders] = useState<FolderTreeItem[]>(_cachedData?.folders ?? []);
  const [loading, setLoading] = useState(_cachedData === null);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    // Only show loading spinner on first load (no cached data)
    if (!_cachedData) {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await fetchJson<WorkspaceBootstrapResponse>(
        "/api/workspace/bootstrap",
        undefined,
        "Failed to load workspace"
      );
      _cachedData = data;
      if (isMounted.current) {
        setProjects(data.projects);
        setFolders(data.folders);
        setError(null);
      }
    } catch (error) {
      if (isMounted.current && !_cachedData) {
        // Only clear data if we have no cache to fall back on
        setProjects([]);
        setFolders([]);
        setError(error instanceof Error ? error.message : "Failed to load workspace");
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void refresh();
    return () => { isMounted.current = false; };
  }, [refresh]);

  const folderById = useMemo(() => {
    const lookup = new Map<string, FolderTreeItem>();
    folders.forEach((folder) => {
      lookup.set(folder.id, folder);
    });
    return lookup;
  }, [folders]);

  const runMutation = useCallback(
    async (
      input: RequestInfo | URL,
      init: RequestInit,
      fallbackError: string
    ): Promise<WorkspaceActionResult> => {
      try {
        const response = await fetchApi(input, init);
        if (!response.ok) {
          return { ok: false, error: await readApiError(response, fallbackError) };
        }

        await refresh();
        return { ok: true };
      } catch {
        return { ok: false, error: fallbackError };
      }
    },
    [refresh]
  );

  const createFolder = useCallback(
    async (name: string, parentId: string | null): Promise<WorkspaceActionResult> => {
      return runMutation(
        "/api/folders/",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            parent_id: parentId,
          }),
        },
        "Failed to create folder"
      );
    },
    [runMutation]
  );

  const renameFolder = useCallback(
    async (folderId: string, name: string): Promise<WorkspaceActionResult> => {
      return runMutation(
        `/api/folders/${folderId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
        "Failed to rename folder"
      );
    },
    [runMutation]
  );

  const deleteFolder = useCallback(
    async (folderId: string): Promise<WorkspaceActionResult> => {
      return runMutation(
        `/api/folders/${folderId}?cascade=true`,
        {
          method: "DELETE",
        },
        "Failed to delete folder"
      );
    },
    [runMutation]
  );

  const moveProjects = useCallback(
    async (projectIds: string[], folderId: string | null): Promise<WorkspaceActionResult> => {
      return runMutation(
        "/api/folders/projects/move",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_ids: projectIds, folder_id: folderId }),
        },
        projectIds.length === 1 ? "Failed to move project" : "Failed to move projects"
      );
    },
    [runMutation]
  );

  const moveProject = useCallback(
    async (projectId: string, folderId: string | null): Promise<WorkspaceActionResult> => {
      return moveProjects([projectId], folderId);
    },
    [moveProjects]
  );

  const deleteProject = useCallback(
    async (projectId: string): Promise<WorkspaceActionResult> => {
      return runMutation(
        `/api/projects/${projectId}`,
        {
          method: "DELETE",
        },
        "Failed to delete project"
      );
    },
    [runMutation]
  );

  return {
    projects,
    folders,
    loading,
    error,
    folderById,
    refresh,
    createFolder,
    renameFolder,
    deleteFolder,
    moveProject,
    moveProjects,
    deleteProject,
  };
}
