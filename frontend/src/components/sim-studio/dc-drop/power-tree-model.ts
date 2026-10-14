import type { Converter, Load, Rail, SimSetup, Source, Terminal } from "../types";

import { BOARD_ID, type BoardIndex, compareNatural, netLeaf, railVoltage } from "./board-index";

/**
 * The power tree on the setup canvas, and every edit it allows, as pure
 * functions over (setup, layout). The canvas and `window.prismSimStudio` both
 * go through these, so a script can build exactly what a click builds.
 *
 * Complete elements live in the setup document (rails, sources, converters,
 * loads and their terminals). An element that is still missing its part, net
 * or rail cannot be written there, so it waits in the layout as `pending`
 * and moves into the setup as soon as it is complete.
 */

export type ElementKind = "source" | "rail" | "converter" | "load";
export const ELEMENT_KINDS: readonly ElementKind[] = ["source", "rail", "converter", "load"];

export interface ElementValues {
    voltage_v?: number;
    tolerance_pct?: number;
    current_a?: number;
    converter_kind?: "switching" | "linear";
    efficiency?: number;
    quiescent_current_a?: number;
}

/** What a user sets on an element; rails are named by rail id. */
export interface ElementPatch {
    component?: string;
    net?: string;
    rail?: string;
    input_rail?: string;
    output_rail?: string;
    values?: ElementValues;
}

export interface PendingElement extends ElementPatch {
    id: string;
    kind: ElementKind;
}

export interface Point {
    x: number;
    y: number;
}

export interface InferenceNote {
    severity: "warning" | "error";
    code: string;
    message: string;
    refs: string[];
}

export interface CanvasLayout {
    version: 1;
    positions: Record<string, Point>;
    pending: PendingElement[];
    notes?: InferenceNote[];
}

export interface TreeState {
    setup: SimSetup;
    layout: CanvasLayout;
}

export type Need = "component" | "net" | "voltage" | "rail" | "input" | "output" | "current" | "efficiency" | "pads";

export interface TreeElement {
    /** `kind:id`, the canvas node id. */
    node: string;
    kind: ElementKind;
    id: string;
    pending: boolean;
    /** Refdes for parts, net for rails. */
    component?: string;
    net?: string;
    rail?: string;
    input_rail?: string;
    output_rail?: string;
    values: ElementValues;
    needs: Need[];
    /** Pads the element's terminal uses (supply side). */
    pins: string[];
    /** Rail in the analysis's solved set. */
    solved?: boolean;
    inferred?: boolean;
}

export interface TreeEdge {
    id: string;
    source: string;
    target: string;
}

export interface InferredTree {
    rails: Rail[];
    terminals: Terminal[];
    sources: Source[];
    loads: Load[];
    converters: Converter[];
    analysis_rails: string[];
    notes: InferenceNote[];
}

export const emptyLayout = (): CanvasLayout => ({ version: 1, positions: {}, pending: [] });

export function asLayout(value: unknown): CanvasLayout {
    const raw = (value ?? {}) as Partial<CanvasLayout>;
    return {
        version: 1,
        positions: raw.positions && typeof raw.positions === "object" ? raw.positions : {},
        pending: Array.isArray(raw.pending) ? raw.pending : [],
        ...(Array.isArray(raw.notes) ? { notes: raw.notes } : {}),
    };
}

export const nodeId = (kind: ElementKind, id: string) => `${kind}:${id}`;

export function parseNode(node: string): { kind: ElementKind; id: string } {
    const index = node.indexOf(":");
    const kind = node.slice(0, index) as ElementKind;
    if (index < 1 || !ELEMENT_KINDS.includes(kind)) throw new Error(`Not a power-tree element: ${node}`);
    return { kind, id: node.slice(index + 1) };
}

const refOf = (component?: string) => (component ? component.slice(component.indexOf(":") + 1) : undefined);
const netOf = (net: string) => net.slice(net.indexOf(":") + 1);
const clone = <T>(value: T): T => structuredClone(value);

