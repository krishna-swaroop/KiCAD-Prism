import type { ComparisonSelection } from "./comparison-selection-bridge";

export type ComparisonUrlTab = "sch" | "pcb" | "bom" | "stackup" | "fabrication";
export type ComparisonPresentationMode =
    | "composite"
    | "side-by-side"
    | "old-new";

export type ComparisonUrlState = {
    base: string | null;
    compare: string | null;
    view: "semantic" | null;
    diff: ComparisonUrlTab;
    /**
     * A presentation the reviewer chose for the linked item, or null to let the
     * policy recommend one.
     *
     * One nullable value rather than a mode plus an `auto` flag: those two could
     * disagree, and every consumer had to collapse them back into this anyway.
     */
    presentationOverride: ComparisonPresentationMode | null;
    item: string | null;
    group: string | null;
    reference: string | null;
    documentPath: string | null;
    showSecondary: boolean;
    layers: string[];
};

const COMPARISON_KEYS = [
    "base",
    "compare",
    "view",
    "diff",
    "presentation",
    "item",
    "group",
    "ref",
    "document",
    "secondary",
    "layers",
] as const;

/**
 * No `presentation` parameter is the shareable default: Prism follows the
 * selected change. An explicit mode records a reviewer's override. Legacy or
 * unknown values are treated as no override.
 */
function parsePresentationOverride(
    raw: string | null,
): ComparisonPresentationMode | null {
    if (raw === "side-by-side") return "side-by-side";
    if (raw === "old-new") return "old-new";
    if (raw === "composite") return "composite";
    return null;
}

export function readComparisonUrlState(
    search: string | URLSearchParams = window.location.search,
): ComparisonUrlState {
    const params =
        typeof search === "string" ? new URLSearchParams(search) : search;
    const rawTab = params.get("diff");
    const rawPresentation = params.get("presentation");
    const diff: ComparisonUrlTab =
        rawTab === "pcb" || rawTab === "bom" || rawTab === "stackup"
        || rawTab === "fabrication"
            ? rawTab
            : "sch";
    return {
        base: params.get("base"),
        compare: params.get("compare"),
        view: params.get("view") === "semantic" ? "semantic" : null,
        diff,
        presentationOverride: parsePresentationOverride(rawPresentation),
        item: params.get("item"),
        group: params.get("group"),
        reference: params.get("ref"),
        documentPath: params.get("document"),
        showSecondary: params.get("secondary") === "1",
        layers: (params.get("layers") ?? "").split(",").filter(Boolean),
    };
}

/** Apply open review params while preserving unrelated query keys (branch, etc.). */
export function applyOpenComparisonParams(
    params: URLSearchParams,
    input: {
        base: string;
        compare: string;
        diff?: ComparisonUrlTab;
        presentationOverride?: ComparisonPresentationMode | null;
        /** Exact semantic change to focus after the comparison is ready. */
        item?: string | null;
        /** Authored-decision group to focus after the comparison is ready. */
        group?: string | null;
        /** One designator inside `group`; absent means the whole decision. */
        reference?: string | null;
        documentPath?: string | null;
    },
): URLSearchParams {
    const next = new URLSearchParams(params);
    next.set("section", "history");
    next.set("base", input.base);
    next.set("compare", input.compare);
    next.set("view", "semantic");
    next.set("diff", input.diff ?? "sch");
    if (input.presentationOverride) {
        next.set("presentation", input.presentationOverride);
    } else {
        next.delete("presentation");
    }
    if (input.item) next.set("item", input.item);
    else next.delete("item");
    if (input.group) next.set("group", input.group);
    else next.delete("group");
    if (input.group && input.reference) next.set("ref", input.reference);
    else next.delete("ref");
    if (input.documentPath) next.set("document", input.documentPath);
    else next.delete("document");
    // Review filters and layer visibility belong to the comparison being left.
    // Workspace URL syncing adds current values back after this reset.
    next.delete("secondary");
    next.delete("layers");
    return next;
}

/** Remove review deep-link params; keep section=history by default. */
export function clearComparisonParams(
    params: URLSearchParams,
    options: { keepSection?: boolean } = {},
): URLSearchParams {
    const next = new URLSearchParams(params);
    for (const key of COMPARISON_KEYS) next.delete(key);
    if (options.keepSection !== false) next.set("section", "history");
    return next;
}

/** Merge in-workspace navigation state into the current search params. */
export function applyWorkspaceComparisonParams(
    params: URLSearchParams,
    state: {
        base: string;
        compare: string;
        activeTab: ComparisonUrlTab;
        presentationOverride: ComparisonPresentationMode | null;
        selection: ComparisonSelection;
        showSecondary: boolean;
        visibleLayers: string[];
    },
): URLSearchParams {
    const next = applyOpenComparisonParams(params, {
        base: state.base,
        compare: state.compare,
        diff: state.activeTab,
        presentationOverride: state.presentationOverride,
    });
    if (state.selection?.kind === "item") {
        next.set("item", state.selection.id);
        next.delete("group");
        next.delete("ref");
    } else if (state.selection) {
        next.delete("item");
        next.set("group", state.selection.id);
        if (state.selection.kind === "instance") {
            next.set("ref", state.selection.reference);
        } else {
            next.delete("ref");
        }
    } else {
        next.delete("item");
        next.delete("group");
        next.delete("ref");
    }
    if (state.selection?.documentPath) {
        next.set("document", state.selection.documentPath);
    } else {
        next.delete("document");
    }
    if (state.showSecondary) next.set("secondary", "1");
    else next.delete("secondary");
    if (state.visibleLayers.length) {
        next.set("layers", state.visibleLayers.join(","));
    } else {
        next.delete("layers");
    }
    return next;
}

export function comparisonIsOpen(state: ComparisonUrlState): boolean {
    return Boolean(state.base && state.compare);
}
