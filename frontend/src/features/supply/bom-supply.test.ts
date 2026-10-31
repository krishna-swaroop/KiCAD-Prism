import { describe, expect, it } from "vitest";

import type { SemanticComponent } from "@/types/prism-selection";
import type { SupplyBomLineResult } from "@/types/supply";
import { buildLines, identityOf, isSupplyColumn, lcscOf, lineInput, lineKey, rowSupply, untrackedLabel } from "./bom-supply";
import { rollupSentences } from "./bom-rollup-text";
import { bomLineFixture, bomRollupFixture } from "./supply-test-fixtures";

function part(reference: string, fields: Record<string, string | number | boolean | null> = {}): SemanticComponent {
  return { componentUid: `cmp:${reference}`, reference, fields };
}

function result(overrides: Partial<SupplyBomLineResult> = {}): SupplyBomLineResult {
  return bomLineFixture({ need: 10, watched: true, status: "ok", stock: 100, short: false, buy: null, ...overrides });
}

describe("the value and footprint a line carries", () => {
  it("sends the first symbol's value and footprint, and leaves them out when empty", () => {
    const fields = { Manufacturer: "Acme", MPN: "R-1" };
    const [line] = buildLines([
      { ...part("R1", fields), value: " 10k ", footprint: "Resistor_SMD:R_0603_1608Metric" },
      { ...part("R2", fields), value: "10K", footprint: "Other" },
    ]);
    expect(line).toMatchObject({ quantity: 2, value: "10k", footprint: "Resistor_SMD:R_0603_1608Metric" });
    expect(lineInput(line)).toMatchObject({ value: "10k", footprint: "Resistor_SMD:R_0603_1608Metric" });
    const [bare] = buildLines([part("R3", fields)]);
    expect(Object.keys(lineInput(bare))).toEqual(["key", "manufacturer", "mpn", "quantity"]);
  });
});

