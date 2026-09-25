/**
 * URL-owned design-variant selection (VAR-14).
 *
 * The requested variant lives in `?variant=<name>` and nowhere else: these
 * helpers read it, rewrite it while preserving every other query parameter,
 * and decide whether the loaded index can actually honour it
 * before the UI advertises a named selection (packet 3.6, cases E16/E17).
 */

import { assemblyProjectionState } from "@/lib/design-variants";
import type {
    PrismSemanticIndex,
} from "@/types/prism-selection";

export type VariantSelectionState =
    | "applied"
    | "missing"
    | "empty"
    | "loading"
    | "failed"
    | "unavailable";

export interface VariantSelectionResolution {
    /** The name the index may render, or null for the default assembly. */
    effective: string | null;
    state: VariantSelectionState;
}

export function requestedVariantFromSearchParams(
    searchParams: URLSearchParams,
): string | null {
    const value = searchParams.get("variant");
    return value ? value : null;
}

/**
 * Rewrite only the variant parameter. Every other query parameter survives,
 * including the commit pin and the open tab.
 */
export function variantSearchParams(
    searchParams: URLSearchParams,
    name: string | null,
): URLSearchParams {
    const next = new URLSearchParams(searchParams);
    if (name) next.set("variant", name);
    else next.delete("variant");
    return next;
}

/** The index owns both the catalog and the data that renders its selection. */
export function resolveVariantSelection(
    requested: string | null,
    index: PrismSemanticIndex | null,
    error: string | null = null,
): VariantSelectionResolution {
    if (!index) return { effective: null, state: error ? "failed" : "loading" };
    const projection = assemblyProjectionState(index, requested);
    if (projection === "unavailable" || projection === "missing")
        return { effective: null, state: projection };
    if (!requested && index.assembly!.catalog.length === 0)
        return { effective: null, state: "empty" };
    return { effective: requested, state: "applied" };
}

/**
 * The one-line explanation rendered beside the selector. `applied` and
 * `loading` need none: the control itself already shows both states.
 */
export function variantSelectionNotice(
    resolution: VariantSelectionResolution,
    requested: string | null = null,
): string | null {
    switch (resolution.state) {
        case "missing":
            return `Variant "${requested ?? "?"}" is not in this revision; showing the default assembly.`;
        case "empty":
            return "This revision has no design variants.";
        case "failed":
            return "Design variants could not be loaded.";
        case "unavailable":
            return "This revision has no variant data; showing the default assembly.";
        case "loading":
            return "Loading design variants…";
        case "applied":
            return null;
    }
}

export function variantSelectorDisabled(
    resolution: VariantSelectionResolution,
): boolean {
    return (
        resolution.state === "loading" ||
        resolution.state === "empty" ||
        resolution.state === "unavailable"
    );
}
