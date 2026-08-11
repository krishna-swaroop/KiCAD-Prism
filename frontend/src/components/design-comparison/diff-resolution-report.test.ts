import { describe, expect, it } from "vitest";
import { buildDiffResolutionReport } from "./diff-resolution-report";
import type {
    EcadDocumentComparisonPreparation,
    EcadPreparedDiffTarget,
} from "@/types/ecad-viewer";

function target(id: string): EcadPreparedDiffTarget {
    return {
        id,
        kind: "change",
        category: "modified",
        label: id,
        memberIds: [id],
        sourceIds: [id],
        bounds: [0, 0, 1, 1],
        sourceSide: "comparison",
        routing: false,
        overlayLines: [],
    };
}

function preparation(
    overrides: Partial<EcadDocumentComparisonPreparation> = {},
): EcadDocumentComparisonPreparation {
    return {
        comparisonKey: "p:a:b",
        context: "SCH",
        document: { path: "root.kicad_sch", docType: "kicad_sch", changes: [] },
        targets: new Map([["a", target("a")], ["b", target("b")]]),
        diagnostics: [],
        prepareMs: 12.345,
        sourceCacheHit: false,
        ...overrides,
    };
}

describe("buildDiffResolutionReport", () => {
    it("reports the share of targets still focusing host-supplied bounds", () => {
        const report = buildDiffResolutionReport(preparation({
            resolution: {
                changes: 10,
                sourceResolved: 9,
                ambiguousSourceIds: 1,
                duplicateChangeTargets: 0,
                targets: 8,
                targetsWithPaintedBounds: 6,
                targetsUsingProvidedBounds: 2,
                targetsNonFocusable: 0,
                visuals: 8,
                visualsWithPaintedBounds: 6,
                visualsUsingProvidedBounds: 2,
                visualsNonFocusable: 0,
            },
        }));

        expect(report.fallbackBoundsRate).to.equal(0.25);
        expect(report.targetsUsingProvidedBounds).to.equal(2);
        expect(report.targetsNonFocusable).to.equal(0);
        expect(report.unreported).to.equal(false);
        expect(report.prepareMs).to.equal(12.3);
    });

    it("separates a bundle that cannot report from a clean measurement", () => {
        const report = buildDiffResolutionReport(preparation());

        expect(report.unreported).to.equal(true);
        // Falls back to the target map rather than claiming zero targets.
        expect(report.targets).to.equal(2);
        // Unmeasured, not "no fallbacks were used".
        expect(report.fallbackBoundsRate).to.equal(null);
    });

    it("groups failures by reason and by object kind, ignoring ambiguity", () => {
        const report = buildDiffResolutionReport(preparation({
            diagnostics: [
                {
                    changeId: "/1",
                    side: "comparison",
                    reason: "item-not-found",
                    typeName: "SCH_SYMBOL",
                },
                {
                    changeId: "/2",
                    side: "comparison",
                    reason: "paint-bounds-not-found",
                    typeName: "SCH_SYMBOL",
                },
                {
                    changeId: "/3",
                    side: "reference",
                    reason: "source-id-ambiguous",
                    typeName: "PCB_TRACK",
                    matchCount: 3,
                },
            ],
        }));

        expect(report.diagnosticsByReason).to.deep.equal({
            "item-not-found": 1,
            "paint-bounds-not-found": 1,
            "source-id-ambiguous": 1,
        });
        // Ambiguity resolved to something, so it is not a resolution failure.
        expect(report.failuresByTypeName).to.deep.equal([
            { typeName: "SCH_SYMBOL", count: 2 },
        ]);
    });

    it("names bounds failures from the target label and splits them by side", () => {
        const labelled = target("/sym");
        labelled.label = "SCH_SYMBOL [C289]";
        const report = buildDiffResolutionReport(preparation({
            // Keys carry a kind prefix; diagnostics carry the bare change id.
            targets: new Map([["change:/sym", labelled]]),
            diagnostics: [
                // Raised during paint, so it carries no typeName of its own.
                {
                    changeId: "/sym",
                    sourceId: "sym",
                    side: "reference",
                    reason: "paint-bounds-not-found",
                    matchCount: 0,
                },
                {
                    changeId: "/sym",
                    sourceId: "sym",
                    side: "comparison",
                    reason: "paint-bounds-not-found",
                    matchCount: 0,
                },
            ],
        }));

        expect(report.failuresByTypeName).to.deep.equal([
            { typeName: "SCH_SYMBOL", count: 2 },
        ]);
        expect(report.boundsFailuresBySide).to.deep.equal({
            reference: 1,
            comparison: 1,
        });
    });

    it("returns a null rate rather than dividing by zero targets", () => {
        const report = buildDiffResolutionReport(preparation({
            targets: new Map(),
        }));

        expect(report.fallbackBoundsRate).to.equal(null);
    });
});