export function slug(text: string, taken: Iterable<string>): string {
    const used = new Set(taken);
    const base = (text.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-._]+|[-._]+$/g, "") || "item").slice(0, 72);
    let candidate = base;
    for (let counter = 2; used.has(candidate); counter += 1) candidate = `${base}-${counter}`;
    return candidate;
}

function analysis(setup: SimSetup) {
    if (!setup.analyses.length) setup.analyses.push({ id: "dc", kind: "dc-drop", rails: [] });
    return setup.analyses[0];
}

// --- reading -------------------------------------------------------------------

export function treeOf({ setup, layout }: TreeState): { elements: TreeElement[]; edges: TreeEdge[] } {
    const elements: TreeElement[] = [];
    const terminal = (id: string) => setup.terminals.find((item) => item.id === id);
    const solved = new Set(setup.analyses[0]?.rails ?? []);
    const outputs = new Set(setup.converters.map((item) => item.output_source));

    for (const rail of setup.rails) {
        elements.push({
            node: nodeId("rail", rail.id), kind: "rail", id: rail.id, pending: false,
            net: netOf(rail.net), values: { voltage_v: rail.voltage_v, tolerance_pct: rail.tolerance_pct },
            needs: [], pins: [], solved: solved.has(rail.id), inferred: rail.inferred,
        });
    }
    for (const source of setup.sources) {
        if (outputs.has(source.id)) continue;
        elements.push({
            node: nodeId("source", source.id), kind: "source", id: source.id, pending: false,
            component: refOf(source.component), rail: source.rail, values: {},
            needs: [], pins: terminal(source.terminal)?.positive ?? [],
        });
    }
    for (const converter of setup.converters) {
        const output = setup.sources.find((item) => item.id === converter.output_source);
        const kind = converter.kind ?? "switching";
        elements.push({
            node: nodeId("converter", converter.id), kind: "converter", id: converter.id, pending: false,
            component: refOf(converter.component), input_rail: converter.input_rail, output_rail: output?.rail,
            values: { converter_kind: kind, efficiency: converter.efficiency, quiescent_current_a: converter.quiescent_current_a },
            needs: kind === "switching" && converter.efficiency === undefined ? ["efficiency"] : [],
            pins: terminal(converter.input_terminal)?.positive ?? [],
        });
    }
    for (const load of setup.loads) {
        elements.push({
            node: nodeId("load", load.id), kind: "load", id: load.id, pending: false,
            component: refOf(load.component), rail: load.rail, values: { current_a: load.current_a },
            needs: load.current_a > 0 ? [] : ["current"], pins: terminal(load.terminal)?.positive ?? [],
        });
    }
    for (const item of layout.pending) {
        elements.push({
            node: nodeId(item.kind, item.id), kind: item.kind, id: item.id, pending: true,
            component: item.component, net: item.net, rail: item.rail,
            input_rail: item.input_rail, output_rail: item.output_rail, values: { ...item.values },
            needs: pendingNeeds(item), pins: [],
        });
    }

    const edges: TreeEdge[] = [];
    const rails = new Set(setup.rails.map((rail) => rail.id));
    const link = (source: string, target: string) => edges.push({ id: `${source}->${target}`, source, target });
    for (const element of elements) {
        if ((element.kind === "source") && element.rail && rails.has(element.rail)) link(element.node, nodeId("rail", element.rail));
        if (element.kind === "load" && element.rail && rails.has(element.rail)) link(nodeId("rail", element.rail), element.node);
        if (element.kind === "converter") {
            if (element.input_rail && rails.has(element.input_rail)) link(nodeId("rail", element.input_rail), element.node);
            if (element.output_rail && rails.has(element.output_rail)) link(element.node, nodeId("rail", element.output_rail));
        }
    }
    return { elements, edges };
}

function pendingNeeds(item: PendingElement): Need[] {
    const needs: Need[] = [];
    if (item.kind === "rail") {
        if (!item.net) needs.push("net");
        if (!(item.values?.voltage_v && item.values.voltage_v > 0) && !(item.net && railVoltage(item.net))) needs.push("voltage");
        return needs;
    }
    if (!item.component) needs.push("component");
    if (item.kind === "converter") {
        if (!item.input_rail) needs.push("input");
        if (!item.output_rail) needs.push("output");
    } else if (!item.rail) {
        needs.push("rail");
    }
    if (needs.length === 0) needs.push("pads");
    return needs;
}

