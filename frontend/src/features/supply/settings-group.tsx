import { useState, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssessmentSettings, AssessmentSettingsView } from "@/types/supply";
import { saveAssessmentSettings } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

/**
 * A whole number inside a range. What is typed stays while it is typed (30 cannot be reached without passing 3, nor anything after
 * clearing the field); a figure inside the range is taken at once, and leaving the field puts back the last one taken.
 */
export function WholeInput({ id, value, low, high, onChange, className = "w-28" }: {
  id: string; value: number; low: number; high: number; onChange: (next: number) => void; className?: string;
}) {
  const [text, setText] = useState(String(value));
  return (
    <Input
      id={id} inputMode="numeric" className={className} value={text}
      onChange={(event) => {
        setText(event.target.value);
        const next = Number(event.target.value);
        if (event.target.value.trim() !== "" && Number.isInteger(next) && next >= low && next <= high) onChange(next);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

/** The default beside a field that differs from it. */
export function DefaultNote({ changed, text }: { changed: boolean; text: string }) {
  return changed ? <span className="ml-2 text-xs text-muted-foreground">default {text}</span> : null;
}

type Draft = AssessmentSettings;

/**
 * One group of the settings: its fields are changed in a draft, Save sends the whole settings with this group's fields changed, and
 * "Back to defaults" does the same with this group's fields at their defaults. Nothing outside the group moves.
 */
export function SettingsGroup({ title, fields, view, readOnly, onSaved, children }: {
  title: string;
  fields: ReadonlyArray<keyof Draft>;
  view: AssessmentSettingsView;
  readOnly: boolean;
  onSaved: (next: AssessmentSettingsView) => void;
  children: (draft: Draft, set: (next: Draft) => void) => ReactNode;
}) {
  const [draft, setDraft] = useState<Draft>(view.settings);
  const { busy, error, run } = useConnectorSubmit();
  const pick = (from: Draft): Partial<Draft> => Object.fromEntries(fields.map((field) => [field, from[field]]));
  const send = async (changes: Partial<Draft>) => {
    await run(async () => {
      const saved = await saveAssessmentSettings({ ...view.settings, ...changes });
      setDraft(saved.settings);
      onSaved(saved);
    });
  };
  const dirty = fields.some((field) => JSON.stringify(draft[field]) !== JSON.stringify(view.settings[field]));
  const atDefaults = fields.every((field) => JSON.stringify(view.settings[field]) === JSON.stringify(view.defaults[field]));
  return (
    <form className="space-y-4" aria-label={title} onSubmit={(event) => { event.preventDefault(); void send(pick(draft)); }}>
      <fieldset disabled={readOnly || busy} className="space-y-4">{children(draft, setDraft)}</fieldset>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {readOnly ? <p className="text-xs text-muted-foreground">Only administrators can change these.</p> : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={busy || !dirty}>Save</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy || atDefaults} onClick={() => void send(pick(view.defaults))}>Back to defaults</Button>
        </div>
      )}
    </form>
  );
}
