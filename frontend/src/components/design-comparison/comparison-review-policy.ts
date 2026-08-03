import type { ComparisonPresentationMode } from "./comparison-url";
import type { ChangeItem } from "./types";

export type ComparisonPresentationRecommendation = {
    mode: ComparisonPresentationMode;
    label: string;
    reason: string;
    rule: string;
};

export const PRESENTATION_LABELS: Record<ComparisonPresentationMode, string> = {
    composite: "Composite",
    "side-by-side": "Side by side",
    "old-new": "Old / New",
};

const SPATIAL_REASONS = new Set([
    "moved",
    "rotated",
    "mirrored",
    "layer-changed",
    "re-pathed",
]);

const COMPONENT_FIELD_REASONS = new Set([
    "symbol-fields-changed",
    "properties-changed",
    "dnp-changed",
    "renamed",
]);

const SCHEMATIC_EXACT_OBJECTS = new Set([
    "pin",
    "sheet_pin",
    "no_connect",
    "bus",
    "bus_entry",
    "sheet",
]);

const SCHEMATIC_NET_OBJECTS = new Set([
    "wire",
    "label",
    "global_label",
    "hierarchical_label",
    "junction",
]);

const PCB_FABRICATION_OBJECTS = new Set([
    "footprint",
    "pad",
    "track",
    "segment",
    "arc",
    "arc_segment",
    "via",
    "zone",
    "footprint_zone",
]);

const DOCUMENTATION_OBJECTS = new Set([
    "image",
    "table",
    "text",
    "footprint_text",
]);

const PCB_REVIEW_LAYER_SUFFIXES = [
    ".Cu",
    ".Mask",
    ".Paste",
    ".SilkS",
    ".Fab",
    ".CrtYd",
    ".Adhes",
];

function recommendation(
    mode: ComparisonPresentationMode,
    reason: string,
    rule: string,
): ComparisonPresentationRecommendation {
    return {
        mode,
        label: PRESENTATION_LABELS[mode],
        reason,
        rule,
    };
}

function hasAny(values: Iterable<string>, expected: Set<string>): boolean {
    for (const value of values) {
        if (expected.has(value)) return true;
    }
    return false;
}

function objectKinds(change: ChangeItem): Set<string> {
    const kinds = new Set<string>();
    for (const value of [
        change.object_kind,
        change.geometry?.kind,
        change.oldGeometry?.kind,
        ...(change.details?.visualTargets ?? []).flatMap((target) => [
            target.kind,
            target.role,
        ]),
    ]) {
        if (value) kinds.add(String(value).toLocaleLowerCase());
    }
    if (!kinds.size && change.category === "components") {
        kinds.add(change.domain === "pcb" ? "footprint" : "symbol");
    }
    return kinds;
}

function isFabricationLayer(layer: string): boolean {
    const folded = layer.toLocaleLowerCase();
    return folded === "edge.cuts"
        || folded === "margin"
        || PCB_REVIEW_LAYER_SUFFIXES.some((suffix) =>
            folded.endsWith(suffix.toLocaleLowerCase())
        );
}

