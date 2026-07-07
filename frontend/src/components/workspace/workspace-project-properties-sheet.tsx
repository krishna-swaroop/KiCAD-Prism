import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Box, CalendarDays, FolderTree, GitBranch, GitCommit, PanelRightOpen, Tag, X } from "lucide-react";

import { fetchJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FolderTreeItem, Project, ProjectPropertiesResponse } from "@/types/project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const COMMIT_AUTHOR_DISPLAY_NAME = "John Doe";

interface WorkspaceProjectPropertiesSheetProps {
  open: boolean;
  project: Project | null;
  folderById: Map<string, FolderTreeItem>;
  onOpenChange: (open: boolean) => void;
  onOpenProject: (project: Project) => void;
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Not available";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const dateOnly = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(dateOnly.getTime())) {
      return dateOnly.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBoardSecondaryLabel(data: ProjectPropertiesResponse | null, project: Project): string {
  const pcbTitle = data?.files.pcb?.title_block?.title?.trim();
  if (pcbTitle) {
    return pcbTitle;
  }

  const pcbFilename = data?.files.pcb?.filename;
  if (pcbFilename) {
    return pcbFilename.replace(/\.kicad_pcb$/i, "");
  }

  return project.name;
}

function resolveRepositoryLabel(project: Project): string {
  if (project.parent_repo) {
    return project.parent_repo;
  }

  if (project.repo_url) {
    return project.repo_url;
  }

  return "Standalone Project";
}

function formatPcbDimensions(
  dimensions?: { width_mm: number; height_mm: number } | null
): string {
  if (!dimensions) {
    return "Not available";
  }

  return `${dimensions.width_mm} mm × ${dimensions.height_mm} mm`;
}

function formatBoardThickness(value?: number | null): string {
  if (value == null) {
    return "Not available";
  }

  return `${value} mm`;
}

function formatFileFormat(
  version?: number | null,
  generator?: string | null,
  generatorVersion?: string | null
): string {
  const parts = [
    version != null ? `v${version}` : null,
    [generator, generatorVersion].filter(Boolean).join(" ").trim() || null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" • ") : "Not available";
}

function buildFolderPath(folderId: string | null | undefined, folderById: Map<string, FolderTreeItem>): string {
  if (!folderId) {
    return "Workspace Root";
  }

  const segments: string[] = [];
  let currentId: string | null = folderId;
  let guard = 0;

  while (currentId && guard < 64) {
    const folder = folderById.get(currentId);
    if (!folder) {
      break;
    }
    segments.unshift(folder.name);
    currentId = folder.parent_id ?? null;
    guard += 1;
  }

  return segments.length > 0 ? segments.join(" / ") : "Workspace Root";
}

function hasMetadataValue(value: ReactNode | null | undefined): boolean {
  if (value == null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

function MetadataRow({
  label,
  value,
  fallback = "Not available",
}: {
  label: string;
  value?: ReactNode | null;
  fallback?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,8rem)_1fr] gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-foreground">{hasMetadataValue(value) ? value : fallback}</span>
    </div>
  );
}

function MetadataSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Box;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{title}</span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function PropertiesSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-3/4 rounded-none" />
        <Skeleton className="h-5 w-1/2 rounded-none" />
      </div>
      <div className="space-y-3 border-t pt-5">
        <Skeleton className="h-4 w-24 rounded-none" />
        <Skeleton className="h-4 w-full rounded-none" />
        <Skeleton className="h-4 w-5/6 rounded-none" />
        <Skeleton className="h-4 w-4/6 rounded-none" />
      </div>
      <div className="space-y-3 border-t pt-5">
        <Skeleton className="h-4 w-24 rounded-none" />
        <Skeleton className="h-16 w-full rounded-none" />
        <Skeleton className="h-16 w-full rounded-none" />
      </div>
    </div>
  );
}

