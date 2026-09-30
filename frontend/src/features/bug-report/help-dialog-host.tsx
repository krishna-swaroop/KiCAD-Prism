import { useEffect, useState } from "react";
import { Bug, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FRONTEND_BUILD } from "@/lib/build-info";
import { subscribeToHelpDialogs, type HelpDialog } from "@/lib/help-dialogs";
import type { AuthConfig } from "@/types/auth";

import { bugReportUrl, formatDiagnostics, loadDiagnosticSources, type DiagnosticSources } from "./diagnostics";

/** Mounted once in `App.tsx`; opens whichever dialog `openHelpDialog` asks for. */
export function HelpDialogHost({ authConfig }: { authConfig: AuthConfig }) {
  const [dialog, setDialog] = useState<HelpDialog | null>(null);

  useEffect(() => subscribeToHelpDialogs(setDialog), []);

  if (!dialog) return null;
  return (
    <HelpDialogContent
      dialog={dialog}
      authConfig={authConfig}
      onDialogChange={setDialog}
      onClose={() => setDialog(null)}
    />
  );
}

interface HelpDialogContentProps {
  dialog: HelpDialog;
  authConfig: AuthConfig;
  onDialogChange: (dialog: HelpDialog) => void;
  onClose: () => void;
}

function HelpDialogContent({ dialog, authConfig, onDialogChange, onClose }: HelpDialogContentProps) {
  const [sources, setSources] = useState<DiagnosticSources | null>(null);
  const [copied, setCopied] = useState(false);

  // No query abstraction owns these two reads, so the effect starts and
  // cancels them; the dialog unmounts on close, so each opening reads afresh.
  useEffect(() => {
    const controller = new AbortController();
    void loadDiagnosticSources(controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setSources(loaded);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const diagnostics = sources
    ? formatDiagnostics({
        frontend: FRONTEND_BUILD,
        backend: sources.backend,
        viewer: sources.viewer,
        authConfig,
        client: sources.client,
        language: navigator.language,
        pathname: window.location.pathname,
        search: window.location.search,
      })
    : null;
  const version = sources?.backend?.release ?? FRONTEND_BUILD.release;
  const issue = diagnostics ? bugReportUrl(version, diagnostics) : null;
  const isReport = dialog === "report-bug";

  const copy = async () => {
    if (!diagnostics) return;
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopied(true);
    } catch {
      toast.error("Copy failed; select the text and copy it.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isReport ? "Report a bug" : "About KiCAD Prism"}</DialogTitle>
          <DialogDescription>
            {isReport
              ? "This opens a new GitHub issue with the details below filled in. Nothing is sent from Prism: you describe the bug and submit the issue yourself on GitHub. Check the details first and remove anything you would rather not share."
              : "Version and environment details for this Prism instance. Paste them into a bug report or a support request."}
          </DialogDescription>
        </DialogHeader>

        {diagnostics ? (
          <pre
            aria-label="Version information"
            className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-3 font-mono text-xs"
          >
            {diagnostics}
          </pre>
        ) : (
          <div className="flex items-center gap-2 rounded-md border bg-muted p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Collecting version details…
          </div>
        )}

        {isReport && issue && !issue.includesDiagnostics ? (
          <p className="text-sm text-muted-foreground">
            These details are too long for a link. Copy them and paste them into the Diagnostics field on GitHub.
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => void copy()} disabled={!diagnostics}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy version info"}
          </Button>
          {isReport ? (
            <Button asChild>
              <a
                href={issue?.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!issue}
                onClick={(event) => {
                  if (!issue) {
                    event.preventDefault();
                    return;
                  }
                  onClose();
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Open on GitHub
              </a>
            </Button>
          ) : (
            <Button onClick={() => onDialogChange("report-bug")}>
              <Bug className="h-4 w-4" />
              Report a bug
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
