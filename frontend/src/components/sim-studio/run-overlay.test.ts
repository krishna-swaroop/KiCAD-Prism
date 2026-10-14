import { describe, expect, it } from "vitest";

import { availableFields, clippedRange, solvedNets } from "./run-overlay";
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

describe("result fields", () => {
    it("lists the grids a result published, and arrows only with both components", () => {
        const grid = (quantity: string) => ({ kind: "field-grid", path: `${quantity}.json`, quantity });
        expect(availableFields([grid("voltage_v"), grid("power_density_w_per_m3"), grid("current_density_x_a_per_m2")]))
            .toEqual({ scalars: ["voltage_v", "power_density_w_per_m3"], vectors: false });
        expect(availableFields([grid("current_density_a_per_m2"), grid("current_density_x_a_per_m2"), grid("current_density_y_a_per_m2")]))
            .toEqual({ scalars: ["current_density_a_per_m2"], vectors: true });
    });

    it("clips a magnitude's colours at a high quantile, from zero", () => {
        const values = Float32Array.from({ length: 1000 }, (_, k) => (k === 999 ? 1e6 : k));
        expect(clippedRange([{ values }], 0.99)).toEqual([0, 990]);
        expect(clippedRange([{ values: new Float32Array([NaN]) }])).toEqual([0, 1]);
    });
});
