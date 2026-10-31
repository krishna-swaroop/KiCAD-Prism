import { useCallback, useState } from "react";
import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MakerChoices } from "./maker-choices";
import { TrackLinesStep } from "./track-lines-step";
import { chooseTrackLine, getProjectOpen } from "./tracking-api";
import { useLoaded } from "./use-loaded";

/** A project's open questions as a badge; it opens the same answers as Review, for this project only. Nothing shows when none. */
export function SettleBadge({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const fetcher = useCallback((signal: AbortSignal) => getProjectOpen(projectId, signal), [projectId]);
  const loaded = useLoaded(`projects/${projectId}/open`, fetcher, "Could not read what is open");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const data = loaded.data;
  const count = (data?.choices.length ?? 0) + (data?.lines.length ?? 0);
  if (!data || count === 0) return null;
  const done = async () => { await loaded.refresh(); onChanged?.(); };
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-7 border-warning text-warning" onClick={() => setOpen(true)}>
        <HelpCircle className="h-3.5 w-3.5" />{count} to settle
      </Button>
      {open ? (
        <Dialog open onOpenChange={(next) => { if (!next) setOpen(false); }}>
          <DialogContent className="w-[min(95vw,48rem)] sm:max-w-none">
            <DialogHeader>
              <DialogTitle>Settle</DialogTitle>
              <DialogDescription>{count} {count === 1 ? "question" : "questions"} for this project.</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-3 themed-scrollbar overflow-y-auto">
              {data.lines.length > 0 ? (
                <TrackLinesStep
                  lines={data.lines} busy={busy}
                  onChoose={(line, partId) => {
                    setBusy(true);
                    chooseTrackLine(projectId, partId, line.manufacturer).then(done).finally(() => setBusy(false));
                  }}
                />
              ) : null}
              <MakerChoices choices={data.choices} onDecided={done} />
            </div>
            <div className="flex justify-end"><Button variant="outline" onClick={() => setOpen(false)}>Close</Button></div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
