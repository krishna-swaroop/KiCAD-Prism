import { useCallback, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollapsibleSection } from "./collapsible-section";
import { addNumberEnding, listNumberEndings, removeNumberEnding } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";
import { useLoaded } from "./use-loaded";

/** The endings makers put on a base number. A packaging ending (a reel, a tube) is the same part and counts; a grade (automotive) is another part and waits for a click. */
export function NumberEndings({ readOnly = false }: { readOnly?: boolean }) {
  const fetcher = useCallback((signal: AbortSignal) => listNumberEndings(signal), []);
  const loaded = useLoaded("settings/number-endings", fetcher, "Could not load the endings");
  const { busy, error, run } = useConnectorSubmit();
  const [ending, setEnding] = useState("");
  const [kind, setKind] = useState<"packaging" | "grade">("packaging");
  const endings = loaded.data ?? [];
  const add = () => void run(async () => {
    await addNumberEnding(ending.trim(), kind);
    setEnding("");
    await loaded.refresh();
  });
  return (
    <section aria-label="Number endings" className="space-y-2">
      <CollapsibleSection id="settings-number-endings" title="Endings of part numbers" count={endings.length} startOpen={false}>
        {(["packaging", "grade"] as const).map((group) => (
          <div key={group} className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2 text-xs" aria-label={group === "packaging" ? "Packaging" : "Grade"}>
            <span className="mr-1 text-sm font-medium">{group === "packaging" ? "Packaging" : "Grade"}</span>
            {endings.flatMap((item) => item.kind !== group ? [] : [(
              <span key={item.suffix_key} className="flex items-center gap-1 border px-2 py-0.5">
                {item.suffix_text}
                {readOnly ? null : (
                  <button type="button" aria-label={`Remove ${item.suffix_text}`} disabled={busy} className="text-muted-foreground hover:text-foreground"
                    onClick={() => void run(async () => { await removeNumberEnding(item.suffix_key); await loaded.refresh(); })}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            )])}
          </div>
        ))}
        {readOnly ? null : <form className="flex flex-wrap items-center gap-2 p-3" onSubmit={(event) => { event.preventDefault(); if (ending.trim()) add(); }}>
          <Input aria-label="Ending" className="h-8 max-w-40 text-xs" value={ending} onChange={(event) => setEnding(event.target.value)} placeholder="-TR" />
          <select aria-label="Kind" className="h-8 border bg-background px-2 text-xs" value={kind} onChange={(event) => setKind(event.target.value as "packaging" | "grade")}>
            <option value="packaging">Packaging</option>
            <option value="grade">Grade</option>
          </select>
          <Button type="submit" size="sm" disabled={busy || !ending.trim()}>Add</Button>
        </form>}
        {error ? <p role="alert" className="px-3 pb-2 text-xs text-destructive">{error}</p> : null}
      </CollapsibleSection>
    </section>
  );
}