function schematicRecommendation(
    change: ChangeItem,
): ComparisonPresentationRecommendation {
    const kinds = objectKinds(change);
    const reasons = new Set<string>(change.reasons ?? []);
    const spatial = hasAny(reasons, SPATIAL_REASONS);
    const hasFields = Object.keys(change.fields ?? {}).length > 0;
    const powerSymbol = /^#(?:PWR|FLG)/i.test(change.reference ?? change.label);

    if (hasAny(kinds, DOCUMENTATION_OBJECTS) || change.category === "text") {
        return recommendation(
            "old-new",
            "A clean revision is easier to inspect for text, image, or table content than an overlapping overlay.",
            "schematic-documentation",
        );
    }

    if (
        powerSymbol
        || reasons.has("connectivity-changed")
        || reasons.has("instance-replaced")
        || reasons.has("instance-count-changed")
        || reasons.has("sheet-changed")
        || reasons.has("bus-membership-changed")
        || hasAny(kinds, SCHEMATIC_EXACT_OBJECTS)
    ) {
        return recommendation(
            "side-by-side",
            "Both revisions must remain visible to verify the exact terminal, hierarchy, or topology change.",
            "schematic-electrical-exact",
        );
    }

    if (
        change.category === "components"
        || change.category === "symbols"
        || kinds.has("symbol")
    ) {
        if (change.kind !== "changed") {
            return recommendation(
                "composite",
                "A simple symbol addition or removal is clearest in full schematic context.",
                "schematic-component-add-remove",
            );
        }
        const fieldOnly = hasFields
            && !spatial
            && !reasons.has("lib-changed")
            && [...reasons].every((reason) => COMPONENT_FIELD_REASONS.has(reason));
        if (fieldOnly) {
            return recommendation(
                "old-new",
                "This is a field or BOM-state edit; inspect each clean revision while the structured values remain visible.",
                "schematic-component-fields",
            );
        }
        return recommendation(
            "side-by-side",
            "Symbol placement, orientation, or library changes need simultaneous old and new geometry.",
            "schematic-component-geometry",
        );
    }

    if (reasons.has("net-renamed") && reasons.size === 1) {
        return recommendation(
            "side-by-side",
            "The electrical scope is unchanged, but both clean label states should remain visible while the rename is verified.",
            "schematic-net-rename",
        );
    }

    if (kinds.has("graphic") || change.category === "graphics") {
        if (spatial) {
            return recommendation(
                "side-by-side",
                "The authored drawing moved or changed geometry, so both placements should be compared directly.",
                "schematic-graphic-geometry",
            );
        }
        return recommendation(
            "old-new",
            "A clean revision view keeps documentation graphics legible without overlay clutter.",
            "schematic-graphic-content",
        );
    }

    if (hasAny(kinds, SCHEMATIC_NET_OBJECTS) || change.category === "nets") {
        if (change.kind === "changed") {
            return recommendation(
                "side-by-side",
                "Modified wires, labels, or junctions need simultaneous old and new geometry.",
                "schematic-net-geometry",
            );
        }
        return recommendation(
            "composite",
            "A net addition or removal is best reviewed with its surrounding connectivity visible.",
            "schematic-net-add-remove",
        );
    }

    if (change.kind === "changed") {
        return recommendation(
            "side-by-side",
            "The change modifies an existing schematic object, so preserve both revisions for comparison.",
            "schematic-modified-fallback",
        );
    }
    return recommendation(
        "composite",
        "The full schematic provides the most useful context for this addition or removal.",
        "schematic-add-remove-fallback",
    );
}

function pcbRecommendation(
    change: ChangeItem,
): ComparisonPresentationRecommendation {
    const kinds = objectKinds(change);
    const reasons = new Set<string>(change.reasons ?? []);
    const layers = change.layers ?? [];
    const fabricationLayer = layers.some(isFabricationLayer);

    if (kinds.has("net_class") || kinds.has("net_class_assignment")) {
        return recommendation(
            "old-new",
            "Constraint definitions have no direct canvas geometry; compare the structured old/new rules with one clean board revision at a time.",
            "pcb-net-class",
        );
    }

    if (kinds.has("group") && change.classification === "secondary") {
        return recommendation(
            "composite",
            "Board-group membership is organizational; the board-wide context is sufficient.",
            "pcb-group",
        );
    }

    if (
        hasAny(kinds, DOCUMENTATION_OBJECTS)
        || kinds.has("drawing")
        || kinds.has("graphic")
        || kinds.has("footprint_graphic")
        || change.category === "graphics"
    ) {
        if (fabricationLayer || hasAny(reasons, SPATIAL_REASONS)) {
            return recommendation(
                "side-by-side",
                "Fabrication, outline, courtyard, or placement geometry must be checked in both revisions.",
                "pcb-fabrication-graphic",
            );
        }
        return recommendation(
            "old-new",
            "This is documentation-layer content; clean revision inspection avoids overlapping text and lines.",
            "pcb-documentation-graphic",
        );
    }

    // A pure addition or removal has nothing to compare against: one pane
    // would be empty, and half the width would go to proving an absence that
    // the composite scene states in place, in board context, with its status
    // colour. Side-by-side earns its cost only when both revisions hold
    // geometry for the same object.
    if (
        (change.kind === "added" || change.kind === "removed")
        && !reasons.has("net-changed")
        && !reasons.has("moved")
        && !reasons.has("layer-changed")
    ) {
        return recommendation(
            "composite",
            "The object exists in only one revision; the composite scene shows it in board context without spending a pane on an empty board.",
            "pcb-one-sided",
        );
    }

    if (
        hasAny(kinds, PCB_FABRICATION_OBJECTS)
        || change.category === "components"
        || change.category === "zones"
        || change.category === "nets"
        || change.net
        || reasons.has("net-changed")
        || reasons.has("content-changed")
    ) {
        return recommendation(
            "side-by-side",
            "Fabricated geometry or copper connectivity changed; simultaneous revisions provide the strongest release evidence.",
            "pcb-fabrication-object",
        );
    }

    if (change.kind === "changed") {
        return recommendation(
            "side-by-side",
            "An existing board object changed, so compare its old and new manufactured state directly.",
            "pcb-modified-fallback",
        );
    }
    return recommendation(
        "composite",
        "The board-wide overlay provides useful placement context for this non-fabrication addition or removal.",
        "pcb-add-remove-fallback",
    );
}

