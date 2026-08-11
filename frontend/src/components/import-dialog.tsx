"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { isDialogSubmitShortcut } from "@/lib/dialog-shortcuts";

interface DiscoveredProject {
  name: string;
  relative_path: string;
  has_schematic: boolean;
  has_pcb: boolean;
  has_project_file?: boolean;
}

interface AnalysisResult {
  repo_name: string;
  repo_url: string;
  import_type: "type1" | "type2";
  projects: DiscoveredProject[];
  /** Present only when nothing was found, explaining what was looked for. */
  empty_reason?: string;
  branches?: string[];
  default_branch?: string | null;
  ref?: string | null;
  already_imported?: boolean;
  /** Relative paths already registered, so they can be shown as done. */
  imported_paths?: string[];
}

export function importReviewTitle(
  analysis: Pick<AnalysisResult, "import_type" | "projects">,
): string {
  if (analysis.projects.length === 0) return "No Projects Detected";
  return analysis.import_type === "type1"
    ? "Single Project Detected"
    : "Multiple Projects Detected";
}

interface JobStatus {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  message: string;
  percent: number;
  /** Coarse phase, e.g. "clone-repository". Set by the job handler. */
  stage?: string;
  /** True when the failure is one the user can fix by granting Prism access. */
  access_failure?: boolean;
  project_ids?: string[];
  error?: string;
}

/** Human wording for the stages the analyse and import jobs report. */
const STAGE_LABELS: Record<string, string> = {
  "list-branches": "Listing branches",
  "clone-metadata": "Reading repository",
  "discover-projects": "Looking for KiCad projects",
  "validate-import": "Checking the repository",
  "clone-repository": "Cloning repository",
  "register-projects": "Registering projects",
  "queue-thumbnails": "Queueing board renders",
};

function describeJob(status: JobStatus | undefined, fallback: string): string {
  if (!status) return fallback;
  if (status.message) return status.message;
  if (status.stage && STAGE_LABELS[status.stage]) return STAGE_LABELS[status.stage];
  if (status.status === "queued") return "Waiting for a free worker…";
  return fallback;
}

interface AccessHelp {
  forge: string;
  deploy_key_url: string | null;
  account_key_url: string | null;
  instructions: string;
  public_key: string | null;
  fingerprint: string | null;
  key_exists: boolean;
  host: string;
  host_trusted: boolean;
}

