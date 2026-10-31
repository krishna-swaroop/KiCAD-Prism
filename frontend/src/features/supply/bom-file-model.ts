import { lineKey } from "./bom-supply";
import type { BomLineInput } from "@/types/supply";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_ROWS = 5000;

export type Role = "manufacturer" | "mpn" | "lcsc" | "quantity" | "references";

const LCSC_NUMBER = /^C\d{1,12}$/;
export type Mapping = Record<Role, number | null>;

const GUESSES: Record<Role, readonly string[]> = {
  manufacturer: ["manufacturer", "manufacturer name", "mfr", "mfr.", "mfg", "mnf", "make", "brand"],
  mpn: ["manufacturer part number", "mpn", "mfr. no.", "mfr part number", "mfg part number", "manufacturer pn", "mfr pn", "part number", "partnumber"],
  lcsc: ["lcsc", "lcsc part", "lcsc part #", "lcsc part number", "lcsc pn", "lcsc#", "supplier part"],
  quantity: ["quantity", "qty", "qnty", "count", "amount", "per board"],
  references: ["references", "reference", "designator", "designators", "refs", "ref"],
};

/** Rows of a delimited file, quotes and doubled quotes honoured. The delimiter is the one the first line uses most. */
export function parseTable(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].reduce((best, candidate) => (firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best), ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

/** The column each role most likely lives in, by header name; null where no header looks right. */
export function guessMapping(header: readonly string[]): Mapping {
  const names = header.map((name) => name.trim().toLowerCase());
  const find = (role: Role) => {
    for (const guess of GUESSES[role]) {
      const at = names.indexOf(guess);
      if (at >= 0) return at;
    }
    return null;
  };
  return { manufacturer: find("manufacturer"), mpn: find("mpn"), lcsc: find("lcsc"), quantity: find("quantity"), references: find("references") };
}

export interface FileLine extends BomLineInput {
  references: string[];
}

/**
 * One line per distinct manufacturer and number, quantities added. A row with only an LCSC number is a line of
 * its own, keyed by that number. A row with neither is left out and counted.
 */
export function buildFileLines(rows: readonly string[][], mapping: Mapping): { lines: FileLine[]; skipped: number } {
  const cell = (row: readonly string[], column: number | null) => (column === null ? "" : (row[column] ?? "").trim());
  const lines = new Map<string, FileLine>();
  let skipped = 0;
  for (const row of rows) {
    const mpn = cell(row, mapping.mpn);
    const number = cell(row, mapping.lcsc).toUpperCase();
    const lcsc = LCSC_NUMBER.test(number) ? number : "";
    if (!mpn && !lcsc) { skipped += 1; continue; }
    const manufacturer = cell(row, mapping.manufacturer);
    const parsed = Math.floor(Number(cell(row, mapping.quantity)));
    const quantity = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 100_000) : 1;
    const key = mpn ? lineKey({ manufacturer, mpn }) : `lcsc | ${lcsc.toLowerCase()}`;
    const reference = cell(row, mapping.references);
    const existing = lines.get(key);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, 100_000);
      if (reference) existing.references.push(reference);
      if (lcsc && !existing.lcsc) existing.lcsc = lcsc;
    } else lines.set(key, { key, manufacturer, mpn, quantity, references: reference ? [reference] : [], ...(lcsc ? { lcsc } : {}) });
  }
  return { lines: [...lines.values()], skipped };
}
