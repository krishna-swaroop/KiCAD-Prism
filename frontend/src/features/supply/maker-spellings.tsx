import { useCallback, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollapsibleSection } from "./collapsible-section";
import { addMakerSpelling, listMakerSpellings, removeMakerSpelling } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";
import { useLoaded } from "./use-loaded";

/** The spellings Prism knows for large makers: one row a maker, each spelling removable, and a way to add one to a maker. */
export function MakerSpellings({ readOnly = false }: { readOnly?: boolean }) {
  const fetcher = useCallback((signal: AbortSignal) => listMakerSpellings(signal), []);
  const loaded = useLoaded("settings/maker-spellings", fetcher, "Could not load the spellings");
  const { busy, error, run } = useConnectorSubmit();
  const [spelling, setSpelling] = useState("");
  const [group, setGroup] = useState("");
  const groups = loaded.data ?? [];
  const add = () => void run(async () => {
    await addMakerSpelling(spelling.trim(), group || null);
    setSpelling("");
    await loaded.refresh();
  });
  return (
    <section aria-label="Known spellings" className="space-y-2">
      <CollapsibleSection id="settings-maker-spellings" title="Known spellings of makers" count={groups.length} startOpen={false}>
        <ul className="max-h-64 divide-y themed-scrollbar overflow-y-auto">
          {groups.map((item) => (
            <li key={item.group_key} className="flex flex-wrap items-center gap-1.5 px-3 py-2 text-xs" aria-label={item.name}>
              <span className="mr-1 text-sm font-medium">{item.name}</span>
              {item.spellings.map((entry) => (
                <span key={entry.alias_key} className="flex items-center gap-1 border px-2 py-0.5">
                  {entry.alias_text}
                  {readOnly ? null : (
                    <button type="button" aria-label={`Remove ${entry.alias_text}`} disabled={busy} className="text-muted-foreground hover:text-foreground"
                      onClick={() => void run(async () => { await removeMakerSpelling(entry.alias_key); await loaded.refresh(); })}>
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </li>
          ))}
        </ul>
        {readOnly ? null : <form className="flex flex-wrap items-center gap-2 border-t p-3" onSubmit={(event) => { event.preventDefault(); if (spelling.trim()) add(); }}>
          <Input aria-label="Spelling" className="h-8 max-w-48 text-xs" value={spelling} onChange={(event) => setSpelling(event.target.value)} placeholder="A spelling" />
          <select aria-label="Of the maker" className="h-8 border bg-background px-2 text-xs" value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="">A new maker</option>
            {groups.map((item) => <option key={item.group_key} value={item.group_key}>{item.name}</option>)}
          </select>
          <Button type="submit" size="sm" disabled={busy || !spelling.trim()}>Add</Button>
        </form>}
        {error ? <p role="alert" className="px-3 pb-2 text-xs text-destructive">{error}</p> : null}
      </CollapsibleSection>
    </section>
  );
}
