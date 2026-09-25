/**
 * Immutable frontend projection of the semantic index's assembly state
 * (contract packet v1.0 sections 2.7 and 3.6).
 *
 * Everything here derives from the base index: the default state never
 * mutates it, a named variant never stacks on another named variant, and
 * untouched components keep their object identity. The caller owns the
 * requested name (URL → server state); these helpers only answer what the
 * index can support.
 */

import type {
    AssemblyComponentDefault,
    AssemblyOverride,
    PhysicalVisibility,
    PrismSemanticIndex,
    SemanticComponent,
} from "@/types/prism-selection";

export interface AssemblyProjection {
    index: PrismSemanticIndex;
    components: SemanticComponent[];
}

/**
 * Whether a requested selection can be applied:
 * - `unavailable`: the index carries no assembly block (old generator);
 * - `default`: no name requested;
 * - `applied`: the name is in this revision's catalog;
 * - `missing`: the name is not; callers render the default and say so.
 */
export type AssemblyProjectionState =
    | "unavailable"
    | "default"
    | "applied"
    | "missing";

export interface FootprintInventoryEntry {
    uuid: string;
    reference: string;
    componentUid?: string | null;
}

export function assemblyProjectionState(
    index: PrismSemanticIndex,
    name: string | null,
): AssemblyProjectionState {
    const assembly = index.assembly;
    if (!assembly) return "unavailable";
    if (!name) return "default";
    return assembly.variants.some((variant) => variant.name === name)
        ? "applied"
        : "missing";
}

function variantFor(index: PrismSemanticIndex, name: string | null) {
    if (!index.assembly || !name) return undefined;
    return index.assembly.variants.find((variant) => variant.name === name);
}

/**
 * Apply the effective assembly state to the index's components. For a base or
 * unknown name the input array and index object are returned unchanged; for a
 * known name only components whose values actually differ are copied.
 */
export function projectAssemblyState(
    index: PrismSemanticIndex,
    name: string | null,
): AssemblyProjection {
    const assembly = index.assembly;
    const variant = variantFor(index, name);
    if (!assembly || !variant) {
        return { index, components: index.components };
    }

    let changed = false;
    const components = index.components.map((component) => {
        const projected = projectComponent(
            component,
            assembly.default.components[component.componentUid],
            variant.components[component.componentUid],
        );
        if (projected !== component) changed = true;
        return projected;
    });
    return { index, components: changed ? components : index.components };
}

function projectComponent(
    component: SemanticComponent,
    defaultState: AssemblyComponentDefault | undefined,
    override: AssemblyOverride | undefined,
): SemanticComponent {
    const dnp = override?.dnp ?? defaultState?.dnp ?? false;
    const excludeFromBom =
        override?.excludeFromBom ?? defaultState?.excludeFromBom ?? false;

    const fields: Record<string, string | number | boolean | null> = {
        ...(component.fields ?? {}),
    };
    let value = component.value;
    let footprint = component.footprint;
    let changed = false;

    for (const [key, fieldValue] of Object.entries(override?.fields ?? {})) {
        fields[key] = fieldValue;
        if (key === "Value") value = fieldValue;
        else if (key === "Footprint") footprint = fieldValue;
        changed = true;
    }

    const dnpText = dnp ? "Yes" : "No";
    if (fields["DNP"] !== dnpText) {
        fields["DNP"] = dnpText;
        changed = true;
    }
    const inBomText = excludeFromBom ? "No" : "Yes";
    if (fields["In BOM"] !== inBomText) {
        fields["In BOM"] = inBomText;
        changed = true;
    }
    // Top-level and field spellings always agree in the projection.
    if (value !== undefined && fields["Value"] !== value) {
        fields["Value"] = value;
        changed = true;
    }
    if (footprint !== undefined && fields["Footprint"] !== footprint) {
        fields["Footprint"] = footprint;
        changed = true;
    }

    if (!changed) return component;
    return { ...component, value, footprint, fields };
}

/**
 * Classify physical visibility from the complete footprint inventory.
 * Differential flag maps supply effective DNP values, never membership.
 * Multiple footprints for a reference remain ambiguous in every variant.
 */
export function physicalVisibility(
    index: PrismSemanticIndex,
    name: string | null,
): Record<string, PhysicalVisibility> {
    const assembly = index.assembly;
    const variant = variantFor(index, name);
    const visibility: Record<string, PhysicalVisibility> = Object.fromEntries(
        index.components.map(({ reference }) => [reference, "absent"]),
    );
    for (const { reference, uuid } of assembly?.footprintInventory ?? []) {
        if (visibility[reference] && visibility[reference] !== "absent") {
            visibility[reference] = "ambiguous";
            continue;
        }
        const dnp = variant?.footprints[uuid]?.dnp
            ?? assembly?.default.footprints[uuid]?.dnp
            ?? false;
        visibility[reference] = dnp ? "hidden" : "visible";
    }
    return visibility;
}