describe("part identity from field names", () => {
  it("reads the spellings KiCad projects use, ignoring case", () => {
    expect(identityOf(part("R1", { Manufacturer: "Acme", "Manufacturer Part Number": "X-1" }))).toEqual({ manufacturer: "Acme", mpn: "X-1" });
    expect(identityOf(part("R1", { Manufacturer_Name: "Acme", Manufacturer_Part_Number: "X-1" }))).toEqual({ manufacturer: "Acme", mpn: "X-1" });
    expect(identityOf(part("R1", { MFR: "Acme", MPN: "X-1" }))).toEqual({ manufacturer: "Acme", mpn: "X-1" });
    expect(identityOf(part("R1", { "Mfr. No.": " X-1 " }))).toEqual({ manufacturer: "", mpn: "X-1" });
    // satnogs-comms writes its manufacturer as "Mnf." and its number as "PartNumber".
    expect(identityOf(part("R1", { "Mnf.": "TRACO", PartNumber: "TSR 1-2450" }))).toEqual({ manufacturer: "TRACO", mpn: "TSR 1-2450" });
    expect(identityOf(part("R1", { "Part Number": "X-9" }))).toEqual({ manufacturer: "", mpn: "X-9" });
    expect(identityOf(part("R1", { Value: "10k", "Manufacturer Part Number": null }))).toEqual({ manufacturer: "", mpn: "" });
    expect(identityOf(part("R1"))).toEqual({ manufacturer: "", mpn: "" });
  });

  it("prefers the explicit name when a part has more than one, and never reads the distributor's number", () => {
    const both = part("R1", { PartNumber: "LOOSE-1", "Manufacturer Part Number": "EXACT-1", "Vendor Part Number": "DIST-9" });
    expect(identityOf(both).mpn).toBe("EXACT-1");
    expect(identityOf(part("R1", { "Vendor Part Number": "DIST-9", "Supplier PN": "DIST-9" })).mpn).toBe("");
    expect(identityOf(part("R1", { "Manufacturer Part Number": "  ", PartNumber: "FALLBACK" })).mpn).toBe("FALLBACK");
  });

  it("gives one key to a part however its number is written", () => {
    const a = lineKey({ manufacturer: "Acme", mpn: "LM358-D" });
    expect(lineKey({ manufacturer: "ACME", mpn: "lm358 d" })).toBe(a);
    expect(lineKey({ manufacturer: "Acme", mpn: "LM358_D" })).toBe(a);
    expect(lineKey({ manufacturer: "Other", mpn: "LM358-D" })).not.toBe(a);
  });

  it("counts fitted parts per distinct part, keeping the references", () => {
    const lines = buildLines([
      part("R1", { Manufacturer: "Acme", "Manufacturer Part Number": "X-1" }),
      part("R2", { Manufacturer: "acme", "Manufacturer Part Number": "x1" }),
      part("C1", { Manufacturer: "Acme", "Manufacturer Part Number": "Y-2" }),
      part("TP1"),
    ]);
    expect(lines.map((line) => [line.mpn, line.quantity, line.references])).toEqual([
      ["X-1", 2, ["R1", "R2"]],
      ["Y-2", 1, ["C1"]],
      ["", 1, ["TP1"]],
    ]);
  });

  it("carries the Prism ID of the placed symbol to the server, and nothing else extra", () => {
    const [placed, plain] = buildLines([
      part("U1", { Manufacturer: "TI", "Manufacturer Part Number": "LM358", "Prism ID": " c1 " }),
      part("U2", { Manufacturer: "Acme", "Manufacturer Part Number": "Z-9" }),
    ]);
    expect(lineInput(placed)).toEqual({ key: placed.key, manufacturer: "TI", mpn: "LM358", quantity: 1, prism_id: "c1" });
    expect(lineInput(plain)).toEqual({ key: plain.key, manufacturer: "Acme", mpn: "Z-9", quantity: 1 });
  });

  it("reads an LCSC number from its field or from a supplier that says LCSC, and sends it", () => {
    expect(lcscOf(part("U1", { "LCSC Part #": " c7950 " }))).toBe("C7950");
    expect(lcscOf(part("U1", { Supplier: "LCSC", "Supplier Part": "C2040" }))).toBe("C2040");
    expect(lcscOf(part("U1", { Supplier: "Mouser", "Supplier Part": "C2040" }))).toBe("");
    expect(lcscOf(part("U1", { LCSC: "n/a" }))).toBe("");
    const [line] = buildLines([
      part("U1", { Manufacturer: "TI", "Manufacturer Part Number": "LM358DR" }),
      part("U2", { Manufacturer: "TI", "Manufacturer Part Number": "LM358DR", LCSC: "C5423" }),
    ]);
    expect(lineInput(line)).toEqual({ key: line.key, manufacturer: "TI", mpn: "LM358DR", quantity: 2, lcsc: "C5423" });
  });
});

describe("a row's supply", () => {
  const maker = { Manufacturer: "Acme" };
  const r1 = part("R1", { ...maker, "Manufacturer Part Number": "X-1" });
  const r2 = part("R2", { ...maker, "Manufacturer Part Number": "Y-2" });
  const keys = new Set([lineKey(identityOf(r1)), lineKey(identityOf(r2))]);

  it("is the part's own figures when the row holds one part", () => {
    const data = { [lineKey(identityOf(r1))]: result({ stock: 5 }) };
    const supply = rowSupply([r1, part("R9", { ...maker, "Manufacturer Part Number": "x1" })], data, keys);
    expect(supply.kind).toBe("line");
  });

  it("summarises a row of several parts by its worst status", () => {
    const data = {
      [lineKey(identityOf(r1))]: result({ status: "ok" }),
      [lineKey(identityOf(r2))]: result({ status: "error" }),
    };
    expect(rowSupply([r1, r2], data, keys)).toEqual({ kind: "mixed", count: 2, worst: "error" });
  });

  it("is nothing without results or when no part in the row is fitted", () => {
    expect(rowSupply([r1], null, keys)).toEqual({ kind: "none" });
    expect(rowSupply([r1], {}, new Set())).toEqual({ kind: "none" });
  });

  it("knows its columns and why a line has none", () => {
    expect(isSupplyColumn("Stock")).toBe(true);
    expect(isSupplyColumn("Value")).toBe(false);
    expect(untrackedLabel(result({ state: "no_mpn" }))).toBe("No part number");
    expect(untrackedLabel(result({ state: "unknown" }))).toBe("Not watched yet");
    expect(untrackedLabel(result({ state: "ambiguous" }))).toBe("Several parts match");
  });
});

