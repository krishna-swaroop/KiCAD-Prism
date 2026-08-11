import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import { isDialogSubmitShortcut } from "@/lib/dialog-shortcuts";
import { FolderTreeItem, Project } from "@/types/project";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MoveProjectDialogProps {
  projects: Project[];
  folders: FolderTreeItem[];
  isMoving: boolean;
  onClose: () => void;
  onConfirm: (projectIds: string[], folderId: string | null) => void | Promise<void>;
  getProjectDisplayName: (project: Project) => string;
}

const ROOT_VALUE = "__root__";
const UNSELECTED_VALUE = "__unselected__";

export function MoveProjectDialog({
  projects,
  folders,
  isMoving,
  onClose,
  onConfirm,
  getProjectDisplayName,
}: MoveProjectDialogProps) {
  const [targetFolderId, setTargetFolderId] = useState(ROOT_VALUE);

  const folderPathById = useMemo(() => {
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const paths = new Map<string, string>();
    const MAX_DEPTH = 64;

    const buildPath = (folderId: string): string => {
      const cached = paths.get(folderId);
      if (cached) {
        return cached;
      }

      const names: string[] = [];
      const visited = new Set<string>();
      let currentId: string | null = folderId;
      let depth = 0;

      while (currentId && depth < MAX_DEPTH) {
        if (visited.has(currentId)) {
          const fallback = folderById.get(folderId)?.name ?? folderId;
          paths.set(folderId, fallback);
          return fallback;
        }

        visited.add(currentId);
        const folder = folderById.get(currentId);
        if (!folder) {
          const fallback = folderById.get(folderId)?.name ?? folderId;
          paths.set(folderId, fallback);
          return fallback;
        }

        names.unshift(folder.name);
        currentId = folder.parent_id ?? null;
        depth += 1;
      }

      if (depth >= MAX_DEPTH) {
        const fallback = folderById.get(folderId)?.name ?? folderId;
        paths.set(folderId, fallback);
        return fallback;
      }

      const resolvedPath = names.length > 0 ? names.join(" / ") : folderById.get(folderId)?.name ?? folderId;
      paths.set(folderId, resolvedPath);
      return resolvedPath;
    };

    folders.forEach((folder) => {
      buildPath(folder.id);
    });

    return paths;
  }, [folders]);

  useEffect(() => {
    if (projects.length === 0) {
      setTargetFolderId(ROOT_VALUE);
      return;
    }

    const sourceFolderIds = new Set(projects.map((project) => project.folder_id ?? null));
    if (sourceFolderIds.size === 1) {
      setTargetFolderId(projects[0].folder_id ?? ROOT_VALUE);
    } else {
      setTargetFolderId(UNSELECTED_VALUE);
    }
  }, [projects]);

  const submit = () => {
    if (projects.length === 0 || targetFolderId === UNSELECTED_VALUE) {
      return;
    }
    void onConfirm(
      projects.map((project) => project.id),
      targetFolderId === ROOT_VALUE ? null : targetFolderId,
    );
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isDialogSubmitShortcut(event)) {
      return;
    }

    event.preventDefault();
    if (isMoving || projects.length === 0 || targetFolderId === UNSELECTED_VALUE) {
      return;
    }

    submit();
  };

  return (
    <Dialog open={projects.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onKeyDown={handleDialogKeyDown}>
        <DialogHeader>
          <DialogTitle>{projects.length === 1 ? "Move Project" : `Move ${projects.length} Projects`}</DialogTitle>
          <DialogDescription>
            {projects.length === 1
              ? "Select where this project should live."
              : "Select one destination for all selected projects. The move is applied atomically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {projects.length === 1
              ? `Project: ${getProjectDisplayName(projects[0])}`
              : `${projects.length} selected projects`}
          </p>
          <select
            aria-label="Destination folder"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={targetFolderId}
            onChange={(event) => setTargetFolderId(event.target.value)}
          >
            {targetFolderId === UNSELECTED_VALUE && (
              <option value={UNSELECTED_VALUE} disabled>
                Choose a destination
              </option>
            )}
            <option value={ROOT_VALUE}>Workspace Root</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folderPathById.get(folder.id) ?? folder.name}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isMoving}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={isMoving || projects.length === 0 || targetFolderId === UNSELECTED_VALUE}
          >
            {isMoving ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
