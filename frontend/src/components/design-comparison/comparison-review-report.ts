/**
 * The review queue as an exportable record.
 *
 * Mature ECAD comparison tools all end the review at a document: Altium
 * Designer writes a comparison/ECO report, Altium 365 exports the compared BOM
 * as CSV. A release review that lives only in a browser tab cannot be attached
 * to an ECO, mailed to a fab house, or diffed against the next revision, so
 * Prism exports exactly what the reviewer is looking at — the same rollups,
 * the same order, the same filters — rather than the raw parser event list.
 */
import { csvCell } from "@/lib/csv";
import { CATEGORY_META } from "@/lib/diff-grouping";
import { CHANGE_KIND_LABEL } from "./change-status";
import type { ChangeGroup } from "./comparison-review-groups";
import {
    REVIEW_IMPACT_LABEL,
    groupDocumentEntries,
    groupSummary,
    reviewImpactForGroup,
} from "./comparison-review-queue";

/**
 * The report's columns, each owning its own heading and how it reads a review
 * item. One definition, so a new column cannot be added to the header and
 * forgotten in the rows.
 */
const COLUMNS = [
    { header: "Status", read: (group: ChangeGroup) => CHANGE_KIND_LABEL[group.kind] },
    {
        header: "Category",
        read: (group: ChangeGroup) => CATEGORY_META[group.category].label,
    },
    {
        header: "Review owner",
        read: (group: ChangeGroup) => REVIEW_IMPACT_LABEL[reviewImpactForGroup(group)],
    },
    { header: "Item", read: (group: ChangeGroup) => group.label },
    { header: "Detail", read: groupSummary },
    {
        header: "Documents",
        read: (group: ChangeGroup) => groupDocumentEntries(group)
            .map((entry) => entry.documentPath)
            .join(" | "),
    },
    { header: "Objects", read: (group: ChangeGroup) => group.changes.length },
    {
        header: "Scope",
        read: (group: ChangeGroup) =>
            group.classification === "secondary" ? "Secondary" : "Primary",
    },
    { header: "Open comments", read: (group: ChangeGroup) => group.unresolvedCount },
] as const satisfies ReadonlyArray<{
    header: string;
    read: (group: ChangeGroup) => string | number;
}>;

export const REVIEW_REPORT_COLUMNS = COLUMNS.map((column) => column.header);

export function reviewReportRows(
    groups: ChangeGroup[],
): Array<Record<string, string | number>> {
    return groups.map((group) => Object.fromEntries(
        COLUMNS.map((column) => [column.header, column.read(group)]),
    ));
}

export function reviewReportCsv(groups: ChangeGroup[]): string {
    const rows = groups.map((group) =>
        COLUMNS.map((column) => csvCell(column.read(group))).join(","));
    return [COLUMNS.map((column) => csvCell(column.header)).join(","), ...rows]
        .join("\n");
}

/**
 * Names the revisions being compared, not just the domain: two exports of
 * "pcb-changes.csv" from different revision pairs are indistinguishable once
 * they leave the browser.
 */
export function reviewReportFilename(context: {
    domain: "schematic" | "pcb";
    base: string;
    compare: string;
}): string {
    const shorten = (revision: string) =>
        revision.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 12) || "revision";
    return `design-compare-${context.domain}-${shorten(context.base)}-${shorten(context.compare)}.csv`;
}
