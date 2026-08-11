/**
 * Which parser events are review evidence, and which are its shadow.
 *
 * KiCad rewrites far more than a reviewer decided. Renaming one net rewrites the
 * net reference on every track and pad that carries it; moving a symbol moves
 * its pins; nudging a label writes new coordinates into the file. Left alone,
 * those follow-on writes bury the handful of edits somebody actually made.
 *
 * This module draws that line once. It either drops a change outright, or marks
 * it `secondary` so it stays available behind the queue's layout section without
 * competing for attention.
 */

import {
    PCB_COMPONENT_CHILD_KINDS,
    SCHEMATIC_WIRING_KINDS,
    hasNativeParent,
    hasStructuredGeometryOnlyField,
    isSamePageLayoutOnly,
    meaningfulFieldEntries,
    objectKind,
    pageFor,
    parentSymbolKey,
    stringFieldPair,
} from "./comparison-change-facts";
import type { ChangeItem } from "./types";

const SCHEMATIC_LABEL_KINDS = new Set([
    "label",
    "global_label",
    "hierarchical_label",
]);

export interface PreparedReviewChanges {
    changes: ChangeItem[];
    suppressedCount: number;
}

function localNetName(value: string): string {
    const parts = value.split("/").filter(Boolean);
    return parts.at(-1) ?? value;
}

function renameKey(page: string, oldName: string, newName: string): string {
    return [page, localNetName(oldName), localNetName(newName)].join("\u0000");
}

function semanticNetRenameKeys(changes: ChangeItem[]): Set<string> {
    return new Set(changes.flatMap((change) => {
        if (!change.reasons?.includes("net-renamed")) return [];
        const pair = stringFieldPair(change, ["name"]);
        return pair ? [renameKey(pageFor(change), pair.old, pair.new)] : [];
    }));
}

function isDuplicateNativeLabelRename(change: ChangeItem, renameKeys: Set<string>): boolean {
    if (
        change.domain !== "schematic"
        || change.kind !== "changed"
        || !SCHEMATIC_LABEL_KINDS.has(objectKind(change))
    ) return false;
    const pair = stringFieldPair(change, ["Net", "Text"]);
    if (!pair || !renameKeys.has(renameKey(pageFor(change), pair.old, pair.new))) return false;
    return meaningfulFieldEntries(change).every(([name]) => (
        name.toLocaleLowerCase() === "net" || name.toLocaleLowerCase() === "text"
    ));
}

function netRenamePairKey(oldName: string, newName: string): string {
    // Escaped, not a literal control byte: a raw NUL in the source makes grep
    // classify this module as binary and skip it silently.
    return `${oldName.trim()}\u0000${newName.trim()}`;
}

/**
 * Net renames the semantic layer resolved by connectivity, keyed old→new.
 *
 * Read from the schematic domain and handed to the PCB pass: renaming one net
 * makes KiCad rewrite the net reference on every track, via, and pad that
 * carries it, and those hundreds of rewrites are one authored edit.
 */
export function semanticNetRenames(changes: ChangeItem[]): Set<string> {
    const keys = new Set<string>();
    for (const change of changes) {
        if (!change.reasons?.includes("net-renamed")) continue;
        const pair = stringFieldPair(change, ["name", "Net"]);
        if (pair) keys.add(netRenamePairKey(pair.old, pair.new));
    }
    return keys;
}

/**
 * A board object whose only difference is that its net was renamed elsewhere.
 * The copper is untouched, so this carries no independent fabrication or
 * electrical decision.
 */
function derivativeNetRename(
    change: ChangeItem,
    renames: Set<string>,
): { old: string; new: string } | null {
    if (change.domain !== "pcb" || change.kind !== "changed") return null;
    const reasons = change.reasons ?? [];
    if (!reasons.length || reasons.some((reason) => reason !== "net-changed")) {
        return null;
    }
    const pair = stringFieldPair(change, ["Net"]);
    if (!pair) return null;
    // Any other authored difference keeps the object a primary review item;
    // only a pure net-name rewrite is derivative.
    if (meaningfulFieldEntries(change).some(
        ([name]) => name.trim().toLocaleLowerCase() !== "net",
    )) {
        return null;
    }
    return renames.has(netRenamePairKey(pair.old, pair.new))
        ? { old: pair.old, new: pair.new }
        : null;
}

