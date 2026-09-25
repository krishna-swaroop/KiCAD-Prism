import type { PrismSelection, PrismSemanticIndex, SemanticNet } from "@/types/prism-selection";
import type { EcadNetRef } from "@/types/ecad-viewer";

/**
 * A net in the review's highlight collection. `netName` is the board net
 * name and the identity; the rest are hints for the viewers.
 */
export interface HighlightedNet {
    netName: string;
    netUid?: string;
    netCode?: number;
    /** Copper uuids from the semantic index, for viewers to resolve by. */
    pcbUuids?: string[];
}

export const sameHighlightedNet = (a: HighlightedNet, b: HighlightedNet): boolean =>
    a.netName === b.netName || (Boolean(a.netUid) && a.netUid === b.netUid);

/**
 * The display name KiCad uses for a hierarchical net: the leaf after the
 * last slash. Callers put the full name on a title for disambiguation.
 */
export const netLeafName = (name: string): string => {
    const slash = name.lastIndexOf("/");
    return slash >= 0 ? name.slice(slash + 1) : name;
};

/** The net a selection stands for: the net itself, or a terminal's net. */
export function netFromSelection(
    selection: PrismSelection | null,
    index: PrismSemanticIndex | null,
): HighlightedNet | null {
    if (!selection || selection.kind === "component") return null;
    const semantic = semanticNet(selection, index);
    const netName = semantic?.name || selection.netName;
    if (!netName) return null;
    return {
        netName,
        netUid: semantic?.netUid ?? selection.netUid,
        netCode: semantic?.netCode ?? selection.netCode,
        pcbUuids: semantic ? copperUuids(semantic) : undefined,
    };
}

function semanticNet(
    selection: Exclude<PrismSelection, { kind: "component" }>,
    index: PrismSemanticIndex | null,
): SemanticNet | undefined {
    if (!index) return undefined;
    if (selection.netUid) {
        const byUid = index.nets.find((net) => net.netUid === selection.netUid);
        if (byUid) return byUid;
    }
    if (selection.netName) {
        const at = index.indexes.netByName?.[selection.netName];
        if (at !== undefined) return index.nets[at];
    }
    return undefined;
}

function copperUuids(net: SemanticNet): string[] {
    const uuids: string[] = [];
    for (const ref of net.pcbRefs ?? []) {
        uuids.push(...(ref.trackUuids ?? []), ...(ref.viaUuids ?? []));
    }
    return uuids;
}

export function toggleHighlightedNet(
    nets: readonly HighlightedNet[],
    net: HighlightedNet,
): HighlightedNet[] {
    return nets.some((entry) => sameHighlightedNet(entry, net))
        ? nets.filter((entry) => !sameHighlightedNet(entry, net))
        : [...nets, net];
}

export function removeHighlightedNet(
    nets: readonly HighlightedNet[],
    net: HighlightedNet,
): HighlightedNet[] {
    return nets.filter((entry) => !sameHighlightedNet(entry, net));
}

/** Viewer refs for the collection, one per net, in order. */
export function highlightRefs(nets: readonly HighlightedNet[]): EcadNetRef[] {
    return nets.map((net) => ({
        name: net.netName,
        netCode: net.netCode,
        uuids: net.pcbUuids?.length ? net.pcbUuids : undefined,
    }));
}

/**
 * Adopt the set a viewer reports after changing it itself (double-click
 * cross-probe, standalone gesture, clear). Names already in the collection
 * keep their hints; new names get the viewer's code.
 */
export function adoptViewerNets(
    current: readonly HighlightedNet[],
    reported: readonly EcadNetRef[],
): HighlightedNet[] {
    const next = reported.map((ref) => {
        const known = current.find((net) => net.netName === ref.name);
        return known ?? { netName: ref.name, netCode: ref.netCode };
    });
    const unchanged =
        next.length === current.length
        && next.every((net, index) => net.netName === current[index]?.netName);
    return unchanged ? (current as HighlightedNet[]) : next;
}

/** True when both lists name the same nets in the same order. */
export function sameHighlightedNets(
    a: readonly HighlightedNet[],
    b: readonly HighlightedNet[],
): boolean {
    return a.length === b.length && a.every((net, index) => net.netName === b[index]?.netName);
}