export function WorkspaceProjectPropertiesSheet({
  open,
  project,
  folderById,
  onOpenChange,
  onOpenProject,
}: WorkspaceProjectPropertiesSheetProps) {
  const [data, setData] = useState<ProjectPropertiesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (!open || !project) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetchJson<ProjectPropertiesResponse>(
      `/api/projects/${project.id}/properties`,
      { signal: controller.signal },
      "Failed to load project properties"
    )
      .then((response) => {
        if (!controller.signal.aborted) {
          setData(response);
        }
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load project properties");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [open, project]);

  const activeProject = data?.project ?? project;
  const panelProject = activeProject ?? project;
  const displayName = activeProject?.display_name || activeProject?.name || "Project";
  const repositoryLabel = panelProject ? resolveRepositoryLabel(panelProject) : "Standalone Project";
  const folderPath = useMemo(
    () => buildFolderPath(panelProject?.folder_id ?? null, folderById),
    [panelProject?.folder_id, folderById]
  );

  if (!open) {
    return null;
  }

  return (
    <aside
      className={cn(
        "flex h-full min-w-0 shrink-0 flex-col border-l bg-background/95 backdrop-blur-sm shadow-2xl",
        "w-[360px] lg:w-[400px] xl:w-[460px]"
      )}
      aria-label="Project properties panel"
    >
      <div className="flex min-h-full flex-col overflow-hidden">
        <div className="space-y-3 border-b px-6 py-5 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Properties</Badge>
              </div>
              <div className="space-y-1">
                <h2 className="truncate text-2xl font-semibold leading-tight">{displayName}</h2>
                <p className="text-sm text-muted-foreground">
                  {project ? formatBoardSecondaryLabel(data, project) : "Project metadata"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {project ? (
                <Button variant="outline" size="sm" onClick={() => onOpenProject(project)}>
                  <PanelRightOpen className="h-4 w-4" />
                  Open Project
                </Button>
              ) : null}
              <Button variant="ghost" size="icon-sm" aria-label="Close properties panel" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {loading ? <PropertiesSkeleton /> : null}

          {!loading && error ? (
            <div className="rounded-none border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!loading && !error && panelProject ? (
            <>
              <section className="space-y-4">
                <div className="aspect-[4/3] overflow-hidden rounded-none border bg-muted/30">
                  {activeProject?.thumbnail_url ? (
                    <button
                      className="h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      onClick={() => setLightbox(true)}
                      title="Click to expand"
                    >
                      <img
                        src={activeProject.thumbnail_url}
                        alt={displayName}
                        className="h-full w-full object-cover hover:scale-105 transition-transform duration-300 cursor-zoom-in"
                      />
                    </button>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Box className="h-12 w-12 opacity-30" />
                    </div>
                  )}
                </div>
              </section>

              {lightbox && activeProject?.thumbnail_url && createPortal(
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)" }}
                  onClick={() => setLightbox(false)}
                >
                  <img
                    src={activeProject.thumbnail_url}
                    alt={displayName}
                    style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: "6px", boxShadow: "0 25px 60px rgba(0,0,0,0.8)" }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>,
                document.body
              )}

              <MetadataSection title="Project Details" icon={FolderTree}>
                <MetadataRow label="Description" value={panelProject.description} />
                <MetadataRow label="Folder" value={folderPath} />
                <MetadataRow
                  label="Repository Link"
                  value={
                    panelProject.repo_url ? (
                      <a
                        href={panelProject.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all underline underline-offset-4 transition-colors hover:text-primary"
                      >
                        {panelProject.repo_url}
                      </a>
                    ) : (
                      repositoryLabel
                    )
                  }
                />
              </MetadataSection>

              <MetadataSection title="Versions" icon={GitBranch}>
                <MetadataRow
                  label="Latest Commit"
                  value={
                    data?.repository.latest_commit
                      ? `${data.repository.latest_commit.hash} by ${COMMIT_AUTHOR_DISPLAY_NAME}`
                      : "No commits found"
                  }
                />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Latest Tag</p>
                  {data?.repository.latest_tag ? (
                    <div className="rounded-none border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <span>{data.repository.latest_tag.tag}</span>
                        <span className="text-xs text-muted-foreground">{data.repository.latest_tag.commit_hash}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(data.repository.latest_tag.date)}</p>
                      {data.repository.latest_tag.message ? (
                        <p className="mt-2 text-sm">{data.repository.latest_tag.message.split("\n")[0]}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No tags available for this project.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Repository Activity</p>
                  <div className="rounded-none border bg-muted/20 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <GitCommit className="h-4 w-4 text-muted-foreground" />
                      <span>{data?.repository.latest_commit?.message?.split("\n")[0] || "No recent commit activity"}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {data?.repository.latest_commit
                        ? `${COMMIT_AUTHOR_DISPLAY_NAME} • ${formatDateTime(data.repository.latest_commit.date)}`
                        : "No repository activity available"}
                    </p>
                  </div>
                </div>
              </MetadataSection>

              <MetadataSection title="Board Details" icon={Box}>
                <MetadataRow label="PCB Dimensions" value={formatPcbDimensions(data?.files.pcb?.dimensions_mm)} />
                <MetadataRow label="Board Thickness" value={formatBoardThickness(data?.files.pcb?.thickness_mm)} />
                <MetadataRow
                  label="SCH Format"
                  value={formatFileFormat(
                    data?.files.schematic?.version,
                    data?.files.schematic?.generator,
                    data?.files.schematic?.generator_version
                  )}
                />
                <MetadataRow
                  label="PCB Format"
                  value={formatFileFormat(
                    data?.files.pcb?.version,
                    data?.files.pcb?.generator,
                    data?.files.pcb?.generator_version
                  )}
                />
              </MetadataSection>

              <MetadataSection title="Dates" icon={CalendarDays}>
                <MetadataRow label="Last Modified" value={formatDateTime(panelProject.last_modified)} />
                <MetadataRow label="Imported" value={formatDateTime(panelProject.registered_at)} />
                <MetadataRow label="Latest Commit" value={formatDateTime(data?.repository.latest_commit?.date)} />
                <MetadataRow label="Schematic Date" value={data?.files.schematic?.title_block?.date} />
                <MetadataRow label="PCB Date" value={data?.files.pcb?.title_block?.date} />
              </MetadataSection>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