interface CommentsSourceUrls {
  project_id: string;
  project_name: string;
  base_url: string;
  list_url: string;
  patch_url_template: string;
  reply_url_template: string;
  delete_url_template: string;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

type ImportState =
  | { step: "input" }
  | { step: "input" }
  | { step: "analyzing"; url: string; jobId?: string; status?: JobStatus }
  | { step: "review"; url: string; analysis: AnalysisResult }
  | { step: "importing"; url: string; jobId: string; status: JobStatus }
  | {
      step: "complete";
      success: boolean;
      message: string;
      commentsSourceUrls?: CommentsSourceUrls[];
      /** Set when the failure is one the user can fix by granting access. */
      accessHelp?: AccessHelp;
      /** Present on a fixable failure so the user can retry without retyping. */
      retryUrl?: string;
    };

export function ImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: ImportDialogProps) {
  const [state, setState] = useState<ImportState>({ step: "input" });
  const [url, setUrl] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  // Empty means "whatever the remote's HEAD points at".
  const [ref, setRef] = useState("");
  const pollTimeoutRef = useRef<number | null>(null);
  const pollControllerRef = useRef<AbortController | null>(null);
  const pollingTokenRef = useRef(0);

  const clearPollingHandles = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (pollControllerRef.current) {
      pollControllerRef.current.abort();
      pollControllerRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    pollingTokenRef.current += 1;
    clearPollingHandles();
  }, [clearPollingHandles]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    if (!open) {
      stopPolling();
    }
  }, [open, stopPolling]);

  const reset = () => {
    stopPolling();
    setState({ step: "input" });
    setUrl("");
    setSelectedPaths(new Set());
    setRef("");
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const analyzeRepo = async (branchOverride?: string, urlOverride?: string) => {
    // Retry passes the URL explicitly: a setUrl() in the same tick has not been
    // applied yet, so reading state here would analyse the previous value.
    const target = (urlOverride ?? url).trim();
    if (!target) return;

    const branch = branchOverride ?? ref;
    stopPolling();
    setState({ step: "analyzing", url: target });

    try {
      const res = await fetch("/api/projects/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target, ref: branch.trim() || null }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || "Analysis failed");
      }

      const { job_id } = await res.json();

      // Start polling analysis job
      pollAnalysisJob(job_id, target);

    } catch (error: any) {
      setState({
        step: "complete",
        success: false,
        message: error.message || "Failed to start analysis",
      });
    }
  };

  const pollAnalysisJob = async (jobId: string, repoUrl: string) => {
    stopPolling();
    const pollingToken = pollingTokenRef.current;

    const poll = async () => {
      const controller = new AbortController();
      try {
        pollControllerRef.current = controller;
        const res = await fetch(`/api/projects/jobs/${jobId}`, { signal: controller.signal });
        if (pollingTokenRef.current !== pollingToken) return;
        if (!res.ok) throw new Error("Failed to get job status");

        const status: JobStatus = await res.json();
        if (pollingTokenRef.current !== pollingToken) return;

        // Update state with ongoing job status
        setState({ step: "analyzing", url: repoUrl, jobId, status });

        if (status.status === "completed") {
          // Job completed, result should be in status (we need to ensure backend sends it)
          // The backend project_import_service puts 'result' in job dict
          // We need to extend JobStatus interface or cast it
          const result = (status as any).result as AnalysisResult;

          if (!result) {
            throw new Error("Analysis completed but no result returned");
          }

          // Auto-select type1
          if (result.import_type === "type1" && result.projects.length === 1) {
            setSelectedPaths(new Set([result.projects[0].relative_path]));
          } else {
            // Adding to an existing repository: preselect nothing, so the user
            // picks only what they actually want on top of what is there.
            setSelectedPaths(new Set());
          }
          if (result.ref) {
            setRef(result.ref);
          }

          setState({ step: "review", url: repoUrl, analysis: result });

        } else if (status.status === "failed" || status.status === "cancelled") {
          const accessHelp =
            status.status === "failed" && status.access_failure
              ? await loadAccessHelp(repoUrl)
              : undefined;
          if (pollingTokenRef.current !== pollingToken) return;
          setState({
            step: "complete",
            success: false,
            message:
              status.status === "cancelled"
                ? "Analysis cancelled."
                : status.error || "Analysis failed",
            accessHelp,
            retryUrl: status.status === "failed" ? repoUrl : undefined,
          });
        } else {
          // Continue polling
          pollTimeoutRef.current = window.setTimeout(() => {
            void poll();
          }, 1000);
        }
      } catch (error: any) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (pollingTokenRef.current !== pollingToken) return;
        setState({
          step: "complete",
          success: false,
          message: error.message || "Failed to check analysis status",
        });
      } finally {
        if (pollControllerRef.current === controller) {
          pollControllerRef.current = null;
        }
      }
    };

    void poll();
  };

  const startImport = async () => {
    if (state.step !== "review") return;

    const { url, analysis } = state;
    const pathsToImport =
      analysis.import_type === "type1"
        ? undefined
        : Array.from(selectedPaths);

    try {
      stopPolling();
      const res = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          import_type: analysis.import_type,
          selected_paths: pathsToImport,
          ref: analysis.ref ?? null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || "Import failed");
      }

      const { job_id } = await res.json();

      // Start polling
      pollJobStatus(job_id, url);
    } catch (error: any) {
      setState({
        step: "complete",
        success: false,
        message: error.message || "Failed to start import",
      });
    }
  };

  const pollJobStatus = async (jobId: string, repoUrl: string) => {
    stopPolling();
    const pollingToken = pollingTokenRef.current;

    const fetchCommentsSourceUrls = async (projectIds: string[]): Promise<CommentsSourceUrls[]> => {
      const entries = await Promise.all(
        projectIds.map(async (id) => {
          const response = await fetch(`/api/projects/${id}/comments/source-urls`);

          if (!response.ok) {
            throw new Error(`Failed to fetch KiCad URL helper for project ${id}`);
          }

          return response.json();
        })
      );

      return entries;
    };

    const poll = async () => {
      const controller = new AbortController();
      try {
        pollControllerRef.current = controller;
        const res = await fetch(`/api/projects/jobs/${jobId}`, { signal: controller.signal });
        if (pollingTokenRef.current !== pollingToken) return;
        if (!res.ok) throw new Error("Failed to get job status");

        const status: JobStatus = await res.json();
        if (pollingTokenRef.current !== pollingToken) return;

        setState({ step: "importing", url: repoUrl, jobId, status });

        if (status.status === "completed") {
          let commentsSourceUrls: CommentsSourceUrls[] | undefined = undefined;

          if (status.project_ids && status.project_ids.length > 0) {
            try {
              commentsSourceUrls = await fetchCommentsSourceUrls(status.project_ids);
            } catch (error) {
              console.warn("Unable to load comments source URLs", error);
            }
          }

          if (pollingTokenRef.current !== pollingToken) return;

          setState({
            step: "complete",
            success: true,
            message: `Successfully imported ${status.project_ids?.length || 1} project(s)`,
            commentsSourceUrls,
          });
          onImportComplete();
        } else if (status.status === "failed" || status.status === "cancelled") {
          const accessHelp =
            status.status === "failed" && status.access_failure
              ? await loadAccessHelp(repoUrl)
              : undefined;
          if (pollingTokenRef.current !== pollingToken) return;
          setState({
            step: "complete",
            success: false,
            message:
              status.status === "cancelled"
                ? "Import cancelled."
                : status.error || "Import failed",
            commentsSourceUrls: undefined,
            accessHelp,
            retryUrl: status.status === "failed" ? repoUrl : undefined,
          });
        } else {
          // Continue polling
          pollTimeoutRef.current = window.setTimeout(() => {
            void poll();
          }, 1000);
        }
      } catch (error: any) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (pollingTokenRef.current !== pollingToken) return;
        setState({
          step: "complete",
          success: false,
          message: error.message || "Failed to check import status",
          commentsSourceUrls: undefined,
        });
      } finally {
        if (pollControllerRef.current === controller) {
          pollControllerRef.current = null;
        }
      }
    };

    void poll();
  };

  const loadAccessHelp = async (repoUrl: string): Promise<AccessHelp | undefined> => {
    try {
      const res = await fetch("/api/projects/access-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: repoUrl }),
      });
      if (!res.ok) return undefined;
      return (await res.json()) as AccessHelp;
    } catch {
      // The failure message still stands on its own; the guided fix is a bonus.
      return undefined;
    }
  };

  const retryAnalysis = (repoUrl: string) => {
    setUrl(repoUrl);
    void analyzeRepo("", repoUrl);
  };

  const cancelRunningJob = async () => {
    const jobId =
      state.step === "analyzing" || state.step === "importing"
        ? state.jobId
        : undefined;
    stopPolling();
    if (jobId) {
      // Best effort: the job may already have finished, and the dialog should
      // close either way.
      try {
        await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      } catch {
        // Ignore; the user asked to stop watching, not to guarantee a rollback.
      }
    }
    handleClose();
  };

  const toggleProjectSelection = (relativePath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }
      return next;
    });
  };

  const importablePaths =
    state.step === "review"
      ? state.analysis.projects
          .map((p) => p.relative_path)
          .filter((path) => !(state.analysis.imported_paths ?? []).includes(path))
      : [];
  const importableCount = importablePaths.length;

  const selectAll = () => {
    // Already-imported projects are not selectable, so "all" means the rest.
    setSelectedPaths(new Set(importablePaths));
  };

  const deselectAll = () => {
    setSelectedPaths(new Set());
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isDialogSubmitShortcut(event)) {
      return;
    }

    if (state.step === "input" && url.trim()) {
      event.preventDefault();
      void analyzeRepo();
      return;
    }

    if (state.step === "review") {
      const canImport = state.analysis.import_type === "type1" || selectedPaths.size > 0;
      if (!canImport) {
        return;
      }

      event.preventDefault();
      void startImport();
      return;
    }

    if (state.step === "complete") {
      event.preventDefault();
      handleClose();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-lg" onKeyDown={handleDialogKeyDown}>
        {state.step === "input" && (
          <>
            <DialogHeader>
              <DialogTitle>Import Project</DialogTitle>
              <DialogDescription>
                Enter the URL of a Git repository containing KiCad projects. GitHub, GitLab and self-hosted remotes are all supported.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="url" className="text-right">
                  Repository
                </Label>
                <Input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/org/repo.git or git@host:org/repo.git"
                  className="col-span-3"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && url.trim()) {
                      e.preventDefault();
                      void analyzeRepo();
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => void analyzeRepo()} disabled={!url.trim()}>
                Analyze
              </Button>
            </div>
          </>
        )}

        {state.step === "analyzing" && (
          <>
            <DialogHeader>
              <DialogTitle>Analyzing Repository</DialogTitle>
              <DialogDescription>
                {describeJob(state.status, "Starting analysis…")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {state.status ? (
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${state.status.percent || 0}%` }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Prism reads the repository without downloading its file contents,
                so this is quick even for a large history.
              </p>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => void cancelRunningJob()}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {state.step === "review" && (
          <>
            <DialogHeader>
              <DialogTitle>
                {importReviewTitle(state.analysis)}
              </DialogTitle>
              <DialogDescription>
                {state.analysis.projects.length === 0
                  ? state.analysis.empty_reason ??
                    `No KiCad projects were found in ${state.analysis.repo_name}.`
                  : state.analysis.import_type === "type1"
                    ? `Found 1 KiCad project at the root of ${state.analysis.repo_name}.`
                    : `Found ${state.analysis.projects.length} KiCad projects in ${state.analysis.repo_name}. Select which to import.`}
              </DialogDescription>
            </DialogHeader>

            {/* Shown even for a single branch, so the user can always see which
                one the listed projects came from. */}
            {(state.analysis.branches?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 py-2">
                <Label htmlFor="import-branch" className="text-sm shrink-0">
                  Branch
                </Label>
                <select
                  id="import-branch"
                  className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
                  value={state.analysis.ref ?? ""}
                  onChange={(event) => {
                    setRef(event.target.value);
                    // Re-analyse: a different branch can hold different boards.
                    void analyzeRepo(event.target.value);
                  }}
                >
                  {state.analysis.branches?.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                      {branch === state.analysis.default_branch ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {state.analysis.already_imported && (
              <p className="text-sm text-muted-foreground">
                This repository is already imported. Projects that are already in
                the workspace are marked below; select any others to add them.
              </p>
            )}

            {state.analysis.import_type === "type2" && (
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">
                  {selectedPaths.size} of {importableCount} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAll}>
                    Deselect All
                  </Button>
                </div>
              </div>
            )}

            <div className="max-h-64 overflow-y-auto border rounded-md">
              {state.analysis.projects.map((project) => {
                const alreadyImported =
                  state.analysis.imported_paths?.includes(project.relative_path) ??
                  false;
                return (
                <div
                  key={project.relative_path}
                  className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50"
                >
                  {state.analysis.import_type === "type2" && (
                    <Checkbox
                      checked={
                        alreadyImported || selectedPaths.has(project.relative_path)
                      }
                      disabled={alreadyImported}
                      aria-label={
                        alreadyImported
                          ? `${project.name} is already imported`
                          : `Select ${project.name}`
                      }
                      onCheckedChange={() =>
                        toggleProjectSelection(project.relative_path)
                      }
                    />
                  )}
                  {state.analysis.import_type === "type1" && (
                    <Check className="h-4 w-4 text-success" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{project.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {project.relative_path === "."
                        ? "Root directory"
                        : project.relative_path}
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    {project.has_schematic && (
                      <span className="px-2 py-1 bg-secondary rounded">
                        SCH
                      </span>
                    )}
                    {project.has_pcb && (
                      <span className="px-2 py-1 bg-secondary rounded">
                        PCB
                      </span>
                    )}
                    {project.has_project_file === false && (
                      // Common when .kicad_pro is gitignored. Worth surfacing:
                      // KiCad regenerates it, but the project name comes from
                      // the board file until it does.
                      <span
                        className="px-2 py-1 bg-secondary rounded"
                        title="No .kicad_pro committed. KiCad will recreate it on first open."
                      >
                        No .kicad_pro
                      </span>
                    )}
                    {alreadyImported && (
                      <span className="px-2 py-1 bg-secondary rounded">
                        Imported
                      </span>
                    )}
                  </div>
                </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={startImport}
                disabled={
                  state.analysis.projects.length === 0 ||
                  importableCount === 0 ||
                  (state.analysis.import_type === "type2" &&
                    selectedPaths.size === 0)
                }
              >
                Import
                {state.analysis.import_type === "type2" &&
                  selectedPaths.size > 0 && ` (${selectedPaths.size})`}
              </Button>
            </div>
          </>
        )}

        {state.step === "importing" && (
          <>
            <DialogHeader>
              <DialogTitle>Importing Projects</DialogTitle>
              <DialogDescription>
                {describeJob(state.status, "Starting import…")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${state.status.percent}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Board renders are queued separately, so projects appear in the
                workspace before their thumbnails finish.
              </p>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => void cancelRunningJob()}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {state.step === "complete" && (
          <>
            <DialogHeader>
              <DialogTitle>
                {state.success ? "Import Complete" : "Import Failed"}
              </DialogTitle>
              <DialogDescription className="whitespace-pre-line">
                {state.message}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-6">
              {state.success ? (
                <div className="h-16 w-16 rounded-full bg-success/15 flex items-center justify-center">
                  <Check className="h-8 w-8 text-success" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-destructive/15 flex items-center justify-center">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
              )}
            </div>

            {state.success && state.commentsSourceUrls && state.commentsSourceUrls.length > 0 && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <p className="text-sm font-medium">KiCad REST URL Helpers</p>
                <p className="text-xs text-muted-foreground">
                  Enter these values in KiCad Comments Source Settings for REST mode.
                </p>
                <div className="max-h-44 overflow-y-auto space-y-3">
                  {state.commentsSourceUrls.map((entry) => (
                    <div key={entry.project_id} className="rounded-md border bg-background p-3 space-y-2">
                      <p className="text-xs font-medium">
                        {entry.project_name} ({entry.project_id})
                      </p>
                      <div className="space-y-1 text-xs font-mono text-muted-foreground break-all">
                        <p>List: {entry.list_url}</p>
                        <p>Patch: {entry.patch_url_template}</p>
                        <p>Reply: {entry.reply_url_template}</p>
                        <p>Delete: {entry.delete_url_template}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {state.accessHelp && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <p className="text-sm font-medium">Grant Prism access</p>
                <p className="whitespace-pre-line text-xs text-muted-foreground">
                  {state.accessHelp.instructions}
                </p>

                {state.accessHelp.key_exists && state.accessHelp.public_key ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        Prism&apos;s public key
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            state.accessHelp?.public_key ?? "",
                          );
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <pre className="max-h-20 overflow-auto rounded bg-background p-2 text-[11px] font-mono break-all whitespace-pre-wrap">
                      {state.accessHelp.public_key}
                    </pre>
                    {state.accessHelp.fingerprint && (
                      <p className="text-[11px] text-muted-foreground">
                        Fingerprint {state.accessHelp.fingerprint}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-destructive">
                    This workspace has no SSH key yet. An administrator can create
                    one in Settings, under Git &amp; SSH.
                  </p>
                )}

                {!state.accessHelp.host_trusted && (
                  <p className="text-xs text-destructive">
                    {state.accessHelp.host} is not a trusted host yet. An
                    administrator needs to add its host key in Settings before
                    Prism can connect over SSH.
                  </p>
                )}

                {state.accessHelp.deploy_key_url && (
                  <a
                    className="inline-block text-xs underline"
                    href={state.accessHelp.deploy_key_url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open deploy key settings on {state.accessHelp.forge}
                  </a>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              {state.retryUrl && (
                <Button
                  variant="outline"
                  onClick={() => retryAnalysis(state.retryUrl as string)}
                >
                  Try again
                </Button>
              )}
              <Button onClick={handleClose}>Close</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
