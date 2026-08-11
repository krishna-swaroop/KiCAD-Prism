/**
 * One authored decision, one review row.
 *
 * The queue is not a list of parser events — it is a list of things somebody
 * decided. Four capacitors that all became 470nF at the same part number are one
 * decision and one row; a trace whose net was renamed underneath it is still one
 * conductor even though half its objects now report the new name. This module
 * decides what shares a row.
 */

import { CATEGORY_META, mergedKind, type Category, type DiffKind } from "@/lib/diff-grouping";
import type { Comment } from "@/types/comments";
import {
    PCB_COMPONENT_CHILD_KINDS,
    PCB_COPPER_KINDS,
    SCHEMATIC_WIRING_KINDS,
    fieldSides,
    isSamePageLayoutOnly,
    objectKind,
    pageFor,
    referenceFor,
    semanticCategory,
    stringFieldPair,
} from "./comparison-change-facts";
import type { BomChangeRow, BomDiff, ChangeItem } from "./types";

export interface ChangeGroup {
    id: string;
    category: Category;
    kind: DiffKind;
    label: string;
    classification: "primary" | "secondary";
    unresolvedCount: number;
    changes: ChangeItem[];
    /**
     * Designators covered by this group, in stable order. A part-bucketed group
     * covers every instance that made the same transition, so the queue can
     * render one row with a chip per instance instead of one row per RefDes.
     * Empty for groups that are not keyed on a component.
     */
    references: string[];
    /**
     * Manufacturer part number behind a part-bucketed group, retained so
     * {@link groupChanges} can disambiguate two groups whose values read alike.
     */
    partMpn?: string | null;
}

/**
 * Which BOM column carries the manufacturer part number.
 *
 * The BOM's field list is discovered from whatever the project's symbols
 * actually carry (`bom_diff_service.build_bom_diff`), not fixed by Prism, so
 * the column has to be recognised by meaning rather than by an exact name.
 */
const MPN_FIELD_PATTERN =
    /^(mpn|(manufacturer|mfr\.?|mfg\.?)[\s_-]*part[\s_-]*(number|no\.?)?)$/i;

const VALUE_FIELD_PATTERN = /^value$/i;

function resolveMpnFieldName(
    fields: readonly string[] | undefined,
): string | null {
    return fields?.find((field) => MPN_FIELD_PATTERN.test(field.trim())) ?? null;
}

/** One revision's BOM identity for a designator. */
interface PartSide {
    value: string;
    mpn: string;
}

export interface PartIdentityIndex {
    /**
     * The Value and manufacturer part number a designator carried on one side,
     * or null when this comparison cannot say.
     */
    resolve(reference: string, side: "old" | "new"): PartSide | null;
}

function partSide(
    fields: Record<string, string> | undefined,
    mpnField: string | null,
): PartSide | null {
    if (!fields) return null;
    const value = String(fields["Value"] ?? "").trim();
    const mpn = mpnField ? String(fields[mpnField] ?? "").trim() : "";
    if (!value && !mpn) return null;
    return { value, mpn };
}

/**
 * Components are grouped the way a BOM groups them: by Value and manufacturer
 * part number. The BOM is a separately staged domain and may be absent or still
 * building, so every caller must tolerate a null index — grouping then falls
 * back to the change's own authored fields, and finally to one row per RefDes.
 */
function buildPartIdentityIndex(
    bom: BomDiff | null | undefined,
): PartIdentityIndex {
    const mpnField = resolveMpnFieldName(bom?.fields);
    const rows = new Map<string, BomChangeRow>();
    for (const row of bom?.changes ?? []) rows.set(row.ref, row);
    return {
        resolve(reference, side) {
            const row = rows.get(reference);
            return partSide(side === "old" ? row?.old : row?.new, mpnField);
        },
    };
}

/**
 * Value and MPN as the change itself authored them, for comparisons whose BOM
 * never built. `fields` entries are either an old/new pair or a bare new value.
 */
