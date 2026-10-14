import type { SimSetup } from "../types";

import { type BoardIndex, isGround, netLeaf, railVoltage } from "./board-index";
import type { ElementKind } from "./power-tree-model";

/**
 * What the canvas offers for each kind of element, from the backend's
 * power-tree rules (`power_tree.candidates`): the same reading of pin types,
 * names and series parts as Infer, as lists to pick from. References and nets
 * are plain (`U3`, `+3V3`), as the board index has them.
 */
export interface RailCandidate {
    net: string;
    voltage_v: number | null;
    pads: number;
    fed_by: string[];
    reason: string;
}

interface PartCandidate {
    component: string;
    value: string;
    library_ref: string;
    reason: string;
}

export interface ConverterCandidate extends PartCandidate {
    input_net: string | null;
    output_net: string | null;
    kind: "switching" | "linear" | null;
}

export interface SourceCandidate extends PartCandidate {
    net: string;
    pads: number;
    fed: boolean;
}

export interface LoadCandidate extends PartCandidate {
    net: string;
    pads: number;
    power_in: number;
    connector: boolean;
}

export interface Candidates {
    rails: RailCandidate[];
    converters: ConverterCandidate[];
    sources: SourceCandidate[];
    loads: LoadCandidate[];
}

export const NO_CANDIDATES: Candidates = { rails: [], converters: [], sources: [], loads: [] };

/** What picking a row puts on the canvas: a kind and its part, net and rails (as nets). */
export interface Pick {
    kind: ElementKind;
    component?: string;
    net?: string;
    voltage_v?: number;
    /** Load and source: the rail's net. Converter: its input and output nets. */
    rail_net?: string;
    input_net?: string;
    output_net?: string;
    converter_kind?: "switching" | "linear";
}

/** One row of a pick list. */
export interface PickItem {
    key: string;
    title: string;
    meta?: string;
    reason?: string;
    group: string;
    /** Already on the canvas: still offered, marked. */
    inTree?: boolean;
    pick: Pick;
}

/** Where the list is opened from: a rail (its consumers), or an output (rails it can feed). */
export interface PickContext {
    /** A rail's net: loads and converters on it come first. */
    rail?: string;
    /** Rails to offer to an output: a converter's own output nets lead. */
    from?: { kind: "source" | "converter"; component?: string };
}

const railNet = (setup: SimSetup, id?: string) => {
    const net = setup.rails.find((rail) => rail.id === id)?.net;
    return net ? net.slice(net.indexOf(":") + 1) : undefined;
};
const refOf = (component?: string) => (component ? component.slice(component.indexOf(":") + 1) : undefined);

/** What is on the canvas already: parts per kind, and the rails' nets. */
function onCanvas(setup: SimSetup) {
    return {
        rails: new Set(setup.rails.map((rail) => railNet(setup, rail.id))),
        sources: new Set(setup.sources.filter((s) => !setup.converters.some((c) => c.output_source === s.id)).map((s) => `${refOf(s.component)}@${railNet(setup, s.rail)}`)),
        converters: new Set(setup.converters.map((c) => refOf(c.component))),
        loads: new Set(setup.loads.map((l) => `${refOf(l.component)}@${railNet(setup, l.rail)}`)),
    };
}

const volts = (value: number | null | undefined) => (value ? `${value} V` : "");

/**
 * The rows for adding or filling an element of `kind`: the board's
 * candidates, best first, then (when `all`) every other part or net under
 * "All parts" / "All nets", so nothing is out of reach.
 */