export const NEED_LABELS: Record<Need, string> = {
    component: "Assign a part",
    net: "Assign a net",
    voltage: "Set the voltage",
    rail: "Connect a rail",
    input: "Connect the input rail",
    output: "Connect the output rail",
    current: "Set the current",
    efficiency: "Set the efficiency",
    pads: "The part has no pads on that rail",
};

// --- editing -------------------------------------------------------------------

export function addElement(
    state: TreeState, board: BoardIndex, kind: ElementKind, init: ElementPatch = {}, position?: Point,
): { state: TreeState; node: string } {
    const next = clone(state);
    const taken = [...next.layout.pending.map((item) => item.id), ...idsOf(next.setup, kind)];
    const id = slug(`new-${kind}`, taken);
    next.layout.pending.push({ id, kind, ...clone(init), values: { ...init.values } });
    if (position) next.layout.positions[nodeId(kind, id)] = position;
    return settle(next, board, nodeId(kind, id));
}

/** Change an element's part, net, rails or values; the result may move it into the setup. */
export function updateElement(state: TreeState, board: BoardIndex, node: string, patch: ElementPatch): { state: TreeState; node: string } {
    const next = clone(state);
    const { kind, id } = parseNode(node);
    const pending = next.layout.pending.find((item) => item.kind === kind && item.id === id);
    if (pending) {
        Object.assign(pending, { ...patch, values: { ...pending.values, ...patch.values } });
        return settle(next, board, node);
    }
    const setup = next.setup;
    if (kind === "rail") {
        const rail = must(setup.rails.find((item) => item.id === id), node);
        if (patch.net !== undefined) rail.net = board.netRef(patch.net);
        if (patch.values?.voltage_v !== undefined) {
            if (!(patch.values.voltage_v > 0)) throw new Error("A rail's voltage must be above 0 V.");
            rail.voltage_v = patch.values.voltage_v;
            delete rail.inferred;
        }
        if (patch.values && "tolerance_pct" in patch.values) setOptional(rail, "tolerance_pct", patch.values.tolerance_pct);
    } else if (kind === "source") {
        const source = must(setup.sources.find((item) => item.id === id), node);
        const component = patch.component ?? refOf(source.component);
        const rail = patch.rail ?? source.rail;
        if (patch.component !== undefined || patch.rail !== undefined) {
            setTerminal(setup, source.terminal, pinsFor(board, setup, must(component, node), rail, "supply"), board.groundPins(component!));
            source.rail = rail;
            source.component = `${BOARD_ID}:${component}`;
        }
    } else if (kind === "load") {
        const load = must(setup.loads.find((item) => item.id === id), node);
        const component = patch.component ?? refOf(load.component);
        const rail = patch.rail ?? load.rail;
        if (patch.component !== undefined || patch.rail !== undefined) {
            setTerminal(setup, load.terminal, pinsFor(board, setup, must(component, node), rail, "supply"), board.groundPins(component!));
            load.rail = rail;
            load.component = `${BOARD_ID}:${component}`;
        }
        if (patch.values?.current_a !== undefined) {
            if (!(patch.values.current_a >= 0)) throw new Error("A load's current cannot be negative.");
            load.current_a = patch.values.current_a;
        }
    } else {
        const converter = must(setup.converters.find((item) => item.id === id), node);
        const output = must(setup.sources.find((item) => item.id === converter.output_source), node);
        const component = must(patch.component ?? refOf(converter.component), node);
        const inputRail = patch.input_rail ?? converter.input_rail;
        const outputRail = patch.output_rail ?? output.rail;
        if (patch.component !== undefined || patch.input_rail !== undefined || patch.output_rail !== undefined) {
            const ground = board.groundPins(component);
            setTerminal(setup, converter.input_terminal, pinsFor(board, setup, component, inputRail, "supply"), ground);
            setTerminal(setup, output.terminal, pinsFor(board, setup, component, outputRail, "output"), ground);
            converter.component = output.component = `${BOARD_ID}:${component}`;
            converter.input_rail = inputRail;
            output.rail = outputRail;
        }
        applyConverterValues(converter, patch.values);
    }
    return { state: next, node };
}

