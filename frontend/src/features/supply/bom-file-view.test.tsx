import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplyBomLookup } from "@/types/supply";
import { buildFileLines, guessMapping, parseTable } from "./bom-file-model";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  lookupSupplyBom: vi.fn(),
}));

import { BomFileView } from "./bom-file-view";
import * as api from "./supply-api";
import { bomLineFixture, bomRollupFixture } from "./supply-test-fixtures";

const mocked = vi.mocked(api);

const rollup = bomRollupFixture({
  lines: 2, tracked: 1, not_tracked: 1, watched: 1, at_risk: 0, short: 0, priced: 1, lines_priced: 1, parts: 1, currency: "EUR",
  cost_build: "5.00", cost_per_board: "5.00", can_build: 10, limited_by: null, without_stock_data: 0, health: 8, health_status: "ok",
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const CSV = 'Reference,Qty,Manufacturer,MPN\nR1,1,Acme,"R-10K"\nR2,1,acme,R-10K\nU1,2,Globex,"LM,358"\nTP1,1,,\n';

describe("reading a BOM file", () => {
  it("handles quotes, other delimiters and blank lines", () => {
    expect(parseTable(CSV)).toEqual([["Reference", "Qty", "Manufacturer", "MPN"], ["R1", "1", "Acme", "R-10K"], ["R2", "1", "acme", "R-10K"], ["U1", "2", "Globex", "LM,358"], ["TP1", "1", "", ""]]);
    expect(parseTable("MPN;Qty\r\nA-1;2\r\n\r\nB-2;3\r\n")).toEqual([["MPN", "Qty"], ["A-1", "2"], ["B-2", "3"]]);
    expect(parseTable('a\t"b ""quoted"""\n')).toEqual([["a", 'b "quoted"']]);
  });

  it("guesses the columns from the header and leaves the rest empty", () => {
    expect(guessMapping(["Reference", "Qty", "Manufacturer", "MPN"])).toEqual({ manufacturer: 2, mpn: 3, lcsc: null, quantity: 1, references: 0 });
    expect(guessMapping(["Foo", "LCSC Part #"])).toEqual({ manufacturer: null, mpn: null, lcsc: 1, quantity: null, references: null });
  });

  it("adds rows that are the same part and counts rows without a number", () => {
    const rows = parseTable(CSV).slice(1);
    const { lines, skipped } = buildFileLines(rows, { manufacturer: 2, mpn: 3, lcsc: null, quantity: 1, references: 0 });
    expect(skipped).toBe(1);
    expect(lines.map((line) => [line.mpn, line.quantity, line.references])).toEqual([["R-10K", 2, ["R1", "R2"]], ["LM,358", 2, ["U1"]]]);
  });

  it("keeps a row with only an LCSC number, and ignores one that does not look like one", () => {
    const rows = parseTable("MPN,LCSC\nLM358DR,C5423\n,c7950\n,n/a\n").slice(1);
    const { lines, skipped } = buildFileLines(rows, { manufacturer: null, mpn: 0, lcsc: 1, quantity: null, references: null });
    expect(skipped).toBe(1);
    expect(lines.map((line) => [line.key, line.mpn, line.lcsc])).toEqual([[" | lm358dr", "LM358DR", "C5423"], ["lcsc | c7950", "", "C7950"]]);
  });
});

describe("the BOM file view", () => {
  it("maps the columns, checks the parts and shows what was found", async () => {
    const lookup: SupplyBomLookup = {
      build_quantity: 5, attrition_percent: 0, attrition_by_part: null, rollup,
      lines: { "acme | r10k": bomLineFixture({ state: "tracked", part_id: "p1", manufacturer_match: "exact", need: 10, watched: true, status: "ok", stock: 500, short: false, buy: null }) },
    };
    mocked.lookupSupplyBom.mockResolvedValue(lookup);
    render(<BomFileView />);
    const file = new File([CSV], "bom.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(CSV) });
    fireEvent.change(screen.getByLabelText(/BOM file/), { target: { files: [file] } });
    expect(await screen.findByText(/4 rows/)).toBeTruthy();
    expect(screen.getByText("bom.csv")).toBeTruthy();
    expect((screen.getByLabelText("Manufacturer part number") as HTMLSelectElement).value).toBe("3");
    fireEvent.change(screen.getByLabelText("Boards to build"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Check 2 distinct parts" }));
    await waitFor(() => expect(mocked.lookupSupplyBom).toHaveBeenCalled());
    expect(mocked.lookupSupplyBom.mock.calls[0][0]).toEqual([
      { key: "acme | r10k", manufacturer: "Acme", mpn: "R-10K", quantity: 2 },
      { key: "globex | lm,358", manufacturer: "Globex", mpn: "LM,358", quantity: 2 },
    ]);
    expect(mocked.lookupSupplyBom.mock.calls[0][1]).toEqual({ buildQuantity: 5, attritionPercent: 0 });
    expect(await screen.findByText("Stock covers 5 boards")).toBeTruthy();
    expect(screen.getByText("R-10K")).toBeTruthy();
  });

  it("reads a file dropped on the zone", async () => {
    render(<BomFileView />);
    const file = new File([CSV], "dropped.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(CSV) });
    fireEvent.drop(screen.getByTestId("bom-drop-zone"), { dataTransfer: { files: [file] } });
    expect(await screen.findByText("dropped.csv")).toBeTruthy();
    expect(screen.getByLabelText("Manufacturer part number")).toBeTruthy();
  });
});
