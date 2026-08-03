/**
 * What a single change *is*, as reviewer-facing vocabulary.
 *
 * Everything here reads one `ChangeItem` and answers a question about it — what
 * kind of KiCad object it names, which sheet it lives on, which of its fields
 * carry an authored decision rather than a nudged coordinate. The noise policy,
 * the grouping rules and the queue all ask those questions, and they must get
 * the same answer, so they ask here.
 *
 * Nothing in this module knows about groups or about the review queue.
 */

import { CATEGORY_META, type Category } from "@/lib/diff-grouping";
import type { ChangeItem, FieldDiffValue } from "./types";

const NET_REASON_CODES = new Set([
    "connectivity-changed",
    "net-renamed",
    "label-count-changed",
]);

const SCHEMATIC_LAYOUT_REASONS = new Set([
    "moved",
    "rotated",
    "mirrored",
    "properties-changed",
]);

export const SCHEMATIC_WIRING_KINDS = new Set([
    "wire",
    "junction",
    "bus",
    "bus_entry",
]);

export const PCB_COPPER_KINDS = new Set([
    "track",
    "segment",
    "arc",
    "arc_segment",
    "via",
]);

export const PCB_COMPONENT_CHILD_KINDS = new Set([
    "pad",
    "footprint_graphic",
    "footprint_text",
    "footprint_zone",
    "zone",
]);

export const RULE_KINDS = new Set([
    "board_constraint",
    "board_default",
    "custom_rule",
    "drc_exclusion",
    "drc_severity",
    "erc_exclusion",
    "erc_pin_rule",
    "fabrication_output",
    "net_class",
    "net_class_assignment",
    "routing_preset",
    "teardrop_setting",
    "zone_setting",
]);

const LAYOUT_FIELD_NAMES = new Set([
    "position",
    "rotation",
    "mirror",
]);

const STRUCTURED_GEOMETRY_KEYS = new Set([
    "at",
    "points",
    "position",
    "rotation",
    "size",
    // Native identifiers are editor bookkeeping, not review evidence.
    "uuid",
    "tstamp",
    "sourceUuid",
    "busUid",
]);

function normalizeCategory(category: string): Category {
    if (category === "board") return "other";
    return category in CATEGORY_META ? (category as Category) : "other";
}

function isSchematicPowerReference(change: ChangeItem): boolean {
    return change.domain === "schematic"
        && /^#(?:PWR|FLG)/i.test(change.reference ?? change.label);
}

export function objectKind(change: ChangeItem): string {
    return String(
        change.object_kind
        ?? change.geometry?.kind
        ?? change.oldGeometry?.kind
        ?? "object",
    ).toLocaleLowerCase();
}

export function changeLayers(change: ChangeItem): string[] {
    return [
        ...(change.layers ?? []),
        change.geometry?.layer,
        change.oldGeometry?.layer,
        change.base_item?.layer,
        change.compare_item?.layer,
    ].filter((layer): layer is string => Boolean(layer));
}

export function hasNativeParent(change: ChangeItem): boolean {
    return Boolean(
        change.parent_source_id_base
        || change.parent_source_id_compare
        || change.base_item?.parent_source_id
        || change.compare_item?.parent_source_id,
    );
}

export function semanticCategory(change: ChangeItem): Category {
    const category = normalizeCategory(change.category);
    const kind = objectKind(change);
    if (category === "rules" || RULE_KINDS.has(kind)) return "rules";
    if (change.domain === "pcb" && change.reference) {
        if (kind === "pad") {
            return change.kind === "changed"
                && (change.reasons?.includes("net-changed") || "Net" in (change.fields ?? {}))
                ? "nets"
                : "components";
        }
        if (PCB_COMPONENT_CHILD_KINDS.has(kind) && (kind !== "zone" || hasNativeParent(change))) {
            return "components";
        }
    }
    if (category === "zones") return category;
    if (
        isSchematicPowerReference(change)
        || change.net
        || change.reasons?.some((reason) => NET_REASON_CODES.has(reason))
    ) {
        return "nets";
    }
    return category;
}

export function referenceFor(change: ChangeItem): string | null {
    return change.reference
        ?? change.compare_item?.reference
        ?? change.base_item?.reference
        ?? change.details?.visualTargets?.find((target) => target.reference)?.reference
        ?? null;
}

