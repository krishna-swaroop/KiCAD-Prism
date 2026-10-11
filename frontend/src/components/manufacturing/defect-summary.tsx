import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DefectSeverity, ManufacturingRun } from "@/types/manufacturing";
import { SEVERITY_VARIANT, SOLID_DESTRUCTIVE } from "./status-badge";

const ORDER: DefectSeverity[] = ["critical", "major", "minor", "aesthetic"];

/**
 * A production's defects at a glance: how many of each severity were logged, and
 * how many of them are still open. Worst first, so a critical one is never hidden.
 */
export function DefectSummary({ run }: { run: ManufacturingRun }) {
    const counts = run.defect_severity_counts ?? {};
    const present = ORDER.filter((severity) => (counts[severity] ?? 0) > 0);
    const open = run.open_defect_count ?? 0;

    if (present.length === 0 && open === 0) {
        return <span className="text-sm text-muted-foreground">—</span>;
    }
    return (
        <div className="space-y-1">
            {present.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {present.map((severity) => (
                        <Badge
                            key={severity}
                            variant={SEVERITY_VARIANT[severity]}
                            className={cn("h-5 px-1.5 text-[11px]", severity === "critical" && SOLID_DESTRUCTIVE)}
                            title={`${counts[severity]} ${severity} defect(s) logged`}
                        >
                            {counts[severity]} {severity}
                        </Badge>
                    ))}
                </div>
            )}
            <p
                className={cn("text-xs", open > 0 ? "text-warning" : "text-muted-foreground")}
                title={open > 0 ? `${open} open defect(s)` : "Every defect is resolved or accepted"}
            >
                {open > 0 ? `${open} open` : "all closed"}
            </p>
        </div>
    );
}
