import { useCallback, useRef } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SupplySvhcList } from "@/types/supply";
import { toBase64 } from "./file-base64";
import { getSvhcList, loadSvhcList, loadSvhcListXlsx } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";
import { useLoaded } from "./use-loaded";

/** Which ECHA Candidate List is loaded, and for administrators a way to load a newer export, so substances declared for parts can be checked against it. */
export function SvhcListUpload({ readOnly = false }: { readOnly?: boolean }) {
  const fetcher = useCallback((signal: AbortSignal) => getSvhcList(signal), []);
  const loaded = useLoaded<SupplySvhcList>("compliance/svhc-list", fetcher, "Could not load the Candidate List");
  const { busy, error, run } = useConnectorSubmit();
  const input = useRef<HTMLInputElement>(null);
  const info = loaded.data;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">REACH Candidate List</legend>
      <p className="text-xs text-muted-foreground">
        {info?.loaded
          ? `${info.substances.toLocaleString()} substances, from ${info.source_name || "a file"}, loaded ${info.loaded_at?.slice(0, 10)} by ${info.loaded_by}.`
          : "Not loaded. Upload the ECHA list (CSV or Excel) with substance name and CAS number columns."}
      </p>
      {readOnly ? null : <input
        ref={input}
        type="file"
        accept=".csv,.txt,.xlsx,text/csv"
        aria-label="Candidate List file"
        className="text-xs"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void run(async () => {
            if (file.name.toLowerCase().endsWith(".xlsx")) await loadSvhcListXlsx(toBase64(new Uint8Array(await file.arrayBuffer())), file.name);
            else await loadSvhcList(await file.text(), file.name);
            await loaded.refresh();
          }).finally(() => { if (input.current) input.current.value = ""; });
        }}
      />}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    </fieldset>
  );
}
