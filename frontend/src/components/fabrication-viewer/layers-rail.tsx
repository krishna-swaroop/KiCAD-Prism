import { memo, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Layers3 } from "lucide-react";

import { PcbLayerList } from "@/components/ecad-viewer-controls";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EcadPcbLayerState } from "@/types/ecad-viewer";

import type { FabricationLayer } from "./types";
import { LAYER_PRESETS, type LayerPreset } from "./viewer-state";

/**
 * The Visualizer rail's pattern, a little narrower: the board is what matters
 * here, and the viewer sits in panels much smaller than the Visualizer.
 */
const DEFAULT_WIDTH = 208;
const MIN_WIDTH = 168;
const MAX_WIDTH = 360;
const COLLAPSED_WIDTH = 44;

/**
 * Layers as the shared list wants them. It keys rows by name, so two layers that
 * read the same are told apart by their file.
 */
export function toListLayers(
    layers: FabricationLayer[],
    visible: ReadonlySet<string>,
    highlighted: string | null,
): { rows: EcadPcbLayerState[]; idByName: Map<string, string> } {
    const counts = new Map<string, number>();
    for (const layer of layers) counts.set(layer.name, (counts.get(layer.name) ?? 0) + 1);
    const idByName = new Map<string, string>();
    const rows = layers.map((layer) => {
        const name = (counts.get(layer.name) ?? 0) > 1 ? `${layer.name} (${layer.file})` : layer.name;
        idByName.set(name, layer.id);
        return {
            name,
            color: layer.colour,
            visible: visible.has(layer.id),
            highlighted: layer.id === highlighted,
        };
    });
    return { rows, idByName };
}

/**
 * The layer rail, built like the Visualizer's: a "Board display" header with a
 * collapse handle, then the same preset menu and layer list.
 */
export const LayersRail = memo(function LayersRail({
    layers,
    visible,
    highlighted,
    onToggle,
    onHighlight,
    onPreset,
}: {
    layers: FabricationLayer[];
    visible: ReadonlySet<string>;
    highlighted: string | null;
    onToggle: (id: string) => void;
    onHighlight: (id: string) => void;
    onPreset: (preset: LayerPreset) => void;
}) {
    const [open, setOpen] = useState(true);
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const [resizing, setResizing] = useState(false);
    const { rows, idByName } = useMemo(
        () => toListLayers(layers, visible, highlighted),
        [layers, visible, highlighted],
    );

    const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startWidth = width;
        const target = event.currentTarget;
        setResizing(true);
        target.setPointerCapture(pointerId);
        const onMove = (move: PointerEvent) => {
            setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (move.clientX - startX))));
        };
        const onUp = () => {
            setResizing(false);
            target.releasePointerCapture(pointerId);
            target.removeEventListener("pointermove", onMove);
            target.removeEventListener("pointerup", onUp);
        };
        target.addEventListener("pointermove", onMove);
        target.addEventListener("pointerup", onUp);
    };

    return (
        <aside
            className={cn(
                "relative flex shrink-0 flex-col overflow-hidden border-r bg-background/95",
                !resizing && "transition-[width] duration-200",
            )}
            style={{ width: open ? width : COLLAPSED_WIDTH }}
            aria-label="Board display"
        >
            <div className="flex h-10 shrink-0 items-center border-b">
                <div className="flex min-w-0 flex-1 items-center gap-2 pl-3 text-xs font-medium">
                    {open && (
                        <>
                            <Layers3 className="size-4 shrink-0" />
                            <span className="truncate">Board display</span>
                        </>
                    )}
                </div>
                <div className="flex w-11 shrink-0 justify-center">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setOpen((value) => !value)}
                        aria-label={open ? "Collapse board display" : "Expand board display"}
                        aria-expanded={open}
                    >
                        {open ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                    </Button>
                </div>
            </div>
            {open && (
                <>
                    <div className="border-b p-3">
                        <Select onValueChange={(value) => onPreset(value as LayerPreset)}>
                            <SelectTrigger className="w-full" aria-label="Layer preset">
                                <SelectValue placeholder="Layer preset" />
                            </SelectTrigger>
                            <SelectContent>
                                {LAYER_PRESETS.map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <ScrollArea className="themed-scrollbar min-h-0 flex-1">
                        <div className="p-2">
                            <PcbLayerList
                                layers={rows}
                                onToggleVisibility={(names) => {
                                    for (const name of names) {
                                        const id = idByName.get(name);
                                        if (id) onToggle(id);
                                    }
                                }}
                                onHighlight={(name) => {
                                    const id = idByName.get(name);
                                    if (id) onHighlight(id);
                                }}
                            />
                        </div>
                    </ScrollArea>
                    <div
                        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-primary/20"
                        onPointerDown={onResizePointerDown}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize board display"
                    />
                </>
            )}
        </aside>
    );
});
