/**
 * Review evidence for the selected change, as data.
 *
 * Moved out of the old selected-change card so the same derivations can feed
 * the property panel without dragging a React component along, and so the
 * pairing rules stay testable on their own.
 */

import { humanize, verbForProperty } from "./comparison-change-vocabulary";
import type {
    ChangeItem,
    FieldDiffValue,
    PcbDiff,
    RouteMetrics,
} from "./types";

/**
 * Fields worth leading with, in this order. Everything else the BOM carries
 * follows alphabetically, so a project with custom fields still shows them.
 */
const PRIMARY_FIELDS = [
    "Value",
    "Footprint",
    "Description",
    "Manufacturer",
    "Manufacturer Part Number",
    "Vendor",
    "Vendor Part Number",
    "Datasheet",
] as const;

const HIDDEN_FIELDS = new Set(["Reference", "Qty", "DNP"]);

/**
 * KiCad object kinds that are a route rather than a placed part.
 *
 * Wider than the grouping module's `PCB_COPPER_KINDS`, and deliberately so:
 * that set decides which changes bucket onto one conductor and answers to the
 * parser's own vocabulary, while this one decides how a group's fields are
 * summarised and has to accept every spelling a provider might emit.
 */
const ROUTING_OBJECT_KINDS = new Set([
    "track",
    "segment",
    "arc",
    "arc_segment",
    "via",
]);

function isRouting(change: ChangeItem): boolean {
    return ROUTING_OBJECT_KINDS.has(change.object_kind ?? "");
}

/**
 * Fields a footprint's own primitives repeat from the footprint itself. Listing
 * them per primitive buries the electrical evidence under placement noise.
 */
const FOOTPRINT_PRIMITIVE_FIELDS = new Set([
    "graphic type",
    "layer",
    "position",
    "reference",
    "rotation",
    "stroke",
]);

const FOOTPRINT_PRIMITIVE_KINDS = new Set([
    "footprint_graphic",
    "footprint_text",
]);

/**
 * Position is proven by the two canvases and a RefDes means nothing on copper.
 * Net and layer stay: when a route changes net or layer without moving, that
 * pair *is* the change.
 */
const ROUTING_CONTEXT_FIELDS = new Set(["position", "reference"]);

/** Ordered field entries for display: primaries first, then the rest. */
export function orderedFields(
    fields: Record<string, string>,
): Array<[string, string]> {
    const remaining = new Map(
        Object.entries(fields).filter(
            ([name, value]) =>
                !HIDDEN_FIELDS.has(name)
                // kicad_* are the raw flags behind DNP / in-BOM, surfaced as
                // badges rather than repeated as raw strings.
                && !name.startsWith("kicad_")
                && String(value ?? "").trim() !== "",
        ),
    );
    const ordered: Array<[string, string]> = [];
    for (const name of PRIMARY_FIELDS) {
        const value = remaining.get(name);
        if (value !== undefined) {
            ordered.push([name, value]);
            remaining.delete(name);
        }
    }
    return [
        ...ordered,
        ...[...remaining.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ];
}

export function isTruthyFlag(value: string | undefined): boolean {
    return String(value ?? "").toLocaleLowerCase() === "true";
}

/**
 * Every field name to show for a component, merging both revisions.
 *
 * A field that exists only in one revision is still evidence — it was added or
 * dropped — so taking the union rather than one side's keys is what lets the
 * panel show that.
 */
export function componentFieldNames(
    oldFields: Record<string, string> | undefined,
    newFields: Record<string, string> | undefined,
): string[] {
    const merged: Record<string, string> = { ...oldFields, ...newFields };
    return orderedFields(merged).map(([name]) => name);
}

export type PropertyDelta = {
    id: string;
    /** Property as shown to the reviewer, e.g. "Design Item ID". */
    label: string;
    /** Verb that explains this property's move, e.g. "Replaced". */
    verb: string;
    oldValue: unknown;
    newValue: unknown;
};

export function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.map(formatValue).join(", ");
    if (typeof value === "object") {
        return Object.entries(value as Record<string, unknown>)
            .map(([key, child]) => `${humanize(key)}: ${formatValue(child)}`)
            .join("; ");
    }
    return String(value);
}

function fieldPair(
    value: FieldDiffValue,
): { oldValue: unknown; newValue: unknown } {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return { oldValue: value.old, newValue: value.new };
    }
    return { oldValue: null, newValue: value };
}

function positionText(value?: [number, number] | null): string | null {
    return value ? `${value[0]}, ${value[1]}` : null;
}

function withoutSchematicPlacement(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(withoutSchematicPlacement);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([key]) => !["at", "position"].includes(key.toLocaleLowerCase()))
                .map(([key, child]) => [key, withoutSchematicPlacement(child)]),
        );
    }
    return value;
}

