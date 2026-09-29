import { useEffect, useMemo, useState } from "react";
import { Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    PcbLayerList,
    RailCheckbox,
    RailSectionSwitch,
    RailSlider,
    ViewerSideRail,
} from "./ecad-viewer-controls";
import type {
    PrismSemanticLayerPreset,
    PrismSemanticViewerElement,
    PrismSemanticViewState,
} from "@/types/prism-semantic-viewer";

const layerPresets: readonly (readonly [PrismSemanticLayerPreset, string])[] = [
    ["all", "Show all"],
    ["none", "Hide all"],
    ["outer", "Outer copper"],
    ["inner", "Inner copper"],
];

/**
 * The PCB 3D side menu. Same frame and parts as the Schematic/PCB menu; the
 * viewer runs with `hide-panel` and this drives it through its element API.
 * Finding things is the global design search, not this rail.
 */
export function Semantic3dControls({
    viewer,
    onVisibleWidthChange,
}: {
    viewer: PrismSemanticViewerElement | null;
    onVisibleWidthChange?: (width: number) => void;
}) {
    const [section, setSection] = useState<"layers" | "settings">("layers");
    const [viewState, setViewState] = useState<PrismSemanticViewState | null>(null);

    useEffect(() => {
        if (!viewer) return;
        setViewState(viewer.getViewState?.() ?? null);
        const onChange = (event: Event) => {
            setViewState((event as CustomEvent<PrismSemanticViewState>).detail);
        };
        viewer.addEventListener("prism-semantic-viewer:viewstatechange", onChange);
        return () => viewer.removeEventListener("prism-semantic-viewer:viewstatechange", onChange);
    }, [viewer]);

    const layers = useMemo(
        () => (viewState?.layers ?? []).map((layer) => ({ ...layer, highlighted: false })),
        [viewState],
    );
    const layerIdByName = useMemo(
        () => new Map((viewState?.layers ?? []).map((layer) => [layer.name, layer.id])),
        [viewState],
    );

    return (
        <ViewerSideRail
            ariaLabel="3D display controls"
            icon={<Box className="size-4" />}
            title="Board 3D"
            onVisibleWidthChange={onVisibleWidthChange}
        >
            <div className="shrink-0 space-y-2 border-b p-3">
                <div className="grid grid-cols-2 gap-1">
                    {([["3d", "3D"], ["layer", "2D"]] as const).map(([mode, label]) => (
                        <Button
                            key={mode}
                            variant={viewState?.mode === mode ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 text-xs"
                            aria-pressed={viewState?.mode === mode}
                            onClick={() => viewer?.setViewMode?.(mode)}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={!viewState?.hasNet}
                        onClick={() => viewer?.showNetLayers?.()}
                        title="Show only the layers the selected net uses"
                    >
                        Net layers
                    </Button>
                    <Button
                        variant={viewState?.isolateNet ? "secondary" : "outline"}
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={!viewState?.hasNet}
                        aria-pressed={Boolean(viewState?.isolateNet)}
                        onClick={() => viewer?.setNetIsolation?.(!viewState?.isolateNet)}
                        title="Isolate the selected net (I)"
                    >
                        Isolate
                    </Button>
                </div>
            </div>

            <RailSectionSwitch
                value={section}
                onChange={setSection}
                options={[["layers", "Layers"], ["settings", "Settings"]]}
            />

            {section === "layers" ? (
                <>
                    {viewState?.mode !== "layer" && (
                        <div className="border-b p-3">
                            <RailSlider
                                label="Stackup separation"
                                value={viewState?.separation ?? 0}
                                onChange={(value) => viewer?.setSeparation?.(value)}
                            />
                        </div>
                    )}
                    <div className="border-b p-3">
                        <Select
                            onValueChange={(value) => viewer?.applyLayerPreset?.(value as PrismSemanticLayerPreset)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Layer preset" />
                            </SelectTrigger>
                            <SelectContent>
                                {layerPresets.map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <ScrollArea className="themed-scrollbar min-h-0 flex-1">
                        <div className="p-2">
                            <PcbLayerList
                                layers={layers}
                                onToggleVisibility={(name, visible) => {
                                    const id = layerIdByName.get(name);
                                    if (id !== undefined) viewer?.setLayerVisible?.(id, visible);
                                }}
                            />
                            {!layers.length && (
                                <p className="px-2 py-8 text-center text-xs text-muted-foreground">Layers are loading…</p>
                            )}
                        </div>
                    </ScrollArea>
                </>
            ) : (
                <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-5 p-4">
                        <RailCheckbox
                            label="Board substrate"
                            checked={viewState?.showBoard ?? true}
                            onChange={(checked) => viewer?.setShowBoard?.(checked)}
                        />
                        <RailCheckbox
                            label="Components"
                            checked={viewState?.showComponents ?? true}
                            onChange={(checked) => viewer?.setShowComponents?.(checked)}
                        />
                        <RailCheckbox
                            label="Model placeholders"
                            checked={viewState?.showPlaceholders ?? true}
                            onChange={(checked) => viewer?.setShowPlaceholders?.(checked)}
                        />
                        <RailCheckbox
                            label="Realistic colours"
                            checked={viewState?.realisticColors ?? true}
                            onChange={(checked) => viewer?.setRealisticColors?.(checked)}
                        />
                    </div>
                </ScrollArea>
            )}
        </ViewerSideRail>
    );
}
