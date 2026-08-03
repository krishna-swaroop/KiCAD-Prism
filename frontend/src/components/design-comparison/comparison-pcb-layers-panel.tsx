import { Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PcbLayerList } from "@/components/ecad-viewer-controls";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ECadViewerElement, EcadPcbLayerState } from "@/types/ecad-viewer";

const PCB_PRESETS = [
    ["front", "Front"],
    ["back", "Back"],
    ["copper", "All copper"],
    ["outer-copper", "Outer copper"],
    ["inner-copper", "Inner copper"],
    ["drawings", "Drawings"],
    ["all", "Show all"],
    ["none", "Hide all"],
] as const;

export type ComparisonPcbLayersPanelProps = {
    layers: EcadPcbLayerState[];
    onToggleVisibility: (name: string, visible: boolean) => void;
    onApplyPreset: (
        preset: Parameters<
            NonNullable<ECadViewerElement["applyPcbLayerPreset"]>
        >[0],
    ) => void;
    onHighlight?: (name: string | null) => void;
    className?: string;
};

/**
 * Compact layer trigger for the canvas toolbar.
 *
 * Reads as "visible of total" rather than a word, so the state a reviewer
 * cares about — am I looking at the whole board or a subset — is legible
 * without opening the panel.
 */
export function ComparisonPcbLayersToggle({
    open,
    onClick,
    visibleCount,
    totalCount,
}: {
    open: boolean;
    onClick: () => void;
    visibleCount?: number;
    totalCount?: number;
}) {
    const counted = totalCount !== undefined && visibleCount !== undefined;
    return (
        <Button
            variant={open ? "secondary" : "outline"}
            size="sm"
            className="h-8"
            onClick={onClick}
            aria-expanded={open}
            aria-label={counted
                ? `Layers, ${visibleCount} of ${totalCount} visible`
                : "Layers"}
        >
            <Layers3 className="mr-2 h-3.5 w-3.5" />
            {counted ? `${visibleCount}/${totalCount}` : "Layers"}
        </Button>
    );
}

/**
 * Visualizer-style PCB layer list for the comparison's overlay rail.
 *
 * The rail owns its own header, close affordance and open/closed state, so this
 * is only ever the body: presets, then the layer list.
 */
export function ComparisonPcbLayersPanel({
    layers,
    onToggleVisibility,
    onApplyPreset,
    onHighlight,
    className,
}: ComparisonPcbLayersPanelProps) {
    return (
        <aside
            className={cn("flex h-full w-full flex-col bg-background/95", className)}
            aria-label="PCB layer visibility"
        >
            <div className="border-b p-3">
                <Select
                    onValueChange={(value) =>
                        onApplyPreset(
                            value as Parameters<
                                NonNullable<
                                    ECadViewerElement["applyPcbLayerPreset"]
                                >
                            >[0],
                        )
                    }
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Layer preset" />
                    </SelectTrigger>
                    <SelectContent>
                        {PCB_PRESETS.map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                                {label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <ScrollArea className="min-h-0 flex-1">
                <div className="p-2">
                    <PcbLayerList
                        layers={layers}
                        onToggleVisibility={onToggleVisibility}
                        onHighlight={onHighlight}
                    />
                    {!layers.length && (
                        <p className="px-2 py-4 text-xs text-muted-foreground">
                            Layers appear after the PCB comparison loads.
                        </p>
                    )}
                </div>
            </ScrollArea>
        </aside>
    );
}
