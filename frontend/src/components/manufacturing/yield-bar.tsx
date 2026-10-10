import { cn } from "@/lib/utils";

/**
 * Good units against units ordered: a thin bar, with the counts ("48/50") or, where the
 * ordered quantity is shown elsewhere, just the percentage.
 */
export function YieldBar({
    good,
    ordered,
    className,
    format = "counts",
}: {
    good: number;
    ordered: number;
    className?: string;
    format?: "counts" | "percent";
}) {
    if (ordered <= 0) return <span className="text-sm text-muted-foreground">—</span>;
    const pct = Math.max(0, Math.min(100, (good / ordered) * 100));
    return (
        <div className={cn("flex items-center gap-2", className)} title={`${Math.round(pct)}% good`}>
            <span className="shrink-0 text-sm tabular-nums">
                {format === "percent" ? `${Math.round(pct)}%` : `${good}/${ordered}`}
            </span>
            <div
                className="h-1.5 w-full min-w-8 bg-muted"
                role="progressbar"
                aria-label="Yield"
                aria-valuemin={0}
                aria-valuemax={ordered}
                aria-valuenow={good}
            >
                <div
                    className={cn("h-full", pct >= 95 ? "bg-success" : pct >= 80 ? "bg-warning" : "bg-destructive")}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}
