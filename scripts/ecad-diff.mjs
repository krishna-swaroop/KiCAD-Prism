#!/usr/bin/env node
/**
 * Diff two parsed snapshots and emit only the delta.
 *
 * M2 of the Design Comparison revamp. One Node process parses base and head
 * and returns added / removed / modified. Shipping 44k parsed objects across
 * the Python/Node boundary would hand back everything the parser wins;
 * shipping ~2.5k changes will not.
 *
 * Identity is `documentPath#uuid`, not the uuid alone. A reused hierarchical
 * sheet is one file, so the same uuid legitimately appears in several
 * documents' *instances*; within one file it is unique. Collapsing on the uuid
 * is what merged distinct components onto one change id before `35cd76f`.
 *
 * A modification is classified rather than merely flagged: the parser knows an
 * object *moved* rather than that its bytes differ, for every kind, without a
 * special case for components.
 *
 * Usage:
 *   node scripts/ecad-diff.mjs <base-snapshot> <head-snapshot> [--out FILE]
 *                              [--summary-only]
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { index_snapshot } from "./ecad-parse.mjs";

export const SCHEMA = "prism.ecad_object_delta_v1";

/** Fields whose change has a name worth reporting, in report order. */
const CLASSIFIERS = [
    ["moved", (before, after) => !same_point(before.at, after.at)],
    ["rotated", (before, after) => (before.rotation ?? 0) !== (after.rotation ?? 0)],
    ["mirrored", (before, after) => before.mirror !== after.mirror],
    ["layer-changed", (before, after) => before.layer !== after.layer],
    ["net-changed", (before, after) => before.net !== after.net],
    ["renamed", (before, after) => before.refdes !== after.refdes],
    ["lib-changed", (before, after) => before.libId !== after.libId],
    ["dnp-changed", (before, after) => (before.dnp ?? false) !== (after.dnp ?? false)],
    [
        "re-pathed",
        (before, after) =>
            JSON.stringify(before.kiidPaths ?? []) !== JSON.stringify(after.kiidPaths ?? []),
    ],
];

const CLASSIFIED_REVIEW_FIELDS = new Set([
    "Position",
    "Rotation",
    "Mirror",
    "Layer",
    "Net",
    "Reference",
    "Library",
    "DNP",
]);

// Values projected by the index rather than read verbatim from the item's
// shallow hash. Most importantly, a schematic pin inherits its owning
// symbol's position. Comparing only `hash` would therefore miss every pin move
// even though the object index carries the new position.
const INDEX_FIELDS = [
    "kind",
    "parentUuid",
    "at",
    "rotation",
    "mirror",
    "layer",
    "net",
    "refdes",
    "libId",
    "dnp",
    "inBom",
    "onBoard",
    "kiidPaths",
    "instances",
    "properties",
    "number",
    "text",
    "name",
    "reviewFields",
    "reviewOnly",
];

function same_point(before, after) {
    if (!before || !after) {
        return before === after || (!before && !after);
    }
    return before[0] === after[0] && before[1] === after[1];
}

function key_of(object) {
    return `${object.documentPath}#${object.uuid}`;
}

function stable_json(value) {
    if (Array.isArray(value)) return value.map(stable_json);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, stable_json(child)]),
        );
    }
    return value ?? null;
}

/**
 * Authored-content identity for unmatched UUIDs.
 *
 * KiCad can recreate objects while preserving every reviewer-visible value.
 * UUID is deliberately absent; parent UUID is also absent because a recreated
 * footprint/symbol otherwise makes all of its unchanged children look new.
 */
function authored_content_identity(object) {
    const container = new Set(["symbol", "footprint", "sheet"]).has(object.kind);
    return JSON.stringify(stable_json({
        documentPath: object.documentPath,
        kind: object.kind,
        // A container's shallow hash intentionally contains child UUIDs so a
        // re-parent is detectable. For UUID-churn reconciliation those child
        // identities are precisely what must be ignored; all authored child
        // objects are independently compared below it.
        hash: container ? undefined : object.hash,
        at: object.at,
        rotation: object.rotation,
        mirror: object.mirror,
        layer: object.layer,
        layers: object.layers,
        net: object.net,
        refdes: object.refdes,
        libId: object.libId,
        dnp: object.dnp,
        inBom: object.inBom,
        onBoard: object.onBoard,
        kiidPaths: object.kiidPaths,
        instances: object.instances,
        properties: object.properties,
        number: object.number,
        text: object.text,
        name: object.name,
        reviewFields: object.reviewFields,
    }));
}