/** Draw an edge: source→rail, rail→converter (its input), converter→rail (its output), rail→load. */
export function connect(state: TreeState, board: BoardIndex, from: string, to: string): { state: TreeState; node: string } {
    const a = parseNode(from);
    const b = parseNode(to);
    if (a.kind === "source" && b.kind === "rail") return updateElement(state, board, from, { rail: committedRail(state, b.id) });
    if (a.kind === "rail" && b.kind === "converter") return updateElement(state, board, to, { input_rail: committedRail(state, a.id) });
    if (a.kind === "converter" && b.kind === "rail") return updateElement(state, board, from, { output_rail: committedRail(state, b.id) });
    if (a.kind === "rail" && b.kind === "load") return updateElement(state, board, to, { rail: committedRail(state, a.id) });
    if (b.kind === "rail" && (a.kind === "load" || a.kind === "converter")) return connect(state, board, to, from);
    throw new Error(`A ${a.kind} cannot feed a ${b.kind}.`);
}

function committedRail(state: TreeState, id: string): string {
    if (!state.setup.rails.some((rail) => rail.id === id)) throw new Error("Give the rail a net and voltage before connecting it.");
    return id;
}

/** Remove an element; anything that hung off a removed rail waits as pending, unconnected. */
export function removeElement(state: TreeState, node: string): TreeState {
    const next = clone(state);
    const { kind, id } = parseNode(node);
    const setup = next.setup;
    delete next.layout.positions[node];
    const before = next.layout.pending.length;
    next.layout.pending = next.layout.pending.filter((item) => !(item.kind === kind && item.id === id));
    if (next.layout.pending.length !== before) return next;

    const dropTerminals = (...ids: string[]) => {
        const used = new Set([
            ...setup.sources.map((s) => s.terminal), ...setup.loads.map((l) => l.terminal),
            ...setup.converters.map((c) => c.input_terminal), ...setup.probes.map((p) => p.terminal),
        ]);
        setup.terminals = setup.terminals.filter((t) => !ids.includes(t.id) || used.has(t.id));
    };
    if (kind === "rail") {
        for (const element of treeOf(next).elements) {
            if (element.pending) continue;
            const touches = element.rail === id || element.input_rail === id || element.output_rail === id;
            if (!touches || element.kind === "rail") continue;
            demote(next, element, id);
        }
        // demote() replaced next.setup; edit the current one.
        next.setup.rails = next.setup.rails.filter((rail) => rail.id !== id);
        for (const item of next.setup.analyses) item.rails = item.rails.filter((rail) => rail !== id);
    } else if (kind === "source") {
        const source = must(setup.sources.find((item) => item.id === id), node);
        setup.sources = setup.sources.filter((item) => item.id !== id);
        dropTerminals(source.terminal);
    } else if (kind === "load") {
        const load = must(setup.loads.find((item) => item.id === id), node);
        setup.loads = setup.loads.filter((item) => item.id !== id);
        dropTerminals(load.terminal);
    } else {
        const converter = must(setup.converters.find((item) => item.id === id), node);
        const output = setup.sources.find((item) => item.id === converter.output_source);
        setup.converters = setup.converters.filter((item) => item.id !== id);
        setup.sources = setup.sources.filter((item) => item.id !== converter.output_source);
        dropTerminals(converter.input_terminal, ...(output ? [output.terminal] : []));
    }
    return next;
}

/** Move a committed element back to pending, without the given rail. */
function demote(state: TreeState, element: TreeElement, rail: string) {
    const position = state.layout.positions[element.node];
    const removed = removeElement(state, element.node);
    state.setup = removed.setup;
    state.layout.pending = removed.layout.pending;
    const clear = (value?: string) => (value === rail ? undefined : value);
    const pendingIds = [...state.layout.pending.map((item) => item.id), ...idsOf(state.setup, element.kind)];
    const id = pendingIds.includes(element.id) ? slug(element.id, pendingIds) : element.id;
    state.layout.pending.push({
        id, kind: element.kind, component: element.component,
        rail: clear(element.rail), input_rail: clear(element.input_rail), output_rail: clear(element.output_rail),
        values: element.values,
    });
    delete state.layout.positions[element.node];
    if (position) state.layout.positions[nodeId(element.kind, id)] = position;
}

