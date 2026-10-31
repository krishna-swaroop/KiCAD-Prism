import { useCallback, useEffect, useState } from "react";
import { FileSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { readProjectBom } from "./tracking-api";
import { isRunning, useLoaded } from "./use-loaded";

const POLL_MS = 5000;
// About five minutes; an index that takes longer is still building, and Read now starts the wait again.
const WAIT_MS = 5 * 60 * 1000;

/**
 * A project whose BOM Prism has not read: one button reads it, or queues its index and looks again until the parts land.
 * The wait shows its time so far.
 */
export function ProjectReadNow({ projectId, onRead }: { projectId: string; onRead: () => void }) {
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fetcher = useCallback(() => readProjectBom(projectId), [projectId]);
  // Each Read now is its own read, so an earlier answer is never taken for this one.
  useLoaded(started === null ? null : `projects/${projectId}/read/${started}`, fetcher, "Could not read the project's BOM", {
    refreshEvery: POLL_MS,
    refreshWhile: isRunning,
    onData: (progress) => {
      if (progress.state === "running") return;
      setStarted(null);
      onRead();
    },
    onError: (error) => {
      setStarted(null);
      toast.error(error.message || "Could not read the project's BOM");
    },
  });

  useEffect(() => {
    if (started === null) return undefined;
    const tick = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at - started >= WAIT_MS) setStarted(null);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [started]);

  const seconds = started === null ? 0 : Math.max(0, Math.round((now - started) / 1000));
  return (
    <div className="flex items-center gap-3 border border-dashed p-6 text-sm text-muted-foreground">
      <span>Not read</span>
      {started === null ? (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { const at = Date.now(); setNow(at); setStarted(at); }}>
          <FileSearch className="h-4 w-4" />Read now
        </Button>
      ) : (
        <span role="status" className="flex items-center gap-1.5">
          <Loader2 className="h-4 w-4 animate-spin" />Reading · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}
