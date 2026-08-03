/**
 * Reviewer-facing vocabulary for describing a change.
 *
 * Two registers, deliberately separate:
 *
 * - A **row** says what happened to the object — Added, Modified, Removed. That
 *   is `CHANGE_KIND_LABEL` and it never varies.
 * - A **property delta** says what happened to one authored field, and names
 *   the field it explains: `Re-annotated: Designator`, `Replaced: Design Item
 *   ID`. That is what this module supplies.
 *
 * Prism already records why a change happened, as reason codes on
 * `ChangeItem.reasons`. What it did not do was tie a reason to the field it
 * explains, so a reviewer saw a row of reason chips beside a table of values
 * and had to pair them up themselves. This module does the pairing.
 */

/**
 * Verb heading a property delta carries when this reason explains it.
 *
 * The three Altium 365 uses — Updated, Replaced, Re-annotated — are kept
 * verbatim because they are the established reading for those transitions. The
 * rest name the geometric and electrical changes Prism tracks and Altium's
 * schematic comparison does not.
 */
export const REASON_VERB: Record<string, string> = {
    renamed: "Re-annotated",
    "lib-changed": "Replaced",
    "instance-replaced": "Replaced",
    "symbol-fields-changed": "Updated",
    "properties-changed": "Updated",
    "dnp-changed": "Updated",
    "content-changed": "Updated",
    "object-added": "Added",
    "object-removed": "Removed",
    "instance-count-changed": "Re-instanced",
    moved: "Moved",
    rotated: "Rotated",
    mirrored: "Mirrored",
    "layer-changed": "Re-layered",
    "net-changed": "Re-netted",
    "net-renamed": "Renamed",
    "connectivity-changed": "Reconnected",
    "label-count-changed": "Re-labelled",
    "bus-membership-changed": "Re-grouped",
    "sheet-changed": "Re-pathed",
    "re-pathed": "Re-pathed",
};

const DEFAULT_VERB = "Updated";

/**
 * Fields whose meaning narrows which reason explains them.
 *
 * `reasons` are preferences in order — the first the change actually declared
 * wins. `fallback` is the verb when it declared none: a named verb where the
 * value moving *is* the transition (a designator delta is a re-annotation
 * whether or not the diff emitted `renamed`), and null where the field is
 * genuinely ambiguous and only the reason can decide.
 *
 * Design Item ID is the ambiguous case worth spelling out: a revision bump on
 * the same part reads "Updated", swapping the part behind the designator reads
 * "Replaced", and both write to that one field. Defaulting it to either verb
 * would state something the evidence does not support.
 */
const FIELD_REASON_AFFINITY: Array<{
    pattern: RegExp;
    reasons: string[];
    fallback: string | null;
}> = [
    {
        pattern: /^(designator|reference|refdes)$/i,
        reasons: ["renamed"],
        fallback: "Re-annotated",
    },
    {
        pattern: /^(lib_?id|library|design item id|symbol|footprint library)$/i,
        reasons: ["lib-changed", "instance-replaced"],
        fallback: null,
    },
    { pattern: /^position$/i, reasons: ["moved"], fallback: "Moved" },
    { pattern: /^rotation$/i, reasons: ["rotated"], fallback: "Rotated" },
    { pattern: /^mirror$/i, reasons: ["mirrored"], fallback: "Mirrored" },
    {
        pattern: /^layers?$/i,
        reasons: ["layer-changed"],
        fallback: "Re-layered",
    },
    {
        pattern: /^net$/i,
        reasons: ["net-changed", "net-renamed"],
        fallback: "Re-netted",
    },
    { pattern: /^dnp$/i, reasons: ["dnp-changed"], fallback: "Updated" },
    {
        pattern: /^sheet$/i,
        reasons: ["sheet-changed", "re-pathed"],
        fallback: "Re-pathed",
    },
];

/** Reasons that explain an authored field edit, most specific first. */
const FIELD_EDIT_REASONS = [
    "symbol-fields-changed",
    "properties-changed",
    "content-changed",
];

/**
 * The verb heading one property's old/new pair.
 *
 * `label` is the property as shown to the reviewer; `reasons` are the reason
 * codes carried by the changes behind it.
 */
export function verbForProperty(
    label: string,
    reasons: Iterable<string>,
): string {
    const declared = new Set(reasons);
    const folded = label.trim();

    for (const { pattern, reasons: candidates, fallback } of FIELD_REASON_AFFINITY) {
        if (!pattern.test(folded)) continue;
        const matched = candidates.find((reason) => declared.has(reason));
        if (matched) return REASON_VERB[matched] ?? DEFAULT_VERB;
        // Ambiguous field with nothing to disambiguate it: fall through to the
        // generic path rather than asserting one of the candidate verbs.
        if (fallback) return fallback;
        break;
    }

    const fieldEdit = FIELD_EDIT_REASONS.find((reason) => declared.has(reason));
    if (fieldEdit) return REASON_VERB[fieldEdit] ?? DEFAULT_VERB;

    // No affinity and no field-edit reason: take whatever the change declared,
    // in the map's own order so the choice is stable rather than incidental.
    for (const reason of Object.keys(REASON_VERB)) {
        if (declared.has(reason)) return REASON_VERB[reason]!;
    }
    return DEFAULT_VERB;
}

/** Title-cases a raw field or reason identifier for display. */
export function humanize(value: string): string {
    return value
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toLocaleUpperCase());
}
