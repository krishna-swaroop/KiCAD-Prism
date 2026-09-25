import type { ChangeItem } from "./types";

/**
 * Layer focus for one selected PCB review item.
 *
 * A selection is shown on exactly the layers it occupies, and the rest of the
 * board is hidden: a net opens every layer it is routed across, a part opens
 * the side it is mounted on. Without that, a change on B.Cu is read through
 * the F.Cu artwork stacked on top of it, which is the opposite of evidence.
 *
 * Each revision carries its own artwork, so the reference and comparison layer
 * sets are derived independently: a pane must never infer its layers from the
 * other revision's objects, or a re-layered route -- or a part moved to the
 * other side of the board -- reads as if it were always on both.
 */
export type ComparisonLayerFocus = {
    net: string | null;
    /** Layers the reference (base) revision carries this selection on. */
    reference: string[];
    /** Layers the comparison (head) revision carries this selection on. */
    comparison: string[];
    /**
     * True when the selection contains no track, arc or part. Only then do via
     * span endpoints define the focus; a via must not expose untouched
     * intermediate copper just because its barrel passes through.
     */
    viaOnly: boolean;
};

export type LayerFocusSide = "reference" | "comparison" | "both";

/**
 * Mechanical context kept visible under a focus. The focused layers alone
 * leave the reviewer with no board frame to place the evidence against, and
 * the outline carries no evidence of its own.
 */
export const LAYER_FOCUS_CONTEXT_LAYERS = ["Edge.Cuts"];

const VIA_KINDS = new Set(["via"]);

function nativeKind(change: ChangeItem): string {
    return String(
        change.object_kind
        ?? change.geometry?.kind
        ?? change.oldGeometry?.kind
        ?? "",
    ).toLocaleLowerCase();
}

function sideLayers(change: ChangeItem, side: "reference" | "comparison"): string[] {
    const item = side === "reference" ? change.base_item : change.compare_item;
    const geometry = side === "reference" ? change.oldGeometry : change.geometry;
    const candidates = [
        ...(item?.layers ?? []),
        item?.layer,
        geometry?.layer,
    ];
    return [...new Set(candidates.filter((layer): layer is string => Boolean(layer)))];
}

function namesALayer(change: ChangeItem): boolean {
    return sideLayers(change, "reference").length > 0
        || sideLayers(change, "comparison").length > 0;
}

/**
 * Derive the focused layers for a selection, or null when nothing in it sits
 * on a layer at all.
 *
 * The rule is deliberately one rule: a selection is shown on exactly the
 * layers it occupies. A part on B.Cu opens B.Cu; its fab text on B.Fab opens
 * B.Fab as well, because selecting "R52 modified" selects both and a reviewer
 * cannot read half of a change.
 *
 * Changes that name no layer -- a design rule, a netlist edit -- do not veto
 * the focus, they simply contribute nothing to it. An earlier version required
 * every selected object to be copper, which meant the most ordinary selection
 * in the tool, a part group carrying one copper change and one silkscreen or
 * fab annotation, isolated nothing at all: the reviewer got the feature only
 * by opening the group and clicking the copper row inside it.
 */
export function layerFocusForChanges(
    changes: ChangeItem[],
): ComparisonLayerFocus | null {
    if (!changes.length) return null;
    if (!changes.every((change) => change.domain === "pcb")) return null;

    const located = changes.filter(namesALayer);
    if (!located.length) return null;

    const viaOnly = located.every((change) => VIA_KINDS.has(nativeKind(change)));
    // Tracks, arcs and parts define the focus. Vias only contribute when
    // nothing else in the selection does, so a via drop on a two-layer board
    // does not light up every inner layer its barrel crosses.
    const contributing = viaOnly
        ? located
        : located.filter((change) => !VIA_KINDS.has(nativeKind(change)));

    const reference = new Set<string>();
    const comparison = new Set<string>();
    for (const change of contributing) {
        for (const layer of sideLayers(change, "reference")) reference.add(layer);
        for (const layer of sideLayers(change, "comparison")) comparison.add(layer);
    }
    if (!reference.size && !comparison.size) return null;

    // A wholly added or removed route -- or part -- leaves one revision with no
    // copper of its own. That pane still has to prove the absence somewhere, so
    // it borrows the layer context of the revision that does carry it.
    const resolved = {
        reference: [...(reference.size ? reference : comparison)].sort(),
        comparison: [...(comparison.size ? comparison : reference)].sort(),
    };

    const net = changes.find((change) => change.net?.trim())?.net?.trim() ?? null;
    return { net, viaOnly, ...resolved };
}