function partSideFromChange(
    change: ChangeItem,
    side: "old" | "new",
): PartSide | null {
    const read = (pattern: RegExp): string => {
        for (const [name, raw] of Object.entries(change.fields ?? {})) {
            if (!pattern.test(name.trim())) continue;
            const sides = fieldSides(raw);
            const picked = sides ? sides[side] : raw;
            if (typeof picked === "string" && picked.trim()) return picked.trim();
        }
        return "";
    };
    const value = read(VALUE_FIELD_PATTERN);
    const mpn = read(MPN_FIELD_PATTERN);
    if (!value && !mpn) return null;
    return { value, mpn };
}

function partSideKey(side: PartSide | null): string {
    if (!side) return "";
    // NUL-separated so a value containing the separator cannot forge a
    // different value/MPN split. Case-folded because "10R" and "10r" name the
    // same part.
    return `${side.value.toLocaleLowerCase()}\u0000${side.mpn.toLocaleLowerCase()}`;
}

function partSideLabel(side: PartSide | null): string {
    if (!side) return "";
    return side.value || side.mpn;
}

/**
 * The transition a component made, which is what identifies a review row.
 *
 * Thirty 100nF capacitors of which four became 470nF at the same part number
 * are one review item, because one decision produced all four. Had two become
 * 470nF and two 220nF, that is two decisions and two rows — the transition, not
 * the part, is the unit.
 */
function partTransition(
    change: ChangeItem,
    reference: string,
    parts: PartIdentityIndex | null,
): { bucket: string; id: string; label: string; mpn: string | null } | null {
    const sideFor = (side: "old" | "new"): PartSide | null =>
        parts?.resolve(reference, side) ?? partSideFromChange(change, side);
    // Gate on the change's own statement about which revisions it exists in. A
    // bare (non-pair) `fields` entry means "this is the value" with no old/new
    // split, which is right for a modification but would otherwise let an
    // addition's only value be read as its old side too, printing "X -> X".
    const before = change.kind === "added" ? null : sideFor("old");
    const after = change.kind === "removed" ? null : sideFor("new");
    if (!before && !after) return null;

    const beforeLabel = partSideLabel(before);
    const afterLabel = partSideLabel(after);
    const label = before && after && partSideKey(before) !== partSideKey(after)
        ? `${beforeLabel} → ${afterLabel}`
        : afterLabel || beforeLabel;

    return {
        // Both sides keyed and separated, so "a" + "bc" cannot collide
        // with "ab" + "c". The transition is the identity, not either
        // endpoint.
        bucket: ["part", partSideKey(before), partSideKey(after)].join("\u0001"),
        // The bucket keys on control characters, which is fine for a Map but
        // not for something that ends up in a URL and on a comment anchor.
        // Same components, readable separators.
        id: [
            "part",
            `${beforeLabel}~${before?.mpn ?? ""}`,
            `${afterLabel}~${after?.mpn ?? ""}`,
        ].join(">"),
        label,
        mpn: after?.mpn || before?.mpn || null,
    };
}

type GroupIdentity = {
    bucket: string;
    idIdentity: string;
    category: Category;
    label: string;
    /** Present only on part-bucketed groups; see {@link ChangeGroup.partMpn}. */
    partMpn?: string | null;
};

/**
 * Net names that are two names for one conductor.
 *
 * A renamed net leaves its copper in place and rewrites the net reference on
 * every object, so those objects arrive as `changed` carrying the *new* name
 * while anything genuinely deleted still carries the old one. Bucketing on the
 * current name therefore splits one physical trace across an "Added <new>" row
 * and a "Removed <old>" row, and selecting either highlights only its share of
 * the trace.
 *
 * The old/new pairs the copper itself reports are the evidence, so the base
 * revision's name is taken as canonical and every alias resolves to it.
 */
function buildNetAliases(changes: ChangeItem[]): Map<string, string> {
    const canonical = new Map<string, string>();
    for (const change of changes) {
        if (change.domain !== "pcb") continue;
        if (!PCB_COPPER_KINDS.has(objectKind(change))) continue;
        const pair = stringFieldPair(change, ["Net", "name"]);
        if (!pair) continue;
        const from = pair.new.trim();
        const to = pair.old.trim();
        if (!from || !to || from === to) continue;
        canonical.set(from, to);
    }
    // Collapse chains (A renamed to B, later B to C) onto one root, guarding
    // against a cycle the data should not contain but must not hang on.
    const resolve = (name: string): string => {
        const seen = new Set<string>([name]);
        let current = name;
        while (canonical.has(current)) {
            const next = canonical.get(current)!;
            if (seen.has(next)) break;
            seen.add(next);
            current = next;
        }
        return current;
    };
    return new Map([...canonical.keys()].map((name) => [name, resolve(name)]));
}

