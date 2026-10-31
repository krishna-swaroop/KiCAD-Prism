import { useMemo, useState, type DragEvent } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SupplyBomLookup } from "@/types/supply";
import { rollupSentences } from "./bom-rollup-text";
import {
  buildFileLines, guessMapping, MAX_FILE_BYTES, MAX_FILE_ROWS, type Mapping, type Role,
} from "./bom-file-model";
import { readTableFile } from "./bom-file-read";
import { BomFileResults } from "./bom-file-results";
import { lineInput } from "./bom-supply";
import { lookupSupplyBom } from "./supply-api";
import { useConnectorSubmit } from "./use-connector-submit";

// A row needs one of the two numbers, so neither is marked optional.
const ROLES: ReadonlyArray<{ role: Role; label: string; required: boolean }> = [
  { role: "mpn", label: "Manufacturer part number", required: true },
  { role: "manufacturer", label: "Manufacturer", required: false },
  { role: "lcsc", label: "LCSC number", required: true },
  { role: "quantity", label: "Quantity per board", required: false },
  { role: "references", label: "References", required: false },
];

/** Check a BOM that is not in a project: pick the columns, and see what it would cost and whether it can be built. */
export function BomFileView() {
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [header, setHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({ manufacturer: null, mpn: null, lcsc: null, quantity: null, references: null });
  const [build, setBuild] = useState(1);
  const [lookup, setLookup] = useState<SupplyBomLookup | null>(null);
  const { busy, error, run } = useConnectorSubmit();
  const [dragging, setDragging] = useState(false);

  const columns = rows[0]?.map((name, index) => ({ id: `column-${index}`, index, name: header ? name.trim() || `Column ${index + 1}` : `Column ${index + 1}` })) ?? [];
  const body = header ? rows.slice(1) : rows;
  const built = useMemo(() => buildFileLines(body, mapping), [body, mapping]);

  const choose = async (file: File) => {
    setLookup(null);
    if (file.size > MAX_FILE_BYTES) {
      setRows([]);
      await run(async () => { throw new Error("The file is larger than 2 MB."); });
      return;
    }
    let parsed: string[][];
    try {
      parsed = (await readTableFile(file)).slice(0, MAX_FILE_ROWS + 1);
    } catch {
      setRows([]);
      await run(async () => { throw new Error("That file could not be read as a spreadsheet or a delimited text file."); });
      return;
    }
    setRows(parsed);
    setFileName(file.name);
    if (parsed.length > 0) setMapping(guessMapping(parsed[0]));
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void choose(file);
  };

  const check = () => run(async () => {
    setLookup(await lookupSupplyBom(built.lines.map(lineInput), { buildQuantity: build, attritionPercent: 0 }));
  });

  return (
    <div className="space-y-4">
      <div
        data-testid="bom-drop-zone"
        className={cn(
          "flex flex-col items-center gap-2 border border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "bg-muted/20",
        )}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">{dragging ? "Drop the file to read it" : "Drop a BOM file here"}</p>
        <p className="text-xs text-muted-foreground">Excel (.xlsx) or CSV, up to 2 MB. The first sheet is read.</p>
        <input id="bom-file" type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,text/csv" className="sr-only" aria-label="BOM file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void choose(file); event.target.value = ""; }} />
        <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("bom-file")?.click()}>
          <FileSpreadsheet className="h-4 w-4" />Choose file
        </Button>
        {fileName ? <p className="text-xs text-muted-foreground">{fileName}</p> : null}
      </div>
      {rows.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{body.length.toLocaleString()} rows{rows.length > MAX_FILE_ROWS ? ` (only the first ${MAX_FILE_ROWS.toLocaleString()} are read)` : ""}.</p>
          <div className="flex items-center gap-2">
            <Checkbox id="bom-header" checked={header} onCheckedChange={(value) => { setHeader(value === true); setLookup(null); }} />
            <Label htmlFor="bom-header" className="font-normal">The first row is a header</Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map(({ role, label, required }) => (
              <div key={role} className="space-y-1">
                <Label htmlFor={`map-${role}`} className="text-xs">{label}{required ? "" : " (optional)"}</Label>
                <select
                  id={`map-${role}`}
                  className="h-9 w-full border bg-background px-2 text-sm"
                  value={mapping[role] ?? ""}
                  onChange={(event) => { setMapping({ ...mapping, [role]: event.target.value === "" ? null : Number(event.target.value) }); setLookup(null); }}
                >
                  <option value="">{required ? "Choose a column" : "None"}</option>
                  {columns.map((column) => <option key={column.id} value={column.index}>{column.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="bom-file-build" className="text-xs">Boards to build</Label>
              <Input id="bom-file-build" type="number" min={1} max={1_000_000} className="h-9 w-28" value={build}
                onChange={(event) => { const next = Math.floor(Number(event.target.value)); if (next >= 1 && next <= 1_000_000) { setBuild(next); setLookup(null); } }} />
            </div>
            <button
              type="button"
              className="h-9 border bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
              disabled={busy || (mapping.mpn === null && mapping.lcsc === null) || built.lines.length === 0}
              onClick={() => void check()}
            >
              Check {built.lines.length.toLocaleString()} distinct parts
            </button>
            {built.skipped > 0 ? <span className="text-xs text-muted-foreground">{built.skipped} rows without a part number or LCSC number are left out.</span> : null}
          </div>
        </div>
      ) : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {lookup ? (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {rollupSentences(lookup.rollup, build, built.lines).map((sentence) => <li key={sentence.text}>{sentence.text}</li>)}
          </ul>
          <BomFileResults lines={built.lines} lookup={lookup} />
        </>
      ) : null}
    </div>
  );
}
