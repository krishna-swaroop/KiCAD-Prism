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

/**
 * Everything a rule is allowed to ask about a change, derived once.
 *
 * Both domains asked the same questions of the same change and each derived the
 * answers itself. Deriving them here means a rule is a predicate over settled
 * facts rather than a place that can compute `kinds` slightly differently from
 * its neighbour.
 */
type PolicyFacts = {
    change: ChangeItem;
    kinds: Set<string>;
    reasons: Set<string>;
    /** The change moved, rotated, mirrored, re-pathed, or changed layer. */
    spatial: boolean;
    hasFields: boolean;
    /** `#PWR`/`#FLG` reference: a power symbol, reviewed as connectivity. */
    powerSymbol: boolean;
    /** Any layer that a fabricator builds from, rather than reads. */
    fabricationLayer: boolean;
};

/**
 * One row of the policy.
 *
 * `rule` is the stable id quoted in `docs/design-comparison/
 * reviewer-presentation-policy.md`; keeping the tables below in the doc's order
 * is what makes the two diffable against each other.
 */
type PolicyRule = {
    rule: string;
    mode: ComparisonPresentationMode;
    reason: string;
    when: (facts: PolicyFacts) => boolean;
};

/** Terminal row: every table ends in one so evaluation always resolves. */
const ALWAYS = () => true;

function policyFacts(change: ChangeItem): PolicyFacts {
    const reasons = new Set<string>(change.reasons ?? []);
    return {
        change,
        reasons,
        kinds: objectKinds(change),
        spatial: hasAny(reasons, SPATIAL_REASONS),
        hasFields: Object.keys(change.fields ?? {}).length > 0,
        powerSymbol: /^#(?:PWR|FLG)/i.test(change.reference ?? change.label),
        fabricationLayer: (change.layers ?? []).some(isFabricationLayer),
    };
}

/** A change whose only edits are BOM/field values, with no geometry or library move. */
function isFieldOnlyComponentEdit({ reasons, spatial, hasFields }: PolicyFacts): boolean {
    return hasFields
        && !spatial
        && !reasons.has("lib-changed")
        && [...reasons].every((reason) => COMPONENT_FIELD_REASONS.has(reason));
}

function isComponentLike({ change, kinds }: PolicyFacts): boolean {
    return change.category === "components"
        || change.category === "symbols"
        || kinds.has("symbol");
}

function isSchematicGraphic({ change, kinds }: PolicyFacts): boolean {
    return kinds.has("graphic") || change.category === "graphics";
}

function isSchematicNet({ change, kinds }: PolicyFacts): boolean {
    return hasAny(kinds, SCHEMATIC_NET_OBJECTS) || change.category === "nets";
}

function isPcbGraphic({ change, kinds }: PolicyFacts): boolean {
    return hasAny(kinds, DOCUMENTATION_OBJECTS)
        || kinds.has("drawing")
        || kinds.has("graphic")
        || kinds.has("footprint_graphic")
        || change.category === "graphics";
}

/** Applies whatever the domain, and so evaluated before either table. */
const COMMON_RULES: PolicyRule[] = [
    {
        rule: "structured-rule",
        mode: "old-new",
        reason:
            "This authored rule or constraint has no direct canvas geometry; review its structured old/new values against one clean revision at a time.",
        when: ({ change }) =>
            Boolean(change.details?.reviewOnly) || change.category === "rules",
    },
];

const SCHEMATIC_RULES: PolicyRule[] = [
    {
        rule: "schematic-documentation",
        mode: "old-new",
        reason:
            "A clean revision is easier to inspect for text, image, or table content than an overlapping overlay.",
        when: ({ change, kinds }) =>
            hasAny(kinds, DOCUMENTATION_OBJECTS) || change.category === "text",
    },
    {
        rule: "schematic-electrical-exact",
        mode: "side-by-side",
        reason:
            "Both revisions must remain visible to verify the exact terminal, hierarchy, or topology change.",
        when: ({ kinds, reasons, powerSymbol }) =>
            powerSymbol
            || reasons.has("connectivity-changed")
            || reasons.has("instance-replaced")
            || reasons.has("instance-count-changed")
            || reasons.has("sheet-changed")
            || reasons.has("bus-membership-changed")
            || hasAny(kinds, SCHEMATIC_EXACT_OBJECTS),
    },
    // The three component rows share a guard and are ordered add/remove →
    // field-only → everything else, matching the nesting they replaced.
    {
        rule: "schematic-component-add-remove",
        mode: "composite",
        reason:
            "A simple symbol addition or removal is clearest in full schematic context.",
        when: (facts) => isComponentLike(facts) && facts.change.kind !== "changed",
    },
    {
        rule: "schematic-component-fields",
        mode: "old-new",
        reason:
            "This is a field or BOM-state edit; inspect each clean revision while the structured values remain visible.",
        when: (facts) => isComponentLike(facts) && isFieldOnlyComponentEdit(facts),
    },
    {
        rule: "schematic-component-geometry",
        mode: "side-by-side",
        reason:
            "Symbol placement, orientation, or library changes need simultaneous old and new geometry.",
        when: isComponentLike,
    },
    {
        rule: "schematic-net-rename",
        mode: "side-by-side",
        reason:
            "The electrical scope is unchanged, but both clean label states should remain visible while the rename is verified.",
        when: ({ reasons }) => reasons.has("net-renamed") && reasons.size === 1,
    },
    {
        rule: "schematic-graphic-geometry",
        mode: "side-by-side",
        reason:
            "The authored drawing moved or changed geometry, so both placements should be compared directly.",
        when: (facts) => isSchematicGraphic(facts) && facts.spatial,
    },
    {
        rule: "schematic-graphic-content",
        mode: "old-new",
        reason:
            "A clean revision view keeps documentation graphics legible without overlay clutter.",
        when: isSchematicGraphic,
    },
    {
        rule: "schematic-net-geometry",
        mode: "side-by-side",
        reason:
            "Modified wires, labels, or junctions need simultaneous old and new geometry.",
        when: (facts) => isSchematicNet(facts) && facts.change.kind === "changed",
    },
    {
        rule: "schematic-net-add-remove",
        mode: "composite",
        reason:
            "A net addition or removal is best reviewed with its surrounding connectivity visible.",
        when: isSchematicNet,
    },
    {
        rule: "schematic-modified-fallback",
        mode: "side-by-side",
        reason:
            "The change modifies an existing schematic object, so preserve both revisions for comparison.",
        when: ({ change }) => change.kind === "changed",
    },
    {
        rule: "schematic-add-remove-fallback",
        mode: "composite",
        reason:
            "The full schematic provides the most useful context for this addition or removal.",
        when: ALWAYS,
    },
];