/**
 * Turn the layer a change names into the layers a reviewer should be shown.
 *
 * A through-hole pad does not sit on a side of the board, so KiCad does not
 * name one: its layer is `*.Cu`, and `F&B.Cu` names the outer pair. Those are
 * patterns, not layers, and a viewer handed `*.Cu` matches nothing on any
 * board -- which is why selecting a through-hole part used to show the outline
 * and nothing else.
 *
 * Wildcards resolve to the outer copper, not to every copper layer. `*.Cu`
 * means all of it to KiCad, but a through-hole pad is only legible where it
 * is a pad: on the outside. Opening the inner layers as well buries the change
 * under the planes it passes through, which is the opposite of what focusing
 * is for. That makes this focus semantics rather than KiCad semantics, hence
 * the name.
 *
 * Anything already naming a real layer passes through, so a caller can hand
 * this a mix of patterns and names -- restoring a reviewer's saved layers goes
 * through the same path.
 */
export function resolveFocusLayers(
    patterns: readonly string[],
    boardLayers: readonly string[],
): string[] {
    const resolved = new Set<string>();
    for (const pattern of patterns) {
        if (!pattern.includes("*") && !pattern.includes("&")) {
            resolved.add(pattern);
            continue;
        }
        const [sides, suffix] = splitPattern(pattern);
        for (const layer of boardLayers) {
            if (!layer.toLocaleLowerCase().endsWith(suffix)) continue;
            const side = outerSideOf(layer);
            // Inner copper is never what a wildcard is asking to be shown.
            if (!side) continue;
            if (sides && !sides.has(side)) continue;
            resolved.add(layer);
        }
    }
    return [...resolved];
}

/**
 * Split a pattern into the sides it names and the suffix it matches.
 *
 * `*.Cu` -> [null, ".cu"] -- no side named, so either outer side matches.
 * `F&B.Cu` -> [Set{"f", "b"}, ".cu"].
 */
function splitPattern(pattern: string): [Set<string> | null, string] {
    const dot = pattern.lastIndexOf(".");
    if (dot < 0) return [null, pattern.toLocaleLowerCase()];
    const head = pattern.slice(0, dot).toLocaleLowerCase();
    const suffix = pattern.slice(dot).toLocaleLowerCase();
    if (head === "*") return [null, suffix];
    return [new Set(head.split("&")), suffix];
}

/** "f" for a front layer, "b" for a back one, null for anything inner. */
function outerSideOf(layer: string): "f" | "b" | null {
    const lower = layer.toLocaleLowerCase();
    if (lower.startsWith("f.")) return "f";
    if (lower.startsWith("b.")) return "b";
    return null;
}

/**
 * Layers a pane should show while the focus is active. Everything else on the
 * board is hidden: the focus owns visibility for as long as the selection
 * stands.
 */
export function focusVisibleLayers(
    focus: ComparisonLayerFocus,
    side: LayerFocusSide,
): string[] {
    const evidence = side === "both"
        ? [...new Set([...focus.reference, ...focus.comparison])].sort()
        : focus[side];
    const orientationCopper = new Set<string>();
    for (const layer of evidence) {
        const lower = layer.toLocaleLowerCase();
        if (lower.endsWith(".cu") || lower === "edge.cuts") continue;
        if (lower.startsWith("f.")) orientationCopper.add("F.Cu");
        else if (lower.startsWith("b.")) orientationCopper.add("B.Cu");
        // Copper patterns already pass through as evidence and resolve below.
        // This branch supplies orientation copper for two-sided non-copper
        // patterns such as F&B.Mask or *.SilkS.
        else if (lower.startsWith("f&b.") || lower.startsWith("*.")) {
            orientationCopper.add("F.Cu");
            orientationCopper.add("B.Cu");
        }
    }
    return [
        ...new Set([...evidence, ...orientationCopper]).values(),
    ].sort().concat(
        LAYER_FOCUS_CONTEXT_LAYERS.filter((layer) => !evidence.includes(layer)),
    );
}
