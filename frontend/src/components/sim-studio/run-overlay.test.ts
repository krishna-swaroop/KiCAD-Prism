import { describe, expect, it } from "vitest";

import { solvedNets } from "./run-overlay";
import type { SimSetup } from "./types";

describe("solvedNets", () => {
    it("isolates the nets of the rails the analysis solved", () => {
        const setup = {
            rails: [
                { id: "3v3", net: "main:+3V3", voltage_v: 3.3 },
                { id: "1v8", net: "main:/Power/+1V8", voltage_v: 1.8 },
                { id: "12v", net: "main:+12V", voltage_v: 12 },
            ],
            analyses: [{ id: "dc", kind: "dc-drop", rails: ["3v3", "1v8"] }],
        } as unknown as SimSetup;
        expect(solvedNets(setup, "dc")).toEqual(["+3V3", "/Power/+1V8"]);
        expect(solvedNets(setup, "other")).toEqual([]);
    });
});
