import type {
    EcadDiffResolutionDiagnostic,
    EcadDiffResolutionReason,
    EcadDocumentComparisonPreparation,
    EcadPreparedDiffTarget,
} from "../../types/ecad-viewer";

/**
 * M5 geometry-resolution measurement. Prism inputs are identity-only; the
 * viewer measures bounds from painted parser objects. A target that cannot be
 * measured is reported as non-focusable instead of receiving origin bounds.
 */
export type DiffResolutionReport = {
    documentPath: string;
    context: "SCH" | "PCB";
    sourceCacheHit: boolean;
    prepareMs: number;
    changes: number;
    sourceResolved: number;
    targets: number;
    targetsWithPaintedBounds: number;
    targetsUsingProvidedBounds: number;
    targetsNonFocusable: number;
    /**
     * Visual-level denominator. A target can hold several visuals and needs
     * only one of them to paint, so visual failures are expected wherever a
     * target spans both revisions: the composite scene paints the comparison
     * document and retains only *changed* reference items. Without this
     * denominator a raw paint-bounds-not-found count is uninterpretable.
     */
    visuals: number;
    visualsWithPaintedBounds: number;
    visualsUsingProvidedBounds: number;
    visualsNonFocusable: number;
    boundsFailuresBySide: { reference: number; comparison: number };
    /** 0–1, rounded to four places. Null when the viewer prepared no targets. */
    fallbackBoundsRate: number | null;
    ambiguousSourceIds: number;
    duplicateChangeTargets: number;
    diagnosticsByReason: Partial<Record<EcadDiffResolutionReason, number>>;
    /** Object kinds that failed to resolve, worst first, capped at eight. */
    failuresByTypeName: Array<{ typeName: string; count: number }>;
    /** True when the bundle predates resolution reporting. */
    unreported: boolean;
};

const FAILURE_REASONS = new Set<EcadDiffResolutionReason>([
    "missing-source-id",
    "item-not-found",
    "paint-bounds-not-found",
]);

function countByReason(
    diagnostics: readonly EcadDiffResolutionDiagnostic[],
): Partial<Record<EcadDiffResolutionReason, number>> {
    const counts: Partial<Record<EcadDiffResolutionReason, number>> = {};
    for (const entry of diagnostics) {
        counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
    }
    return counts;
}

/**
 * Bounds diagnostics are raised during paint, where only the target is in
 * scope, so they carry no typeName. The target's label already leads with it
 * (`SCH_SYMBOL [C289]`), which is enough to keep the breakdown useful instead
 * of collapsing the largest failure class into "unknown".
 */
function typeNameOf(
    entry: EcadDiffResolutionDiagnostic,
    targets: ReadonlyMap<string, EcadPreparedDiffTarget>,
): string {
    if (entry.typeName) return entry.typeName;
    // The map is keyed with a kind prefix so a group and a change sharing a
    // native id cannot overwrite each other; diagnostics carry the bare id.
    const target =
        targets.get(`change:${entry.changeId}`)
        ?? targets.get(`group:${entry.changeId}`);
    return target?.label?.split(" ")[0] ?? "unknown";
}

function failuresByTypeName(
    diagnostics: readonly EcadDiffResolutionDiagnostic[],
    targets: ReadonlyMap<string, EcadPreparedDiffTarget>,
): Array<{ typeName: string; count: number }> {
    const counts = new Map<string, number>();
    for (const entry of diagnostics) {
        if (!FAILURE_REASONS.has(entry.reason)) continue;
        const key = typeNameOf(entry, targets);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([typeName, count]) => ({ typeName, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
}

function boundsFailuresBySide(
    diagnostics: readonly EcadDiffResolutionDiagnostic[],
): { reference: number; comparison: number } {
    const sides = { reference: 0, comparison: 0 };
    for (const entry of diagnostics) {
        if (entry.reason !== "paint-bounds-not-found") continue;
        sides[entry.side] += 1;
    }
    return sides;
}

export function buildDiffResolutionReport(
    preparation: EcadDocumentComparisonPreparation,
): DiffResolutionReport {
    const diagnostics = preparation.diagnostics ?? [];
    const resolution = preparation.resolution;
    const targets = resolution?.targets ?? preparation.targets.size;
    const painted = resolution?.targetsWithPaintedBounds ?? 0;
    const provided = resolution?.targetsUsingProvidedBounds ?? 0;
    return {
        documentPath: preparation.document.path,
        context: preparation.context,
        sourceCacheHit: preparation.sourceCacheHit,
        prepareMs: Number(preparation.prepareMs.toFixed(1)),
        changes: resolution?.changes ?? preparation.document.changes.length,
        sourceResolved: resolution?.sourceResolved ?? 0,
        targets,
        targetsWithPaintedBounds: painted,
        targetsUsingProvidedBounds: provided,
        targetsNonFocusable: resolution?.targetsNonFocusable ?? 0,
        // Null, never 0, when the bundle cannot report or prepared no targets.
        // A numeric zero here would read as "no fallbacks were used", which is
        // the opposite of what an unreporting bundle actually tells us.
        fallbackBoundsRate: resolution && targets > 0
            ? Number((provided / targets).toFixed(4))
            : null,
        visuals: resolution?.visuals ?? 0,
        visualsWithPaintedBounds: resolution?.visualsWithPaintedBounds ?? 0,
        visualsUsingProvidedBounds:
            resolution?.visualsUsingProvidedBounds ?? 0,
        visualsNonFocusable: resolution?.visualsNonFocusable ?? 0,
        boundsFailuresBySide: boundsFailuresBySide(diagnostics),
        ambiguousSourceIds: resolution?.ambiguousSourceIds ?? 0,
        duplicateChangeTargets: resolution?.duplicateChangeTargets ?? 0,
        diagnosticsByReason: countByReason(diagnostics),
        failuresByTypeName: failuresByTypeName(diagnostics, preparation.targets),
        // Distinguishes "measured zero fallbacks" from "the loaded bundle
        // cannot report", which would otherwise both read as a clean result.
        unreported: resolution === undefined,
    };
}
