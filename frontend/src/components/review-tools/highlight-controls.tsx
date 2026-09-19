import { Crosshair, Contrast, Network, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HighlightNotice } from "@/lib/review-highlight-state";
import type { ScopedNetRef } from "@/types/ecad-viewer";

export interface HighlightControlsProps {
    refs: readonly ScopedNetRef[];
    /** Viewer rejections and unmappable gestures, newest last. */
    notices: readonly HighlightNotice[];
    dimming: boolean;
    onRemove: (ref: ScopedNetRef) => void;
    onClear: () => void;
    onToggleDimming: (enabled: boolean) => void;
    onFit: () => void;
    /** True when at least one PCB ref can be fitted by the board viewer. */
    canFit?: boolean;
}

/** The leaf label text, so a hierarchical SCH key stays readable in a chip. */
function chipLabel(ref: ScopedNetRef): string {
    if (ref.context === "PCB") return ref.netKey;
    return ref.netKey.split("/").filter(Boolean).at(-1) || ref.netKey;
}

/**
 * Compact selected-net chips with remove/clear, context dimming and Fit
 * highlighted. Presentational on purpose: the Visualizer owns the collection
 * and the viewer calls, so both PCB and SCH mount the same control.
 */
export function HighlightControls({
    refs,
    notices,
    dimming,
    onRemove,
    onClear,
    onToggleDimming,
    onFit,
    canFit = false,
}: HighlightControlsProps) {
    const empty = refs.length === 0 && notices.length === 0;

    return (
        <section
            aria-label="Highlighted nets"
            className="pointer-events-auto flex max-w-3xl flex-col gap-2 border bg-background/95 p-2 shadow-lg backdrop-blur-sm"
        >
            <div className="flex flex-wrap items-center gap-1.5">
                <Network className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-xs font-medium">Highlighted nets</span>
                <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                    {refs.length}
                </span>
                <div className="flex-1" />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onFit}
                    disabled={!canFit}
                    title="Fit the highlighted nets on the board"
                >
                    <Crosshair className="mr-1.5 size-3.5" aria-hidden />
                    Fit highlighted
                </Button>
                <Button
                    type="button"
                    variant={dimming ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    aria-pressed={dimming}
                    onClick={() => onToggleDimming(!dimming)}
                    title="Dim the unhighlighted context without changing layer visibility"
                >
                    <Contrast className="mr-1.5 size-3.5" aria-hidden />
                    Dim context
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onClear}
                    disabled={empty}
                >
                    Clear
                </Button>
            </div>

            {refs.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Selected nets">
                    {refs.map((ref) => {
                        const label = chipLabel(ref);
                        return (
                            <li
                                key={`${ref.context}:${ref.documentKey}:${ref.occurrencePath ?? ""}:${ref.netKey}`}
                                className="flex items-center gap-1.5 border bg-muted/40 py-0.5 pl-1.5 pr-0.5"
                            >
                                <Badge
                                    variant="outline"
                                    className="px-1 py-0 text-[9px] font-medium uppercase"
                                >
                                    {ref.context}
                                </Badge>
                                <span
                                    className="max-w-40 truncate font-mono text-xs"
                                    title={ref.netKey}
                                >
                                    {label}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-5"
                                    aria-label={`Remove ${label} from highlights`}
                                    onClick={() => onRemove(ref)}
                                >
                                    <X className="size-3" aria-hidden />
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {notices.length > 0 && (
                <ul
                    role="status"
                    aria-live="polite"
                    aria-label="Highlight problems"
                    className="space-y-1"
                >
                    {notices.map((notice) => (
                        <li
                            key={notice.key}
                            className={cn(
                                "border border-warning/50 bg-warning/10 px-2 py-1 text-[11px] leading-snug text-foreground",
                            )}
                        >
                            {notice.message}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