function schematicPlacementOnlyField(
    label: string,
    value: FieldDiffValue,
): boolean {
    const folded = label.trim().toLocaleLowerCase();
    if (folded === "position") return true;
    if (!folded.endsWith("attributes")) return false;
    const pair = fieldPair(value);
    return JSON.stringify(withoutSchematicPlacement(pair.oldValue))
        === JSON.stringify(withoutSchematicPlacement(pair.newValue));
}

/**
 * Authored old/new pairs behind a review item, each headed by the verb that
 * explains it.
 *
 * The rules about what to leave out are unchanged from the selected-change
 * card: same-page schematic placement is proven by the canvases, a routing
 * group's per-segment values are aggregated rather than repeated, and a
 * footprint's primitive geometry stays summarized.
 */
export function propertyDeltas(changes: ChangeItem[]): PropertyDelta[] {
    const rows: PropertyDelta[] = [];
    const seen = new Set<string>();
    const routingGroup = changes.length > 1 && changes.every(isRouting);
    const aggregateRouteFields = new Map<string, {
        label: string;
        oldValues: Map<string, unknown>;
        newValues: Map<string, unknown>;
    }>();
    const reasons = new Set(changes.flatMap((change) => change.reasons ?? []));
    const push = (row: Omit<PropertyDelta, "verb">) => {
        const key = `${row.label}:${formatValue(row.oldValue)}:${formatValue(row.newValue)}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({ ...row, verb: verbForProperty(row.label, reasons) });
    };

    for (const change of changes) {
        for (const [label, value] of Object.entries(change.fields ?? {})) {
            const foldedLabel = label.toLocaleLowerCase();
            if (
                change.domain === "schematic"
                && change.classification !== "secondary"
                && schematicPlacementOnlyField(label, value)
            ) {
                continue;
            }
            if (routingGroup) {
                if (ROUTING_CONTEXT_FIELDS.has(foldedLabel)) continue;
                const pair = fieldPair(value);
                const aggregate = aggregateRouteFields.get(foldedLabel) ?? {
                    label,
                    oldValues: new Map<string, unknown>(),
                    newValues: new Map<string, unknown>(),
                };
                if (pair.oldValue !== null && pair.oldValue !== undefined) {
                    aggregate.oldValues.set(formatValue(pair.oldValue), pair.oldValue);
                }
                if (pair.newValue !== null && pair.newValue !== undefined) {
                    aggregate.newValues.set(formatValue(pair.newValue), pair.newValue);
                }
                aggregateRouteFields.set(foldedLabel, aggregate);
                continue;
            }
            if (
                changes.length > 1
                && FOOTPRINT_PRIMITIVE_KINDS.has(change.object_kind ?? "")
                && FOOTPRINT_PRIMITIVE_FIELDS.has(foldedLabel)
            ) {
                continue;
            }
            push({
                id: `${change.id}:field:${label}`,
                label: humanize(label),
                ...fieldPair(value),
            });
        }
        // A route/net group can contain dozens of native objects. Listing every
        // centroid crowds out the electrical evidence; one exact object still
        // gets its old/new position.
        if (changes.length === 1) {
            const oldPosition = positionText(change.position_base);
            const newPosition = positionText(change.position_compare);
            if ((oldPosition || newPosition) && oldPosition !== newPosition) {
                push({
                    id: `${change.id}:position`,
                    label: "Position",
                    oldValue: oldPosition,
                    newValue: newPosition,
                });
            }
        }
        if (change.details?.sheetChange) {
            push({
                id: `${change.id}:sheet`,
                label: "Sheet",
                oldValue: change.details.sheetChange.old,
                newValue: change.details.sheetChange.new,
            });
        }
    }
    for (const [key, aggregate] of aggregateRouteFields) {
        const oldKeys = [...aggregate.oldValues.keys()].sort();
        const newKeys = [...aggregate.newValues.keys()].sort();
        if (JSON.stringify(oldKeys) === JSON.stringify(newKeys)) continue;
        push({
            id: `route-field:${key}`,
            label: humanize(aggregate.label),
            oldValue: oldKeys.length ? oldKeys.join(", ") : null,
            newValue: newKeys.length ? newKeys.join(", ") : null,
        });
    }
    return rows;
}

/** Metrics worth stating for a route, in the order a reviewer reads them. */
const ROUTE_METRIC_ROWS: ReadonlyArray<{
    id: string;
    label: string;
    key: keyof RouteMetrics;
    /** Metrics carrying a physical length are shown with their unit. */
    millimetres?: boolean;
}> = [
    {
        id: "route:length",
        label: "Route length",
        key: "centerline_length_mm",
        millimetres: true,
    },
    { id: "route:vias", label: "Via count", key: "via_count" },
    { id: "route:layers", label: "Used layers", key: "used_layers" },
    {
        id: "route:barrel",
        label: "Via barrel",
        key: "via_barrel_length_mm",
        millimetres: true,
    },
];

export function routeMetricRows(
    changes: ChangeItem[],
    metrics?: PcbDiff["route_metrics"],
): PropertyDelta[] {
    const routingChanges = changes.filter(
        (change) => change.net && isRouting(change),
    );
    if (!routingChanges.length || !metrics) return [];

    const nonEmptyName = (value: unknown): string | null =>
        typeof value === "string" && value.trim() ? value : null;
    const sideNet = (side: "old" | "new"): string | null => {
        for (const change of routingChanges) {
            // Parser changes use the authored field name `Net`. Keep `name` as
            // a compatibility fallback for semantic providers.
            const pair = fieldPair(change.fields?.Net ?? change.fields?.name);
            const explicit = nonEmptyName(
                side === "old" ? pair.oldValue : pair.newValue,
            );
            if (explicit) return explicit;
            if (
                (side === "old" && change.kind !== "added")
                || (side === "new" && change.kind !== "removed")
            ) {
                const current = nonEmptyName(change.net);
                if (current) return current;
            }
        }
        return null;
    };
    const oldNet = sideNet("old");
    const newNet = sideNet("new");
    const oldMetric = oldNet ? metrics.base[oldNet] : undefined;
    const newMetric = newNet ? metrics.compare[newNet] : undefined;
    if (!oldMetric && !newMetric) return [];

    const value = (
        metric: RouteMetrics | undefined,
        row: (typeof ROUTE_METRIC_ROWS)[number],
    ): unknown => {
        const raw = metric?.[row.key];
        if (raw === null || raw === undefined) return null;
        return row.millimetres ? `${raw} mm` : raw;
    };
    return ROUTE_METRIC_ROWS.map((row) => ({
        id: row.id,
        label: row.label,
        verb: "Rerouted",
        oldValue: value(oldMetric, row),
        newValue: value(newMetric, row),
    }));
}

export type ChangeEvidenceMode = "visual" | "structured" | "unresolved";

/**
 * Whether the reviewer can cross-probe this change on the canvas.
 *
 * A rule, constraint, exclusion, or aggregate semantic record has no standalone
 * KiCad object by design, and saying so is honest evidence. A change that names
 * a native object but carries no target is a visualization failure, and hiding
 * that behind the same wording would let a silent resolution bug read as a
 * legitimate non-geometric change.
 */
export function changeEvidenceMode(changes: ChangeItem[]): ChangeEvidenceMode {
    if (changes.some((change) => (change.details?.visualTargets?.length ?? 0) > 0)) {
        return "visual";
    }
    const expectsCanvasTarget = (change: ChangeItem): boolean =>
        !change.details?.reviewOnly
        && Boolean(change.source_id_base || change.source_id_compare);
    return changes.some(expectsCanvasTarget) ? "unresolved" : "structured";
}

export type ConnectionEntry = {
    id: string;
    /** Terminal as authored, e.g. "U3-42". */
    label: string;
    kind: "added" | "removed";
    /** The change that owns this terminal, so selecting it can focus a canvas. */
    change: ChangeItem;
};

/**
 * A net's connectivity delta as navigable entries rather than prose.
 *
 * The old card joined these into two comma-separated lines, which told a
 * reviewer a pin had moved but gave them no way to go and look at it. One entry
 * per terminal restores the drill-down.
 */
export function connectionEntries(changes: ChangeItem[]): ConnectionEntry[] {
    const entries: ConnectionEntry[] = [];
    const seen = new Set<string>();
    for (const change of changes) {
        const connectivity = change.details?.connectivity;
        if (!connectivity) continue;
        const sides = [
            ["added", connectivity.addedTerminals],
            ["removed", connectivity.removedTerminals],
        ] as const;
        for (const [kind, terminals] of sides) {
            for (const terminal of terminals) {
                const key = `${kind}:${terminal}`;
                if (seen.has(key)) continue;
                seen.add(key);
                entries.push({
                    id: `${change.id}:${key}`,
                    label: terminal,
                    kind,
                    change,
                });
            }
        }
    }
    return entries.sort((left, right) => (
        left.kind === right.kind
            ? left.label.localeCompare(right.label, undefined, { numeric: true })
            : left.kind === "added" ? -1 : 1
    ));
}

/**
 * The same connectivity delta as prose, for the panel's summary lines.
 *
 * Derived from `connectionEntries` rather than walking `details.connectivity`
 * again, so the two can never disagree about which terminals moved — the panel
 * says "Added: U3-42" and the row that drills into it must list the same pin.
 */
export function terminalSummary(changes: ChangeItem[]) {
    const entries = connectionEntries(changes);
    if (!entries.length) return null;
    const named = (kind: ConnectionEntry["kind"]) =>
        entries.filter((entry) => entry.kind === kind).map((entry) => entry.label);
    return { added: named("added"), removed: named("removed") };
}
