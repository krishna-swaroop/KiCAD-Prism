import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    checkCapabilities,
    mergeCapabilityRows,
    type CapabilityMeta,
    type CapabilityRow,
    type PcbRuleField,
} from "@/types/manufacturing";

function formatValue(value: unknown, unit?: string | null): string {
    if (value === undefined || value === null || value === "") return "—";
    if (value === true) return "yes";
    if (value === false) return "no";
    return unit ? `${value} ${unit}` : String(value);
}

interface CapabilityCheckProps {
    fields: PcbRuleField[];
    capabilities: Record<string, number>;
    meta: Record<string, CapabilityMeta>;
    /** The board's own extracted rules; null when they could not be read. */
    boardRules: Record<string, unknown> | null;
    /** The linked process's name, or null when the spec has none. */
    processName: string | null;
}

/**
 * Compares the board with the process's minimums. Shows only what is below a
 * minimum up front; the full rule table opens on demand. Display only: it never
 * blocks saving or starting a production.
 */
export function CapabilityCheck({ fields, capabilities, meta, boardRules, processName }: CapabilityCheckProps) {
    const [showAll, setShowAll] = useState(false);
    const rows = mergeCapabilityRows(fields, capabilities, meta);
    const { findings, compared } = checkCapabilities(rows, boardRules);
    const belowKeys = new Set(findings.map((f) => f.row.key));
    const hasAnyCapability = rows.some((r) => r.value !== undefined);

    let status: React.ReactNode;
    if (!processName) {
        status = <p className="text-sm text-muted-foreground">Pick a process to see its minimums.</p>;
    } else if (!hasAnyCapability) {
        status = (
            <p className="text-sm text-muted-foreground">
                No capabilities set for this process yet. Add them from Edit process, on its Capabilities tab.
            </p>
        );
    } else if (findings.length > 0) {
        status = (
            <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    {findings.length} {findings.length === 1 ? "rule" : "rules"} below minimum
                </p>
                <ul className="divide-y border text-sm">
                    {findings.map(({ row, board }) => (
                        <li key={row.key} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                            <span className="min-w-0">{row.label}</span>
                            <span className="shrink-0 tabular-nums">
                                <span className="font-medium text-warning">{formatValue(board, row.unit)}</span>
                                <span className="text-muted-foreground"> &lt; {formatValue(row.value, row.unit)}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        );
    } else if (compared > 0) {
        status = (
            <p className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                All {compared} checked {compared === 1 ? "rule meets" : "rules meet"} the {processName} minimums
            </p>
        );
    } else {
        status = (
            <p className="text-sm text-muted-foreground">
                {boardRules === null
                    ? "The board's rules could not be read."
                    : "The board has no rule values to compare with."}
            </p>
        );
    }

    return (
        <section className="border">
            <div className="border-b bg-muted/30 px-4 py-2.5">
                <h3 className="text-sm font-medium">Capability check</h3>
                {processName && <p className="text-xs text-muted-foreground">{processName}</p>}
            </div>
            <div className="space-y-3 px-4 py-3">
                {status}
                {processName && hasAnyCapability && (
                    <button
                        type="button"
                        aria-expanded={showAll}
                        onClick={() => setShowAll((v) => !v)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                        {showAll ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        Show all rules
                    </button>
                )}
            </div>
            {showAll && processName && hasAnyCapability && (
                <CapabilitiesTable rows={rows} boardRules={boardRules} belowKeys={belowKeys} />
            )}
        </section>
    );
}

// The full rule table: the process minimum beside this board's value. A toggle
// limits it to KiCad-tracked rules (the only ones with a board value) or shows
// the process's custom capabilities too. Rows with nothing to show are hidden.
function CapabilitiesTable({
    rows: allRows,
    boardRules,
    belowKeys,
}: {
    rows: CapabilityRow[];
    boardRules: Record<string, unknown> | null;
    belowKeys: Set<string>;
}) {
    const [showCustom, setShowCustom] = useState(false);
    const rows = allRows.filter((r) => {
        if (!showCustom && !r.kicad) return false;
        const hasCap = r.value !== undefined;
        const hasBoard = r.kicad && boardRules != null && boardRules[r.key] !== undefined;
        return hasCap || hasBoard;
    });
    const hasCustom = allRows.some((r) => !r.kicad && r.value !== undefined);

    return (
        <div className="border-t">
            {hasCustom && (
                <div className="flex justify-end px-4 pt-2">
                    <div className="inline-flex border text-xs" role="group" aria-label="Rules to show">
                        <button
                            type="button"
                            className={cn("px-2.5 py-1", !showCustom ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                            onClick={() => setShowCustom(false)}
                        >
                            KiCad-tracked
                        </button>
                        <button
                            type="button"
                            className={cn("px-2.5 py-1", showCustom ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                            onClick={() => setShowCustom(true)}
                        >
                            All
                        </button>
                    </div>
                </div>
            )}
            <div className="themed-scrollbar overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b text-muted-foreground">
                            <th className="px-4 py-2 text-left font-medium">Rule</th>
                            <th className="px-2 py-2 text-right font-medium">Min</th>
                            {boardRules != null && <th className="px-4 py-2 text-right font-medium">Board</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.key} className={cn(belowKeys.has(row.key) && "bg-warning/10")}>
                                <td className="px-4 py-1.5 text-muted-foreground">{row.label}</td>
                                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                                    {formatValue(row.value, row.unit)}
                                </td>
                                {boardRules != null && (
                                    <td className="px-4 py-1.5 text-right tabular-nums">
                                        {row.kicad ? formatValue(boardRules[row.key], row.unit) : "—"}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
