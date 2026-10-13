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
import { BoardLayerSections, LAYER_PRESETS } from "./semantic-3d-board-layers";
import type {
    PrismSemanticBoardLayerState,
    PrismSemanticLayerPreset,
    PrismSemanticViewerElement,
    PrismSemanticViewState,
} from "@/types/prism-semantic-viewer";

/**
 * Each side's solder mask, paste and silkscreen, shown and hidden like the
 * copper layers. In a system scene they apply to every placed board.
 */
function TechnicalLayerList({
    viewer,
    layers,
}: {
    viewer: PrismSemanticViewerElement | null;
    layers: readonly PrismSemanticBoardLayerState[];
}) {
    const byName = useMemo(() => new Map(layers.map((layer) => [layer.name, layer])), [layers]);
    if (!layers.length) return null;
    return (
        <div className="border-t p-2" aria-label="Technical layers">
            <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Technical layers
            </p>
            <PcbLayerList
                layers={layers.map((layer) => ({ name: layer.name, color: layer.color, visible: layer.visible, highlighted: false }))}
                onToggleVisibility={(name, visible) => {
                    const layer = byName.get(name);
                    if (layer) viewer?.setBoardLayerVisible?.(layer.role, layer.side, visible);
                }}
            />
        </div>
    );
}

/**
 * The PCB 3D side menu. Same frame and parts as the Schematic/PCB menu; the
 * viewer runs with `hide-panel` and this drives it through its element API.
 * Finding things is the global design search, not this rail. A system scene
 * (the viewer reports `boards`) gets a Layers section per placed board and no
 * 2D view (D-P2-26, D-P2-27).
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
    const boards = viewState?.boards;
    const boardLayers = viewState?.mode === "layer" ? [] : viewState?.boardLayers ?? [];

    return (
        <ViewerSideRail
            ariaLabel="3D display controls"
            icon={<Box className="size-4" />}
            title={boards ? "System 3D" : "Board 3D"}
            onVisibleWidthChange={onVisibleWidthChange}
        >
            <div className="shrink-0 space-y-2 border-b p-3">
                {!boards && <div className="grid grid-cols-2 gap-1">
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
                </div>}
                <div className="grid grid-cols-2 gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={!viewState?.hasNet}
                        onClick={() => viewer?.showNetLayers?.()}
                        title={boards
                            ? "Show only the layers the selected net uses, on its board"
                            : "Show only the layers the selected net uses"}
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
                    {/* A system scene separates each board on its own (in its section). */}
                    {viewState?.mode !== "layer" && !boards && (
                        <div className="border-b p-3">
                            <RailSlider
                                label="Stackup separation"
                                value={viewState?.separation ?? 0}
                                onChange={(value) => viewer?.setSeparation?.(value)}
                            />
                        </div>
                    )}
                    {boards ? (
                        <ScrollArea className="themed-scrollbar min-h-0 flex-1">
                            <BoardLayerSections
                                viewer={viewer}
                                boards={boards}
                                selectedBoard={viewState?.selectedBoard ?? null}
                            />
                            <TechnicalLayerList viewer={viewer} layers={boardLayers} />
                        </ScrollArea>
                    ) : <>
                    <div className="border-b p-3">
                        <Select
                            onValueChange={(value) => viewer?.applyLayerPreset?.(value as PrismSemanticLayerPreset)}
                        >
                            <SelectTrigger className="w-full">
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
                        <TechnicalLayerList viewer={viewer} layers={boardLayers} />
                    </ScrollArea>
                    </>}
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