function isGeneratedNetName(value: string): boolean {
    return /^(?:unconnected-|net-\()/i.test(value.trim());
}

function isGeneratedNetRenameOnly(change: ChangeItem): boolean {
    if (
        change.domain !== "schematic"
        || !change.reasons?.includes("net-renamed")
        || change.reasons.some((reason) => reason !== "net-renamed")
    ) return false;
    const pair = stringFieldPair(change, ["name"]);
    return Boolean(pair && isGeneratedNetName(pair.old) && isGeneratedNetName(pair.new));
}

/**
 * Convert parser-level events into reviewer-level evidence. Pins that merely
 * follow a symbol are derivative, while same-page geometry is retained as an
 * optional secondary audit trail instead of flooding the primary review list.
 */
export function prepareChangesForReview(
    changes: ChangeItem[],
    options: { netRenames?: Set<string> } = {},
): PreparedReviewChanges {
    const netRenames = options.netRenames ?? new Set<string>();
    const parentSymbolEvents = new Set(
        changes
            .filter((change) => change.domain === "schematic" && objectKind(change) === "symbol")
            .map(parentSymbolKey),
    );
    const prepared: ChangeItem[] = [];
    let suppressedCount = 0;
    const netRenameKeys = semanticNetRenameKeys(changes);
    const parentFootprintEvents = new Set(
        changes
            .filter((change) => (
                change.domain === "pcb"
                && objectKind(change) === "footprint"
                && (change.kind === "added" || change.kind === "removed")
            ))
            .map(parentSymbolKey),
    );

    for (const change of changes) {
        const kind = objectKind(change);
        if (
            hasStructuredGeometryOnlyField(change)
            || isDuplicateNativeLabelRename(change, netRenameKeys)
            || isGeneratedNetRenameOnly(change)
        ) {
            suppressedCount += 1;
            continue;
        }
        if (change.domain === "schematic" && kind === "pin") {
            if (isSamePageLayoutOnly(change)) {
                suppressedCount += 1;
                continue;
            }
            if (
                (change.kind === "added" || change.kind === "removed")
                && parentSymbolEvents.has(parentSymbolKey(change))
            ) {
                suppressedCount += 1;
                continue;
            }
            if (
                change.kind === "changed"
                && parentSymbolEvents.has(parentSymbolKey(change))
                && meaningfulFieldEntries(change).every(
                    ([name]) => name.trim().toLocaleLowerCase() === "reference",
                )
            ) {
                suppressedCount += 1;
                continue;
            }
        }

        if (
            change.domain === "pcb"
            && PCB_COMPONENT_CHILD_KINDS.has(kind)
            && (kind !== "zone" || hasNativeParent(change))
            && (change.kind === "added" || change.kind === "removed")
            && parentFootprintEvents.has(parentSymbolKey(change))
        ) {
            suppressedCount += 1;
            continue;
        }

        const renamed = derivativeNetRename(change, netRenames);
        if (renamed) {
            prepared.push({
                ...change,
                classification: "secondary",
                derivedFrom: { kind: "net-rename", ...renamed },
            });
        } else if (
            change.domain === "schematic"
            && SCHEMATIC_WIRING_KINDS.has(kind)
            && !change.net
            && (change.kind === "added" || change.kind === "removed")
        ) {
            prepared.push({ ...change, classification: "secondary" });
        } else if (isSamePageLayoutOnly(change)) {
            prepared.push({ ...change, classification: "secondary" });
        } else {
            prepared.push(change);
        }
    }

    return { changes: prepared, suppressedCount };
}
