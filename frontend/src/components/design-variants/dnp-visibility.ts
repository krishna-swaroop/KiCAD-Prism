/**
 * VAR-19: split the packet-2.6 physical classification into what the 3D
 * workspace should hide, what must stay visible because a reference owns
 * multiple footprints, and what has no model at all.
 *
 * Only `hidden` references may be handed to the viewer's
 * `setHiddenComponents`; `ambiguous` pairs are never collapsed into one
 * guessed DNP value (VAR-18 preserves and reports them).
 */

import type { PhysicalVisibility } from "@/types/prism-selection";

export interface DnpVisibilityPlan {
    hidden: string[];
    ambiguous: string[];
    absent: string[];
}

export const EMPTY_DNP_PLAN: DnpVisibilityPlan = {
    hidden: [],
    ambiguous: [],
    absent: [],
};

export function dnpVisibilityPlan(
    visibility: Record<string, PhysicalVisibility>,
    showDnp: boolean,
): DnpVisibilityPlan {
    if (showDnp) return EMPTY_DNP_PLAN;
    const hidden: string[] = [];
    const ambiguous: string[] = [];
    const absent: string[] = [];
    for (const [reference, state] of Object.entries(visibility)) {
        if (state === "hidden") hidden.push(reference);
        else if (state === "ambiguous") ambiguous.push(reference);
        else if (state === "absent") absent.push(reference);
    }
    hidden.sort();
    ambiguous.sort();
    absent.sort();
    return { hidden, ambiguous, absent };
}

export function dnpVisibilityNotice(plan: DnpVisibilityPlan): string | null {
    if (plan.ambiguous.length === 0) return null;
    const references = plan.ambiguous.join(", ");
    const noun = plan.ambiguous.length === 1 ? "component has" : "components have";
    return `${plan.ambiguous.length} ${noun} alternate footprints and stay visible with their DNP state unresolved (${references}).`;
}