/** The conductor a copper change belongs to, independent of a rename. */
function canonicalNetName(
    change: ChangeItem,
    aliases: Map<string, string> | null,
): string | null {
    const pair = stringFieldPair(change, ["Net", "name"]);
    const own = (pair?.old ?? change.net ?? "").trim();
    if (!own) return null;
    return aliases?.get(own) ?? own;
}

type DerivedNetRename = { old: string; new: string };

/**
 * One authored schematic rename, keyed by the base-revision name.
 *
 * `prepareChangesForReview` marks rewritten copper with `derivedFrom`, but
 * genuinely deleted stubs on the old name never get that mark. Harvesting the
 * rename here lets those removals share the same review row as the rewrite
 * cascade, so one physical conductor stays one queue item on the production
 * path — not only on the alias-only path that skips prepare.
 */
function buildDerivedNetRenames(
    changes: ChangeItem[],
): Map<string, DerivedNetRename> {
    const renames = new Map<string, DerivedNetRename>();
    for (const change of changes) {
        if (change.derivedFrom?.kind !== "net-rename") continue;
        const oldName = change.derivedFrom.old.trim();
        const newName = change.derivedFrom.new.trim();
        if (!oldName || !newName || oldName === newName) continue;
        renames.set(oldName, { old: oldName, new: newName });
    }
    return renames;
}

/** Shared identity for a schematic-owned net rename and every board object that followed it. */
function netRenameIdentity(oldName: string, newName: string): GroupIdentity {
    return {
        bucket: `net-rename:${oldName} ${newName}`,
        idIdentity: `net-rename:${oldName} ${newName}`,
        category: "nets",
        label: newName,
    };
}

/**
 * Identity for a change that belongs to a placed component.
 *
 * Prefers the BOM transition so instances that made the same decision share one
 * review row. Falls back to the designator when neither the BOM nor the change's
 * own fields can name the part — a comparison whose BOM never built still has to
 * produce a usable queue.
 */
function componentIdentity(
    change: ChangeItem,
    reference: string,
    category: Category,
    parts: PartIdentityIndex | null,
    fallbackIdIdentity: string,
): GroupIdentity {
    const part = partTransition(change, reference, parts);
    if (!part) {
        return {
            bucket: `component:${reference}`,
            idIdentity: fallbackIdIdentity,
            category,
            label: reference,
        };
    }
    return {
        bucket: part.bucket,
        idIdentity: part.id,
        category,
        label: part.label,
        partMpn: part.mpn,
    };
}