const PCB_RULES: PolicyRule[] = [
    {
        rule: "pcb-net-class",
        mode: "old-new",
        reason:
            "Constraint definitions have no direct canvas geometry; compare the structured old/new rules with one clean board revision at a time.",
        when: ({ kinds }) =>
            kinds.has("net_class") || kinds.has("net_class_assignment"),
    },
    {
        rule: "pcb-group",
        mode: "composite",
        reason:
            "Board-group membership is organizational; the board-wide context is sufficient.",
        when: ({ change, kinds }) =>
            kinds.has("group") && change.classification === "secondary",
    },
    {
        rule: "pcb-fabrication-graphic",
        mode: "side-by-side",
        reason:
            "Fabrication, outline, courtyard, or placement geometry must be checked in both revisions.",
        when: (facts) =>
            isPcbGraphic(facts) && (facts.fabricationLayer || facts.spatial),
    },
    {
        rule: "pcb-documentation-graphic",
        mode: "old-new",
        reason:
            "This is documentation-layer content; clean revision inspection avoids overlapping text and lines.",
        when: isPcbGraphic,
    },
    // A pure addition or removal has nothing to compare against: one pane
    // would be empty, and half the width would go to proving an absence that
    // the composite scene states in place, in board context, with its status
    // colour. Side-by-side earns its cost only when both revisions hold
    // geometry for the same object.
    {
        rule: "pcb-one-sided",
        mode: "composite",
        reason:
            "The object exists in only one revision; the composite scene shows it in board context without spending a pane on an empty board.",
        when: ({ change, reasons }) =>
            (change.kind === "added" || change.kind === "removed")
            && !reasons.has("net-changed")
            && !reasons.has("moved")
            && !reasons.has("layer-changed"),
    },
    {
        rule: "pcb-fabrication-object",
        mode: "side-by-side",
        reason:
            "Fabricated geometry or copper connectivity changed; simultaneous revisions provide the strongest release evidence.",
        when: ({ change, kinds, reasons }) =>
            hasAny(kinds, PCB_FABRICATION_OBJECTS)
            || change.category === "components"
            || change.category === "zones"
            || change.category === "nets"
            || Boolean(change.net)
            || reasons.has("net-changed")
            || reasons.has("content-changed"),
    },
    {
        rule: "pcb-modified-fallback",
        mode: "side-by-side",
        reason:
            "An existing board object changed, so compare its old and new manufactured state directly.",
        when: ({ change }) => change.kind === "changed",
    },
    {
        rule: "pcb-add-remove-fallback",
        mode: "composite",
        reason:
            "The board-wide overlay provides useful placement context for this non-fabrication addition or removal.",
        when: ALWAYS,
    },
];

function firstMatch(
    rules: PolicyRule[],
    facts: PolicyFacts,
): ComparisonPresentationRecommendation | null {
    for (const rule of rules) {
        if (rule.when(facts)) return recommendation(rule.mode, rule.reason, rule.rule);
    }
    return null;
}

export function recommendPresentationForChange(
    change: ChangeItem,
): ComparisonPresentationRecommendation {
    const facts = policyFacts(change);
    const domainRules = change.domain === "pcb" ? PCB_RULES : SCHEMATIC_RULES;
    const matched = firstMatch(COMMON_RULES, facts) ?? firstMatch(domainRules, facts);
    // Both domain tables end in an unconditional rule, so a match is certain.
    // Returning a default rather than throwing keeps a malformed table from
    // taking down the workspace: this runs during render.
    return matched ?? recommendation(
        "composite",
        "The full design provides the most useful context for this change.",
        "unmatched",
    );
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
