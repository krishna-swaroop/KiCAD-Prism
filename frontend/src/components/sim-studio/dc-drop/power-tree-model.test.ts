import { describe, expect, it } from "vitest";

import type { SimSetup } from "../types";
import type { PrismSemanticIndex } from "@/types/prism-selection";

import { BoardIndex, railVoltage } from "./board-index";
import { pickItems, type Candidates } from "./candidates";
import {
    addElement, addPicked, autoArrange, connect, emptyLayout, mergeInferred, removeElement, treeOf, updateElement,
    type InferredTree, type TreeState,
} from "./power-tree-model";

const PADS: [string, string, string, string, string][] = [
    ["J1", "1", "1", "PASSIVE", "+12V"], ["J1", "2", "2", "PASSIVE", "GND"],
    ["U5", "1", "VIN", "POWER_IN", "+12V"], ["U5", "2", "SW", "POWER_OUT", "Net-(U5-SW)"], ["U5", "3", "GND", "POWER_IN", "GND"],
    ["L1", "1", "1", "PASSIVE", "Net-(U5-SW)"], ["L1", "2", "2", "PASSIVE", "+3V3"],
    ["U1", "1", "VDD", "POWER_IN", "+3V3"], ["U1", "2", "VDD", "POWER_IN", "+3V3"], ["U1", "3", "VSS", "POWER_IN", "GND"],
];

function board(): BoardIndex {
    const refs = [...new Set(PADS.map((pad) => pad[0]))];
    return new BoardIndex({
        components: refs.map((reference) => ({ componentUid: reference, reference, pcbRefs: [{}] })),
        terminals: PADS.map(([reference, pin, pinName, pinType, netName]) => ({
            terminalUid: `${reference}.${pin}`, componentUid: reference, reference, pin, pinName, pinType, netName, pcbPadUuid: `${reference}-${pin}`,
        })),
    } as unknown as PrismSemanticIndex);
}

function blank(): TreeState {
    const setup: SimSetup = {
        schema: "prism.sim.setup", version: "a0", name: "t", bundle: { board_id: "main" }, materials: { slices: {} },
        components: {}, rails: [], terminals: [], sources: [], loads: [], converters: [], probes: [],
        analyses: [{ id: "dc", kind: "dc-drop", rails: [] }],
    };
    return { setup, layout: emptyLayout() };
}