/** Include or leave out a rail from the analysis. */
export function setSolved(state: TreeState, railId: string, solved: boolean): TreeState {
    const next = clone(state);
    const target = analysis(next.setup);
    target.rails = solved
        ? [...new Set([...target.rails, railId])]
        : target.rails.filter((rail) => rail !== railId);
    return next;
}

/** Turn every complete pending element into setup entries. */
function settle(state: TreeState, board: BoardIndex, focus: string): { state: TreeState; node: string } {
    let node = focus;
    for (const kind of ELEMENT_KINDS) {
        for (const item of [...state.layout.pending.filter((entry) => entry.kind === kind)]) {
            const committed = commit(state, board, item);
            if (!committed) continue;
            state.layout.pending = state.layout.pending.filter((entry) => entry !== item);
            const from = nodeId(item.kind, item.id);
            const to = nodeId(item.kind, committed);
            if (state.layout.positions[from]) {
                state.layout.positions[to] = state.layout.positions[from];
                if (from !== to) delete state.layout.positions[from];
            }
            if (from === focus) node = to;
        }
    }
    return { state, node };
}

function commit(state: TreeState, board: BoardIndex, item: PendingElement): string | null {
    const setup = state.setup;
    const values = item.values ?? {};
    if (item.kind === "rail") {
        const voltage = values.voltage_v ?? (item.net ? railVoltage(item.net) : null);
        if (!item.net || !voltage) return null;
        if (setup.rails.some((rail) => netOf(rail.net) === item.net)) throw new Error(`${item.net} is already a rail.`);
        const id = slug(netLeaf(item.net).replace(/^\+/, ""), setup.rails.map((rail) => rail.id));
        const rail: Rail = { id, net: board.netRef(item.net), voltage_v: voltage };
        if (values.tolerance_pct !== undefined) rail.tolerance_pct = values.tolerance_pct;
        setup.rails.push(rail);
        analysis(setup).rails.push(id);
        return id;
    }
    if (!item.component) return null;
    const ground = board.groundPins(item.component);
    if (item.kind === "converter") {
        if (!item.input_rail || !item.output_rail) return null;
        const input = pinsFor(board, setup, item.component, item.input_rail, "supply", false);
        const output = pinsFor(board, setup, item.component, item.output_rail, "output", false);
        if (!input.length || !output.length) return null;
        const id = slug(`${item.component}-${item.output_rail}`, setup.converters.map((c) => c.id));
        const sourceId = slug(`${id}-out`, setup.sources.map((s) => s.id));
        const component = `${BOARD_ID}:${item.component}`;
        const inTerminal = addTerminal(setup, `${id}-in`, input, ground);
        const outTerminal = addTerminal(setup, `${id}-out`, output, ground);
        setup.sources.push({ id: sourceId, rail: item.output_rail, terminal: outTerminal, component });
        const converter: Converter = {
            id, component, input_rail: item.input_rail, input_terminal: inTerminal, output_source: sourceId,
            kind: values.converter_kind ?? "switching",
        };
        applyConverterValues(converter, values);
        setup.converters.push(converter);
        return id;
    }
    if (!item.rail) return null;
    const pins = pinsFor(board, setup, item.component, item.rail, "supply", false);
    if (!pins.length) return null;
    const component = `${BOARD_ID}:${item.component}`;
    if (item.kind === "source") {
        const id = slug(`${item.component}-${item.rail}`, setup.sources.map((s) => s.id));
        setup.sources.push({ id, rail: item.rail, terminal: addTerminal(setup, `${id}-in`, pins, ground), component });
        return id;
    }
    const id = slug(`${item.component}-${item.rail}`, setup.loads.map((l) => l.id));
    setup.loads.push({
        id, rail: item.rail, terminal: addTerminal(setup, `${id}-t`, pins, ground),
        current_a: values.current_a ?? 0, distribution: "uniform", component,
    });
    return id;
}

