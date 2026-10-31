import { useCallback, useMemo, useState } from "react";
import { Loader2, Radar, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProjectTrackingPreview } from "@/types/supply";
import { TrackChooseStep } from "./track-choose-step";
import { TrackLinesStep, type TrackLine } from "./track-lines-step";
import { RaiseBudgetDialog } from "./raise-budget-dialog";
import { TrackProgressStep } from "./track-progress-step";
import { chooseTrackLine, getProjectTracking, trackProject, untrackProject } from "./tracking-api";
import { invalidateSupply, useLoaded } from "./use-loaded";
import { useTrackProject } from "./use-track-project";

type Step = "choose" | "lines" | "tracking";

const TITLE: Record<Step, string> = { choose: "Track Project", lines: "Settle Lines", tracking: "Checking Distributors" };

/** The lines the preview could not place: several makers share their number. */
function waitingLines(preview: ProjectTrackingPreview | null): TrackLine[] {
  return (preview?.tracked?.skipped ?? []).flatMap((item) =>
    item.reason === "needs_choice" ? [{ mpn: item.mpn, manufacturer: item.manufacturer ?? "", candidates: item.candidates ?? [] }] : []);
}

/** How many parts tracking would take on, from the preview. */
function partsOf(preview: ProjectTrackingPreview | null): number {
  return Math.max(0, ...(preview?.connectors ?? []).map((item) => (item.admitted_new ?? 0) + (item.waiting_new ?? 0)));
}

/**
 * Every decision tracking a project needs, in one dialog: the designs, the distributors, what it buys for, the lines that
 * need a word, then the work starts and its progress shows here. Closing leaves the searching running.
 */
function TrackProjectDialog({ projectId, onClose, onChanged }: { projectId: string; onClose: () => void; onChanged: () => void }) {
  const track = useTrackProject(projectId);
  const { state, preview } = track;
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProjectTrackingPreview | null>(null);
  const [raising, setRaising] = useState<string | null>(null);
  const raised = track.connectors.find((item) => item.id === raising);
  const lines = useMemo(() => waitingLines(preview), [preview]);
  const parts = partsOf(preview);

  const start = () => {
    setBusy(true);
    trackProject(projectId, track.choice)
      .then((done) => { setResult(done); setStep("tracking"); onChanged(); })
      .catch((caught: Error) => track.setError(caught.message))
      .finally(() => setBusy(false));
  };
  const next = () => (lines.length > 0 && step === "choose" ? setStep("lines") : start());
  const choose = (line: TrackLine, partId: string) => {
    setBusy(true);
    chooseTrackLine(projectId, partId, line.manufacturer)
      .then(() => track.recheck())
      .catch((caught: Error) => track.setError(caught.message))
      .finally(() => setBusy(false));
  };
  const stop = () => {
    setBusy(true);
    untrackProject(projectId)
      .then(() => { toast.success("No longer tracking this project"); onChanged(); onClose(); })
      .catch((caught: Error) => track.setError(caught.message))
      .finally(() => setBusy(false));
  };
  const finished = useCallback(() => onChanged(), [onChanged]);

  const reading = track.needsRead;
  const title = reading ? "Reading BOM" : TITLE[step];
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{state?.tracked && step === "choose" ? "Tracking Project" : title}</DialogTitle>
          <DialogDescription>
            {reading ? "Prism is reading the project's BOM." : step === "choose" ? "Parts are read daily within each call budget." : step === "lines" ? "Pick the part each line means." : "First searches of the project's parts."}
          </DialogDescription>
        </DialogHeader>
        {track.error ? <Alert variant="destructive"><AlertDescription>{track.error}</AlertDescription></Alert> : null}

        {reading ? (
          <div className="space-y-3 py-2">
            <div className="h-2 w-full overflow-hidden bg-secondary" role="progressbar" aria-label="Reading the BOM">
              <div className="h-full w-1/3 animate-pulse bg-primary" />
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />This can take a minute.</p>
          </div>
        ) : null}

        {!reading && state?.has_usage && step === "choose" ? (
          <TrackChooseStep
            designs={["", ...state.variants]}
            followed={new Set(track.variants)}
            allDesigns={track.allVariants}
            onDesign={track.toggleVariant}
            onAllDesigns={track.setAllVariants}
            regular={track.regular}
            assembly={track.assembly}
            bought={new Set(track.ids)}
            onConnector={track.toggleConnector}
            packaging={track.packaging}
            onPackaging={track.setPackaging}
            buildQuantity={track.buildQuantity}
            onBuildQuantity={track.setBuildQuantity}
            spares={track.spares}
            onSpares={track.setSpares}
            preview={preview}
            onRaise={(id) => setRaising(id)}
          />
        ) : null}
        {step === "lines" ? <TrackLinesStep lines={lines} busy={busy} onChoose={choose} /> : null}
        {step === "tracking" ? <TrackProgressStep projectId={projectId} result={result} onFinished={finished} /> : null}

        <div className="flex justify-end gap-2">
          {state?.tracked && step === "choose" ? <Button variant="destructive" disabled={busy} onClick={stop}>Stop tracking</Button> : null}
          {step === "tracking" ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              {step === "lines" ? <Button variant="outline" disabled={busy} onClick={start}>Skip these</Button> : null}
              <Button
                disabled={busy || reading || !state?.has_usage || (track.variants.length === 0 && !track.allVariants) || preview?.fits_nowhere === true}
                onClick={step === "lines" ? start : next}
              >
                {step === "choose" && lines.length > 0 ? "Next" : parts > 0 ? `${state?.tracked ? "Save" : "Track"} (${parts.toLocaleString()})` : state?.tracked ? "Save" : "Track"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
      {raised ? (
        <RaiseBudgetDialog
          connectorId={raised.id} name={raised.display_name} current={raised.daily_budget}
          onClose={() => setRaising(null)} onSaved={() => { toast.success(`${raised.display_name} budget raised`); track.reload(); }}
        />
      ) : null}
    </Dialog>
  );
}

/** "Track this project" while it is not tracked; once it is, a chip and a settings button that opens the same dialog. */
export function TrackProjectButton({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const fetcher = useCallback((signal: AbortSignal) => getProjectTracking(projectId, signal), [projectId]);
  const tracked = Boolean(useLoaded(`projects/${projectId}/tracking`, fetcher, "Could not load the project's tracking").data?.tracked);
  const changed = () => { void invalidateSupply(`projects/${projectId}`); onChanged?.(); };
  return (
    <>
      {tracked ? (
        <span className="inline-flex items-center gap-1">
          <Badge variant="secondary" className="h-7 gap-1 rounded-none"><Radar className="h-3.5 w-3.5" />Tracked</Badge>
          <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label="Tracking settings" title="Tracking settings" onClick={() => setOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
          <Radar className="h-3.5 w-3.5" />Track this project
        </Button>
      )}
      {open ? <TrackProjectDialog projectId={projectId} onClose={() => setOpen(false)} onChanged={changed} /> : null}
    </>
  );
}
