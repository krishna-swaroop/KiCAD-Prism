import { useCallback, useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { AlertTriangle, Check, ChevronRight, FolderOpen, FolderSearch, HardDrive, LoaderCircle, PanelLeftClose, PanelLeftOpen, RefreshCw, Rows3, Table2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchApi, fetchJson, readApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { canWriteCatalog } from "@/lib/roles";
import type { User } from "@/types/auth";
import type { LibraryFolderDiscovery, ProjectComponentImportProposal, ProjectComponentImportSession } from "@/types/catalog";
import type { Project } from "@/types/project";
import { PermissionHint } from "@/components/ui/permission-hint";
import { cn } from "@/lib/utils";
import { LibraryImportRemediationDialog, type ProposalRemediation } from "./library-import-remediation-dialog";
import { LibraryImportRemediationGrid } from "./library-import-remediation-grid";
import { LibraryFolderDiscoveryDialog } from "./library-folder-discovery-dialog";

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
    let lastMessage = `Failed to upload ${file.name}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const form = new FormData();
        form.append("relative_path", folderRelativePath(file));
        form.append("file", file, file.name);
        const response = await fetchApi(`/api/catalog/import-snapshots/folders/${snapshotId}/files`, { method: "POST", body: form });
        if (response.ok) return;
        lastMessage = await readApiError(response, response.status === 413
          ? `${file.name} exceeds the reverse-proxy upload limit`
          : `Failed to upload ${file.name}`);
        if (!retryableUploadStatus.has(response.status)) break;
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : lastMessage;
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

export function LibraryImportCenter({ projects, user, initialSessionId }: LibraryImportCenterProps) {
  const [sessions, setSessions] = useState<ProjectComponentImportSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId || "");
  const [proposals, setProposals] = useState<ProjectComponentImportProposal[]>([]);
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
  const canWrite = canWriteCatalog(user?.role);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const directoryInputProps: InputHTMLAttributes<HTMLInputElement> & {
    webkitdirectory: string;
    directory: string;
  } = { webkitdirectory: "", directory: "" };

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId),
    [selectedSessionId, sessions]
  );

  const loadSessions = useCallback(async () => {
    const response = await fetchJson<{ items: ProjectComponentImportSession[] }>("/api/catalog/import-sessions");
    setSessions(response.items);
    setSelectedSessionId((current) => current || initialSessionId || response.items[0]?.id || "");
  }, [initialSessionId]);

  const loadProposals = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setProposals([]);
      return;
    }
    const response = await fetchJson<{ items: ProjectComponentImportProposal[] }>(
      `/api/catalog/import-sessions/${sessionId}/proposals`
    );
    setProposals(response.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await loadSessions();
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Failed to load import sessions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [loadSessions]);

  useEffect(() => {
    if (!canWrite) return;
    void fetchJson<{ items: Array<{ name: string; path_hint: string }> }>(
      "/api/catalog/import-sources/folder-roots"
    ).then((response) => {
      setServerRoots(response.items);
      setServerRoot((current) => current || response.items[0]?.name || "");
    }).catch(() => setServerRoots([]));
  }, [canWrite]);

  useEffect(() => {
    void loadProposals(selectedSessionId).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to load import proposals");
    });
  }, [loadProposals, selectedSessionId]);

  useEffect(() => {
    if (!sessions.some((session) => session.status === "queued" || session.status === "scanning")) return;
    const timer = window.setInterval(() => {
      void loadSessions().then(() => loadProposals(selectedSessionId));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loadProposals, loadSessions, selectedSessionId, sessions]);

  const createSession = async (scope: "project" | "all-projects") => {
    if (scope === "project" && !projectId) return;
    setCreating(true);
    try {
      const session = await fetchJson<ProjectComponentImportSession>("/api/catalog/import-sessions/projects", {
        method: "POST",
        body: JSON.stringify({ scope, project_id: scope === "project" ? projectId : "" }),
      });
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
      const snapshot = await fetchJson<{ id: string }>("/api/catalog/import-snapshots/folders", {
        method: "POST",
        body: JSON.stringify({ display_name: topLevel }),
      });
      setFolderProgress({ completed: 0, total: discoveryFiles.length, label: "Capturing KiCad sources" });
      await uploadSnapshotFiles(snapshot.id, discoveryFiles, (completed, total) => {
        setFolderProgress({ completed, total, label: "Capturing KiCad sources" });
      });
      setFolderProgress({ completed: 0, total: 1, label: "Resolving component relationships" });
      const discovery = await fetchJson<LibraryFolderDiscovery>(
        `/api/catalog/import-snapshots/folders/${snapshot.id}/discover`,
        {
          method: "POST",
          body: JSON.stringify({ files: selected.map((file) => ({ relative_path: folderRelativePath(file), size_bytes: file.size })) }),
        }
      );
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
      const refreshedDiscovery = await fetchJson<LibraryFolderDiscovery>(
        `/api/catalog/import-snapshots/folders/${pendingFolder.snapshotId}/discover`,
        {
          method: "POST",
          body: JSON.stringify({
            files: inventory,
            footprint_resolutions: effectiveResolutions,
          }),
        }
      );
      const approved = refreshedDiscovery.components.filter((component) => componentIds.includes(component.id));
      const requiredPaths = new Set<string>();
      for (const component of approved) {
        requiredPaths.add(component.symbol.relative_path);
        if (component.footprint.selected) requiredPaths.add(component.footprint.selected.relative_path);
        for (const model of component.models) {
          if (model.status === "resolved" && model.candidates[0]) requiredPaths.add(model.candidates[0].relative_path);
        }
      }
      const filesToUpload = [...requiredPaths]
        .filter((path) => !pendingFolder.uploadedPaths.has(path.toLocaleLowerCase()))
        .map((path) => pendingFolder.filesByPath.get(path.toLocaleLowerCase()) || pendingFolder.manualFiles.get(path))
        .filter((file): file is File => Boolean(file));
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
      const session = await fetchJson<ProjectComponentImportSession>(
        `/api/catalog/import-snapshots/folders/${pendingFolder.snapshotId}/complete`,
        { method: "POST", body: JSON.stringify({ approved_component_ids: componentIds, footprint_resolutions: effectiveResolutions }) }
      );
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
    const form = new FormData();
    form.append("relative_path", relativePath);
    form.append("file", file, file.name);
    const response = await fetchApi(`/api/catalog/import-snapshots/folders/${pendingFolder.snapshotId}/files`, { method: "POST", body: form });
    if (!response.ok) throw new Error(await readApiError(response, `Failed to attach ${file.name}`));
    const manualFiles = new Map(pendingFolder.manualFiles).set(relativePath, file);
    const uploadedPaths = new Set(pendingFolder.uploadedPaths).add(relativePath.toLocaleLowerCase());
    const footprintResolutions = { ...pendingFolder.footprintResolutions, [componentId]: relativePath };
    const inventory = [
      ...[...pendingFolder.filesByPath.values()].map((source) => ({ relative_path: folderRelativePath(source), size_bytes: source.size })),
      ...[...manualFiles].map(([path, source]) => ({ relative_path: path, size_bytes: source.size })),
    ];
    const discovery = await fetchJson<LibraryFolderDiscovery>(
      `/api/catalog/import-snapshots/folders/${pendingFolder.snapshotId}/discover`,
      { method: "POST", body: JSON.stringify({ files: inventory, footprint_resolutions: footprintResolutions }) }
    );
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
    const form = new FormData();
    form.append("relative_path", relativePath);
    form.append("file", file, file.name);
    const response = await fetchApi(`/api/catalog/import-snapshots/folders/${pendingFolder.snapshotId}/files`, { method: "POST", body: form });
    if (!response.ok) throw new Error(await readApiError(response, `Failed to attach ${file.name}`));
    const manualFiles = new Map(pendingFolder.manualFiles).set(relativePath, file);
    const uploadedPaths = new Set(pendingFolder.uploadedPaths).add(relativePath.toLocaleLowerCase());
    const inventory = [
      ...[...pendingFolder.filesByPath.values()].map((source) => ({ relative_path: folderRelativePath(source), size_bytes: source.size })),
      ...[...manualFiles].map(([path, source]) => ({ relative_path: path, size_bytes: source.size })),
    ];
    const discovery = await fetchJson<LibraryFolderDiscovery>(
      `/api/catalog/import-snapshots/folders/${pendingFolder.snapshotId}/discover`,
      { method: "POST", body: JSON.stringify({ files: inventory, footprint_resolutions: pendingFolder.footprintResolutions }) }
    );
    setPendingFolder({ ...pendingFolder, manualFiles, uploadedPaths, discovery });
    toast.success(`${file.name} attached to ${component.symbol_name}`);
  };

  const importServerFolder = async () => {
    if (!serverRoot) return;
    setCreating(true);
    try {
      const session = await fetchJson<ProjectComponentImportSession>(
        "/api/catalog/import-snapshots/folders/server",
        {
          method: "POST",
          body: JSON.stringify({ root_name: serverRoot, subpath: serverSubpath }),
        }
      );
      await loadSessions();
      setSelectedSessionId(session.id);
      toast.success("Read-only folder snapshot queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import server folder");
    } finally {
      setCreating(false);
    }
  };

  const resolveProposal = async (proposal: ProjectComponentImportProposal, action: "accept" | "reject", remediation?: ProposalRemediation) => {
    setProposalActionId(proposal.id);
    try {
      await fetchJson(`/api/catalog/import-proposals/${proposal.id}/${action}`, {
        method: "POST",
        body: action === "accept" ? JSON.stringify(remediation) : undefined,
      });
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
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Loading imports…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Import Center</h2>
            <p className="mt-1 text-sm text-muted-foreground">Capture KiCad library folders or extract components from Prism projects. Every result remains staged for review.</p>
          </div>
          {/* One hint for the whole cluster: six identical tooltips on six
              adjacent buttons is noise, and the reason is the same for all. */}
          <PermissionHint
            blocked={!canWrite}
            action="import components into the catalog"
            allowedRoles={["component_designer", "admin"]}
            className="max-w-4xl"
          >
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              {...directoryInputProps}
              onChange={(event) => void uploadFolder(event.currentTarget.files)}
            />
            <Button variant="outline" onClick={() => folderInputRef.current?.click()} disabled={!canWrite || creating}>
              <FolderOpen className="mr-2 h-4 w-4" />Choose library folder
            </Button>
            {serverRoots.length > 0 && (
              <>
                <Select value={serverRoot} onValueChange={setServerRoot} disabled={!canWrite || creating}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Server root" /></SelectTrigger>
                  <SelectContent>{serverRoots.map((root) => <SelectItem key={root.name} value={root.name}>{root.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="w-48" value={serverSubpath} onChange={(event) => setServerSubpath(event.target.value)} placeholder="Optional subfolder" disabled={creating} />
                <Button variant="outline" onClick={() => void importServerFolder()} disabled={!canWrite || creating}>
                  <HardDrive className="mr-2 h-4 w-4" />Import server folder
                </Button>
              </>
            )}
            <Select value={projectId} onValueChange={setProjectId} disabled={!canWrite || creating}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select a project" /></SelectTrigger>
              <SelectContent>
                {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.display_name || project.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void createSession("project")} disabled={!canWrite || !projectId || creating}>Import project</Button>
            <Button onClick={() => void createSession("all-projects")} disabled={!canWrite || creating}>Import all projects</Button>
          </div>
          </PermissionHint>
        </div>
        {folderProgress && (
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            {folderProgress.label} {folderProgress.completed}/{folderProgress.total}
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${(folderProgress.completed / folderProgress.total) * 100}%` }} />
            </div>
          </div>
        )}
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1 transition-[grid-template-columns] duration-200",
          sessionsCollapsed ? "grid-cols-[3rem_minmax(0,1fr)]" : "grid-cols-[18rem_minmax(0,1fr)]"
        )}
      >
        <aside className="min-h-0 overflow-y-auto border-r p-2">
          {sessionsCollapsed ? (
            <div className="flex flex-col items-center gap-2">
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
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Import sessions</span>
            <div className="flex items-center">
              <Button variant="ghost" size="icon-sm" aria-label="Refresh imports" onClick={() => void loadSessions()}><RefreshCw className="h-3.5 w-3.5" /></Button>
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
          </div>
          {sessions.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No imports yet.</p>
          ) : sessions.map((session) => (
            <button
              type="button"
              key={session.id}
              onClick={() => setSelectedSessionId(session.id)}
              className={cn("mb-1 w-full border p-3 text-left transition-colors hover:bg-muted/40", selectedSessionId === session.id && "border-primary bg-primary/5")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{session.scope === "folder" ? session.selection.display_name || "Library folder" : session.scope === "all-projects" ? "All projects" : projects.find((project) => project.id === session.project_id)?.display_name || projects.find((project) => project.id === session.project_id)?.name || session.project_id}</span>
                {(session.status === "queued" || session.status === "scanning") && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{sessionStatusLabel[session.status]}</span><span>{session.proposal_count} candidates</span>
              </div>
            </button>
          ))}
            </>
          )}
        </aside>

        <section className="min-h-0 overflow-y-auto p-4">
          {!selectedSession ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground"><FolderSearch className="mb-3 h-8 w-8" /><p>Select or create an import session.</p></div>
          ) : selectedSession.status === "failed" ? (
            <div className="border border-destructive/40 bg-destructive/5 p-4"><h3 className="font-medium text-destructive">Import scan failed</h3><p className="mt-2 text-sm text-muted-foreground">{selectedSession.error_message}</p></div>
          ) : proposals.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{selectedSession.status === "staged" ? "No components were discovered." : selectedSession.scope === "folder" ? "Resolving symbols, footprints, and referenced 3D models…" : "Scanning captured project revisions…"}</div>
          ) : reviewMode === "grid" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Resolve missing metadata and footprints across every row, then import in bulk.
                </p>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setReviewMode("cards")}>
                  <Rows3 className="mr-1.5 h-3.5 w-3.5" />Detail view
                </Button>
              </div>
              <LibraryImportRemediationGrid
                sessionId={selectedSession.id}
                proposals={proposals}
                canWrite={canWrite}
                onRefresh={async () => {
                  await Promise.all([loadSessions(), loadProposals(selectedSession.id)]);
                }}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Per-component findings and provenance.</p>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setReviewMode("grid")}>
                  <Table2 className="mr-1.5 h-3.5 w-3.5" />Bulk edit grid
                </Button>
              </div>
              {proposals.map((proposal) => {
                const metadata = proposal.metadata as { value?: string; manufacturer?: string; manufacturer_part_number?: string; footprint?: string; references?: string[] };
                const blocking = proposal.findings.filter((finding) => finding.severity === "error").length;
                const warnings = proposal.findings.length - blocking;
                const findingGroups = groupedFindings(proposal.findings);
                return (
                  <article key={proposal.id} className="border bg-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-mono text-sm font-semibold">{(metadata.references || [proposal.reference]).join(", ")}</h3><Badge variant="outline">{proposal.status}</Badge>{blocking > 0 && <Badge variant="destructive">{blocking} blocking</Badge>}</div>
                        <p className="mt-2 text-sm">{metadata.value || "No value"} · {metadata.manufacturer_part_number || "No MPN"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{metadata.manufacturer || "No manufacturer"} · {metadata.footprint || "No footprint"} · {proposal.assets.length} staged assets · {proposal.provenance.length} usages</p>
                        {proposal.findings.length > 0 && (
                          <details className="group mt-3 border-t pt-2">
                            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
                              <span>Review findings</span>
                              {blocking > 0 ? <Badge variant="destructive">{blocking} blocker{blocking === 1 ? "" : "s"}</Badge> : null}
                              {warnings > 0 ? <Badge variant="warning">{warnings} warning{warnings === 1 ? "" : "s"}</Badge> : null}
                            </summary>
                            <div className="mt-2 space-y-1.5 border-l pl-3">
                              {findingGroups.map((finding) => (
                                <p key={`${finding.severity}:${finding.message}`} className="flex items-start gap-2 text-xs text-muted-foreground">
                                  <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", finding.severity === "error" ? "text-destructive" : "text-warning")} />
                                  <span>{finding.message}{finding.count > 1 ? <span className="ml-1 font-medium text-foreground">×{finding.count}</span> : null}</span>
                                </p>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                      {proposal.status === "candidate" && <div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" onClick={() => void resolveProposal(proposal, "reject")} disabled={!canWrite || proposalActionId === proposal.id}><X className="mr-1.5 h-3.5 w-3.5" />Reject</Button><Button size="sm" onClick={() => setRemediationProposal(proposal)} disabled={!canWrite || proposalActionId === proposal.id}>{proposalActionId === proposal.id ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}Review & accept</Button></div>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <LibraryImportRemediationDialog
        proposal={remediationProposal}
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
    </div>
  );
}
