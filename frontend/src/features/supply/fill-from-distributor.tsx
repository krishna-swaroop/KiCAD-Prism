import { useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { FillCandidate, FillDetails, FillSearchResult } from "@/types/supply";

import { defaultChosen, fillChanges, searchSummary } from "./fill-model";
import type { FillChange } from "./fill-model";
import { getFillDetails, searchFillCandidates } from "./fill-api";
import { VendorName } from "./vendor-name";

type Step =
  | { name: "idle" }
  | { name: "working"; what: string }
  | { name: "pick"; result: FillSearchResult }
  | { name: "review"; candidate: FillCandidate; details: FillDetails; chosen: Set<string> };

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Look the part up at the connected distributors and offer what they know as form values.
 * It changes nothing itself: `onApply` hands the chosen values to the edit form, and the
 * person saves them as a new revision like any other edit.
 */
export function FillFromDistributor({
  values,
  onApply,
}: {
  values: Record<string, string>;
  onApply: (changes: Record<string, string>) => void;
}) {
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [error, setError] = useState("");
  const mpn = (values.mpn ?? "").trim();

  const search = async () => {
    setError("");
    setStep({ name: "working", what: "Asking the distributors" });
    try {
      const result = await searchFillCandidates(mpn, (values.manufacturer ?? "").trim());
      setStep({ name: "pick", result });
    } catch (reason) {
      setError(messageOf(reason));
      setStep({ name: "idle" });
    }
  };

  const pick = async (candidate: FillCandidate) => {
    setError("");
    setStep({ name: "working", what: `Reading ${candidate.connector}` });
    try {
      const details = await getFillDetails(candidate);
      setStep({ name: "review", candidate, details, chosen: defaultChosen(fillChanges(candidate, details, values)) });
    } catch (reason) {
      setError(messageOf(reason));
      setStep({ name: "idle" });
    }
  };

  return (
    <section aria-label="Fill from distributor" className="space-y-3 border border-border p-3 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Fill from distributor</h3>
          <p className="text-xs text-muted-foreground">Look the part number up and take the fields you want. Nothing is saved until you save the revision.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!mpn || step.name === "working"} onClick={() => void search()}>
          {step.name === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Look up
        </Button>
      </div>
      {step.name === "working" ? <p className="text-xs text-muted-foreground">{step.what}...</p> : null}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
      {step.name === "pick" ? <Candidates result={step.result} onPick={(candidate) => void pick(candidate)} /> : null}
      {step.name === "review" ? (
        <Review
          step={step}
          values={values}
          onToggle={(key) => {
            const chosen = new Set(step.chosen);
            if (!chosen.delete(key)) chosen.add(key);
            setStep({ ...step, chosen });
          }}
          onApply={(changes) => {
            onApply(changes);
            setStep({ name: "idle" });
          }}
          onBack={() => setStep({ name: "idle" })}
        />
      ) : null}
    </section>
  );
}

function Candidates({ result, onPick }: { result: FillSearchResult; onPick: (candidate: FillCandidate) => void }) {
  const note = searchSummary(result.skipped);
  return (
    <div className="space-y-2">
      {result.candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No distributor knows this part number.</p>
      ) : (
        <ul className="divide-y border">
          {result.candidates.map((candidate) => (
            <li key={`${candidate.connector_id}:${candidate.sku}`} className="flex items-center justify-between gap-3 p-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {candidate.manufacturer || "Unknown manufacturer"}, {candidate.mpn}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  <VendorName provider={candidate.provider} name={candidate.connector} />, {candidate.sku}
                  {candidate.description ? `, ${candidate.description}` : ""}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => onPick(candidate)}>
                Use
              </Button>
            </li>
          ))}
        </ul>
      )}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function Review({
  step,
  values,
  onToggle,
  onApply,
  onBack,
}: {
  step: Extract<Step, { name: "review" }>;
  values: Record<string, string>;
  onToggle: (key: string) => void;
  onApply: (changes: Record<string, string>) => void;
  onBack: () => void;
}) {
  const changes: FillChange[] = fillChanges(step.candidate, step.details, values);
  if (changes.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{step.candidate.connector} has nothing to add to these fields.</p>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>Close</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">From {step.candidate.connector}. Empty fields are ticked; tick the others to replace them.</p>
      <ul className="divide-y border">
        {changes.map((change) => (
          <li key={change.key} className="flex items-start gap-3 p-2 text-sm">
            <Checkbox
              aria-label={change.label}
              checked={step.chosen.has(change.key)}
              onCheckedChange={() => onToggle(change.key)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{change.label}</div>
              <div className="break-words">{change.suggested}</div>
              {change.current ? <div className="break-words text-xs text-muted-foreground line-through">{change.current}</div> : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>Cancel</Button>
        <Button
          type="button"
          size="sm"
          disabled={step.chosen.size === 0}
          onClick={() => onApply(Object.fromEntries(changes.flatMap((c) => (step.chosen.has(c.key) ? [[c.key, c.suggested]] : []))))}
        >
          Fill {step.chosen.size} {step.chosen.size === 1 ? "field" : "fields"}
        </Button>
      </div>
    </div>
  );
}
