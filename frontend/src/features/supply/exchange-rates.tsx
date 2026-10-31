import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollapsibleSection } from "./collapsible-section";
import { parseRates } from "./exchange-rates-model";
import { enterFxRates, getFxRates, refreshFxRates } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";
import { useLoaded } from "./use-loaded";

/** The exchange rates behind every converted price: the day they are from, a refresh from the ECB, and entry by hand when it cannot be reached. */
export function ExchangeRates({ readOnly = false }: { readOnly?: boolean }) {
  const fetcher = useCallback((signal: AbortSignal) => getFxRates(signal), []);
  const loaded = useLoaded("settings/fx-rates", fetcher, "Could not load the exchange rates");
  const { busy, error, run } = useConnectorSubmit();
  const [text, setText] = useState("");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const rates = parseRates(text);
  const current = loaded.data;
  return (
    <section aria-label="Exchange rates" className="space-y-2">
      <CollapsibleSection id="settings-exchange-rates" title="Exchange rates" count={current?.currencies.length ?? -1} startOpen={false}>
        <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
          <span>{current?.day ? `From ${current.day}` : "No rates stored yet"}</span>
          {current?.stale ? <span className="border border-warning/50 px-2 py-0.5 text-xs">Out of date</span> : null}
          {readOnly ? null : <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { await refreshFxRates(); await loaded.refresh(); })}>Refresh from the ECB</Button>}
        </div>
        {readOnly ? null : <form className="flex flex-wrap items-center gap-2 border-t p-3" onSubmit={(event) => { event.preventDefault(); if (rates) void run(async () => { await enterFxRates(day, rates); setText(""); await loaded.refresh(); }); }}>
          <Input aria-label="Day" type="date" className="h-8 w-40 text-xs" value={day} onChange={(event) => setDay(event.target.value)} />
          <Input aria-label="Rates" className="h-8 max-w-72 flex-1 text-xs" value={text} onChange={(event) => setText(event.target.value)} placeholder="USD 1.08, GBP 0.85 (per euro)" />
          <Button type="submit" size="sm" disabled={busy || !rates}>Save rates</Button>
        </form>}
        {error ? <p role="alert" className="px-3 pb-2 text-xs text-destructive">{error}</p> : null}
      </CollapsibleSection>
    </section>
  );
}
