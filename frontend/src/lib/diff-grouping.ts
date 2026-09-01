/**
 * Unified diff grouping — single source of truth for how diff items are
 * categorised and rendered across the project.
 *
 * Ported from the Design Comparison prototype so the commit-list summary
 * (history-viewer.tsx) and the future Design Comparison workspace share the
 * same category taxonomy. The categories are domain-aware: PCB items go into
 * Components/Nets/Zones/Graphics; schematic items into Symbols/Nets/Sheets/
 * Text. Within a category, items that have both additions and removals are
 * merged into a "changed" (mixed) kind — this prevents visually misleading
 * green+red splits when a net was rerouted or a zone redrawn.
 */

export type DiffKind = "added" | "removed" | "changed";

/** Visual + semantic category. Stable identifiers used for grouping and ordering. */
export type Category =
    | "rules"      // board constraints, net classes, custom rules and waivers
    | "components" // PCB footprints
    | "nets"       // PCB segments + vias OR schematic wires + labels
    | "zones"      // PCB zones / fills
    | "graphics"   // PCB graphic primitives (gr_text, gr_line, ...)
    | "symbols"    // schematic symbols
    | "sheets"     // schematic hierarchical sheets
    | "text"       // schematic text / annotations
    | "other";

export interface CategoryMeta {
    /** Plural label shown as a section heading. */
    label: string;
    /** Sort order for stable display. */
    order: number;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
    rules:      { label: "Rules & Constraints", order: 0 },
    components: { label: "Components", order: 1 },
    symbols:    { label: "Symbols",    order: 1 },
    nets:       { label: "Nets",       order: 2 },
    zones:      { label: "Zones",      order: 3 },
    sheets:     { label: "Sheets",     order: 4 },
    text:       { label: "Text",       order: 5 },
    graphics:   { label: "Graphics",   order: 6 },
    other:      { label: "Other",      order: 9 },
};

/**
 * Reconcile a set of kinds within a single bucket.
 *
 *   { added }            → "added"
 *   { removed }          → "removed"
 *   { changed }          → "changed"
 *   { added, removed }   → "changed"  (rerouted / replaced)
 *   any with "changed"   → "changed"
 */
export function mergedKind(kinds: Iterable<DiffKind>): DiffKind {
    const set = new Set<DiffKind>();
    for (const k of kinds) set.add(k);
    if (set.size === 1) return set.values().next().value as DiffKind;
    return "changed";
}