/** A sheet-pin name/type can change while its logical interface slot remains. */
function sheet_pin_slot_identity(object) {
    if (object.kind !== "sheet_pin" || !object.parentUuid || !object.at) return null;
    return JSON.stringify([
        object.documentPath,
        object.kind,
        object.parentUuid,
        object.at,
        object.rotation ?? 0,
    ]);
}

function pair_unmatched(base, head, matchedBase, matchedHead, identity, reason, matches) {
    const baseGroups = new Map();
    const headGroups = new Map();
    const add = (groups, signature, key) => {
        if (!signature) return;
        const values = groups.get(signature) ?? [];
        values.push(key);
        groups.set(signature, values);
    };
    for (const [key, object] of base) {
        if (!matchedBase.has(key)) add(baseGroups, identity(object), key);
    }
    for (const [key, object] of head) {
        if (!matchedHead.has(key)) add(headGroups, identity(object), key);
    }
    for (const signature of [...baseGroups.keys()].sort()) {
        const baseKeys = (baseGroups.get(signature) ?? []).sort();
        const headKeys = (headGroups.get(signature) ?? []).sort();
        const count = Math.min(baseKeys.length, headKeys.length);
        for (let index = 0; index < count; index += 1) {
            const baseKey = baseKeys[index];
            const headKey = headKeys[index];
            matchedBase.add(baseKey);
            matchedHead.add(headKey);
            matches.set(headKey, { baseKey, reason });
        }
    }
}

function same_index_fields(before, after) {
    return INDEX_FIELDS.every(
        (field) => JSON.stringify(before[field] ?? null) === JSON.stringify(after[field] ?? null),
    );
}

function native_object(object) {
    return {
        uuid: object.uuid,
        kind: object.kind,
        documentPath: object.documentPath,
        parentUuid: object.parentUuid,
        at: object.at,
        rotation: object.rotation,
        mirror: object.mirror,
        layer: object.layer,
        layers: object.layers,
        net: object.net,
        refdes: object.refdes,
        libId: object.libId,
        dnp: object.dnp,
        inBom: object.inBom,
        onBoard: object.onBoard,
        kiidPaths: object.kiidPaths,
        instances: object.instances,
        properties: object.properties,
        number: object.number,
        text: object.text,
        name: object.name,
        reviewFields: object.reviewFields,
        reviewOnly: object.reviewOnly,
    };
}

function native_target(object) {
    return {
        uuid: object.uuid,
        kind: object.kind,
        documentPath: object.documentPath,
        parentUuid: object.parentUuid,
        at: object.at,
    };
}

function component_objects(objects) {
    return objects
        .filter((object) => object.kind === "symbol" || object.kind === "footprint")
        .map(native_object);
}

function property_deltas(before, after) {
    const deltas = [];
    const beforeByName = new Map((before.properties ?? []).map((p) => [p.name, p]));
    const afterByName = new Map((after.properties ?? []).map((p) => [p.name, p]));
    for (const name of new Set([...beforeByName.keys(), ...afterByName.keys()])) {
        const from = beforeByName.get(name);
        const to = afterByName.get(name);
        if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) {
            continue;
        }
        const fromAttributes = from === undefined
            ? undefined
            : {
                at: from.at,
                rotation: from.rotation,
                hide: from.hide ?? false,
                effects: from.effects,
            };
        const toAttributes = to === undefined
            ? undefined
            : {
                at: to.at,
                rotation: to.rotation,
                hide: to.hide ?? false,
                effects: to.effects,
            };
        deltas.push({
            name,
            from: from?.value,
            to: to?.value,
            // A property that only moved or was hidden is a real edit the
            // value-only comparison this replaces cannot see.
            attributesChanged:
                from !== undefined
                && to !== undefined
                && JSON.stringify(fromAttributes) !== JSON.stringify(toAttributes),
            fromAttributes,
            toAttributes,
        });
    }
    return deltas.sort((a, b) => a.name.localeCompare(b.name));
}

