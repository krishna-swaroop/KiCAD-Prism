import { Ban, Check, Circle, CircleDot, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { RUN_STAGES } from "./flow";
import type { RunStage, StageState } from "./types";

const ICONS: Record<StageState, typeof Check> = {
    done: Check,
    active: CircleDot,
    failed: X,
    cancelled: Ban,
    pending: Circle,
    locked: Circle,
};

const TONES: Record<StageState, string> = {
    done: "text-success",
    active: "text-foreground",
    failed: "text-destructive",
    cancelled: "text-warning",
    pending: "text-muted-foreground",
    locked: "text-muted-foreground",
};

/** The ordered stages of a run, with a one-line summary of each.
 *
 * Sequential to read, random-access to use: every stage stays clickable
 * whatever its state, because a run is re-entered far more often than it is
 * walked through once.
 */
export function StageRail({
    stage,
    states,
    summaries,
    onSelect,
}: {
    stage: RunStage;
    states: Record<RunStage, StageState>;
    summaries: Partial<Record<RunStage, string>>;
    onSelect: (next: RunStage) => void;
}) {
    return (
        <nav aria-label="Run stages" className="flex flex-col gap-px">
            {RUN_STAGES.map((item, index) => {
                const state = states[item.id];
                const Icon = ICONS[state];
                const active = stage === item.id;
                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.id)}
                        disabled={state === "locked"}
                        aria-current={active ? "step" : undefined}
                        // Exposed so the stage's state is assertable: it is
                        // otherwise carried only by an icon, and "a finished
                        // run's ticks leaking onto a new one" is exactly the
                        // regression worth catching.
                        data-state={state}
                        className={cn(
                            "flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm leading-snug",
                            active ? "bg-muted font-medium" : "hover:bg-muted/40",
                            state === "locked" && "cursor-not-allowed opacity-50 hover:bg-transparent",
                        )}
                    >
                        <Icon className={cn("h-4 w-4 shrink-0", TONES[state])} />
                        <span className="font-mono text-xs text-muted-foreground">
                            {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate">{item.label}</span>
                            {summaries[item.id] && (
                                <span className="block truncate text-xs text-muted-foreground">
                                    {summaries[item.id]}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}

export default StageRail;
