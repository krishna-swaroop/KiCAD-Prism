import { mergeCapabilityRows, type ManufacturingRun, type PcbRuleField, type SpecTemplate } from "@/types/manufacturing";

export interface DefectTotals {
    critical: number;
    major: number;
    minor: number;
    aesthetic: number;
    total: number;
}

export interface Scorecard {
    productions: number;
    /** Units ordered across every production. */
    units: number;
    /** Good units over ordered units, for productions already received or closed; null if none are. */
    yieldPct: number | null;
    defects: DefectTotals;
}

/**
 * How a manufacturer has done across its productions. Cancelled ones are left out
 * entirely: nothing was built. Yield only counts the ones that have arrived
 * (received or closed): a draft has no good units yet and would drag the figure
 * down for no reason.
 */
export function manufacturerScorecard(allRuns: ManufacturingRun[]): Scorecard {
    const runs = allRuns.filter((run) => run.status !== "cancelled");
    let units = 0;
    let finishedOrdered = 0;
    let finishedGood = 0;
    const defects: DefectTotals = { critical: 0, major: 0, minor: 0, aesthetic: 0, total: 0 };
    for (const run of runs) {
        units += run.quantity_ordered;
        if ((run.status === "received" || run.status === "closed") && run.quantity_ordered > 0) {
            finishedOrdered += run.quantity_ordered;
            finishedGood += run.quantity_good;
        }
        for (const severity of ["critical", "major", "minor", "aesthetic"] as const) {
            const n = run.defect_severity_counts?.[severity] ?? 0;
            defects[severity] += n;
            defects.total += n;
        }
    }
    return {
        productions: runs.length,
        units,
        yieldPct: finishedOrdered > 0 ? Math.round((finishedGood / finishedOrdered) * 1000) / 10 : null,
        defects,
    };
}

export interface MinimumSummary {
    key: string;
    label: string;
    value: number;
    unit?: string;
}

/** The first few minimums a process sets, KiCad-tracked ones first, for its card. */
export function keyMinimums(template: SpecTemplate, ruleFields: PcbRuleField[], limit = 4): MinimumSummary[] {
    return mergeCapabilityRows(ruleFields, template.capabilities ?? {}, template.capability_meta ?? {})
        .filter((row): row is typeof row & { value: number } => row.value !== undefined)
        .slice(0, limit)
        .map((row) => ({ key: row.key, label: row.label, value: row.value, unit: row.unit }));
}