function applyConverterValues(converter: Converter, values?: ElementValues) {
    if (!values) return;
    if (values.converter_kind) converter.kind = values.converter_kind;
    if ("efficiency" in values) {
        const efficiency = values.efficiency;
        if (efficiency !== undefined && !(efficiency > 0 && efficiency <= 1)) throw new Error("Efficiency is a fraction between 0 and 1.");
        setOptional(converter, "efficiency", efficiency);
    }
    if ("quiescent_current_a" in values) setOptional(converter, "quiescent_current_a", values.quiescent_current_a);
    if (converter.kind === "linear") delete converter.efficiency;
}

function pinsFor(
    board: BoardIndex, setup: SimSetup, component: string, railId: string, side: "supply" | "output", strict = true,
): string[] {
    const rail = setup.rails.find((item) => item.id === railId);
    if (!rail) {
        if (strict) throw new Error(`No rail ${railId}.`);
        return [];
    }
    const net = netOf(rail.net);
    const pins = side === "output" ? board.outputPins(component, net) : board.pinsOn(component, net);
    if (!pins.length && strict) throw new Error(`${component} has no pads on ${net}.`);
    return pins;
}

function addTerminal(setup: SimSetup, name: string, positive: string[], reference: string[]): string {
    const id = slug(name, setup.terminals.map((t) => t.id));
    setup.terminals.push({ id, positive, reference });
    return id;
}

function setTerminal(setup: SimSetup, id: string, positive: string[], reference: string[]) {
    const terminal = must(setup.terminals.find((item) => item.id === id), id);
    terminal.positive = positive;
    terminal.reference = reference;
}

function setOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined) {
    if (value === undefined || value === null) delete target[key];
    else target[key] = value;
}

function idsOf(setup: SimSetup, kind: ElementKind): string[] {
    if (kind === "rail") return setup.rails.map((item) => item.id);
    if (kind === "source") return setup.sources.map((item) => item.id);
    if (kind === "load") return setup.loads.map((item) => item.id);
    return setup.converters.map((item) => item.id);
}

function must<T>(value: T | undefined | null, what: string): T {
    if (value === undefined || value === null) throw new Error(`Nothing called ${what} in this setup.`);
    return value;
}

// --- the inferred tree ------------------------------------------------------------

/**
 * Bring the inferred tree into a setup. `replace` swaps the power tree for it
 * (settings stay); `add` keeps everything and adds what is missing, matching
 * rails by net and parts by (part, rail net).
 */
