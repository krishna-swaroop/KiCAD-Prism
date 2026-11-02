import { parseTable } from "./bom-file-model";
import { toBase64 } from "./file-base64";
import { readBomSheet } from "./supply-api";

const SPREADSHEET = /\.(xlsx|xlsm)$/i;

export function isSpreadsheet(name: string): boolean {
  return SPREADSHEET.test(name);
}

/** The rows of a BOM file: an Excel file's first sheet (read by the server), or delimited text. */
export async function readTableFile(file: File): Promise<string[][]> {
  return isSpreadsheet(file.name) ? readBomSheet(toBase64(new Uint8Array(await file.arrayBuffer()))) : parseTable(await file.text());
}
