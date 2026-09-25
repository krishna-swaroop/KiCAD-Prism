/**
 * VAR-16: apply the URL-owned variant selection to the vendored
 * `<ecad-viewer>` elements and report what actually happens.
 *
 * `setVariant`/`getVariant` are part of the frozen ecad-viewer public API
 * (packet 3.4) and are declared as required methods in
 * `src/types/ecad-viewer.d.ts`, so this module calls them directly. A missing
 * method means the served bundle is older than the vendored source — a
 * provenance failure that must be visible, never optional-chained away.
 */

import type { ECadViewerElement } from "@/types/ecad-viewer";

export type ViewerVariantTarget = "schematic" | "pcb";

export type ViewerVariantState =
    | "applied"
    | "default"
    | "pending"
    | "missing"
    | "unsupported";

export interface ViewerVariantSync {
    state: ViewerVariantState;
    requested: string | null;
    /** What the element reports as active after the call. */
    applied: string | null;
}

const TARGET_LABELS: Record<ViewerVariantTarget, string> = {
    schematic: "schematic",
    pcb: "PCB",
};

/**
 * Idempotent: the element owns replay across source replacement and page
 * switches, so a repeated call with the same name converges on the same state.
 * An element that is not mounted yet reports `pending`; the caller's effect
 * runs again when the ref attaches or the next ready generation arrives.
 */
export function syncViewerVariant(
    element: ECadViewerElement | null | undefined,
    requested: string | null,
): ViewerVariantSync {
    if (!element) {
        return { state: "pending", requested, applied: null };
    }
    if (
        typeof element.setVariant !== "function"
        || typeof element.getVariant !== "function"
    ) {
        return { state: "unsupported", requested, applied: null };
    }
    const known = element.setVariant(requested);
    const applied = element.getVariant();
    if (requested === null) {
        return { state: "default", requested: null, applied };
    }
    if (!known) {
        return { state: "missing", requested, applied };
    }
    return {
        state: applied === requested ? "applied" : "pending",
        requested,
        applied,
    };
}

/**
 * One message per failure the user must know about; `null` when the sync is
 * on track (including `pending`, which the element resolves itself).
 */
export function viewerVariantNotice(
    target: ViewerVariantTarget,
    result: ViewerVariantSync,
): string | null {
    const label = TARGET_LABELS[target];
    switch (result.state) {
        case "unsupported":
            return `The ${label} viewer bundle is out of date and cannot apply design variants; rebuild the vendored viewer.`;
        case "missing":
            return `The ${label} viewer has no variant "${result.requested ?? "?"}" in this revision; showing the default design.`;
        case "applied":
        case "default":
        case "pending":
            return null;
    }
}
