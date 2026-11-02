import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { RUN_STATUSES, RUN_STATUS_LABELS, type RunStatus } from "@/types/manufacturing";

/** The status after this one, or null once the run is closed. */
export function nextRunStatus(status: RunStatus): RunStatus | null {
    const index = RUN_STATUSES.indexOf(status);
    return index >= 0 && index < RUN_STATUSES.length - 1 ? RUN_STATUSES[index + 1] : null;
}

/**
 * The run's lifecycle as five ordered stages: finished ones are ticked, the
 * current one is ringed, the rest are open. Read-only; advancing is a button
 * next to it.
 */
export function StatusStepper({ status }: { status: RunStatus }) {
    const current = RUN_STATUSES.indexOf(status);
    return (
        <ol className="flex min-w-0 flex-[1_1_30rem] items-center" aria-label="Production status">
            {RUN_STATUSES.map((stage, index) => {
                const done = index < current;
                const active = index === current;
                return (
                    <li key={stage} aria-current={active ? "step" : undefined} className={cn("flex items-center", index < RUN_STATUSES.length - 1 && "flex-1")}>
                        <span
                            className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                                done && "border-primary bg-primary text-primary-foreground",
                                active && "border-primary bg-background text-primary ring-2 ring-primary/30",
                                !done && !active && "text-muted-foreground",
                            )}
                            aria-hidden
                        >
                            {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                        </span>
                        <span
                            className={cn(
                                "ml-2 whitespace-nowrap text-sm",
                                active ? "font-medium" : done ? "text-foreground" : "text-muted-foreground",
                            )}
                        >
                            {RUN_STATUS_LABELS[stage]}
                            {active && <span className="sr-only"> (current)</span>}
                        </span>
                        {index < RUN_STATUSES.length - 1 && (
                            <span
                                className={cn("mx-3 h-px min-w-3 flex-1", index < current ? "bg-primary" : "bg-border")}
                                aria-hidden
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