function identityFor(
    change: ChangeItem,
    parts: PartIdentityIndex | null,
    netAliases: Map<string, string> | null,
    derivedNetRenames: Map<string, DerivedNetRename> | null,
): GroupIdentity {
    const kind = objectKind(change);
    const page = pageFor(change);
    const category = semanticCategory(change);
    const exactIdentity = change.semantic_id
        ?? referenceFor(change)
        ?? change.net
        ?? change.geometry?.semantic_id
        ?? change.oldGeometry?.semantic_id
        ?? change.id;

    if (category === "rules") {
        if (kind === "drc_exclusion") {
            return {
                bucket: "drc-exclusions",
                idIdentity: "drc-exclusions",
                category,
                label: "DRC exclusions",
            };
        }
        if (kind === "erc_exclusion") {
            return {
                bucket: "erc-exclusions",
                idIdentity: "erc-exclusions",
                category,
                label: "ERC exclusions",
            };
        }
        if (kind === "erc_pin_rule") {
            return {
                bucket: "erc-pin-compatibility",
                idIdentity: "erc-pin-compatibility",
                category,
                label: "ERC pin compatibility",
            };
        }
        if (kind === "net_class_assignment") {
            return {
                bucket: "net-class-assignments",
                idIdentity: "net-class-assignments",
                category,
                label: "Net class assignments",
            };
        }
        return {
            bucket: `rule:${kind}:${change.label}`,
            idIdentity: exactIdentity,
            category,
            label: change.label,
        };
    }

    // One authored rename, one review item, regardless of how many board
    // objects KiCad rewrote to follow it.
    if (change.derivedFrom?.kind === "net-rename") {
        return netRenameIdentity(change.derivedFrom.old, change.derivedFrom.new);
    }

    if (isSamePageLayoutOnly(change)) {
        return {
            bucket: `layout:${page}`,
            idIdentity: `layout:${page}`,
            category: "graphics",
            label: "Layout-only changes",
        };
    }

    if (change.domain === "schematic") {
        if (
            change.net
            && category === "nets"
            && kind !== "no_connect"
            && kind !== "sheet_pin"
        ) {
            return {
                bucket: `net:${change.net}`,
                idIdentity: `net:${change.net}`,
                category: "nets",
                label: change.net,
            };
        }
        if (
            category !== "nets"
            && change.reference
            && (kind === "symbol" || category === "components" || category === "symbols")
        ) {
            return componentIdentity(
                change,
                change.reference,
                category,
                parts,
                exactIdentity,
            );
        }
        if (
            SCHEMATIC_WIRING_KINDS.has(kind)
            && !change.net
            && (change.kind === "added" || change.kind === "removed")
        ) {
            return {
                bucket: `wiring:${page}`,
                idIdentity: `wiring:${page}`,
                category: "nets",
                label: "Wiring changes",
            };
        }
        if (kind === "no_connect" && change.kind !== "changed") {
            return {
                bucket: `no-connect:${page}`,
                idIdentity: `no-connect:${page}`,
                category: "nets",
                label: "No-connect markers",
            };
        }
        if (kind === "sheet_pin") {
            return {
                bucket: `sheet-pins:${page}`,
                idIdentity: `sheet-pins:${page}`,
                category: "sheets",
                label: "Hierarchical sheet pins",
            };
        }
    }

    if (change.domain === "pcb") {
        const reference = referenceFor(change);
        if (
            reference
            && (kind === "footprint" || semanticCategory(change) === "components")
        ) {
            return componentIdentity(
                change,
                reference,
                "components",
                parts,
                exactIdentity,
            );
        }
        // A footprint's own pads and artwork belong to that footprint even when
        // the change is electrical rather than mechanical. Without this, a pin
        // reassignment across one BGA lists forty separate rows all called by
        // the same RefDes.
        if (reference && PCB_COMPONENT_CHILD_KINDS.has(kind)) {
            return componentIdentity(
                change,
                reference,
                category,
                parts,
                `component:${reference}`,
            );
        }
        if (PCB_COPPER_KINDS.has(kind)) {
            const canonical = canonicalNetName(change, netAliases);
            const current = (change.net ?? "").trim();
            // Removals on the pre-rename name never carry `derivedFrom`, but they
            // are the same conductor as the rewrite cascade. Join that row.
            const ownedRename = (canonical && derivedNetRenames?.get(canonical))
                || (current && derivedNetRenames?.get(current))
                || null;
            if (ownedRename) {
                return netRenameIdentity(ownedRename.old, ownedRename.new);
            }
            const net = canonical ?? "Unconnected copper";
            // Name the row for the conductor it is, and say so when the net was
            // renamed underneath it.
            const label = canonical
                ? (current && current !== canonical
                    ? `${canonical} \u2192 ${current} routing`
                    : `${canonical} routing`)
                : net;
            return {
                bucket: `copper:${net}`,
                idIdentity: `net:${net}`,
                category: "nets",
                label,
            };
        }
        if (category === "graphics") {
            const layer = change.layers?.join(", ") || change.geometry?.layer || "Documentation";
            const foldedLayer = layer.toLocaleLowerCase();
            if (foldedLayer.includes("edge.cuts")) {
                return {
                    bucket: "board-outline",
                    idIdentity: "board-outline",
                    category,
                    label: "Board outline",
                };
            }
            if (
                (foldedLayer.includes(".fab") || foldedLayer === "f.fab" || foldedLayer === "b.fab")
                && Object.keys(change.fields ?? {}).some((field) => field.toLocaleLowerCase() === "text")
            ) {
                return {
                    bucket: "fabrication-notes",
                    idIdentity: "fabrication-notes",
                    category,
                    label: "Fabrication notes",
                };
            }
            return {
                bucket: `graphics:${layer}:${kind}`,
                idIdentity: `graphics:${layer}:${kind}`,
                category,
                label: `${layer} ${kind.replace(/_/g, " ")}`,
            };
        }
    }

    return {
        bucket: `exact:${exactIdentity}`,
        idIdentity: exactIdentity,
        category,
        label: referenceFor(change) ?? change.net ?? change.label,
    };
}

