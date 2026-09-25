import { Crosshair, Network, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { netLeafName, type HighlightedNet } from "@/lib/net-highlights";

interface NetHighlightBarProps {
    nets: readonly HighlightedNet[];
    onRemove: (net: HighlightedNet) => void;
    onClear: () => void;
    /** Fit the board camera to the highlighted copper; absent off the PCB. */
    onFit?: () => void;
}

/**
 * The nets the reviewer has accumulated with shift-click, floating over the
 * canvas. Presentational: the visualizer owns the collection and the viewer
 * calls, so the schematic and the board mount the same bar.
 */
export function NetHighlightBar({ nets, onRemove, onClear, onFit }: NetHighlightBarProps) {
    if (nets.length === 0) return null;
    return (
        <section
            aria-label="Highlighted nets"
            className="pointer-events-auto flex max-w-[min(100%,48rem)] flex-wrap items-center gap-1.5 border bg-background/95 px-2 py-1.5 text-xs shadow-lg backdrop-blur-sm"
        >
            <Network className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="font-medium">Highlighted</span>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] tabular-nums">
                {nets.length}
            </Badge>
            <ul className="flex flex-wrap items-center gap-1" aria-label="Highlighted net list">
                {nets.map((net) => {
                    const label = netLeafName(net.netName);
                    return (
                        <li
                            key={net.netName}
                            className="flex items-center gap-0.5 border bg-muted/40 py-0.5 pl-1.5 pr-0.5 font-mono"
                            title={net.netName}
                        >
                            <span className="max-w-40 truncate">{label}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="size-5"
                                aria-label={`Remove ${label} from highlights`}
                                onClick={() => onRemove(net)}
                            >
                                <X className="size-3" aria-hidden />
                            </Button>
                        </li>
                    );
                })}
            </ul>
            <div className="flex-1" />
            {onFit && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={onFit}
                    title="Fit the highlighted nets in view"
                >
                    <Crosshair className="mr-1 size-3" aria-hidden />
                    Fit
                </Button>
            )}
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onClear}
                title="Clear the highlighted nets (Esc)"
            >
                Clear
            </Button>
        </section>
    );
}
