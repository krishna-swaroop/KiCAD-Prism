import { useCallback, useState } from "react";
import { ScanSearch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CheckProgress } from "@/types/supply";
import { getCheck, startCheck } from "./tracking-api";
import { isRunning, useLoaded } from "./use-loaded";

const EVERY_MS = 5000;

/**
 * Read the parts on a BOM that have no reading, once, without tracking them. The calls come from the pool the budget
 * keeps for this and, when it is empty, from spare budget, so a large BOM can take an evening. A dialog asks, then shows
 * the progress; closing it leaves the check running and a line shows beside the button.
 */
export function CheckOnceButton({
  projectId, lines, onFinished,
}: { projectId: string; lines: ReadonlyArray<{ manufacturer: string; mpn: string }>; onFinished: () => void }) {
  const [requestId, setRequestId] = useState("");
  const [started, setStarted] = useState<CheckProgress | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const fetcher = useCallback((signal: AbortSignal) => getCheck(requestId, signal), [requestId]);
  const read = useLoaded(requestId ? `checks/${requestId}` : null, fetcher, "Could not read the check", {
    refreshEvery: EVERY_MS, refreshWhile: isRunning, onData: (next) => { if (next.state === "done") onFinished(); },
  });
  const progress = read.data ?? started;
  const finished = progress?.state === "done";

  const start = () => {
    setBusy(true);
    startCheck("bom", projectId, lines)
      .then((made) => {
        if (made.parts === 0) { setOpen(false); toast.success("Nothing to check", { description: "Every part is already tracked." }); return; }
        setRequestId(made.id);
        setStarted(made.progress);
        setSkipped(made.skipped.length);
      })
      .catch((caught: Error) => toast.error(caught.message))
      .finally(() => setBusy(false));
  };

  const running = progress !== null && !finished;
  const share = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
  if (lines.length === 0 && !running) return null;
  return (
    <>
      {running && !open ? (
        <span role="status" className="text-xs text-muted-foreground">
          <button type="button" className="hover:text-foreground" onClick={() => setOpen(true)}>
            Checking: {progress.done} of {progress.total} parts read
          </button>
        </span>
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
          <ScanSearch className="h-3.5 w-3.5" />Check once ({lines.length})
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{running ? "Checking Parts" : finished ? "Check Finished" : "Check Once"}</DialogTitle>
            <DialogDescription>{running || finished ? "Read once at every distributor, not tracked." : "Read the parts nobody reads yet, once, without tracking them."}</DialogDescription>
          </DialogHeader>
          {progress ? (
            <div className="space-y-3">
              <div className="h-2 w-full overflow-hidden bg-secondary" role="progressbar" aria-label="Parts read" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share}>
                <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${share}%` }} />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-secondary px-2 py-0.5 tabular-nums">{progress.done} of {progress.total} parts read</span>
                {progress.failed > 0 ? <span className="bg-warning/15 px-2 py-0.5 text-warning">{progress.failed} failed</span> : null}
                {skipped > 0 ? <span className="bg-secondary px-2 py-0.5">{skipped} to settle first</span> : null}
              </div>
              <p className="text-xs text-muted-foreground">{running ? "Reading continues if you close this." : "Done."}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="bg-secondary px-2 py-0.5 tabular-nums">{lines.length} {lines.length === 1 ? "part" : "parts"}</span>
              <span className="bg-secondary px-2 py-0.5">from the one-off pool of each distributor</span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>{progress ? "Close" : "Cancel"}</Button>
            {progress ? null : <Button disabled={busy} onClick={start}>Check ({lines.length})</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