/**
 * The indexes grouping needs, built once for a domain and shared by every call.
 *
 * Sharing them is not only cheaper than rebuilding per call — it is what keeps a
 * filtered queue consistent with an unfiltered one. Net aliases are read out of
 * the copper's own old/new net pairs, so building them from whichever subset a
 * search left behind could hide the very rename that ties a conductor together
 * and split one trace back into two rows.
 */
export interface ReviewGroupingContext {
    parts: PartIdentityIndex;
    netAliases: Map<string, string>;
    /** Schematic-owned renames, keyed by the base-revision net name. */
    derivedNetRenames: Map<string, DerivedNetRename>;
}

/** Build the indexes for one domain's full change list. */
export function createGroupingContext(
    changes: ChangeItem[],
    bom?: BomDiff | null,
): ReviewGroupingContext {
    return {
        parts: buildPartIdentityIndex(bom),
        netAliases: buildNetAliases(changes),
        derivedNetRenames: buildDerivedNetRenames(changes),
    };
}

export function groupChanges(
    changes: ChangeItem[],
    comments: Comment[] = [],
    grouping?: ReviewGroupingContext | null,
): ChangeGroup[] {
    // Without a shared context this still works, on the changes it was handed.
    const { parts, netAliases, derivedNetRenames } = grouping
        ?? createGroupingContext(changes);
    const buckets = new Map<string, ChangeGroup>();
    for (const change of changes) {
        const identity = identityFor(
            change,
            parts,
            netAliases,
            derivedNetRenames,
        );
        const key = `${change.domain}:${identity.category}:${identity.bucket}`;
        const existing = buckets.get(key);
        if (existing) {
            existing.changes.push(change);
            if (change.classification !== "secondary") existing.classification = "primary";
            continue;
        }
        const id = `${change.domain}:${identity.category}:${identity.idIdentity}`;
        buckets.set(key, {
            id,
            category: identity.category,
            kind: change.kind,
            label: identity.label,
            classification: change.classification ?? "primary",
            unresolvedCount: comments.filter(
                (comment) => comment.status === "OPEN" && comment.semanticItemId === id,
            ).length,
            changes: [change],
            references: [],
            partMpn: identity.partMpn ?? null,
        });
    }

    const groups = [...buckets.values()];
    for (const group of groups) {
        group.kind = mergedKind(group.changes.map((change) => change.kind));
        group.references = [
            ...new Set(
                group.changes
                    .map((change) => referenceFor(change))
                    .filter((reference): reference is string => Boolean(reference)),
            ),
        ].sort((left, right) => left.localeCompare(right, undefined, {
            numeric: true,
            sensitivity: "base",
        }));
    }

    // Two parts can read alike when only their manufacturer part number differs
    // — they are correctly separate rows, but identical labels would make them
    // look like a duplicate. Qualify only the labels that actually collide, so
    // the common row stays short.
    const labelCounts = new Map<string, number>();
    for (const group of groups) {
        labelCounts.set(group.label, (labelCounts.get(group.label) ?? 0) + 1);
    }
    for (const group of groups) {
        if (!group.partMpn) continue;
        if ((labelCounts.get(group.label) ?? 0) < 2) continue;
        group.label = `${group.label} (${group.partMpn})`;
    }

    return groups.sort((left, right) => {
        const classOrder = left.classification === right.classification
            ? 0
            : left.classification === "primary" ? -1 : 1;
        return classOrder
            || CATEGORY_META[left.category].order - CATEGORY_META[right.category].order
            || left.label.localeCompare(right.label);
    });
}