export function pageFor(change: ChangeItem): string {
    return change.page
        ?? change.compare_item?.path
        ?? change.compare_item?.page
        ?? change.base_item?.path
        ?? change.base_item?.page
        ?? change.details?.visualTargets?.[0]?.documentPath
        ?? change.details?.visualTargets?.[0]?.page
        ?? "Schematic";
}

function normalizedValue(value: unknown): unknown {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) return value.map(normalizedValue);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, normalizedValue(entry)]),
        );
    }
    return value;
}

export function fieldSides(value: FieldDiffValue): { old: unknown; new: unknown } | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const sides = value as { old?: unknown; new?: unknown };
    if (!("old" in sides) && !("new" in sides)) return null;
    return { old: sides.old, new: sides.new };
}

function valuesEquivalent(oldValue: unknown, newValue: unknown): boolean {
    return JSON.stringify(normalizedValue(oldValue)) === JSON.stringify(normalizedValue(newValue));
}

function isLayoutField(name: string): boolean {
    const folded = name.trim().toLocaleLowerCase();
    return LAYOUT_FIELD_NAMES.has(folded) || folded.endsWith(" attributes");
}

function parsedStructuredValue(value: unknown): unknown {
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function withoutStructuredGeometry(value: unknown): unknown {
    const parsed = parsedStructuredValue(value);
    if (Array.isArray(parsed)) return parsed.map(withoutStructuredGeometry);
    if (parsed && typeof parsed === "object") {
        return Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
                .filter(([key]) => !STRUCTURED_GEOMETRY_KEYS.has(key))
                .map(([key, child]) => [key, withoutStructuredGeometry(child)]),
        );
    }
    return parsed;
}

function isStructuredGeometryOnlyField(
    name: string,
    sides: { old: unknown; new: unknown },
): boolean {
    if (!name.trim().toLocaleLowerCase().endsWith("content")) return false;
    const oldValue = parsedStructuredValue(sides.old);
    const newValue = parsedStructuredValue(sides.new);
    if (
        !oldValue || typeof oldValue !== "object"
        || !newValue || typeof newValue !== "object"
    ) return false;
    return !valuesEquivalent(oldValue, newValue)
        && valuesEquivalent(
            withoutStructuredGeometry(oldValue),
            withoutStructuredGeometry(newValue),
        );
}

export function hasStructuredGeometryOnlyField(change: ChangeItem): boolean {
    return Object.entries(change.fields ?? {}).some(([name, value]) => {
        const sides = fieldSides(value);
        return Boolean(sides && isStructuredGeometryOnlyField(name, sides));
    });
}

export function meaningfulFieldEntries(change: ChangeItem): Array<[string, { old: unknown; new: unknown }]> {
    const entries: Array<[string, { old: unknown; new: unknown }]> = [];
    for (const [name, value] of Object.entries(change.fields ?? {})) {
        if (isLayoutField(name)) continue;
        const sides = fieldSides(value);
        if (!sides || valuesEquivalent(sides.old, sides.new)) continue;
        if (isStructuredGeometryOnlyField(name, sides)) continue;
        entries.push([name, sides]);
    }
    return entries;
}

export function isSamePageLayoutOnly(change: ChangeItem): boolean {
    if (change.domain !== "schematic" || change.kind !== "changed") return false;
    if (hasStructuredGeometryOnlyField(change) && meaningfulFieldEntries(change).length === 0) {
        return true;
    }
    const reasons = change.reasons ?? [];
    if (!reasons.length || reasons.some((reason) => !SCHEMATIC_LAYOUT_REASONS.has(reason))) {
        return false;
    }
    return meaningfulFieldEntries(change).length === 0;
}

export function parentSymbolKey(change: ChangeItem): string {
    return [change.kind, referenceFor(change) ?? "", pageFor(change)].join(":");
}

export function stringFieldPair(
    change: ChangeItem,
    names: string[],
): { old: string; new: string } | null {
    for (const name of names) {
        const sides = fieldSides(change.fields?.[name]);
        if (typeof sides?.old === "string" && typeof sides.new === "string") {
            return { old: sides.old, new: sides.new };
        }
    }
    return null;
}

export function compactValue(value: unknown): string {
    const normalized = normalizedValue(value);
    if (normalized === null || normalized === undefined || normalized === "") return "—";
    if (typeof normalized === "string" || typeof normalized === "number" || typeof normalized === "boolean") {
        return String(normalized);
    }
    const encoded = JSON.stringify(normalized);
    return encoded.length > 42 ? `${encoded.slice(0, 39)}…` : encoded;
}
