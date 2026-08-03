import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Maximize2,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChangeStatusDot, CHANGE_KIND_LABEL } from "./change-status";
import type { ComparisonPresentationMode } from "./comparison-url";
import {
    paneLayout,
    useBoardViewport,
    type BoardRect,
    type Camera,
} from "./fabrication-viewport";
import type {
    FabricationDiff,
    FabricationLayerDiff,
    FabricationRegion,
} from "./types";

type OldNewSide = "base" | "compare";

const STATUS_LABEL: Record<FabricationLayerDiff["status"], string> = {
    changed: "",
    added: "added",
    removed: "removed",
    unchanged: "",
    unreadable: "unreadable",
};

const STATUS_TONE: Record<FabricationLayerDiff["status"], string> = {
    changed: "text-warning",
    added: "text-success",
    removed: "text-destructive",
    unchanged: "text-muted-foreground",
    unreadable: "text-destructive",
};

const REGION_TONE: Record<FabricationRegion["kind"], string> = {
    added: "stroke-success",
    removed: "stroke-destructive",
    changed: "stroke-warning",
};

function regionRect(region: FabricationRegion): BoardRect {
    return { x: region.x, y: region.y, width: region.width, height: region.height };
}

/** A payload rectangle as the viewport's origin-plus-size form. */
function useRect(
    bounds: [number, number, number, number] | null | undefined,
): BoardRect | null {
    return useMemo(
        () => bounds
            ? {
                x: bounds[0],
                y: bounds[1],
                width: bounds[2] - bounds[0],
                height: bounds[3] - bounds[1],
            }
            : null,
        [bounds],
    );
}