function review_fields(object) {
    if (!object) return {};
    return {
        ...(object.at ? { Position: object.at.join(", ") } : {}),
        ...(object.rotation !== undefined ? { Rotation: object.rotation } : {}),
        ...(object.mirror !== undefined ? { Mirror: object.mirror } : {}),
        ...(object.layer !== undefined ? { Layer: object.layer } : {}),
        ...(object.net !== undefined ? { Net: object.net } : {}),
        ...(object.refdes !== undefined ? { Reference: object.refdes } : {}),
        ...(object.libId !== undefined ? { Library: object.libId } : {}),
        ...(object.dnp !== undefined ? { DNP: object.dnp } : {}),
        ...(object.inBom !== undefined ? { "In BOM": object.inBom } : {}),
        ...(object.onBoard !== undefined ? { "On board": object.onBoard } : {}),
        ...(object.reviewFields ?? {}),
    };
}

function review_field_deltas(before, after) {
    const oldFields = review_fields(before);
    const newFields = review_fields(after);
    const deltas = [];
    for (const name of new Set([...Object.keys(oldFields), ...Object.keys(newFields)])) {
        const from = oldFields[name];
        const to = newFields[name];
        if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
        deltas.push({ name, from, to });
    }
    return deltas.sort((a, b) => a.name.localeCompare(b.name));
}