describe("the rollup in words", () => {
  const rollup = bomRollupFixture({
    lines: 10, tracked: 8, not_tracked: 2, watched: 6, at_risk: 1, short: 2, priced: 7, lines_priced: 7, parts: 8, currency: "EUR",
    cost_build: "24.00", cost_per_board: "2.4000", can_build: 15, limited_by: "k", without_stock_data: 0, health: 7.5, health_status: "ok",
  });
  const lines = [{ key: "k", manufacturer: "Acme", mpn: "B-1", quantity: 2, references: ["U1"] }];
  const text = (sentences: ReturnType<typeof rollupSentences>) => sentences.map((sentence) => sentence.text);

  it("says the stock is enough, what it costs, and what needs a look", () => {
    const sentences = rollupSentences(rollup, 10, lines);
    expect(text(sentences)).toEqual([
      "Stock covers 10 boards",
      expect.stringMatching(/24\.00.* to buy for 10 boards \(.*2\.40.* a board in use\), covers 7 of 10 lines/),
      "1 at risk",
      "Health 7.5 of 10",
      "2 short for this build",
      "2 not tracked",
    ]);
    expect(sentences.map((sentence) => sentence.tone)).toEqual(["plain", "warn", "bad", "plain", "bad", "warn"]);
    const complete = rollupSentences({ ...rollup, lines_priced: 10, not_tracked: 0 }, 10, lines);
    expect(complete[1].text).not.toContain("covers");
    expect(complete[1].tone).toBe("plain");
  });

  it("says what a converted total was made of", () => {
    const converted = rollupSentences({ ...rollup, converted: true, rates_day: "2026-03-02", original_costs: { EUR: "20.00", USD: "9.00" } }, 10, lines);
    expect(converted[1].text).toContain("converted at the rates of 2026-03-02 (from 20.00 EUR and 9.00 USD), list prices without VAT or shipping");
    const single = rollupSentences({ ...rollup, converted: true, rates_day: "2026-03-02", original_costs: { USD: "9.00" } }, 10, lines);
    expect(single[1].text).not.toContain("(from");
  });

  it("names the part that limits the build when stock falls short", () => {
    expect(text(rollupSentences({ ...rollup, can_build: 4 }, 10, lines))[0]).toBe("Can build 4 of 10, limited by B-1");
    expect(rollupSentences({ ...rollup, can_build: 4 }, 10, lines)[0].tone).toBe("bad");
  });

  it("leaves health out when nothing has data, and calls a weak one bad", () => {
    expect(text(rollupSentences({ ...rollup, health: null }, 10, lines))).not.toContain("Health");
    const weak = rollupSentences({ ...rollup, health: 3.2, health_status: "error" }, 10, lines).find((sentence) => sentence.text.startsWith("Health"));
    expect(weak).toMatchObject({ text: "Health 3.2 of 10", tone: "bad" });
  });

  it("says when there is nothing to go on", () => {
    expect(text(rollupSentences({ ...rollup, can_build: null, tracked: 0, priced: 0, cost_build: null, currency: null, at_risk: 0, short: 0, not_tracked: 0, health: null }, 1, lines)))
      .toEqual(["No parts tracked yet"]);
    expect(text(rollupSentences({ ...rollup, can_build: null, at_risk: 0, short: 0, not_tracked: 0 }, 1, lines))[0]).toBe("No stock data yet");
  });

  it("refuses to total prices in two currencies", () => {
    const mixed = rollupSentences({ ...rollup, cost_build: null, currency: null, at_risk: 0, short: 0, not_tracked: 0 }, 10, lines);
    expect(text(mixed)).toContain("Prices are in more than one currency and the exchange rates are missing, so no total");
  });
});

