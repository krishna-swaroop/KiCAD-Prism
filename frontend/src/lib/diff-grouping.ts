/**
 * Unified diff grouping — single source of truth for how diff items are
 * categorised and rendered across the project.
 *
 * Used by:
 *   - PCB diff viewer sidebar (with bbox computation layered on top)
 *   - Schematic diff viewer sidebar
 *   - Commit list summary (history-viewer.tsx)
 *
 * The categories are domain-aware: PCB items go into Components/Nets/Zones/
 * Graphics; schematic items into Symbols/Nets/Sheets/Text. Within a category,
 * items that have both additions and removals are merged into a "changed"
 * (mixed) kind — this prevents visually misleading green+red splits when a
 * net was rerouted or a zone redrawn.
 */

export type DiffKind = "added" | "removed" | "changed";

/** Visual + semantic category. Stable identifiers used for grouping and ordering. */
export type Category =
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
    components: { label: "Components", order: 0 },
    symbols:    { label: "Symbols",    order: 0 },
    nets:       { label: "Nets",       order: 1 },
    zones:      { label: "Zones",      order: 2 },
    sheets:     { label: "Sheets",     order: 3 },
    text:       { label: "Text",       order: 4 },
    graphics:   { label: "Graphics",   order: 5 },
    other:      { label: "Other",      order: 9 },
};

/** Map a raw kicad item type → category. Pure, no item context required. */
export function categoryFor(type: string | undefined): Category {
    if (!type) return "other";
    switch (type) {
        // PCB
        case "footprint": return "components";
        case "segment":
        case "arc":
        case "via":       return "nets";
        case "zone":      return "zones";
        // Board graphics (gr_*) and footprint graphics (fp_*: silkscreen, fab,
        // courtyard) both group under "graphics", itemised per element.
        case "gr_text":
        case "gr_line":
        case "gr_circle":
        case "gr_rect":
        case "gr_arc":
        case "gr_poly":
        case "fp_text":
        case "fp_line":
        case "fp_circle":
        case "fp_rect":
        case "fp_arc":
        case "fp_poly":   return "graphics";
        // Schematic
        case "symbol":              return "symbols";
        case "label":
        case "global_label":
        case "hierarchical_label":
        case "net_label":
        case "wire":
        case "bus":
        case "bus_entry":
        case "junction":
        case "no_connect":          return "nets";
        case "sheet":               return "sheets";
        case "text":                return "text";
        default:                    return "other";
    }
}

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

/** Minimal item shape — anything else is ignored by this module. */
export interface GroupableItem {
    id?: string;
    type: string;
    /** PCB nets are keyed on this string. */
    net?: string | number | null;
    net_name?: string;
    /** Layer string (used by graphics for sub-grouping). */
    layer?: string;
    /** PCB component identity. */
    reference?: string;
    value?: string;
    lib_id?: string;
    /** Free-form per-type label fields. */
    text?: string;
    name?: string;
    sheet_name?: string;
    sheet_file?: string;
}

export interface KindedItem<T extends GroupableItem = GroupableItem> {
    kind: DiffKind;
    item: T;
}

/** Sub-group within a category — e.g. one net, one component, one layer. */
export interface DiffGroup<T extends GroupableItem = GroupableItem> {
    /** Stable id within the categorise() call. */
    id: string;
    category: Category;
    /** Reconciled kind across all members. */
    kind: DiffKind;
    /** Display label (e.g. "GND — 3 wires", "U5 (LM358)"). */
    label: string;
    /** All items belonging to this group, with their original kinds. */
    members: KindedItem<T>[];
    /**
     * Item count breakdown — useful for compact summaries without iterating
     * `members`. Excludes the "kind" reconciliation; values reflect the raw
     * input distribution.
     */
    count: { added: number; removed: number; changed: number };
}

/** Sub-grouping policy — controls how items within a category are bucketed. */
type SubGroupPolicy =
    | "per-item"      // one group per item (default for components, sheets, zones, symbols)
    | "by-net"        // PCB nets and schematic nets — group by net key
    | "by-layer";     // PCB graphics — group by layer

const POLICY: Record<Category, SubGroupPolicy> = {
    components: "per-item",
    symbols:    "per-item",
    sheets:     "per-item",
    zones:      "per-item",
    text:       "per-item",
    other:      "per-item",
    nets:       "by-net",
    graphics:   "by-layer",
};

/**
 * Group a flat list of {kind, item} into category buckets, with sub-grouping
 * applied per category policy. Stable across calls (deterministic ordering
 * via insertion order + `order` rank).
 *
 * NOTE: This is the layout for sidebars and commit-list previews. Geometric
 * concerns (bounding boxes, polygon points) are computed separately by the
 * diff viewers — pass the same items through this function and merge the
 * `members` lists by group id when you need the geometry.
 */
