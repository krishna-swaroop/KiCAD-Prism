import type { PrismSemanticIndex } from "@/types/prism-selection";

/**
 * What the power-tree canvas needs from the board: which pads a part has on a
 * net, its ground pads, and the nets and parts to pick from. Built from the
 * project's semantic index; setup references are `main:REF.PAD` and
 * `main:NET` (board id `main`, as in backend `board_facts.py`).
 */

export const BOARD_ID = "main";

// Mirrors backend `drafting.py`: ground names, and a voltage stated in a net name.
const GROUND = /^(?:A|D|P|S)?GND|^VSS|^0V$/i;
const CONTROL = /^(?:LX|SW|PG|PGOOD|EN|FB|SENSE|SNS|BST|BOOT|SS|COMP|ILIM|VSEL)(?:[_-]|$)/i;
const VOLTS = /(?:^|[^0-9.])(\d{1,2})(?:V(\d{1,3})|\.(\d{1,3})V|V)(?=$|[_\-/.])/gi;
const SERIES = /^(?:L|FB)\d/i;

export interface BoardPart {
    reference: string;
    value: string;
    libraryRef: string;
    description: string;
}

export interface BoardPad {
    reference: string;
    pin: string;
    pinName: string;
    pinType: string;
    net: string;
}

export function netLeaf(net: string): string {
    return net.split("/").pop() ?? net;
}

export function isGround(net: string): boolean {
    return GROUND.test(netLeaf(net));
}

/** The supply voltage a net's name states, if it states exactly one. */
export function railVoltage(net: string): number | null {
    const leaf = netLeaf(net);
    if (GROUND.test(leaf) || CONTROL.test(leaf)) return null;
    const found = new Set<number>();
    for (const match of net.matchAll(VOLTS)) {
        found.add(Number.parseFloat(`${match[1]}.${match[2] ?? match[3] ?? 0}`));
    }
    if (found.size !== 1) return null;
    const volts = [...found][0];
    return volts > 0 && volts <= 60 ? volts : null;
}

export class BoardIndex {
    readonly parts = new Map<string, BoardPart>();
    readonly nets: string[];
    private readonly padsByRef = new Map<string, BoardPad[]>();
    private readonly padsByNet = new Map<string, BoardPad[]>();

    constructor(index: PrismSemanticIndex | null) {
        for (const component of index?.components ?? []) {
            if (!component.reference || !component.pcbRefs?.length) continue;
            this.parts.set(component.reference, {
                reference: component.reference,
                value: component.value ?? "",
                libraryRef: component.libraryRef ?? "",
                description: String(component.fields?.Description ?? ""),
            });
        }
        for (const terminal of index?.terminals ?? []) {
            if (!terminal.reference || !terminal.pin || !terminal.pcbPadUuid) continue;
            const pad: BoardPad = {
                reference: terminal.reference,
                pin: terminal.pin,
                pinName: terminal.pinName ?? "",
                pinType: (terminal.pinType ?? "").toUpperCase(),
                net: terminal.netName ?? "",
            };
            push(this.padsByRef, pad.reference, pad);
            if (pad.net) push(this.padsByNet, pad.net, pad);
        }
        this.nets = [...this.padsByNet.keys()].sort(compareNatural);
    }

    get empty(): boolean {
        return this.padsByRef.size === 0;
    }

    netRef(net: string): string {
        return `${BOARD_ID}:${net}`;
    }

    pinRef(pad: Pick<BoardPad, "reference" | "pin">): string {
        return `${BOARD_ID}:${pad.reference}.${pad.pin}`;
    }

    padsOf(reference: string): BoardPad[] {
        return this.padsByRef.get(reference) ?? [];
    }

    padsOn(net: string): BoardPad[] {
        return this.padsByNet.get(net) ?? [];
    }

    /** A part's pads on a net, as setup pin references. */
    pinsOn(reference: string, net: string): string[] {
        return this.padsOf(reference).filter((pad) => pad.net === net).map((pad) => this.pinRef(pad));
    }

    groundPins(reference: string): string[] {
        return this.padsOf(reference).filter((pad) => isGround(pad.net)).map((pad) => this.pinRef(pad));
    }

    /** Non-ground nets a part touches, most pads first. */
    netsOf(reference: string): string[] {
        const counts = new Map<string, number>();
        for (const pad of this.padsOf(reference)) {
            if (pad.net && !isGround(pad.net)) counts.set(pad.net, (counts.get(pad.net) ?? 0) + 1);
        }
        return [...counts].sort((a, b) => b[1] - a[1] || compareNatural(a[0], b[0])).map(([net]) => net);
    }

    /** Parts with pads on a net, connectors and ICs first. */
    partsOn(net: string): string[] {
        return [...new Set(this.padsOn(net).map((pad) => pad.reference))].sort(compareNatural);
    }

    /**
     * Where a regulator's output meets a rail: its own pads on the rail, else
     * the rail-side pad of a two-pad inductor or ferrite its pins reach.
     */
    outputPins(reference: string, net: string): string[] {
        const direct = this.pinsOn(reference, net);
        if (direct.length) return direct;
        const own = new Set(this.padsOf(reference).map((pad) => pad.net));
        for (const pad of this.padsOn(net)) {
            if (!SERIES.test(pad.reference)) continue;
            const pads = this.padsOf(pad.reference);
            if (pads.length === 2 && pads.some((other) => other.net !== net && own.has(other.net))) return [this.pinRef(pad)];
        }
        return [];
    }
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
}

export function compareNatural(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
