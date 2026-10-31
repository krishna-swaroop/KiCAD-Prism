import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PartAlertRules, RulesRequest, SupplyWatchSummary } from "@/types/supply";
import { followPart } from "./tracking-api";
import { parseThreshold } from "./supply-format";
import { getAlertRules, saveAlertRules } from "./tracking-api";
import { useConnectorSubmit } from "./use-connector-submit";
import { useLoaded } from "./use-loaded";

const KIND_LABEL: Record<string, string> = {
  out_of_stock: "Out of stock",
  below_threshold: "At or below the threshold",
  rupture_soon: "Could run out soon",
  likely_out: "Likely to run out everywhere",
  price_up: "Price rises",
  target_price_missed: "Price over the target",
  assessment_worse: "Assessment gets worse",
};

function Form({ partId, initial, asking, mutable, watch, onChanged }: {
  partId: string; initial: Required<RulesRequest>; asking: string[]; mutable: string[]; watch?: SupplyWatchSummary | null; onChanged?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  // Kinds asked off and waiting for QA: off in the form, so saving again keeps the request.
  const [asked, setAsked] = useState(() => new Set(asking));
  // The stock threshold is the watch's, typed where the rule that uses it is.
  const [thresholdText, setThresholdText] = useState(watch?.threshold == null ? "" : String(watch.threshold));
  const threshold = parseThreshold(thresholdText);
  const { busy, error, run } = useConnectorSubmit();
  const muted = useMemo(() => new Set(draft.muted), [draft.muted]);
  const toggle = (kind: string, on: boolean) =>
    setDraft((current) => ({ ...current, muted: on ? current.muted.filter((item) => item !== kind) : [...current.muted, kind] }));
  const save = () => {
    if (threshold === undefined) return;
    void run(async () => {
      const saved = await saveAlertRules(partId, draft);
      const waiting = saved.muting ?? [];
      setDraft({
        muted: [...saved.muted, ...waiting], price_rise_percent: saved.price_rise_percent, likely_out_percent: saved.likely_out_percent ?? null,
        target_price: saved.target_price, target_currency: saved.target_currency,
      });
      setAsked(new Set(waiting));
      if (watch && threshold !== watch.threshold) {
        await followPart(partId, { threshold });
        await onChanged?.();
      }
      toast.success("Alert rules saved");
    });
  };
  return (
    <div className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="text-xs text-muted-foreground">A Dashboard alert when</legend>
        {mutable.map((kind) => (
          <div key={kind} className="flex items-center gap-2">
            <Checkbox id={`rule-${kind}`} checked={!muted.has(kind)} onCheckedChange={(on) => toggle(kind, on === true)} />
            <Label htmlFor={`rule-${kind}`} className="font-normal">{KIND_LABEL[kind] ?? kind}</Label>
            {asked.has(kind) && muted.has(kind) ? <span className="text-xs text-muted-foreground">Asked QA</span> : null}
            {kind === "below_threshold" && watch ? (
              <Input
                aria-label="Stock threshold" inputMode="numeric" placeholder="None" className="ml-auto h-7 w-24"
                aria-invalid={threshold === undefined} value={thresholdText} onChange={(event) => setThresholdText(event.target.value)}
              />
            ) : null}
          </div>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="rule-rise" className="text-xs">A price rise of at least (%)</Label>
          <Input id="rule-rise" type="number" min={1} max={500} className="h-8 w-24" placeholder="20" value={draft.price_rise_percent ?? ""}
            onChange={(event) => setDraft({ ...draft, price_rise_percent: event.target.value === "" ? null : Number(event.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rule-likely" className="text-xs">Likely to run out at a chance of (%)</Label>
          <Input id="rule-likely" type="number" min={50} max={99} className="h-8 w-24" placeholder="70" value={draft.likely_out_percent ?? ""}
            onChange={(event) => setDraft({ ...draft, likely_out_percent: event.target.value === "" ? null : Number(event.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rule-target" className="text-xs">Target price</Label>
          <Input id="rule-target" inputMode="decimal" className="h-8 w-28" value={draft.target_price ?? ""}
            onChange={(event) => setDraft({ ...draft, target_price: event.target.value === "" ? null : event.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rule-currency" className="text-xs">Currency</Label>
          <Input id="rule-currency" maxLength={3} className="h-8 w-20 uppercase" value={draft.target_currency}
            onChange={(event) => setDraft({ ...draft, target_currency: event.target.value.toUpperCase() })} />
        </div>
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      <Button type="button" size="sm" disabled={busy || threshold === undefined} onClick={save}>Save alert rules</Button>
    </div>
  );
}

/** Which Dashboard alerts this part raises, its stock threshold, how big a price rise matters, and a target price to stay under. */
export function AlertRulesSection({ partId, canEdit, watch, onChanged }: {
  partId: string; canEdit: boolean; watch?: SupplyWatchSummary | null; onChanged?: () => Promise<void>;
}) {
  const fetcher = useCallback((signal: AbortSignal) => getAlertRules(partId, signal), [partId]);
  const { data, status } = useLoaded<PartAlertRules>(`parts/${partId}/rules`, fetcher, "Could not load the alert rules");
  if (!canEdit || status !== "ready" || !data) return null;
  return (
    <section aria-label="Alert rules" className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alert rules</h3>
      <Form watch={watch} onChanged={onChanged} partId={partId} asking={data.muting ?? []} initial={{ muted: [...data.muted, ...(data.muting ?? [])], price_rise_percent: data.price_rise_percent, likely_out_percent: data.likely_out_percent ?? null, target_price: data.target_price, target_currency: data.target_currency }} mutable={data.mutable} />
    </section>
  );
}