function merged_property_deltas(before, after) {
    const byName = new Map();
    for (const delta of [
        ...review_field_deltas(before, after),
        ...property_deltas(before, after),
    ]) {
        byName.set(delta.name, delta);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function position_delta(before, after) {
    if (!before.at || !after.at) {
        return undefined;
    }
    const dx = round6(after.at[0] - before.at[0]);
    const dy = round6(after.at[1] - before.at[1]);
    if (dx === 0 && dy === 0) {
        return undefined;
    }
    return { dx, dy, distance: round6(Math.hypot(dx, dy)) };
}

function round6(value) {
    return Math.round(value * 1e6) / 1e6;
}

export function diff_indexes(baseObjects, headObjects) {
    const base = new Map(baseObjects.map((object) => [key_of(object), object]));
    const head = new Map(headObjects.map((object) => [key_of(object), object]));
    const matchedBase = new Set();
    const matchedHead = new Set();
    const matches = new Map();
    for (const key of head.keys()) {
        if (!base.has(key)) continue;
        matchedBase.add(key);
        matchedHead.add(key);
        matches.set(key, { baseKey: key, reason: "native-identity" });
    }
    // First remove pure UUID churn for any object whose authored content is
    // byte-for-byte equivalent after canonicalisation. Then reconcile a
    // hierarchical pin that retained its exact parent slot so a name/type edit
    // is one modification, not an opaque removal plus addition.
    pair_unmatched(
        base,
        head,
        matchedBase,
        matchedHead,
        authored_content_identity,
        "internal-identity-only",
        matches,
    );
    pair_unmatched(
        base,
        head,
        matchedBase,
        matchedHead,
        sheet_pin_slot_identity,
        "sheet-pin-slot",
        matches,
    );
    const changes = [];
    const ignored = [];
    let unchanged = 0;

    for (const [key, after] of head) {
        const match = matches.get(key);
        const before = match ? base.get(match.baseKey) : undefined;
        if (before === undefined) {
            const properties = review_field_deltas(null, after);
            changes.push({
                key,
                status: "added",
                ...native_object(after),
                compare: native_object(after),
                properties: properties.length > 0 ? properties : undefined,
            });
            continue;
        }
        if (match.reason === "internal-identity-only") {
            ignored.push({
                key,
                status: "ignored",
                reason: match.reason,
                ...native_object(after),
            });
            unchanged += 1;
            continue;
        }
        if (before.hash === after.hash && same_index_fields(before, after)) {
            if (
                before.generatedHash !== undefined
                && before.generatedHash !== after.generatedHash
            ) {
                ignored.push({
                    key,
                    status: "ignored",
                    reason: "generated-content-only",
                    ...native_object(after),
                });
            }
            unchanged += 1;
            continue;
        }
        const reasons = CLASSIFIERS.filter(([, test]) => test(before, after)).map(
            ([name]) => name,
        );
        const properties = merged_property_deltas(before, after);
        if (properties.some(
            (delta) => delta.attributesChanged || !CLASSIFIED_REVIEW_FIELDS.has(delta.name),
        )) {
            reasons.push("properties-changed");
        }
        changes.push({
            key,
            status: "modified",
            ...native_object(after),
            base: native_object(before),
            compare: native_object(after),
            atBase: before.at,
            // A shallow-hash delta with no positional/identity/property
            // classifier is still authored content: pad shape, stroke, fill,
            // text effects, zone rules, and similar native fields. M7 names
            // that class explicitly instead of leaking "unclassified".
            reasons: reasons.length > 0 ? reasons : ["content-changed"],
            positionDelta: position_delta(before, after),
            properties: properties.length > 0 ? properties : undefined,
        });
    }

    for (const [key, before] of base) {
        if (matchedBase.has(key)) {
            continue;
        }
        const properties = review_field_deltas(before, null);
        changes.push({
            key,
            status: "removed",
            ...native_object(before),
            base: native_object(before),
            properties: properties.length > 0 ? properties : undefined,
        });
    }

    const byKind = {};
    const byReason = {};
    for (const change of changes) {
        const row = (byKind[change.kind] ??= { added: 0, removed: 0, modified: 0 });
        row[change.status] += 1;
        for (const reason of change.reasons ?? []) {
            byReason[reason] = (byReason[reason] ?? 0) + 1;
        }
    }

    changes.sort((a, b) => a.key.localeCompare(b.key));
    return {
        changes,
        ignored,
        counts: {
            added: changes.filter((change) => change.status === "added").length,
            removed: changes.filter((change) => change.status === "removed").length,
            modified: changes.filter((change) => change.status === "modified").length,
            unchanged,
            ignored: ignored.length,
            baseObjects: base.size,
            headObjects: head.size,
        },
        byKind,
        byReason,
    };
}

export function diff_snapshots(baseRoot, headRoot) {
    const started = performance.now();
    const base = index_snapshot(baseRoot);
    const head = index_snapshot(headRoot);
    const deltaStarted = performance.now();
    const delta = diff_indexes(base.objects, head.objects);
    const now = performance.now();

    return {
        schema: SCHEMA,
        base: {
            root: baseRoot,
            objects: base.counts.total,
            timings: base.timings,
            nativeObjects: base.objects.map(native_target),
            componentObjects: component_objects(base.objects),
            routeMetrics: base.routeMetrics,
        },
        head: {
            root: headRoot,
            objects: head.counts.total,
            timings: head.timings,
            nativeObjects: head.objects.map(native_target),
            componentObjects: component_objects(head.objects),
            routeMetrics: head.routeMetrics,
        },
        ...delta,
        timings: {
            baseMs: base.timings.totalMs,
            headMs: head.timings.totalMs,
            deltaMs: Math.round((now - deltaStarted) * 1000) / 1000,
            totalMs: Math.round((now - started) * 1000) / 1000,
        },
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        node: process.version,
    };
}

function main(argv) {
    const positional = [];
    let out = null;
    let summaryOnly = false;
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === "--out") {
            out = argv[(index += 1)];
        } else if (argv[index] === "--summary-only") {
            summaryOnly = true;
        } else {
            positional.push(argv[index]);
        }
    }
    if (positional.length !== 2) {
        console.error(
            "usage: ecad-diff.mjs <base-snapshot> <head-snapshot> [--out FILE] "
            + "[--summary-only]",
        );
        process.exit(2);
    }

    const report = diff_snapshots(positional[0], positional[1]);
    const summary = {
        ...report,
        base: {
            ...report.base,
            nativeObjects: undefined,
            componentObjects: undefined,
            routeMetrics: undefined,
        },
        head: {
            ...report.head,
            nativeObjects: undefined,
            componentObjects: undefined,
            routeMetrics: undefined,
        },
        changes: undefined,
    };
    if (out) {
        writeFileSync(out, JSON.stringify(summaryOnly ? summary : report));
    }
    console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main(process.argv.slice(2));
}