const MarkerLayer = memo(function MarkerLayer({
    board,
    regions,
    selected,
    pxPerMm,
    onSelect,
    label,
}: {
    board: BoardRect;
    regions: FabricationRegion[];
    selected: number | null;
    pxPerMm: number;
    onSelect: (region: FabricationRegion) => void;
    label: string;
}) {
    // Marker chrome is specified in screen pixels and converted to board units,
    // so it holds its size at every zoom instead of growing with the board.
    const stroke = 1.25 / pxPerMm;
    const font = 11 / pxPerMm;
    // Dashed, so a marker cannot be read as a plotted rectangle. Board artwork
    // is solid without exception, which makes the dash the one cue that never
    // collides with the geometry underneath it.
    const dash = `${4 / pxPerMm} ${3 / pxPerMm}`;
    return (
        <svg
            viewBox={`${board.x} ${board.y} ${board.width} ${board.height}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-label={`Difference markers, ${label}`}
            role="img"
        >
            {regions.map((region) => {
                const active = selected === region.index;
                const pad = Math.max(font * 0.35, stroke * 2);
                const x = region.x - pad;
                const y = region.y - pad;
                const width = region.width + pad * 2;
                const height = region.height + pad * 2;
                return (
                    <g key={region.index}>
                        {active && (
                            <rect
                                x={x}
                                y={y}
                                width={width}
                                height={height}
                                className="pointer-events-none fill-primary/20"
                            />
                        )}
                        {/*
                          * `fill="none"`, not a transparent fill: a painted
                          * transparent fill is still a hit target, so a large
                          * marker swallowed every drag that began inside it and
                          * the pane could not be panned at all.
                          */}
                        <rect
                            x={x}
                            y={y}
                            width={width}
                            height={height}
                            fill="none"
                            strokeDasharray={dash}
                            strokeWidth={active ? stroke * 2 : stroke}
                            className={cn(
                                "pointer-events-auto cursor-pointer",
                                active ? "stroke-primary" : REGION_TONE[region.kind],
                            )}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => onSelect(region)}
                        />
                        <text
                            x={x + width / 2}
                            y={y - font * 0.3}
                            textAnchor="middle"
                            fontSize={font}
                            className={cn(
                                "pointer-events-auto cursor-pointer select-none",
                                active ? "fill-primary" : "fill-foreground",
                            )}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => onSelect(region)}
                        >
                            {region.index}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
});

function Pane({
    label,
    drawn,
    board,
    camera,
    handlers,
    children,
}: {
    label: string;
    drawn: BoardRect | null;
    board: BoardRect | null;
    camera: Camera;
    handlers: ReturnType<typeof useBoardViewport>["handlers"];
    children: (pxPerMm: number) => ReactNode;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry) {
                setSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // Before the first measurement the board is drawn filling the pane, which
    // is what fit looks like anyway. Waiting for the observer would blank the
    // artwork on every mount and leave nothing to render at all where no
    // observer exists.
    const layout = drawn && board && size.width && size.height
        ? paneLayout(drawn, board, camera, size)
        : null;
    const pxPerMm = layout?.scale
        ?? (board ? (size.width || 600) / board.width : 1);

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
            <span className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
            </span>
            <div
                ref={ref}
                className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden rounded border bg-[#0b0f14] active:cursor-grabbing"
                {...handlers}
            >
                <div
                    className={cn("absolute", !layout && "inset-0")}
                    style={layout
                        ? {
                            width: layout.width,
                            height: layout.height,
                            left: layout.left,
                            top: layout.top,
                        }
                        : undefined}
                >
                    {children(pxPerMm)}
                </div>
            </div>
        </div>
    );
}

function LayerImage({ url, alt }: { url: string | null; alt: string }) {
    if (!url) {
        return (
            <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Not plotted in this revision
            </p>
        );
    }
    return (
        <img
            src={url}
            alt={alt}
            draggable={false}
            className="h-full w-full select-none object-contain"
        />
    );
}

export function FabricationPanel({
    fabrication,
    sidecarUrls,
    presentationMode,
    presentationSwitcher,
}: {
    fabrication: FabricationDiff | undefined;
    sidecarUrls?: Record<string, string>;
    presentationMode: ComparisonPresentationMode;
    presentationSwitcher?: ReactNode;
}) {
    const [activeLayer, setActiveLayer] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [selectedRegion, setSelectedRegion] = useState<number | null>(null);
    const [showUnchanged, setShowUnchanged] = useState(false);
    const [oldNewSide, setOldNewSide] = useState<OldNewSide>("compare");

    const layers = useMemo(() => fabrication?.layers ?? [], [fabrication?.layers]);
    const changed = useMemo(
        () => layers.filter((layer) => layer.status !== "unchanged"),
        [layers],
    );
    const listed = showUnchanged ? layers : changed;
    const current = layers.find((layer) => layer.name === activeLayer)
        ?? changed[0]
        ?? layers[0]
        ?? null;

    const drawn = useRect(fabrication?.bounds);
    // Fitting to the drawn extent leaves the board adrift: fabrication and
    // courtyard layers annotate well outside the profile.
    const board = useRect(fabrication?.board) ?? drawn;

    const { frame, reset, zoomBy, view, handlers } = useBoardViewport(board);
    const regions = useMemo(() => current?.regions ?? [], [current?.regions]);

    const select = useCallback((region: FabricationRegion) => {
        setSelectedRegion(region.index);
        frame(regionRect(region));
    }, [frame]);

    const step = (direction: -1 | 1) => {
        if (!regions.length) return;
        const at = regions.findIndex((region) => region.index === selectedRegion);
        const next = at < 0
            ? (direction > 0 ? 0 : regions.length - 1)
            : (at + direction + regions.length) % regions.length;
        select(regions[next]!);
    };

    const layerName = current?.name;
    useEffect(() => {
        setSelectedRegion(null);
        reset();
    }, [layerName, reset]);

    const resolve = (name: string | undefined) => (name && sidecarUrls?.[name]) || null;
    const baseUrl = resolve(current?.render?.base);
    const compareUrl = resolve(current?.render?.compare);
    const warnings = fabrication?.warnings ?? [];
    const summary = fabrication?.summary;

    if (!fabrication?.present) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
                <p className="text-sm font-medium">No fabrication output</p>
                {warnings.length > 0 && (
                    <p className="max-w-md text-xs text-muted-foreground">
                        {warnings.join(" · ")}
                    </p>
                )}
            </div>
        );
    }

    const markers = (label: string, pxPerMm: number) => drawn && (
        <MarkerLayer
            board={drawn}
            regions={regions}
            selected={selectedRegion}
            pxPerMm={pxPerMm}
            onSelect={select}
            label={label}
        />
    );

    const selected = regions.find((region) => region.index === selectedRegion) ?? null;

    return (
        <div className="flex min-h-0 min-w-0 flex-1">
            <aside className="flex w-72 shrink-0 flex-col border-r">
                <div className="space-y-2 border-b p-2">
                    <p className="text-[11px] text-muted-foreground">
                        {summary
                            ? `${summary.changedLayers}/${summary.layers} layers · `
                              + `${summary.regions} difference${summary.regions === 1 ? "" : "s"}`
                            : "Comparing…"}
                    </p>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                        <input
                            type="checkbox"
                            checked={showUnchanged}
                            onChange={(event) => setShowUnchanged(event.target.checked)}
                            className="accent-primary"
                        />
                        Show unchanged layers
                    </label>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-1">
                    {!listed.length ? (
                        <p className="px-3 py-10 text-center text-xs text-muted-foreground">
                            No differences
                        </p>
                    ) : listed.map((layer) => {
                        const active = current?.name === layer.name;
                        const open = expanded.has(layer.name) && layer.regions.length > 0;
                        return (
                            <div key={layer.name}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveLayer(layer.name);
                                        setExpanded((previous) => {
                                            const next = new Set(previous);
                                            if (next.has(layer.name)) next.delete(layer.name);
                                            else next.add(layer.name);
                                            return next;
                                        });
                                    }}
                                    aria-expanded={layer.regions.length ? open : undefined}
                                    aria-current={active ? "true" : undefined}
                                    className={cn(
                                        "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
                                        active && "bg-accent",
                                    )}
                                >
                                    {layer.regions.length ? (
                                        open
                                            ? <ChevronDown className="h-3 w-3 shrink-0" />
                                            : <ChevronRight className="h-3 w-3 shrink-0" />
                                    ) : <span className="w-3 shrink-0" />}
                                    <span className="min-w-0 flex-1 truncate font-medium">
                                        {layer.name}
                                    </span>
                                    <span
                                        className={cn(
                                            "shrink-0 text-[10px]",
                                            STATUS_TONE[layer.status],
                                        )}
                                    >
                                        {STATUS_LABEL[layer.status]
                                            || layer.regions.length
                                            || ""}
                                    </span>
                                </button>
                                {open && (
                                    <div className="ml-4 border-l py-0.5 pl-1">
                                        {layer.regions.map((region) => (
                                            <button
                                                key={region.index}
                                                type="button"
                                                onClick={() => {
                                                    setActiveLayer(layer.name);
                                                    select(region);
                                                }}
                                                className={cn(
                                                    "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground",
                                                    active && selectedRegion === region.index
                                                        && "bg-primary/10 text-primary",
                                                )}
                                                aria-current={
                                                    active && selectedRegion === region.index
                                                        ? "true"
                                                        : undefined
                                                }
                                            >
                                                <ChangeStatusDot kind={region.kind} />
                                                <span className="w-4 shrink-0 tabular-nums">
                                                    {region.index}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate">
                                                    {region.x.toFixed(2)}, {region.y.toFixed(2)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                            {current?.name ?? "Fabrication"}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                            {current?.function}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <div className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => step(-1)}
                                disabled={!regions.length}
                                aria-label="Previous difference"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="min-w-10 text-center text-[10px] tabular-nums text-muted-foreground">
                                {selected
                                    ? `${selected.index}/${regions.length}`
                                    : regions.length}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => step(1)}
                                disabled={!regions.length}
                                aria-label="Next difference"
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <div className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => zoomBy(1 / 1.4)}
                                aria-label="Zoom out"
                            >
                                <ZoomOut className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => zoomBy(1.4)}
                                aria-label="Zoom in"
                            >
                                <ZoomIn className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={reset}
                                aria-label="Fit board"
                            >
                                <Maximize2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        {presentationMode === "old-new" && (
                            <div
                                className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5"
                                role="group"
                                aria-label="Revision side"
                            >
                                <Button
                                    variant={oldNewSide === "base" ? "secondary" : "ghost"}
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setOldNewSide("base")}
                                    aria-pressed={oldNewSide === "base"}
                                >
                                    Old
                                </Button>
                                <Button
                                    variant={oldNewSide === "compare" ? "secondary" : "ghost"}
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setOldNewSide("compare")}
                                    aria-pressed={oldNewSide === "compare"}
                                >
                                    New
                                </Button>
                            </div>
                        )}
                        {presentationSwitcher}
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 gap-2 p-3">
                    {presentationMode === "side-by-side" ? (
                        <>
                            <Pane label="Old" drawn={drawn} board={board} camera={view} handlers={handlers}>
                                {(pxPerMm) => (
                                    <>
                                        <LayerImage url={baseUrl} alt="Old revision" />
                                        {markers("old", pxPerMm)}
                                    </>
                                )}
                            </Pane>
                            <Pane label="New" drawn={drawn} board={board} camera={view} handlers={handlers}>
                                {(pxPerMm) => (
                                    <>
                                        <LayerImage url={compareUrl} alt="New revision" />
                                        {markers("new", pxPerMm)}
                                    </>
                                )}
                            </Pane>
                        </>
                    ) : presentationMode === "old-new" ? (
                        <Pane
                            label={oldNewSide === "base" ? "Old" : "New"}
                            drawn={drawn} board={board}
                            camera={view}
                            handlers={handlers}
                        >
                            {(pxPerMm) => (
                                <>
                                    <LayerImage
                                        url={oldNewSide === "base" ? baseUrl : compareUrl}
                                        alt={oldNewSide === "base" ? "Old revision" : "New revision"}
                                    />
                                    {markers(oldNewSide === "base" ? "old" : "new", pxPerMm)}
                                </>
                            )}
                        </Pane>
                    ) : (
                        <Pane label="Composite" drawn={drawn} board={board} camera={view} handlers={handlers}>
                            {(pxPerMm) => (
                                <>
                                    <LayerImage url={baseUrl} alt="Old revision" />
                                    {compareUrl && (
                                        <img
                                            src={compareUrl}
                                            alt="New revision"
                                            draggable={false}
                                            className="absolute inset-0 h-full w-full select-none object-contain"
                                            style={{ mixBlendMode: "screen" }}
                                        />
                                    )}
                                    {markers("composite", pxPerMm)}
                                </>
                            )}
                        </Pane>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate">
                        {selected
                            ? `#${selected.index} · ${CHANGE_KIND_LABEL[selected.kind]} · `
                              + `${selected.width.toFixed(3)} × ${selected.height.toFixed(3)} mm `
                              + `at ${selected.x.toFixed(3)}, ${selected.y.toFixed(3)}`
                            : current?.warnings?.join(" · ")}
                    </span>
                    <span className="shrink-0 tabular-nums">
                        {Math.round(view.scale * 100)}%
                    </span>
                </div>
                {warnings.length > 0 && (
                    <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                        {warnings.join(" · ")}
                    </div>
                )}
            </div>
        </div>
    );
}