export function categorise<T extends GroupableItem>(input: KindedItem<T>[]): DiffGroup<T>[] {
    const buckets = new Map<string, DiffGroup<T>>();
    let auto = 0;
    const nextId = () => `g${auto++}`;

    for (const ki of input) {
        const cat = categoryFor(ki.item.type);
        const policy = POLICY[cat];
        const subKey = subGroupKey(cat, policy, ki.item);
        const bucketKey = `${cat}::${subKey}`;
        let bucket = buckets.get(bucketKey);
        if (!bucket) {
            bucket = {
                id: nextId(),
                category: cat,
                kind: ki.kind,
                label: "", // computed at end from members
                members: [],
                count: { added: 0, removed: 0, changed: 0 },
            };
            buckets.set(bucketKey, bucket);
        }
        bucket.members.push(ki);
        bucket.count[ki.kind]++;
    }

    // Reconcile kinds + build labels.
    const out: DiffGroup<T>[] = [];
    for (const b of buckets.values()) {
        b.kind = mergedKind(b.members.map(m => m.kind));
        b.label = labelForGroup(b);
        out.push(b);
    }

    // Sort by category order, then by label for stable presentation.
    out.sort((a, b) => {
        const oa = CATEGORY_META[a.category].order;
        const ob = CATEGORY_META[b.category].order;
        if (oa !== ob) return oa - ob;
        return a.label.localeCompare(b.label);
    });
    return out;
}

function subGroupKey(cat: Category, policy: SubGroupPolicy, item: GroupableItem): string {
    if (policy === "by-net") {
        // PCB segments/vias use `net` (number) or `net_name` (string).
        // Schematic labels expose the net name via `text` (label content).
        const k = item.net ?? item.net_name ?? item.text ?? "(no net)";
        return String(k);
    }
    if (policy === "by-layer") {
        return item.layer ?? "(no layer)";
    }
    // per-item: use a unique key so each item gets its own bucket.
    return item.id ?? `${cat}-${Math.random().toString(36).slice(2)}`;
}

function labelForGroup(g: DiffGroup): string {
    const m = g.members;
    if (m.length === 0) return "";
    switch (g.category) {
        case "nets": {
            const item = m[0].item;
            const netLabel = item.net_name
                ? String(item.net_name)
                : item.net != null && item.net !== ""
                    ? `Net ${String(item.net)}`
                    : item.text
                        ? String(item.text)
                        : "No net";
            const parts: string[] = [];
            const segCount  = m.filter(x => x.item.type === "segment" || x.item.type === "wire" || x.item.type === "arc").length;
            const viaCount  = m.filter(x => x.item.type === "via").length;
            const lblCount  = m.filter(x => x.item.type === "label" || x.item.type === "global_label" || x.item.type === "hierarchical_label" || x.item.type === "net_label").length;
            const busCount  = m.filter(x => x.item.type === "bus" || x.item.type === "bus_entry").length;
            const jncCount  = m.filter(x => x.item.type === "junction" || x.item.type === "no_connect").length;
            if (segCount) parts.push(`${segCount} ${segCount === 1 ? "wire" : "wires"}`);
            if (viaCount) parts.push(`${viaCount} ${viaCount === 1 ? "via" : "vias"}`);
            if (lblCount) parts.push(`${lblCount} ${lblCount === 1 ? "label" : "labels"}`);
            if (busCount) parts.push(`${busCount} ${busCount === 1 ? "bus" : "buses"}`);
            if (jncCount) parts.push(`${jncCount} ${jncCount === 1 ? "junction" : "junctions"}`);
            return parts.length > 0 ? `${netLabel} — ${parts.join(", ")}` : netLabel;
        }
        case "graphics": {
            const layer = m[0].item.layer ?? "No layer";
            return `${layer} — ${m.length} item${m.length === 1 ? "" : "s"}`;
        }
        case "components": {
            const it = m[0].item;
            const ref = it.reference || it.lib_id || "?";
            return it.value ? `${ref} (${it.value})` : ref;
        }
        case "symbols": {
            const it = m[0].item;
            const ref = it.reference || it.lib_id || "?";
            return it.value ? `${ref} (${it.value})` : ref;
        }
        case "zones": {
            const it = m[0].item;
            return it.net_name && it.layer
                ? `${it.net_name} (${it.layer})`
                : it.net_name || it.name || "Zone";
        }
        case "sheets": {
            const it = m[0].item;
            return it.sheet_name || it.sheet_file || "Sheet";
        }
        case "text": {
            const it = m[0].item;
            const t = it.text ?? "";
            return t.length > 32 ? `${t.slice(0, 29)}…` : (t || "Text");
        }
        case "other":
        default: {
            const it = m[0].item;
            return it.name || it.text || it.type;
        }
    }
}
