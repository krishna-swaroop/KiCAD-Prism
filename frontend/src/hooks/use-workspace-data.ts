import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchApi, fetchJson, readApiError } from "@/lib/api";
import type { User } from "@/types/auth";
import { FolderTreeItem, Project } from "@/types/project";

export interface WorkspaceActionResult {
  ok: boolean;
  error?: string;
}

interface WorkspaceDataState {
  projects: Project[];
  folders: FolderTreeItem[];
  /** No data to show yet for this session. */
  loading: boolean;
  /** The latest load failed and there is no data to fall back on. */
  error: string | null;
  /** The latest refresh failed but earlier data is still shown. */
  refreshError: string | null;
  /** The shown data has not been confirmed by a successful load in this session. */
  stale: boolean;
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

/**
 * Identity of the signed-in account the workspace data belongs to. Two
 * sessions with different keys never see each other's cached bootstrap.
 */
export function workspaceSessionKey(user: Pick<User, "email" | "role"> | null | undefined): string {
  return user ? `${user.email}\u0000${user.role}` : "";
}

interface WorkspaceCacheEntry {
  sessionKey: string;
  /** Request sequence that produced this entry; a lower one never overwrites it. */
  sequence: number;
  data: WorkspaceBootstrapResponse;
}

// Module-level cache so data persists across component mounts/unmounts. It is
// keyed by session so a later sign-in never starts from another account's
// data, and by request sequence so a slow older response never overwrites a
// newer one. Clearing bumps a generation so a request that was already in
// flight when the cache was cleared cannot repopulate it afterwards.
let cache: WorkspaceCacheEntry | null = null;
let requestSequence = 0;
let cacheGeneration = 0;

/** Drop the cached bootstrap, e.g. on sign-out, and invalidate pending writers. */
export function clearWorkspaceDataCache(): void {
  cache = null;
  cacheGeneration += 1;
}

function cachedFor(sessionKey: string): WorkspaceBootstrapResponse | null {
  return cache && cache.sessionKey === sessionKey ? cache.data : null;
}

function rememberResponse(
  sessionKey: string,
  sequence: number,
  generation: number,
  data: WorkspaceBootstrapResponse
): void {
  if (generation !== cacheGeneration) return;
  if (cache && cache.sessionKey === sessionKey && cache.sequence > sequence) return;
  cache = { sessionKey, sequence, data };
}

interface Snapshot {
  sessionKey: string;
  data: WorkspaceBootstrapResponse | null;
  /** True once a load for this session succeeded in this mount. */
  confirmed: boolean;
  loading: boolean;
  error: string | null;
  refreshError: string | null;
}

function initialSnapshot(sessionKey: string): Snapshot {
  const data = cachedFor(sessionKey);
  return {
    sessionKey,
    data,
    confirmed: false,
    loading: data === null,
    error: null,
    refreshError: null,
  };
}

const EMPTY_PROJECTS: Project[] = [];
const EMPTY_FOLDERS: FolderTreeItem[] = [];

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

export function useWorkspaceData({ sessionKey }: { sessionKey: string }): WorkspaceDataState {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => initialSnapshot(sessionKey));
  // The snapshot belongs to one session. When the session changes, the
  // previous account's state is not shown while the new load is pending;
  // deriving here avoids mirroring the key into state and resyncing it.
  const current = snapshot.sessionKey === sessionKey ? snapshot : initialSnapshot(sessionKey);

  const isMounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  // The session this instance is currently serving. A refresh closure created
  // for an earlier session (for example one a pending mutation still holds)
  // must not start a request, or it would fetch the new session's data and
  // file it under the old key.
  const activeSession = useRef(sessionKey);
  // The most recent refresh started by this hook instance. Only it may publish.
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    // An instance that is gone, or that has moved to another session, does
    // not start requests at all.
    if (!isMounted.current || activeSession.current !== sessionKey) return;
    const sequence = ++requestSequence;
    const generation = cacheGeneration;
    latestRequest.current = sequence;
    const signal = abortRef.current?.signal;
    const owns = () =>
      isMounted.current &&
      activeSession.current === sessionKey &&
      latestRequest.current === sequence &&
      !signal?.aborted;

    setSnapshot((previous) => {
      const base = previous.sessionKey === sessionKey ? previous : initialSnapshot(sessionKey);
      // Only show the loading state on first load (no cached data).
      return { ...base, loading: base.data === null, error: null };
    });

    try {
      const data = await fetchJson<WorkspaceBootstrapResponse>(
        "/api/workspace/bootstrap",
        signal ? { signal } : undefined,
        "Failed to load workspace"
      );
      // Ownership gates the cache as well as the state: a response nobody is
      // waiting for any more is not the truth about this session.
      if (!owns()) return;
      rememberResponse(sessionKey, sequence, generation, data);
      setSnapshot({ sessionKey, data, confirmed: true, loading: false, error: null, refreshError: null });
    } catch (error) {
      if (!owns() || isAbortError(error)) return;
      const message = error instanceof Error ? error.message : "Failed to load workspace";
      setSnapshot((previous) => {
        const base = previous.sessionKey === sessionKey ? previous : initialSnapshot(sessionKey);
        if (base.data === null) {
          return { ...base, loading: false, error: message, refreshError: null };
        }
        // Keep the data already on screen; say that it may be out of date.
        return { ...base, confirmed: false, loading: false, error: null, refreshError: message };
      });
    }
  }, [sessionKey]);

  useEffect(() => {
    isMounted.current = true;
    activeSession.current = sessionKey;
    const controller = new AbortController();
    abortRef.current = controller;
    void refresh();
    return () => {
      isMounted.current = false;
      controller.abort();
    };
  }, [refresh, sessionKey]);

  const projects = current.data?.projects ?? EMPTY_PROJECTS;
  const folders = current.data?.folders ?? EMPTY_FOLDERS;

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
    loading: current.loading,
    error: current.error,
    refreshError: current.refreshError,
    stale: current.data !== null && !current.confirmed,
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
