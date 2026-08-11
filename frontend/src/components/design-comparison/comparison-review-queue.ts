/**
 * How the grouped review items are presented, counted and searched.
 *
 * Everything here takes groups the grouping module already built and answers a
 * question the queue asks about them: which discipline owns this, which section
 * it belongs in, how many of each kind exist, what one line summarises it, and
 * whether it matches what the reviewer typed.
 */

import type { Category, DiffKind } from "@/lib/diff-grouping";
import {
    PCB_COMPONENT_CHILD_KINDS,
    PCB_COPPER_KINDS,
    RULE_KINDS,
    changeLayers,
    compactValue,
    meaningfulFieldEntries,
    objectKind,
    pageFor,
} from "./comparison-change-facts";
import type { ChangeGroup } from "./comparison-review-groups";
import type { ChangeItem } from "./types";

export type ReviewImpact =
    | "mechanical"
    | "fabrication"
    | "electrical"
    | "assembly"
    | "constraints"
    | "documentation";

export const REVIEW_IMPACT_LABEL: Record<ReviewImpact, string> = {
    mechanical: "Mechanical",
    fabrication: "PCB fabrication",
    electrical: "Electrical",
    assembly: "Assembly / BOM",
    constraints: "Rules / constraints",
    documentation: "Documentation",
};

export interface GroupDocumentEntry {
    documentPath: string;
    count: number;
    change: ChangeItem;
}

const FABRICATION_LAYERS = [
    ".cu",
    ".mask",
    ".paste",
    ".silks",
    ".fab",
    ".crtyd",
    "edge.cuts",
];

const ASSEMBLY_FIELD_NAMES = [
    "value",
    "footprint",
    "description",
    "datasheet",
    "part number",
    "manufacturer",
    "dnp",
    "in bom",
    "exclude from bom",
    "substitution",
    "board only",
    "position file",
];

const SPATIAL_REASON_CODES = new Set([
    "moved",
    "rotated",
    "mirrored",
    "layer-changed",
    "lib-changed",
]);

function hasFabricationLayer(change: ChangeItem): boolean {
    return changeLayers(change).some((layer) => {
        const folded = layer.toLocaleLowerCase();
        return FABRICATION_LAYERS.some((suffix) => folded.includes(suffix));
    });
}

function hasAssemblyEvidence(change: ChangeItem): boolean {
    return Object.keys(change.fields ?? {}).some((field) => {
        const folded = field.trim().toLocaleLowerCase();
        return ASSEMBLY_FIELD_NAMES.some((name) => folded.includes(name));
    }) || change.reasons?.includes("dnp-changed") === true;
}

/**
 * Deterministic reviewer impact derived from authored ECAD evidence. This is
 * intentionally not a severity score: it tells the reviewer which discipline
 * owns the proof without pretending Prism knows whether the design decision is
 * good or bad.
 */
export function reviewImpactForGroup(group: {
    category: string;
    classification: "primary" | "secondary";
    label: string;
    changes: ChangeItem[];
}): ReviewImpact {
    const kinds = new Set(group.changes.map(objectKind));
    if (group.classification === "secondary") return "documentation";
    if (group.category === "rules" || [...kinds].some((kind) => RULE_KINDS.has(kind))) {
        return "constraints";
    }

    const reasons = new Set(group.changes.flatMap((change) => change.reasons ?? []));
    const layers = group.changes.flatMap(changeLayers).map((layer) => layer.toLocaleLowerCase());
    const mechanical = group.label === "Board outline"
        || layers.some((layer) => layer.includes("edge.cuts") || layer.includes("margin"))
        || group.changes.some((change) => Object.keys(change.fields ?? {}).some((field) => (
            /keepout|courtyard|mounting hole|board outline/i.test(field)
        )));
    if (mechanical) return "mechanical";

    const pcbChanges = group.changes.filter((change) => change.domain === "pcb");
    if (pcbChanges.length) {
        const netAssignmentOnly = reasons.size > 0 && [...reasons].every((reason) => (
            reason === "net-changed" || reason === "renamed" || reason === "properties-changed"
        )) && group.changes.every((change) => (
            Object.keys(change.fields ?? {}).length > 0
            && Object.keys(change.fields ?? {}).every((field) => (
                field.trim().toLocaleLowerCase() === "net"
            ))
        ));
        if (netAssignmentOnly || (group.category === "nets" && ![...reasons].some(
            (reason) => SPATIAL_REASON_CODES.has(reason),
        ))) {
            return "electrical";
        }
        if (
            [...kinds].some((kind) => (
                PCB_COPPER_KINDS.has(kind)
                || PCB_COMPONENT_CHILD_KINDS.has(kind)
                || kind === "footprint"
            ))
            || pcbChanges.some(hasFabricationLayer)
            || [...reasons].some((reason) => SPATIAL_REASON_CODES.has(reason))
        ) {
            return "fabrication";
        }
        if (pcbChanges.some(hasAssemblyEvidence) || group.category === "components") {
            return "assembly";
        }
        return "fabrication";
    }

    if (group.category === "nets" || group.category === "sheets") return "electrical";
    if (group.changes.some(hasAssemblyEvidence)) return "assembly";
    if (group.category === "components" || group.category === "symbols") return "electrical";
    return "documentation";
}