export function recommendPresentationForChange(
    change: ChangeItem,
): ComparisonPresentationRecommendation {
    if (change.details?.reviewOnly || change.category === "rules") {
        return recommendation(
            "old-new",
            "This authored rule or constraint has no direct canvas geometry; review its structured old/new values against one clean revision at a time.",
            "structured-rule",
        );
    }
    return change.domain === "pcb"
        ? pcbRecommendation(change)
        : schematicRecommendation(change);
}

export function recommendPresentationForChanges(
    changes: ChangeItem[],
): ComparisonPresentationRecommendation {
    if (!changes.length) {
        return recommendation(
            "composite",
            "Select a change to let Prism choose the most useful review view.",
            "overview",
        );
    }
    const schematicReferences = new Set(
        changes
            .filter((change) => change.domain === "schematic")
            .map((change) => change.reference)
            .filter(Boolean),
    );
    const pages = new Set(changes.flatMap((change) => [
        change.page,
        change.base_item?.path,
        change.compare_item?.path,
    ]).filter(Boolean));
    if (
        schematicReferences.size === 1
        && pages.size > 1
        && changes.some((change) => change.kind === "added")
        && changes.some((change) => change.kind === "removed")
    ) {
        return recommendation(
            "side-by-side",
            "The same design item moved between schematic pages; keep both source and destination visible to verify the relocation in context.",
            "group:schematic-cross-sheet-relocation",
        );
    }
    const recommendations = changes.map(recommendPresentationForChange);
    const selected = recommendations.find((item) => item.mode === "side-by-side")
        ?? recommendations.find((item) => item.mode === "old-new")
        ?? recommendations[0]!;
    if (changes.length === 1) return selected;
    return {
        ...selected,
        reason: `${selected.reason} This group contains ${changes.length} related changes.`,
        rule: `group:${selected.rule}`,
    };
}

/**
 * Auto for a whole tab, where the differences queue has nothing to say.
 *
 * Fabrication output is manufactured evidence, which the PCB rules below
 * already review side by side. Returning a recommendation rather than setting
 * the mode directly keeps the Auto button's tooltip honest about what Auto
 * chose.
 */
export function recommendPresentationForTab(
    tab: string,
    changes: ChangeItem[],
): ComparisonPresentationRecommendation {
    if (tab === "fabrication") {
        return recommendation(
            "side-by-side",
            "Fabrication output is manufactured evidence; both plotted revisions stay visible.",
            "tab:fabrication",
        );
    }
    return recommendPresentationForChanges(changes);
}

export function presentationForSelection(
    current: ComparisonPresentationMode,
    recommendation: ComparisonPresentationRecommendation,
    autoPresentation: boolean,
): ComparisonPresentationMode {
    return autoPresentation ? recommendation.mode : current;
}
