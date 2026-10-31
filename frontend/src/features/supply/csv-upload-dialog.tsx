import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupplyConnector, SupplyCsvResult } from "@/types/supply";
import { CsvRejectedError, SUPPLY_CSV_TEMPLATE_URL, uploadSupplyCsv } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

const MAX_BYTES = 5 * 1024 * 1024;

interface CsvUploadDialogProps {
  connector: SupplyConnector | null;
  onClose: () => void;
  onUploaded: (connector: SupplyConnector, result: SupplyCsvResult) => void;
}

export function CsvUploadDialog({ connector, onClose, onUploaded }: CsvUploadDialogProps) {
  return (
    <Dialog open={connector !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {connector ? <UploadForm key={connector.id} connector={connector} onClose={onClose} onUploaded={onUploaded} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function UploadForm({ connector, onClose, onUploaded }: { connector: SupplyConnector } & Omit<CsvUploadDialogProps, "connector">) {
  const [file, setFile] = useState<File | null>(null);
  const [rejection, setRejection] = useState<CsvRejectedError | null>(null);
  const { busy, error, run } = useConnectorSubmit();
  const tooLarge = file !== null && file.size > MAX_BYTES;

  const submit = async () => {
    if (!file) return;
    setRejection(null);
    const uploaded = await run(async () => {
      try {
        onUploaded(connector, await uploadSupplyCsv(connector.id, file));
      } catch (caught) {
        if (caught instanceof CsvRejectedError) setRejection(caught);
        throw caught;
      }
    });
    if (uploaded) onClose();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (file && !tooLarge) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Upload offers for {connector.display_name}</DialogTitle>
        <DialogDescription>
          A CSV file of stock and prices. It replaces the previous upload. If any row is wrong, nothing is imported.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="csv-offers-file">CSV file</Label>
        <Input
          id="csv-offers-file"
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          onChange={(event) => { setFile(event.target.files?.[0] ?? null); setRejection(null); }}
        />
        <p className="text-xs text-muted-foreground">
          Needs sku, mpn, manufacturer and stock columns. Price columns are named price_1, price_10, price_100.{" "}
          <a className="underline underline-offset-2" href={SUPPLY_CSV_TEMPLATE_URL} download>Download a template</a>
        </p>
        {tooLarge ? <p className="text-xs text-destructive">The file is larger than 5 MB.</p> : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{error}</p>
            {rejection ? <RejectionList rejection={rejection} /> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || !file || tooLarge}>{busy ? "Uploading…" : "Upload"}</Button>
      </DialogFooter>
    </form>
  );
}

function RejectionList({ rejection }: { rejection: CsvRejectedError }) {
  const hidden = rejection.errorCount - rejection.errors.length;
  return (
    <ul className="mt-2 max-h-48 space-y-0.5 themed-scrollbar overflow-y-auto text-xs" aria-label="Problems in the file">
      {rejection.errors.map((item) => (
        <li key={`${item.line}:${item.column}:${item.message}`}>
          {item.line > 0 ? `Line ${item.line}` : "File"}
          {item.column ? `, ${item.column}` : ""}: {item.message}
        </li>
      ))}
      {hidden > 0 ? <li>and {hidden.toLocaleString()} more</li> : null}
    </ul>
  );
}