function statusSummary(changes: ChangeItem[]): string {
    const counts = { added: 0, removed: 0, changed: 0 };
    for (const change of changes) counts[change.kind] += 1;
    return ([
        counts.added ? `${counts.added} added` : "",
        counts.removed ? `${counts.removed} removed` : "",
        counts.changed ? `${counts.changed} modified` : "",
    ]).filter(Boolean).join(" · ");
}

function kindSummary(changes: ChangeItem[]): string {
    const counts = new Map<string, number>();
    for (const change of changes) {
        const kind = objectKind(change).replace(/_/g, " ");
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`)
        .join(" · ");
}

export function groupSummary(group: ChangeGroup): string {
    const pages = groupDocumentEntries(group);
    const hasAdded = group.changes.some((change) => change.kind === "added");
    const hasRemoved = group.changes.some((change) => change.kind === "removed");
    const references = new Set(group.changes.map((change) => change.reference).filter(Boolean));
    if (hasAdded && hasRemoved && references.size === 1 && pages.length > 1) {
        const oldPage = group.changes.find((change) => change.kind === "removed");
        const newPage = group.changes.find((change) => change.kind === "added");
        return `Moved: ${pageFor(oldPage!)} → ${pageFor(newPage!)}`;
    }

    const renamedFrom = group.changes[0]?.derivedFrom;
    if (renamedFrom?.kind === "net-rename") {
        const objects = group.changes.length;
        return `Renamed from ${renamedFrom.old} · ${objects} board object${
            objects === 1 ? "" : "s"
        } follow the schematic`;
    }

    if (group.label === "Layout-only changes") return kindSummary(group.changes);
    if (group.category === "rules" && group.changes.length > 1) {
        return statusSummary(group.changes);
    }

    const summaryChanges = [...group.changes].sort((left, right) => {
        const rank = (change: ChangeItem): number => {
            const kind = objectKind(change);
            if (kind === "symbol" || kind === "footprint") return 0;
            if (kind === "pad") return 1;
            if (PCB_COMPONENT_CHILD_KINDS.has(kind)) return 2;
            return 1;
        };
        return rank(left) - rank(right);
    });
    for (const change of summaryChanges) {
        const details = change.details;
        if (change.reasons?.includes("connectivity-changed") && details?.connectivity) {
            const terminals = [
                ...details.connectivity.addedTerminals.map((value) => `+${value}`),
                ...details.connectivity.removedTerminals.map((value) => `−${value}`),
            ];
            return terminals.join(", ") || "Connectivity changed";
        }
        if (change.reasons?.includes("instance-replaced")) return "Instance replaced (same RefDes)";
        if (change.reasons?.includes("instance-count-changed") && details?.instanceCount) {
            return `Instances ${details.instanceCount.old} → ${details.instanceCount.new}`;
        }
        if (change.reasons?.includes("label-count-changed") && details?.labelInstances) {
            return `Labels ${details.labelInstances.old} → ${details.labelInstances.new}`;
        }
        if (change.reasons?.includes("sheet-changed") && details?.sheetChange) {
            return `Sheet ${details.sheetChange.old ?? "—"} → ${details.sheetChange.new ?? "—"}`;
        }
        const fields = meaningfulFieldEntries(change)
            .filter(([name]) => (
                group.category !== "components"
                || !PCB_COMPONENT_CHILD_KINDS.has(objectKind(change))
                || !["reference", "layer", "stroke"].includes(name.toLocaleLowerCase())
            ))
            .slice(0, 2);
        if (fields.length) {
            return fields.map(([name, value]) => (
                `${name}: ${compactValue(value.old)} → ${compactValue(value.new)}`
            )).join(" · ");
        }
    }

    if (group.changes.length > 1) {
        const statuses = statusSummary(group.changes);
        const kinds = new Set(group.changes.map(objectKind));
        return kinds.size > 1 ? `${statuses} · ${kindSummary(group.changes)}` : statuses;
    }
    const reasons = group.changes[0]?.reasons ?? [];
    if (reasons.includes("net-changed")) return "Net assignment changed";
    if (reasons.includes("lib-changed")) return "Library item changed";
    if (reasons.includes("renamed")) return "Renamed";
    if (reasons.includes("re-pathed")) return "Hierarchy path changed";
    return "";
}

export function groupDocumentEntries(group: ChangeGroup): GroupDocumentEntry[] {
    const entries = new Map<string, GroupDocumentEntry>();
    for (const change of group.changes) {
        const paths = new Set<string>();
        for (const path of [
            change.page,
            change.base_item?.path,
            change.base_item?.page,
            change.compare_item?.path,
            change.compare_item?.page,
            ...(change.details?.visualTargets ?? []).flatMap((target) => [
                target.documentPath,
                target.page,
            ]),
        ]) {
            if (path) paths.add(path);
        }
        for (const documentPath of paths) {
            const existing = entries.get(documentPath);
            if (existing) existing.count += 1;
            else entries.set(documentPath, { documentPath, count: 1, change });
        }
    }
    return [...entries.values()].sort((left, right) => (
        left.documentPath.localeCompare(right.documentPath)
    ));
}

/**
 * How many review items each status holds. Callers pass the queue *before* the
 * status, owner, and search filters so a chip reads as "this many items exist",
 * which is the only count a reviewer can act on when deciding what to open.
 */
export function reviewStatusCounts(
    groups: ChangeGroup[],
): Record<DiffKind, number> {
    const counts: Record<DiffKind, number> = { added: 0, changed: 0, removed: 0 };
    for (const group of groups) counts[group.kind] += 1;
    return counts;
}

/** The same count per review owner, busiest discipline first. */
export function reviewImpactCounts(
    groups: ChangeGroup[],
): Array<{ impact: ReviewImpact; count: number }> {
    const counts = new Map<ReviewImpact, number>();
    for (const group of groups) {
        const impact = reviewImpactForGroup(group);
        counts.set(impact, (counts.get(impact) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([impact, count]) => ({ impact, count }))
        .sort((left, right) => (
            right.count - left.count
            || REVIEW_IMPACT_LABEL[left.impact].localeCompare(
                REVIEW_IMPACT_LABEL[right.impact],
            )
        ));
}

/**
 * Where a review item sits in the queue.
 *
 * Four sections rather than the nine object categories. Components, nets and
 * rules are the decisions a release review signs off; everything else — board
 * graphics, free text, and anything already classified secondary — is layout
 * and documentation, available but not competing for attention. This is the
 * same boundary Altium's comparison draws by simply not detecting the latter.
 */
export type QueueSection = "components" | "nets" | "rules" | "layout";

export const QUEUE_SECTION_LABEL: Record<QueueSection, string> = {
    components: "Components",
    nets: "Nets",
    rules: "Rules & constraints",
    layout: "Layout & documentation",
};

export const QUEUE_SECTION_ORDER: QueueSection[] = [
    "components",
    "nets",
    "rules",
    "layout",
];

/**
 * A hierarchical sheet is an instantiated block with its own identity, and its
 * pin edits already roll up to it, so it reads as a component rather than as
 * documentation. A zone belongs to the net it pours, which is how Altium files
 * polygon pours under their net rather than in a section of their own.
 */
const SECTION_BY_CATEGORY: Partial<Record<Category, QueueSection>> = {
    components: "components",
    symbols: "components",
    sheets: "components",
    nets: "nets",
    zones: "nets",
    rules: "rules",
};

export function queueSection(group: ChangeGroup): QueueSection {
    if (group.classification === "secondary") return "layout";
    return SECTION_BY_CATEGORY[group.category] ?? "layout";
}

export function groupMatchesSearch(group: ChangeGroup, search: string): boolean {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return true;
    const values: unknown[] = [group.label, groupSummary(group), group.category];
    for (const change of group.changes) {
        values.push(
            change.label,
            change.reference,
            change.net,
            change.page,
            ...(change.reasons ?? []),
            ...Object.keys(change.fields ?? {}),
            ...(change.layers ?? []),
        );
    }
    return values.some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
}
