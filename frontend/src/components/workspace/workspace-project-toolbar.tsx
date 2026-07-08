import { useState } from "react";
import { FolderPlus, Grid3X3, Image, List, Plus, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/api";

import { ViewMode } from "./workspace-types";

interface WorkspaceProjectToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onImport: () => void;
  onCreateFolder: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  canManageProjects: boolean;
  canOpenSettings: boolean;
  onThumbnailsGenerated?: () => void;
}

async function pollJob(jobId: string): Promise<void> {
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetchApi(`/api/projects/thumbnail/jobs/${jobId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === "done") return;
    if (data.status === "error") throw new Error(data.error || "Thumbnail generation failed");
  }
  throw new Error("Timed out waiting for thumbnail generation");
}

export function WorkspaceProjectToolbar({
  viewMode,
  onViewModeChange,
  onImport,
  onCreateFolder,
  onRefresh,
  onOpenSettings,
  canManageProjects,
  canOpenSettings,
  onThumbnailsGenerated,
}: WorkspaceProjectToolbarProps) {
  const [generating, setGenerating] = useState(false);

  const handleGenerateThumbnails = async () => {
    setGenerating(true);
    const toastId = toast.loading("Generating thumbnails…");
    try {
      const res = await fetchApi("/api/projects/thumbnail/generate-missing", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to start thumbnail generation");
      }
      const { job_id } = await res.json();
      await pollJob(job_id);
      toast.success("Thumbnails generated", { id: toastId });
      onThumbnailsGenerated?.();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Thumbnail generation failed", { id: toastId });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:h-14 md:flex-nowrap md:py-0">
      <div className="inline-flex rounded-md border p-1">
        <Button
          variant={viewMode === "gallery" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange("gallery")}
        >
          <Grid3X3 className="mr-2 h-4 w-4" />
          Gallery
        </Button>
        <Button
          variant={viewMode === "list" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange("list")}
        >
          <List className="mr-2 h-4 w-4" />
          List
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {canManageProjects && (
          <>
            <Button onClick={onImport}>
              <Plus className="mr-2 h-4 w-4" />
              Import Project
            </Button>
            <Button variant="outline" size="icon" onClick={onCreateFolder} aria-label="Create new folder">
              <FolderPlus className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void handleGenerateThumbnails()}
              disabled={generating}
              aria-label="Generate missing thumbnails"
              title="Generate missing thumbnails"
            >
              <Image className={`h-4 w-4 ${generating ? "animate-pulse" : ""}`} />
            </Button>
          </>
        )}
        <Button variant="outline" size="icon" onClick={onRefresh} aria-label="Refresh workspace">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {canOpenSettings && (
          <Button variant="outline" size="icon" onClick={onOpenSettings} aria-label="Open settings">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