export function pickItems(kind: ElementKind, candidates: Candidates, board: BoardIndex | null, setup: SimSetup, context: PickContext = {}, all = true): PickItem[] {
    const canvas = onCanvas(setup);
    const items: PickItem[] = [];
    const offered = new Set<string>();
    const part = (ref: string) => board?.parts.get(ref)?.value ?? "";

    if (kind === "rail") {
        const fedByMine = new Set(context.from?.kind === "converter" ? candidates.converters.filter((c) => c.component === context.from?.component).map((c) => c.output_net) : []);
        const rows = [...candidates.rails].sort((a, b) => Number(fedByMine.has(b.net)) - Number(fedByMine.has(a.net)));
        for (const rail of rows) {
            offered.add(rail.net);
            items.push({
                key: `rail:${rail.net}`, title: netLeaf(rail.net), meta: [volts(rail.voltage_v), `${rail.pads} pads`].filter(Boolean).join(" · "),
                reason: rail.reason, group: fedByMine.has(rail.net) ? `Fed by ${context.from?.component}` : "Power nets", inTree: canvas.rails.has(rail.net),
                pick: { kind: "rail", net: rail.net, ...(rail.voltage_v ? { voltage_v: rail.voltage_v } : {}) },
            });
        }
        if (all) {
            for (const net of board?.nets ?? []) {
                if (offered.has(net) || isGround(net)) continue;
                items.push({ key: `rail:${net}`, title: netLeaf(net), meta: volts(railVoltage(net)), group: "All nets", inTree: canvas.rails.has(net), pick: { kind: "rail", net } });
            }
        }
        return items;
    }

    if (kind === "converter") {
        const rows = context.rail
            ? [...candidates.converters].sort((a, b) => Number(b.input_net === context.rail) - Number(a.input_net === context.rail))
            : candidates.converters;
        for (const conv of rows) {
            offered.add(conv.component);
            const rails = conv.input_net || conv.output_net ? `${netLeaf(conv.input_net ?? "?")} → ${netLeaf(conv.output_net ?? "?")}` : "rails unknown";
            items.push({
                key: `converter:${conv.component}:${conv.output_net ?? ""}`, title: conv.component, meta: `${conv.value} · ${rails}`, reason: conv.reason,
                group: context.rail && conv.input_net === context.rail ? `From ${netLeaf(context.rail)}` : conv.kind ? "Regulators" : "Regulator-like, rails to set",
                inTree: canvas.converters.has(conv.component),
                pick: {
                    kind: "converter", component: conv.component, input_net: conv.input_net ?? context.rail, output_net: conv.output_net ?? undefined,
                    ...(conv.kind ? { converter_kind: conv.kind } : {}),
                },
            });
        }
    } else if (kind === "source") {
        for (const source of candidates.sources) {
            offered.add(source.component);
            items.push({
                key: `source:${source.component}:${source.net}`, title: source.component, meta: `${source.value} · ${netLeaf(source.net)}`, reason: source.reason,
                group: source.fed ? "On rails something else feeds" : "Feeds a rail nothing else does",
                inTree: canvas.sources.has(`${source.component}@${source.net}`),
                pick: { kind: "source", component: source.component, rail_net: source.net },
            });
        }
    } else {
        const rows = context.rail
            ? [...candidates.loads].sort((a, b) => Number(b.net === context.rail) - Number(a.net === context.rail))
            : candidates.loads;
        for (const load of rows) {
            offered.add(load.component);
            items.push({
                key: `load:${load.component}:${load.net}`, title: load.component, meta: `${load.value} · ${netLeaf(load.net)}`, reason: load.reason,
                group: context.rail && load.net === context.rail ? `On ${netLeaf(context.rail)}` : load.connector ? "Connectors drawing from a rail" : "Loads",
                inTree: canvas.loads.has(`${load.component}@${load.net}`),
                pick: { kind: "load", component: load.component, rail_net: load.net },
            });
        }
    }
    if (all) {
        for (const ref of board?.parts.keys() ?? []) {
            if (offered.has(ref)) continue;
            items.push({ key: `${kind}:${ref}`, title: ref, meta: part(ref), group: "All parts", pick: { kind, component: ref, ...(context.rail && kind !== "converter" ? { rail_net: context.rail } : {}) } });
        }
    }
    return items;
}

/** A part field's rows for an element already on the canvas: its kind's candidates, those on its rails first. */
export function partItems(kind: ElementKind, candidates: Candidates, board: BoardIndex | null, setup: SimSetup, element: { rail?: string; input_rail?: string }): PickItem[] {
    const rail = kind === "converter" ? railNet(setup, element.input_rail) : railNet(setup, element.rail);
    return pickItems(kind, candidates, board, setup, rail ? { rail } : {});
}