describe("power-tree model", () => {
    it("reads voltages from net names like the backend", () => {
        expect([railVoltage("+3V3"), railVoltage("1V8_CORE"), railVoltage("LX_0V9"), railVoltage("GND"), railVoltage("SDA")])
            .toEqual([3.3, 1.8, null, null, null]);
    });

    it("builds a tree element by element, pending until complete", () => {
        const b = board();
        let { state } = addElement(blank(), b, "rail", { net: "+12V" });
        ({ state } = addElement(state, b, "rail", { net: "+3V3" }));
        expect(state.setup.rails.map((rail) => [rail.id, rail.voltage_v])).toEqual([["12v", 12], ["3v3", 3.3]]);
        expect(state.setup.analyses[0].rails).toEqual(["12v", "3v3"]);

        let node: string;
        ({ state, node } = addElement(state, b, "converter", { component: "U5" }));
        expect(node).toBe("converter:new-converter");
        expect(treeOf(state).elements.find((e) => e.node === node)?.needs).toEqual(["input", "output"]);
        ({ state, node } = connect(state, b, "rail:12v", node));
        ({ state, node } = connect(state, b, node, "rail:3v3"));
        expect(node).toBe("converter:u5-3v3");
        expect(state.layout.pending).toEqual([]);
        const converter = state.setup.converters[0];
        expect(converter).toMatchObject({ component: "main:U5", input_rail: "12v", kind: "switching" });
        const out = state.setup.sources.find((s) => s.id === converter.output_source)!;
        expect(state.setup.terminals.find((t) => t.id === out.terminal)).toEqual({ id: "u5-3v3-out", positive: ["main:L1.2"], reference: ["main:U5.3"] });
        expect(treeOf(state).elements.find((e) => e.node === node)?.needs).toEqual(["efficiency"]);

        ({ state } = updateElement(state, b, node, { values: { efficiency: 0.9 } }));
        expect(state.setup.converters[0].efficiency).toBe(0.9);

        ({ state, node } = addElement(state, b, "load", { component: "U1", rail: "3v3" }));
        expect(node).toBe("load:u1-3v3");
        ({ state } = updateElement(state, b, node, { values: { current_a: 2 } }));
        expect(state.setup.loads[0]).toMatchObject({ current_a: 2, rail: "3v3" });

        ({ state } = addElement(state, b, "source", { component: "J1", rail: "12v" }));
        const { edges } = treeOf(state);
        expect(edges.map((e) => e.id).sort()).toEqual([
            "converter:u5-3v3->rail:3v3", "rail:12v->converter:u5-3v3", "rail:3v3->load:u1-3v3", "source:j1-12v->rail:12v",
        ]);

        const arranged = autoArrange(state).layout.positions;
        expect(arranged["source:j1-12v"].x).toBeLessThan(arranged["rail:12v"].x);
        expect(arranged["converter:u5-3v3"].x).toBeLessThan(arranged["load:u1-3v3"].x);
    });

    it("refuses an edge that means nothing and parts without pads on the rail", () => {
        const b = board();
        let { state } = addElement(blank(), b, "rail", { net: "+12V" });
        ({ state } = addElement(state, b, "load", { component: "U1" }));
        expect(() => connect(state, b, "load:new-load", "source:x")).toThrow();
        ({ state } = connect(state, b, "rail:12v", "load:new-load"));
        expect(state.layout.pending[0]).toMatchObject({ rail: "12v" });
        expect(treeOf(state).elements.find((e) => e.pending)?.needs).toEqual(["pads"]);
    });

    it("removing a rail leaves what it fed pending", () => {
        const b = board();
        let { state } = addElement(blank(), b, "rail", { net: "+3V3" });
        ({ state } = addElement(state, b, "load", { component: "U1", rail: "3v3", values: { current_a: 1 } }));
        state = removeElement(state, "rail:3v3");
        expect(state.setup.rails).toEqual([]);
        expect(state.setup.loads).toEqual([]);
        expect(state.setup.terminals).toEqual([]);
        expect(state.layout.pending).toEqual([{ id: "u1-3v3", kind: "load", component: "U1", rail: undefined, input_rail: undefined, output_rail: undefined, values: { current_a: 1 } }]);
    });

    it("merges an inferred tree without duplicating what is there", () => {
        const b = board();
        let { state } = addElement(blank(), b, "rail", { net: "+3V3" });
        ({ state } = addElement(state, b, "load", { component: "U1", rail: "3v3", values: { current_a: 1 } }));
        const tree: InferredTree = {
            rails: [{ id: "3v3", net: "main:+3V3", voltage_v: 3.3, inferred: true }, { id: "12v", net: "main:+12V", voltage_v: 12, inferred: true }],
            terminals: [{ id: "u1-3v3-t", positive: ["main:U1.1"], reference: [] }, { id: "j1-in", positive: ["main:J1.1"], reference: ["main:J1.2"] }],
            sources: [{ id: "j1-12v", rail: "12v", terminal: "j1-in", component: "main:J1" }],
            loads: [{ id: "u1-3v3", rail: "3v3", terminal: "u1-3v3-t", current_a: 0, distribution: "uniform", component: "main:U1" }],
            converters: [], analysis_rails: ["12v", "3v3"], notes: [],
        };
        const added = mergeInferred(state, tree, "add").setup;
        expect(added.rails.map((r) => r.id)).toEqual(["3v3", "12v"]);
        expect(added.loads).toHaveLength(1);
        expect(added.loads[0].current_a).toBe(1);
        expect(added.sources.map((s) => s.id)).toEqual(["j1-12v"]);
        const replaced = mergeInferred(state, tree, "replace").setup;
        expect(replaced.loads[0].current_a).toBe(0);
        expect(replaced.analyses[0].rails).toEqual(["12v", "3v3"]);
    });

    it("places a picked element filled in, adding the rails it needs", () => {
        const b = board();
        let { state, node } = addPicked(blank(), b, { kind: "converter", component: "U5", input_net: "+12V", output_net: "+3V3", converter_kind: "switching" }, { x: 0, y: 0 });
        expect(node).toBe("converter:u5-3v3");
        expect(state.setup.rails.map((rail) => rail.id)).toEqual(["12v", "3v3"]);
        expect(state.layout.positions["rail:12v"]).toEqual({ x: -300, y: 0 });
        ({ state, node } = addPicked(state, b, { kind: "load", component: "U1", rail_net: "+3V3" }));
        expect(node).toBe("load:u1-3v3");
        expect(state.setup.rails).toHaveLength(2);
        // A rail already on the canvas is not added again; picking it selects it.
        expect(addPicked(state, b, { kind: "rail", net: "+3V3" }).node).toBe("rail:3v3");
    });
});

const CANDIDATES: Candidates = {
    rails: [
        { net: "+12V", voltage_v: 12, pads: 3, fed_by: [], reason: "Voltage in the net name" },
        { net: "+3V3", voltage_v: 3.3, pads: 3, fed_by: ["U5"], reason: "Voltage in the net name; fed by U5" },
    ],
    converters: [{ component: "U5", value: "TPS54338", library_ref: "", input_net: "+12V", output_net: "+3V3", kind: "switching", reason: "Through an inductor to +3V3" }],
    sources: [{ component: "J1", value: "CONN", library_ref: "", net: "+12V", pads: 1, fed: false, reason: "Feeds +12V; no converter does" }],
    loads: [{ component: "U1", value: "MCU", library_ref: "", net: "+3V3", pads: 2, power_in: 2, connector: false, reason: "2 power-input pads on +3V3" }],
};

describe("pick lists", () => {
    it("offer each kind's candidates first, then every part, marking what the canvas has", () => {
        const b = board();
        const loads = pickItems("load", CANDIDATES, b, blank().setup);
        expect(loads.map((item) => [item.title, item.group])).toEqual([
            ["U1", "Loads"], ["J1", "All parts"], ["U5", "All parts"], ["L1", "All parts"],
        ]);
        expect(loads[0].pick).toEqual({ kind: "load", component: "U1", rail_net: "+3V3" });

        const { state } = addPicked(blank(), b, { kind: "load", component: "U1", rail_net: "+3V3" });
        expect(pickItems("load", CANDIDATES, b, state.setup)[0].inTree).toBe(true);
        expect(pickItems("rail", CANDIDATES, b, state.setup, {}, false).map((item) => [item.title, item.inTree])).toEqual([["+12V", false], ["+3V3", true]]);
    });

    it("from a converter's output, the rails it feeds lead", () => {
        const rails = pickItems("rail", CANDIDATES, board(), blank().setup, { from: { kind: "converter", component: "U5" } }, false);
        expect(rails.map((item) => [item.title, item.group])).toEqual([["+3V3", "Fed by U5"], ["+12V", "Power nets"]]);
    });
});
