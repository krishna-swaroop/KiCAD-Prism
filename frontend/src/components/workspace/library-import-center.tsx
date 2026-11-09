import { useCallback, useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { AlertTriangle, Check, ChevronRight, CircuitBoard, FolderOpen, FolderSearch, HardDrive, LoaderCircle, PanelLeftClose, PanelLeftOpen, RefreshCw, Table2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ApiHttpError } from "@/lib/api";
import { usePoll } from "@/lib/server-state";
import { Input } from "@/components/ui/input";
import { canWriteCatalog } from "@/lib/roles";
import type { User } from "@/types/auth";
import type { LibraryFolderDiscovery, ProjectComponentImportProposal, ProjectComponentImportSession } from "@/types/catalog";
import type { Project } from "@/types/project";
import { PermissionHint } from "@/components/ui/permission-hint";
import { cn } from "@/lib/utils";
import { LibraryImportRemediationDialog, type ProposalRemediation } from "./library-import-remediation-dialog";
import { LibraryImportRemediationGrid } from "./library-import-remediation-grid";
import { useImportCustomFields } from "./library-import-custom-fields";
import { LibraryFolderDiscoveryDialog } from "./library-folder-discovery-dialog";
import { isAbortError } from "@/lib/jobs";
import { useImportSessionProposals } from "./library-import-session-proposals";
import {
  completeFolderSnapshot,
  createFolderSnapshot,
  createProjectImportSession,
  deleteImportSession,
  discoverFolderSnapshot,
  importServerFolder as queueServerFolderImport,
  listFolderImportRoots,
  listImportSessions,
  resolveImportProposal,
  uploadSnapshotFile,
} from "./catalog-client";

interface LibraryImportCenterProps {
  projects: Project[];
  user: User | null;
  initialSessionId?: string;
}

const sessionStatusLabel: Record<ProjectComponentImportSession["status"], string> = {
  queued: "Queued",
  uploading: "Uploading",
  scanning: "Scanning",
  staged: "Ready for review",
  failed: "Failed",
};

function groupedFindings(findings: ProjectComponentImportProposal["findings"]) {
  const grouped = new Map<string, ProjectComponentImportProposal["findings"][number] & { count: number }>();
  for (const finding of findings) {
    const key = `${finding.severity}:${finding.message}`;
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { ...finding, count: 1 });
  }
  return Array.from(grouped.values());
}

// Status dots, as in Release Studio's run list.
const SESSION_DOT: Record<ProjectComponentImportSession["status"], string> = {
  queued: "bg-muted-foreground",
  uploading: "bg-muted-foreground",
  scanning: "bg-muted-foreground",
  staged: "bg-primary",
  failed: "bg-destructive",
};

function sessionName(session: ProjectComponentImportSession, projects: Project[]): string {
  if (session.scope === "folder") return session.selection.display_name || "Library folder";
  if (session.scope === "all-projects") return "All projects";
  const project = projects.find((item) => item.id === session.project_id);
  return project?.display_name || project?.name || session.project_id;
}

const runningStatuses = new Set<ProjectComponentImportSession["status"]>(["queued", "uploading", "scanning"]);

const folderRelativePath = (file: File) => file.webkitRelativePath || file.name;
const isDiscoverySource = (file: File) => /\.(kicad_sym|kicad_mod)$/i.test(file.name);
const retryableUploadStatus = new Set([408, 425, 429, 500, 502, 503, 504]);

