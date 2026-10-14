import { describe, expect, it } from "vitest";

import type { RunResult } from "../../run-overlay";
import type { SimSetup } from "../../types";

import { buildResultsModel } from "./results-model";

function setup(): SimSetup {
    return {
        schema: "prism.sim.setup", version: "a0", name: "t", bundle: { board_id: "main" }, materials: { slices: {} }, components: {},
        rails: [
            { id: "12v", net: "main:+12V", voltage_v: 12 },
            { id: "3v3", net: "main:+3V3", voltage_v: 3.3, tolerance_pct: 3 },
        ],
        terminals: [],
        sources: [
            { id: "j1", rail: "12v", terminal: "t1", component: "main:J1" },
            { id: "u5-out", rail: "3v3", terminal: "t2", component: "main:U5" },
        ],
        loads: [
            { id: "u1", rail: "3v3", terminal: "t3", current_a: 2, distribution: "uniform", component: "main:U1" },
            { id: "u2", rail: "12v", terminal: "t4", current_a: 0.1, distribution: "uniform", component: "main:U2" },
        ],
        converters: [{ id: "u5", component: "main:U5", input_rail: "12v", input_terminal: "t5", output_source: "u5-out", efficiency: 0.9 }],
        probes: [],
        analyses: [{ id: "dc", kind: "dc-drop", rails: ["12v", "3v3"] }],
    };
}

const result = {
    status: "succeeded",
    engine: { id: "dc-drop-grid", engine_version: "0" },
    artifacts: [],
    summary: {
        loads: [
            { load: "u1", rail: "3v3", min_voltage_v: 3.29, max_voltage_v: 3.29, max_drop_v: 0.0099, supply_drop_v: 0.006, return_drop_v: 0.0039 },
            { load: "u2", rail: "12v", min_voltage_v: 11.99, max_voltage_v: 11.99, max_drop_v: 0.012 },
        ],
        sources: [{ source: "j1", current_a: 0.8 }, { source: "u5-out", current_a: 2 }],
        converters: [{ converter: "u5", input_voltage_v: 12, input_current_a: 0.61, input_power_w: 7.33, output_voltage_v: 3.3, output_current_a: 2, output_power_w: 6.6, loss_w: 0.73, iterations: 4, converged: true }],
        copper_loss_w: 0.05,
        probes: [],
        nets: [
            { net: "+12V", copper_loss_w: 0.01, max_current_density_a_per_m2: 1e7 },
            { net: "+3V3", copper_loss_w: 0.03, max_current_density_a_per_m2: 4e7 },
            { net: "GND", copper_loss_w: 0.01, max_current_density_a_per_m2: 2e7 },
        ],
    },
} as RunResult;

describe("results model", () => {
    it("budgets each load from its rail, worst share first", () => {
        const model = buildResultsModel(result, setup(), "dc");
        expect(model.shape).toBe("tree");
        // 9.9 mV of a 3 % budget on 3.3 V (99 mV) is 10 %; 12 mV of 5 % on 12 V (600 mV) is 2 %.
        expect(model.loads.map((load) => [load.id, +load.share!.toFixed(3)])).toEqual([["u1", 0.1], ["u2", 0.02]]);
        expect(model.worst?.component).toBe("U1");
    });

    it("sums rails, inputs and losses", () => {
        const model = buildResultsModel(result, setup(), "dc");
        expect(model.rails.map((rail) => [rail.net, rail.currentA, rail.copperLossW, rail.budgetFromTolerance])).toEqual([
            ["+12V", 0.8, 0.01, false], ["+3V3", 2, 0.03, true],
        ]);
        expect(model.inputs).toEqual([{ source: "j1", component: "J1", rail: "12v", currentA: 0.8, powerW: 9.600000000000001 }]);
        expect(model.returns).toEqual([{ net: "GND", copperLossW: 0.01, maxJ: 2e7 }]);
        expect(model.efficiency).toBeCloseTo((9.6 - 0.73 - 0.05) / 9.6, 9);
        expect(model.peakJ).toEqual({ value: 4e7, net: "+3V3" });
    });

    it("tells a single rail from several", () => {
        const one = setup();
        one.converters = [];
        one.analyses[0].rails = ["3v3"];
        expect(buildResultsModel({ ...result, summary: { ...result.summary!, converters: [] } }, one, "dc").shape).toBe("rail");
        const two = setup();
        two.converters = [];
        expect(buildResultsModel({ ...result, summary: { ...result.summary!, converters: [] } }, two, "dc").shape).toBe("multi");
    });
});
