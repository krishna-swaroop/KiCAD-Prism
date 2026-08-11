import type { ChangeItem } from "./types";

/**
 * Layer focus for one selected PCB routing review item.
 *
 * A route is one semantic net across two revisions, and each revision carries
 * its own copper. The reference and comparison layer sets are therefore derived
 * independently: a pane must never infer its layers from the other revision's
 * objects, or a re-layered route reads as if it were always on both layers.
 */
export type ComparisonRouteFocus = {
    net: string | null;
    /** Copper layers the reference (base) revision routes this net on. */
    reference: string[];
    /** Copper layers the comparison (head) revision routes this net on. */
    comparison: string[];
    /**
     * True when the selection contains no track or arc. Only then do via span
     * endpoints define the focus; a via must not expose untouched intermediate
     * copper just because its barrel passes through.
     */
    viaOnly: boolean;
};

export type RouteFocusSide = "reference" | "comparison" | "both";

/**
 * Mechanical context kept visible under a routing focus. Copper alone leaves
 * the reviewer with no board frame to place the route against, and the outline
 * carries no copper evidence of its own.
 */
export const ROUTE_FOCUS_CONTEXT_LAYERS = ["Edge.Cuts"];

const ROUTING_KINDS = new Set([
    "track",
    "segment",
    "arc",
    "arc_segment",
    "via",
]);

const VIA_KINDS = new Set(["via"]);

function nativeKind(change: ChangeItem): string {
    return String(
        change.object_kind
        ?? change.geometry?.kind
        ?? change.oldGeometry?.kind
        ?? "",
    ).toLocaleLowerCase();
}

function isCopperLayer(layer: string): boolean {
    return layer.toLocaleLowerCase().endsWith(".cu");
}

function sideLayers(change: ChangeItem, side: "reference" | "comparison"): string[] {
    const item = side === "reference" ? change.base_item : change.compare_item;
    const geometry = side === "reference" ? change.oldGeometry : change.geometry;
    const candidates = [
        ...(item?.layers ?? []),
        item?.layer,
        geometry?.layer,
    ];
    return [...new Set(candidates.filter((layer): layer is string => Boolean(layer)))]
        .filter(isCopperLayer);
}

/**
 * Derive the focused copper layers for a selection, or null when the selection
 * is not a routing review item. Mixed selections are deliberately excluded:
 * hiding layers is only defensible when every selected object is copper the
 * reviewer is trying to isolate.
 */
export function routeFocusForChanges(
    changes: ChangeItem[],
): ComparisonRouteFocus | null {
    if (!changes.length) return null;
    if (!changes.every((change) =>
        change.domain === "pcb" && ROUTING_KINDS.has(nativeKind(change))
    )) {
        return null;
    }

    const viaOnly = changes.every((change) => VIA_KINDS.has(nativeKind(change)));
    // Tracks and arcs define the route. Vias only contribute when nothing else
    // in the selection does, so a via drop on a two-layer board does not light
    // up every inner layer its barrel crosses.
    const contributing = viaOnly
        ? changes
        : changes.filter((change) => !VIA_KINDS.has(nativeKind(change)));

    const reference = new Set<string>();
    const comparison = new Set<string>();
    for (const change of contributing) {
        for (const layer of sideLayers(change, "reference")) reference.add(layer);
        for (const layer of sideLayers(change, "comparison")) comparison.add(layer);
    }
    if (!reference.size && !comparison.size) return null;

    // A wholly added or removed route leaves one revision with no copper of its
    // own. That pane still has to prove the absence somewhere, so it borrows
    // the layer context of the revision that does carry the route.
    const resolved = {
        reference: [...(reference.size ? reference : comparison)].sort(),
        comparison: [...(comparison.size ? comparison : reference)].sort(),
    };

    const net = changes.find((change) => change.net?.trim())?.net?.trim() ?? null;
    return { net, viaOnly, ...resolved };
}

/**
 * Layers a pane should show while the focus is active. Everything else on the
 * board is hidden: the focus owns visibility for as long as the routing
 * selection stands.
 */
export function focusVisibleLayers(
    focus: ComparisonRouteFocus,
    side: RouteFocusSide,
): string[] {
    const copper = side === "both"
        ? [...new Set([...focus.reference, ...focus.comparison])].sort()
        : focus[side];
    return [...copper, ...ROUTE_FOCUS_CONTEXT_LAYERS];
}