async function uploadSnapshotFiles(
  snapshotId: string,
  files: File[],
  onProgress: (completed: number, total: number) => void
) {
  let cursor = 0;
  let completed = 0;
  const failures: Array<{ file: File; message: string }> = [];
  const uploadOne = async (file: File) => {
    const uploadFailed = `Failed to upload ${file.name}`;
    let lastMessage = uploadFailed;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await uploadSnapshotFile(snapshotId, folderRelativePath(file), file, uploadFailed);
        return;
      } catch (error) {
        if (error instanceof ApiHttpError) {
          // A proxy's 413 page has no Prism body, so the generic message says why.
          lastMessage = error.status === 413 && error.message === uploadFailed
            ? `${file.name} exceeds the reverse-proxy upload limit`
            : error.message;
          if (!retryableUploadStatus.has(error.status)) break;
        } else {
          lastMessage = error instanceof Error ? error.message : lastMessage;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
    }
    failures.push({ file, message: lastMessage });
  };
  const worker = async () => {
    while (cursor < files.length) {
      const file = files[cursor];
      cursor += 1;
      await uploadOne(file);
      completed += 1;
      onProgress(completed, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
  if (failures.length > 0) {
    const first = failures[0];
    throw new Error(`${failures.length} file${failures.length === 1 ? "" : "s"} could not be captured. ${first.file.name}: ${first.message}`);
  }
}

// One toast per outage, not one per 2 s tick (usePoll skips repeats until a
// tick succeeds), so a 30 s restart does not stack fifteen identical errors.
const reportScanRefreshFailure = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : "Failed to refresh import sessions");
};

// The non-standard directory attributes React does not type. Constant, so
// it is declared once rather than rebuilt on every render.
const DIRECTORY_INPUT_PROPS: InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory: string;
  directory: string;
} = { webkitdirectory: "", directory: "" };

