import { describe, expect, it } from "vitest";

import { csvCell } from "./csv";

describe("csvCell", () => {
    it("quotes ordinary values and doubles embedded quotes", () => {
        expect(csvCell("USB, DP")).toBe('"USB, DP"');
        expect(csvCell('say "hi"')).toBe('"say ""hi"""');
        expect(csvCell(null)).toBe('""');
    });

    it("neutralizes leading spreadsheet formula characters", () => {
        expect(csvCell("=CMD|' /c calc'!A0")).toBe(`"'=CMD|' /c calc'!A0"`);
        expect(csvCell("+1+1")).toBe(`"'+1+1"`);
        expect(csvCell("-2+3")).toBe(`"'-2+3"`);
        expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
        expect(csvCell("\t=1+1")).toBe(`"'\t=1+1"`);
    });

    it("leaves safe leading characters alone", () => {
        expect(csvCell("100nF")).toBe('"100nF"');
        expect(csvCell("/AUX/AUX.SBU2S")).toBe('"/AUX/AUX.SBU2S"');
    });
});