export function mergeInferred(state: TreeState, tree: InferredTree, mode: "replace" | "add"): TreeState {
    const next = clone(state);
    const setup = next.setup;
    next.layout.notes = tree.notes;
    if (mode === "replace") {
        setup.rails = clone(tree.rails);
        setup.terminals = clone(tree.terminals);
        setup.sources = clone(tree.sources);
        setup.loads = clone(tree.loads);
        setup.converters = clone(tree.converters);
        setup.probes = [];
        analysis(setup).rails = [...tree.analysis_rails];
        next.layout = { version: 1, positions: {}, pending: [], notes: tree.notes };
        return next;
    }

    const railByNet = new Map(setup.rails.map((rail) => [rail.net, rail.id]));
    const railMap = new Map<string, string>();
    for (const rail of tree.rails) {
        const existing = railByNet.get(rail.net);
        if (existing) {
            railMap.set(rail.id, existing);
            continue;
        }
        const id = slug(rail.id, setup.rails.map((item) => item.id));
        railMap.set(rail.id, id);
        setup.rails.push({ ...clone(rail), id });
        if (tree.analysis_rails.includes(rail.id)) analysis(setup).rails.push(id);
    }
    const netOfRail = (id: string) => setup.rails.find((rail) => rail.id === id)?.net;
    const key = (component: string | undefined, rail: string) => `${component ?? ""}@${netOfRail(rail) ?? rail}`;
    const terminalMap = new Map<string, string>();
    const takeTerminal = (id: string) => {
        if (!terminalMap.has(id)) {
            const terminal = must(tree.terminals.find((item) => item.id === id), id);
            terminalMap.set(id, addTerminal(setup, id, [...terminal.positive], [...terminal.reference]));
        }
        return terminalMap.get(id)!;
    };

    const outputs = new Set(tree.converters.map((item) => item.output_source));
    const haveSources = new Set(setup.sources.map((s) => key(s.component, s.rail)));
    for (const source of tree.sources) {
        if (outputs.has(source.id)) continue;
        const rail = railMap.get(source.rail)!;
        if (haveSources.has(key(source.component, rail))) continue;
        setup.sources.push({ ...clone(source), id: slug(source.id, setup.sources.map((s) => s.id)), rail, terminal: takeTerminal(source.terminal) });
    }
    const haveConverters = new Set(setup.converters.map((c) => {
        const output = setup.sources.find((s) => s.id === c.output_source);
        return key(c.component, output?.rail ?? "");
    }));
    for (const converter of tree.converters) {
        const output = must(tree.sources.find((s) => s.id === converter.output_source), converter.output_source);
        const outRail = railMap.get(output.rail)!;
        if (haveConverters.has(key(converter.component, outRail))) continue;
        const sourceId = slug(output.id, setup.sources.map((s) => s.id));
        setup.sources.push({ ...clone(output), id: sourceId, rail: outRail, terminal: takeTerminal(output.terminal) });
        setup.converters.push({
            ...clone(converter), id: slug(converter.id, setup.converters.map((c) => c.id)),
            input_rail: railMap.get(converter.input_rail)!, input_terminal: takeTerminal(converter.input_terminal), output_source: sourceId,
        });
    }
    const haveLoads = new Set(setup.loads.map((l) => key(l.component, l.rail)));
    for (const load of tree.loads) {
        const rail = railMap.get(load.rail)!;
        if (haveLoads.has(key(load.component, rail))) continue;
        setup.loads.push({ ...clone(load), id: slug(load.id, setup.loads.map((l) => l.id)), rail, terminal: takeTerminal(load.terminal) });
    }
    return next;
}

// --- auto-arrange --------------------------------------------------------------

export const NODE_WIDTH = 220;
const COLUMN = 290;
const ROW = 92;

/**
 * Left to right by depth in the tree: sources, their rails, what each rail
 * feeds, the converters' rails, ... Each leaf takes the next row; a parent
 * sits at the middle of its children.
 */
export function autoArrange(state: TreeState): TreeState {
    const { elements, edges } = treeOf(state);
    const children = new Map<string, string[]>();
    const parents = new Map<string, number>();
    for (const edge of edges) {
        children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
        parents.set(edge.target, (parents.get(edge.target) ?? 0) + 1);
    }
    const byNode = new Map(elements.map((element) => [element.node, element]));
    const order = (nodes: string[]) => [...nodes].sort((a, b) => rank(byNode.get(a)!) - rank(byNode.get(b)!) || compareNatural(a, b));
    const positions: Record<string, Point> = {};
    let row = 0;
    const place = (node: string, depth: number): number => {
        if (positions[node]) return positions[node].y;
        positions[node] = { x: depth * COLUMN, y: 0 };
        const below = order(children.get(node) ?? []).filter((child) => !positions[child]);
        if (below.length === 0) {
            positions[node].y = row * ROW;
            row += 1;
            return positions[node].y;
        }
        const ys = below.map((child) => place(child, depth + 1));
        positions[node].y = (Math.min(...ys) + Math.max(...ys)) / 2;
        return positions[node].y;
    };
    const roots = order(elements.filter((element) => !parents.has(element.node) && !element.pending).map((element) => element.node));
    for (const root of roots) place(root, byNode.get(root)!.kind === "rail" ? 1 : 0);
    row += 1;
    for (const element of elements) if (!positions[element.node]) place(element.node, 0);
    return { setup: state.setup, layout: { ...state.layout, positions } };
}

/** Sources first, then by voltage (high first), converters before loads. */
function rank(element: TreeElement): number {
    const order = { source: 0, rail: 1, converter: 2, load: 3 }[element.kind];
    return order * 1000 - (element.values.voltage_v ?? 0);
}