// react-doctor-disable-next-line no-giant-component - multi-step import flow with one session state machine
export function LibraryImportCenter({ projects, user, initialSessionId }: LibraryImportCenterProps) {
  const [sessions, setSessions] = useState<ProjectComponentImportSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId || "");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [folderProgress, setFolderProgress] = useState<{ completed: number; total: number; label: string } | null>(null);
  const [pendingFolder, setPendingFolder] = useState<{
    snapshotId: string;
    filesByPath: Map<string, File>;
    manualFiles: Map<string, File>;
    discovery: LibraryFolderDiscovery;
    uploadedPaths: Set<string>;
    footprintResolutions: Record<string, string>;
  } | null>(null);
  const [serverRoots, setServerRoots] = useState<Array<{ name: string; path_hint: string }>>([]);
  const [serverRoot, setServerRoot] = useState("");
  const [serverSubpath, setServerSubpath] = useState("");
  const [proposalActionId, setProposalActionId] = useState("");
  const [remediationProposal, setRemediationProposal] = useState<ProjectComponentImportProposal | null>(null);
  // The grid is the primary path; the card list stays for per-component findings.
  const [reviewMode, setReviewMode] = useState<"grid" | "cards">("grid");
  // The grid is wide; collapsing the session rail gives it back ~15rem.
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<ProjectComponentImportSession | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const customFields = useImportCustomFields();
  const canWrite = canWriteCatalog(user?.role);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId),
    [selectedSessionId, sessions]
  );
  const { proposals, loadProposals } = useImportSessionProposals(selectedSessionId, selectedSession?.status);
  const hasActiveScan = sessions.some((session) => session.status === "queued" || session.status === "scanning");

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    const response = await listImportSessions(signal);
    if (signal?.aborted) return;
    setSessions(response.items);
    setSelectedSessionId((current) => current || initialSessionId || response.items[0]?.id || "");
  }, [initialSessionId]);

  const refreshActiveImport = useCallback(async (signal: AbortSignal) => {
    await loadSessions(signal);
    await loadProposals(selectedSessionId, signal);
  }, [loadProposals, loadSessions, selectedSessionId]);

  // Fetch carries the AbortController signal; setters run only when this
  // initial session-list request is still the mounted one.
  // react-doctor-disable-next-line react-doctor/no-set-state-after-await-in-effect
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        await loadSessions(controller.signal);
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        toast.error(error instanceof Error ? error.message : "Failed to load import sessions");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [loadSessions]);

  useEffect(() => {
    if (!canWrite) return;
    void listFolderImportRoots().then((response) => {
      setServerRoots(response.items);
      setServerRoot((current) => current || response.items[0]?.name || "");
    }).catch(() => setServerRoots([]));
  }, [canWrite]);

  usePoll(hasActiveScan, refreshActiveImport, { intervalMs: 2000, onError: reportScanRefreshFailure });

  const createSession = async (scope: "project" | "all-projects") => {
    if (scope === "project" && !projectId) return;
    setCreating(true);
    try {
      const session = await createProjectImportSession(scope, scope === "project" ? projectId : "");
      await loadSessions();
      setSelectedSessionId(session.id);
      toast.success(scope === "project" ? "Project component scan queued" : "All-project component scan queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue project import");
    } finally {
      setCreating(false);
    }
  };

  const uploadFolder = async (files: FileList | null) => {
    if (!files?.length) return;
    setCreating(true);
    const selected = Array.from(files);
    try {
      const topLevel = selected[0]?.webkitRelativePath.split("/")[0] || "KiCad libraries";
      const discoveryFiles = selected.filter(isDiscoverySource);
      if (discoveryFiles.length === 0) throw new Error("No .kicad_sym or .kicad_mod files were found in the selected directory");
      const snapshot = await createFolderSnapshot(topLevel);
      setFolderProgress({ completed: 0, total: discoveryFiles.length, label: "Capturing KiCad sources" });
      await uploadSnapshotFiles(snapshot.id, discoveryFiles, (completed, total) => {
        setFolderProgress({ completed, total, label: "Capturing KiCad sources" });
      });
      setFolderProgress({ completed: 0, total: 1, label: "Resolving component relationships" });
      const discovery = await discoverFolderSnapshot(snapshot.id, {
        files: selected.map((file) => ({ relative_path: folderRelativePath(file), size_bytes: file.size })),
      });
      setPendingFolder({
        snapshotId: snapshot.id,
        filesByPath: new Map(selected.map((file) => [folderRelativePath(file).toLocaleLowerCase(), file])),
        manualFiles: new Map(),
        discovery,
        uploadedPaths: new Set(discoveryFiles.map((file) => folderRelativePath(file).toLocaleLowerCase())),
        footprintResolutions: {},
      });
      toast.success(`${discovery.components.length} components identified for review`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to discover library folder");
    } finally {
      setCreating(false);
      setFolderProgress(null);
    }
  };

  const approveFolderDiscovery = async (componentIds: string[], footprintResolutions: Record<string, string>) => {
    if (!pendingFolder) return;
    setCreating(true);
    try {
      const effectiveResolutions = { ...pendingFolder.footprintResolutions, ...footprintResolutions };
      const selectedFiles = [...pendingFolder.filesByPath.values()];
      const inventory = [
        ...selectedFiles.map((file) => ({ relative_path: folderRelativePath(file), size_bytes: file.size })),
        ...[...pendingFolder.manualFiles].map(([relativePath, file]) => ({ relative_path: relativePath, size_bytes: file.size })),
      ];
      const refreshedDiscovery = await discoverFolderSnapshot(pendingFolder.snapshotId, {
        files: inventory,
        footprint_resolutions: effectiveResolutions,
      });
      const componentIdSet = new Set(componentIds);
      const approved = refreshedDiscovery.components.filter((component) => componentIdSet.has(component.id));
      const requiredPaths = new Set<string>();
      for (const component of approved) {
        requiredPaths.add(component.symbol.relative_path);
        if (component.footprint.selected) requiredPaths.add(component.footprint.selected.relative_path);
        for (const model of component.models) {
          if (model.status === "resolved" && model.candidates[0]) requiredPaths.add(model.candidates[0].relative_path);
        }
      }
      const filesToUpload = [...requiredPaths].flatMap((path) => {
        if (pendingFolder.uploadedPaths.has(path.toLocaleLowerCase())) return [];
        const file = pendingFolder.filesByPath.get(path.toLocaleLowerCase()) || pendingFolder.manualFiles.get(path);
        return file ? [file] : [];
      });
      const missing = [...requiredPaths].filter((path) =>
        !pendingFolder.uploadedPaths.has(path.toLocaleLowerCase())
        && !pendingFolder.filesByPath.has(path.toLocaleLowerCase())
        && !pendingFolder.manualFiles.has(path)
      );
      if (missing.length > 0) throw new Error(`Referenced asset is unavailable in the browser selection: ${missing[0]}`);
      setFolderProgress({ completed: 0, total: filesToUpload.length || 1, label: "Capturing approved assets" });
      await uploadSnapshotFiles(pendingFolder.snapshotId, filesToUpload, (completed, total) => {
        setFolderProgress({ completed, total, label: "Capturing approved assets" });
      });
      const session = await completeFolderSnapshot(pendingFolder.snapshotId, {
        approved_component_ids: componentIds,
        footprint_resolutions: effectiveResolutions,
      });
      await loadSessions();
      setSelectedSessionId(session.id);
      setPendingFolder(null);
      if (folderInputRef.current) folderInputRef.current.value = "";
      toast.success(`${componentIds.length} approved components queued for import`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to capture approved library assets");
    } finally {
      setCreating(false);
      setFolderProgress(null);
    }
  };

  const attachMissingFootprint = async (componentId: string, file: File) => {
    if (!pendingFolder) return;
    if (!file.name.toLocaleLowerCase().endsWith(".kicad_mod")) throw new Error("Select a KiCad .kicad_mod footprint file");
    const component = pendingFolder.discovery.components.find((item) => item.id === componentId);
    if (!component) throw new Error("Discovered component is no longer available");
    const safeLibrary = component.library.replace(/[^A-Za-z0-9_.-]+/g, "_") || "Manual";
    const relativePath = `manual-footprints/${safeLibrary}.pretty/${file.name}`;
    await uploadSnapshotFile(pendingFolder.snapshotId, relativePath, file, `Failed to attach ${file.name}`);
    const manualFiles = new Map(pendingFolder.manualFiles).set(relativePath, file);
    const uploadedPaths = new Set(pendingFolder.uploadedPaths).add(relativePath.toLocaleLowerCase());
    const footprintResolutions = { ...pendingFolder.footprintResolutions, [componentId]: relativePath };
    const inventory = [
      ...[...pendingFolder.filesByPath.values()].map((source) => ({ relative_path: folderRelativePath(source), size_bytes: source.size })),
      ...[...manualFiles].map(([path, source]) => ({ relative_path: path, size_bytes: source.size })),
    ];
    const discovery = await discoverFolderSnapshot(pendingFolder.snapshotId, {
      files: inventory,
      footprint_resolutions: footprintResolutions,
    });
    setPendingFolder({ ...pendingFolder, manualFiles, uploadedPaths, footprintResolutions, discovery });
    toast.success(`${file.name} attached to ${component.symbol_name}`);
  };

  const attachMissingModel = async (componentId: string, file: File) => {
    if (!pendingFolder) return;
    if (!/\.(step|stp|wrl)$/i.test(file.name)) throw new Error("Select a STEP, STP, or WRL 3D model file");
    const component = pendingFolder.discovery.components.find((item) => item.id === componentId);
    if (!component) throw new Error("Discovered component is no longer available");
    const missingModel = component.models.find((model) => model.status === "missing");
    if (!missingModel) throw new Error("This component no longer has a missing 3D model reference");
    const expectedName = missingModel.reference.replace(/\\/g, "/").split("/").pop();
    if (expectedName && file.name.toLocaleLowerCase() !== expectedName.toLocaleLowerCase()) {
      throw new Error(`The footprint references ${expectedName}. Select a model with that filename so the relationship remains deterministic.`);
    }
    const relativePath = `manual-models/${file.name}`;
    await uploadSnapshotFile(pendingFolder.snapshotId, relativePath, file, `Failed to attach ${file.name}`);
    const manualFiles = new Map(pendingFolder.manualFiles).set(relativePath, file);
    const uploadedPaths = new Set(pendingFolder.uploadedPaths).add(relativePath.toLocaleLowerCase());
    const inventory = [
      ...[...pendingFolder.filesByPath.values()].map((source) => ({ relative_path: folderRelativePath(source), size_bytes: source.size })),
      ...[...manualFiles].map(([path, source]) => ({ relative_path: path, size_bytes: source.size })),
    ];
    const discovery = await discoverFolderSnapshot(pendingFolder.snapshotId, {
      files: inventory,
      footprint_resolutions: pendingFolder.footprintResolutions,
    });
    setPendingFolder({ ...pendingFolder, manualFiles, uploadedPaths, discovery });
    toast.success(`${file.name} attached to ${component.symbol_name}`);
  };

  const importServerFolder = async () => {
    if (!serverRoot) return;
    setCreating(true);
    try {
      const session = await queueServerFolderImport(serverRoot, serverSubpath);
      await loadSessions();
      setSelectedSessionId(session.id);
      toast.success("Read-only folder snapshot queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import server folder");
    } finally {
      setCreating(false);
    }
  };

  const deleteSession = async (session: ProjectComponentImportSession) => {
    setDeletingSession(true);
    try {
      await deleteImportSession(session.id);
      const remaining = sessions.filter((item) => item.id !== session.id);
      setSessions(remaining);
      if (selectedSessionId === session.id) setSelectedSessionId(remaining[0]?.id || "");
      setSessionToDelete(null);
      toast.success("Import session deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete import session");
    } finally {
      setDeletingSession(false);
    }
  };

  const resolveProposal = async (proposal: ProjectComponentImportProposal, action: "accept" | "reject", remediation?: ProposalRemediation) => {
    setProposalActionId(proposal.id);
    try {
      await resolveImportProposal(proposal.id, action, remediation);
      await Promise.all([loadSessions(), loadProposals(proposal.session_id)]);
      toast.success(action === "accept" ? `${proposal.reference} imported as a draft revision` : `${proposal.reference} rejected`);
      if (action === "accept") setRemediationProposal(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} proposal`);
    } finally {
      setProposalActionId("");
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground" aria-label="Loading"><LoaderCircle className="h-4 w-4 animate-spin" /></div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          {...DIRECTORY_INPUT_PROPS}
          onChange={(event) => void uploadFolder(event.currentTarget.files)}
        />
        {/* One hint for the whole cluster: the permission and allowed roles are
            identical for every import source. */}
        <PermissionHint
          blocked={!canWrite}
          action="import components into the catalog"
          allowedRoles={["designer", "admin"]}
          className="flex min-w-0 flex-1 max-w-none"
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" data-testid="import-sources">
            <div role="group" aria-label="Project components" className="flex min-w-0 items-center gap-1.5">
              <CircuitBoard className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Select value={projectId} onValueChange={setProjectId} disabled={!canWrite || creating}>
                <SelectTrigger size="sm" className="w-48" aria-label="Project"><SelectValue placeholder="Project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.display_name || project.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" title="Scan this project's components" onClick={() => void createSession("project")} disabled={!canWrite || !projectId || creating}>Scan</Button>
              <Button size="sm" variant="outline" title="Scan every project's components" onClick={() => void createSession("all-projects")} disabled={!canWrite || creating}>All projects</Button>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div role="group" aria-label="KiCad libraries" className="flex min-w-0 items-center gap-1.5">
              <Button size="sm" variant="outline" title="Import KiCad libraries from a folder on this computer" onClick={() => folderInputRef.current?.click()} disabled={!canWrite || creating}>
                <FolderOpen className="h-3.5 w-3.5" />Local folder
              </Button>
              {serverRoots.length > 0 && (
                <>
                  <Select value={serverRoot} onValueChange={setServerRoot} disabled={!canWrite || creating}>
                    <SelectTrigger size="sm" className="w-32" aria-label="Server root"><SelectValue placeholder="Server root" /></SelectTrigger>
                    <SelectContent>{serverRoots.map((root) => <SelectItem key={root.name} value={root.name} title={root.path_hint}>{root.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="h-8 w-36 text-xs" aria-label="Subfolder" value={serverSubpath} onChange={(event) => setServerSubpath(event.target.value)} placeholder="Subfolder" disabled={creating} />
                  <Button size="sm" variant="outline" title="Import KiCad libraries from the server folder" onClick={() => void importServerFolder()} disabled={!canWrite || creating}>
                    <HardDrive className="h-3.5 w-3.5" />Server folder
                  </Button>
                </>
              )}
            </div>
          </div>
        </PermissionHint>
        {folderProgress && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" title={folderProgress.label}>
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            <span className="tabular-nums">{folderProgress.completed}/{folderProgress.total}</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${(folderProgress.completed / folderProgress.total) * 100}%` }} />
            </div>
          </div>
        )}
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1 transition-[grid-template-columns] duration-200",
          sessionsCollapsed ? "grid-cols-[3rem_minmax(0,1fr)]" : "grid-cols-[15rem_minmax(0,1fr)]"
        )}
      >
        <aside className="flex min-h-0 flex-col border-r">
          {sessionsCollapsed ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Expand import sessions"
                title="Expand import sessions"
                onClick={() => setSessionsCollapsed(false)}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
              <Badge variant="outline" className="px-1 text-[10px]">{sessions.length}</Badge>
            </div>
          ) : (
            <>
              <div className="flex h-10 shrink-0 items-center gap-1 border-b pl-3 pr-1 text-sm font-medium">
                <span className="flex-1 truncate">Sessions</span>
                <Button variant="ghost" size="icon-sm" aria-label="Refresh imports" title="Refresh" onClick={() => void loadSessions()}><RefreshCw className="h-3.5 w-3.5" /></Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Collapse import sessions"
                  title="Collapse import sessions"
                  onClick={() => setSessionsCollapsed(true)}
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {sessions.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">No imports</p>
                ) : sessions.map((session) => {
                  const name = sessionName(session, projects);
                  const active = selectedSessionId === session.id;
                  const running = runningStatuses.has(session.status);
                  return (
                    <div key={session.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => setSelectedSessionId(session.id)}
                        aria-current={active ? "true" : undefined}
                        title={`${name} · ${sessionStatusLabel[session.status]} · ${session.candidate_count} of ${session.proposal_count} open`}
                        className={cn(
                          "flex h-9 w-full items-center gap-2 border-b px-3 text-left text-xs",
                          active ? "bg-muted shadow-[inset_2px_0_0_hsl(var(--primary))]" : "hover:bg-muted/40",
                        )}
                      >
                        {running ? (
                          <LoaderCircle className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                        ) : (
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", SESSION_DOT[session.status])} aria-hidden />
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground group-hover:invisible group-focus-within:invisible">{session.candidate_count}</span>
                      </button>
                      {canWrite && !running && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label="Delete import session"
                          title="Delete import session"
                          onClick={() => setSessionToDelete(session)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </aside>

        <section
          className={cn(
            "min-h-0 p-4",
            selectedSession && proposals.length > 0 && reviewMode === "grid"
              ? "overflow-hidden"
              : "overflow-y-auto"
          )}
        >
          {!selectedSession ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><FolderSearch className="size-6" aria-hidden />No session selected</div>
          ) : selectedSession.status === "failed" ? (
            <Alert variant="destructive"><AlertTriangle /><AlertTitle>Scan failed</AlertTitle><AlertDescription className="break-words">{selectedSession.error_message}</AlertDescription></Alert>
          ) : proposals.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{selectedSession.status === "staged" ? "No components found" : <LoaderCircle className="h-4 w-4 animate-spin" aria-label="Scanning" />}</div>
          ) : reviewMode === "grid" ? (
            <div className="h-full min-h-0">
              <LibraryImportRemediationGrid
                sessionId={selectedSession.id}
                proposals={proposals}
                customFields={customFields}
                canWrite={canWrite}
                onShowDetailView={() => setReviewMode("cards")}
                onRefresh={async () => {
                  await Promise.all([loadSessions(), loadProposals(selectedSession.id)]);
                }}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setReviewMode("grid")}>
                  <Table2 className="mr-1.5 h-3.5 w-3.5" />Grid
                </Button>
              </div>
              {proposals.map((proposal) => {
                const metadata = proposal.metadata as { value?: string; manufacturer?: string; manufacturer_part_number?: string; footprint?: string; references?: string[] };
                const blocking = proposal.findings.filter((finding) => finding.severity === "error").length;
                const warnings = proposal.findings.length - blocking;
                const findingGroups = groupedFindings(proposal.findings);
                return (
                  <article key={proposal.id} className="border bg-card px-3 py-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-mono text-sm font-semibold">{(metadata.references || [proposal.reference]).join(", ")}</h3><Badge variant="outline">{proposal.status}</Badge>{blocking > 0 && <Badge variant="destructive">{blocking} blocking</Badge>}</div>
                        <p className="mt-1 truncate text-sm">{metadata.value || "—"} · {metadata.manufacturer_part_number || "—"}</p>
                        <p className="truncate text-xs text-muted-foreground">{metadata.manufacturer || "—"} · {metadata.footprint || "—"} · {proposal.assets.length} assets · {proposal.provenance.length} usages</p>
                        {proposal.findings.length > 0 && (
                          <Collapsible className="group mt-2 border-t pt-1.5">
                            <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                              <span>Findings</span>
                              {blocking > 0 ? <Badge variant="destructive">{blocking} blocker{blocking === 1 ? "" : "s"}</Badge> : null}
                              {warnings > 0 ? <Badge variant="warning">{warnings} warning{warnings === 1 ? "" : "s"}</Badge> : null}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 space-y-1.5 border-l pl-3">
                              {findingGroups.map((finding) => (
                                <p key={`${finding.severity}:${finding.message}`} className="flex items-start gap-2 text-xs text-muted-foreground">
                                  <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", finding.severity === "error" ? "text-destructive" : "text-warning")} />
                                  <span>{finding.message}{finding.count > 1 ? <span className="ml-1 font-medium text-foreground">×{finding.count}</span> : null}</span>
                                </p>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                      {proposal.status === "candidate" && <div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" onClick={() => void resolveProposal(proposal, "reject")} disabled={!canWrite || proposalActionId === proposal.id}><X className="mr-1.5 h-3.5 w-3.5" />Reject</Button><Button size="sm" onClick={() => setRemediationProposal(proposal)} disabled={!canWrite || proposalActionId === proposal.id}>{proposalActionId === proposal.id ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}Accept</Button></div>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <LibraryImportRemediationDialog
        key={remediationProposal?.id ?? "none"}
        proposal={remediationProposal}
        customFields={customFields}
        open={remediationProposal !== null}
        submitting={proposalActionId === remediationProposal?.id}
        onOpenChange={(nextOpen) => { if (!nextOpen && !proposalActionId) setRemediationProposal(null); }}
        onAccept={(remediation) => { if (remediationProposal) void resolveProposal(remediationProposal, "accept", remediation); }}
      />
      <LibraryFolderDiscoveryDialog
        discovery={pendingFolder?.discovery || null}
        open={pendingFolder !== null}
        submitting={creating}
        onOpenChange={(open) => {
          if (!open && !creating) {
            setPendingFolder(null);
            if (folderInputRef.current) folderInputRef.current.value = "";
          }
        }}
        onApprove={(componentIds, footprintResolutions) => void approveFolderDiscovery(componentIds, footprintResolutions)}
        onAttachFootprint={attachMissingFootprint}
        onAttachModel={attachMissingModel}
      />
      <ConfirmDialog
        open={sessionToDelete !== null}
        onOpenChange={(open) => { if (!open && !deletingSession) setSessionToDelete(null); }}
        title="Delete import session"
        description="Open candidates and staged files are removed. Accepted components stay in the catalog."
        confirmLabel="Delete"
        busy={deletingSession}
        onConfirm={() => { if (sessionToDelete) void deleteSession(sessionToDelete); }}
      />
    </div>
  );
}
