import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    ChevronLeft,
    ChevronRight,
    Eye,
    EyeOff,
    Layers3,
    ListFilter,
    Search,
    Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type {
    ECadViewerElement,
    EcadPcbLayerState,
    EcadPcbViewState,
    EcadSchematicPageState,
} from "@/types/ecad-viewer";

type EcadViewerControlsProps = {
    context: "SCH" | "PCB";
    viewer: ECadViewerElement | null;
    onVisibleWidthChange?: (width: number) => void;
};

const pcbPresets = [
    ["front", "Front"],
    ["back", "Back"],
    ["copper", "All copper"],
    ["outer-copper", "Outer copper"],
    ["inner-copper", "Inner copper"],
    ["drawings", "Drawings"],
    ["all", "Show all"],
    ["none", "Hide all"],
] as const;

export function EcadViewerControls({
    context,
    viewer,
    onVisibleWidthChange,
}: EcadViewerControlsProps) {
    const [open, setOpen] = useState(true);
    const railRef = useRef<HTMLElement | null>(null);
    const handleRef = useRef<HTMLDivElement | null>(null);
    const openRef = useRef(open);
    openRef.current = open;
    const [section, setSection] = useState<"layers" | "objects">("layers");
    const [pcbState, setPcbState] = useState<EcadPcbViewState | null>(null);

    // Schematic page state belongs to SchematicPageTree, which owns its own
    // refresh so it can be mounted anywhere a viewer exists.
    const refresh = useCallback(() => {
        if (!viewer || context === "SCH") return;
        setPcbState(viewer.getPcbViewState?.() ?? null);
    }, [context, viewer]);

    useEffect(() => {
        refresh();
        viewer?.addEventListener("ecad-viewer:view-state-change", refresh);

        // Board paint can finish after the first view-state-change (which still
        // reports null layers). Re-poll briefly until layers appear.
        let cancelled = false;
        let attempts = 0;
        let timer: number | undefined;
        if (context === "PCB" && viewer) {
            const poll = () => {
                if (cancelled || attempts++ > 40) return;
                const state = viewer.getPcbViewState?.() ?? null;
                if (state?.layers?.length) {
                    setPcbState(state);
                    return;
                }
                timer = window.setTimeout(poll, 150);
            };
            timer = window.setTimeout(poll, 150);
        }

        return () => {
            cancelled = true;
            if (timer !== undefined) window.clearTimeout(timer);
            viewer?.removeEventListener("ecad-viewer:view-state-change", refresh);
        };
    }, [context, refresh, viewer]);

    const mutatePcb = useCallback((action: () => void) => {
        action();
        setPcbState(viewer?.getPcbViewState?.() ?? null);
    }, [viewer]);

    useLayoutEffect(() => {
        if (!onVisibleWidthChange) return;
        const report = () => {
            const target = openRef.current ? railRef.current : handleRef.current;
            onVisibleWidthChange(target?.getBoundingClientRect().width ?? 0);
        };
        report();
        const observer = typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(report);
        if (railRef.current) observer?.observe(railRef.current);
        if (handleRef.current) observer?.observe(handleRef.current);
        return () => {
            observer?.disconnect();
            onVisibleWidthChange(0);
        };
    }, [onVisibleWidthChange]);

    useLayoutEffect(() => {
        if (!onVisibleWidthChange) return;
        const target = open ? railRef.current : handleRef.current;
        onVisibleWidthChange(target?.getBoundingClientRect().width ?? 0);
    }, [onVisibleWidthChange, open]);

    return (
        <aside
            ref={railRef}
            className={cn(
                "absolute inset-y-0 left-0 z-30 flex w-80 flex-col border-r bg-background/95 shadow-lg backdrop-blur-sm transition-transform duration-200",
                open ? "translate-x-0" : "-translate-x-[calc(100%_-_2.75rem)]",
            )}
            aria-label={context === "SCH" ? "Schematic pages" : "PCB display controls"}
        >
            <div className="flex h-10 shrink-0 items-center border-b">
                {/* Always reserve the leading flex area so the collapse handle stays on the
                    right edge of the panel. The closed transform keeps that right strip
                    visible; putting the handle on the left would hide it off-screen. */}
                <div className="flex min-w-0 flex-1 items-center gap-2 pl-3 text-xs font-medium">
                    {open && (
                        <>
                            {context === "SCH" ? <ListFilter className="size-4" /> : <Layers3 className="size-4" />}
                            <span>{context === "SCH" ? "Schematic pages" : "Board display"}</span>
                        </>
                    )}
                </div>
                <div ref={handleRef} className="flex w-11 shrink-0 justify-center">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setOpen((value) => !value)}
                        aria-label={open ? "Collapse viewer controls" : "Expand viewer controls"}
                    >
                        {open ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                    </Button>
                </div>
            </div>

            {open && context === "SCH" && <SchematicPageTree viewer={viewer} />}

            {open && context === "PCB" && (
                <>
                    <div className="grid grid-cols-2 border-b p-2">
                        <Button
                            variant={section === "layers" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setSection("layers")}
                        >
                            Layers
                        </Button>
                        <Button
                            variant={section === "objects" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setSection("objects")}
                        >
                            Objects & filters
                        </Button>
                    </div>
                    {section === "layers" ? (
                        <>
                            <div className="border-b p-3">
                                <Select
                                    onValueChange={(value) => mutatePcb(() => viewer?.applyPcbLayerPreset?.(value as Parameters<NonNullable<ECadViewerElement["applyPcbLayerPreset"]>>[0]))}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Layer preset" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {pcbPresets.map(([value, label]) => (
                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <ScrollArea className="min-h-0 flex-1">
                                <div className="p-2">
                                    <PcbLayerList
                                        layers={pcbState?.layers ?? []}
                                        onToggleVisibility={(name, visible) => mutatePcb(
                                            () => viewer?.setPcbLayerVisibility?.(name, visible),
                                        )}
                                        onHighlight={(name) => mutatePcb(
                                            () => viewer?.setPcbLayerHighlight?.(name),
                                        )}
                                    />
                                </div>
                            </ScrollArea>
                        </>
                    ) : (
                        <ScrollArea className="min-h-0 flex-1">
                            <div className="space-y-5 p-4">
                                <ControlHeading>Object opacity</ControlHeading>
                                {(["tracks", "vias", "pads", "zones"] as const).map((kind) => (
                                    <div key={kind} className="space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="capitalize">{kind}</span>
                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                {Math.round((pcbState?.objectOpacity[kind] ?? 1) * 100)}%
                                            </span>
                                        </div>
                                        <Slider
                                            min={0}
                                            max={1}
                                            step={0.01}
                                            value={[pcbState?.objectOpacity[kind] ?? 1]}
                                            onValueChange={([value]) => mutatePcb(() => viewer?.setPcbObjectOpacity?.(kind, value ?? 1))}
                                        />
                                    </div>
                                ))}
                                <Separator />
                                <ControlHeading>Visibility filters</ControlHeading>
                                {([
                                    ["references", "References"],
                                    ["values", "Values"],
                                    ["footprintText", "Footprint text"],
                                    ["hiddenText", "Hidden text"],
                                ] as const).map(([kind, label]) => (
                                    <label key={kind} className="flex cursor-pointer items-center justify-between gap-3 text-xs">
                                        <span>{label}</span>
                                        <Checkbox
                                            checked={pcbState?.objectVisibility[kind] ?? false}
                                            onCheckedChange={(checked) => mutatePcb(() => viewer?.setPcbObjectVisibility?.(kind, checked === true))}
                                        />
                                    </label>
                                ))}
                                <label className="flex cursor-pointer items-center justify-between gap-3 text-xs">
                                    <span>Highlight connected track</span>
                                    <Checkbox
                                        checked={pcbState?.highlightTracks ?? true}
                                        onCheckedChange={(checked) => mutatePcb(() => viewer?.setPcbTrackHighlight?.(checked === true))}
                                    />
                                </label>
                            </div>
                        </ScrollArea>
                    )}
                </>
            )}
        </aside>
    );
}

function ControlHeading({ children }: { children: ReactNode }) {
    return <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>;
}

/**
 * The board's layer colour, drawn the same way everywhere it appears.
 *
 * A layer is identified by its colour as much as by its name, so the Visualizer
 * rail, the comparison layer panel, and the comparison property sheet all draw
 * this one mark rather than three near-identical squares.
 */
export function PcbLayerSwatch({ color }: { color: string }) {
    return (
        <span
            className="size-3 shrink-0 border"
            style={{ backgroundColor: color }}
            aria-hidden="true"
        />
    );
}

/**
 * Per-layer visibility and highlight rows.
 *
 * Presentational on purpose: the Visualizer drives the viewer directly while
 * the comparison wraps these in its own route-focus behaviour, so ownership of
 * the layer state stays with the caller.
 */
export function PcbLayerList({
    layers,
    onToggleVisibility,
    onHighlight,
}: {
    layers: readonly EcadPcbLayerState[];
    onToggleVisibility: (name: string, visible: boolean) => void;
    onHighlight?: (name: string) => void;
}) {
    return (
        <>
            {layers.map((layer) => (
                <div
                    key={layer.name}
                    className={cn(
                        "group flex items-center gap-2 border-l-2 px-2 py-1.5 text-xs hover:bg-accent",
                        layer.highlighted ? "border-primary bg-accent" : "border-transparent",
                    )}
                >
                    <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => onHighlight?.(layer.name)}
                    >
                        <PcbLayerSwatch color={layer.color} />
                        <span className={cn("truncate", !layer.visible && "text-muted-foreground")}>
                            {layer.name}
                        </span>
                    </button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => onToggleVisibility(layer.name, !layer.visible)}
                        aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                    >
                        {layer.visible
                            ? <Eye className="size-3.5" />
                            : <EyeOff className="size-3.5 text-muted-foreground" />}
                    </Button>
                </div>
            ))}
        </>
    );
}

/**
 * The project's sheet hierarchy, with a filter and a parent-sheet action.
 *
 * Owns its own page state so any surface that holds a viewer can mount it — the
 * Visualizer keeps it in a rail, the comparison mounts it in a popover behind
 * the canvas sheet trigger. `hasChanges` lets the comparison mark sheets that
 * carry differences; the Visualizer leaves it unset and gets the plain tree.
 */
export function SchematicPageTree({
    viewer,
    hasChanges,
    onNavigate,
}: {
    viewer: ECadViewerElement | null;
    hasChanges?: (page: EcadSchematicPageState) => boolean;
    onNavigate?: (page: EcadSchematicPageState | null) => void;
}) {
    const [pages, setPages] = useState<EcadSchematicPageState[]>([]);
    const [query, setQuery] = useState("");

    const refresh = useCallback(() => {
        setPages(viewer?.getSchematicPages?.() ?? []);
    }, [viewer]);

    useEffect(() => {
        refresh();
        viewer?.addEventListener("ecad-viewer:view-state-change", refresh);
        return () => {
            viewer?.removeEventListener("ecad-viewer:view-state-change", refresh);
        };
    }, [refresh, viewer]);

    const visiblePages = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        if (!normalized) return pages;
        return pages.filter((page) =>
            [page.name, page.filename, page.page]
                .filter(Boolean)
                .some((value) => value!.toLocaleLowerCase().includes(normalized)),
        );
    }, [pages, query]);

    return (
        <>
            <div className="space-y-2 border-b p-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Find page…"
                        className="h-8 pl-8 text-xs"
                    />
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-full justify-start text-xs"
                    onClick={() => {
                        viewer?.navigateSchematicParent?.();
                        refresh();
                        onNavigate?.(null);
                    }}
                >
                    <Undo2 className="mr-2 size-3.5" />
                    Parent sheet
                    <span className="ml-auto text-[10px] text-muted-foreground">⌥⌫</span>
                </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
                <div className="p-2">
                    {visiblePages.map((page) => (
                        <button
                            key={page.projectPath}
                            type="button"
                            className={cn(
                                "flex w-full items-center gap-2 border-l-2 px-2 py-2 text-left text-xs transition-colors hover:bg-accent",
                                page.active ? "border-primary bg-accent text-accent-foreground" : "border-transparent text-muted-foreground",
                            )}
                            style={{ paddingLeft: `${0.5 + Math.min(page.depth, 6) * 0.75}rem` }}
                            onClick={() => {
                                viewer?.switchPage(page.projectPath);
                                refresh();
                                onNavigate?.(page);
                            }}
                            aria-current={page.active ? "page" : undefined}
                        >
                            <span className="min-w-6 shrink-0 font-mono text-[10px] text-muted-foreground">
                                {page.page || "—"}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-foreground">
                                {page.name || page.filename}
                            </span>
                            {hasChanges?.(page) && (
                                <span
                                    className="size-1.5 shrink-0 rounded-full bg-primary"
                                    role="img"
                                    aria-label="Has changes"
                                />
                            )}
                        </button>
                    ))}
                    {!visiblePages.length && (
                        <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                            {pages.length ? "No matching pages" : "Pages are loading…"}
                        </p>
                    )}
                </div>
            </ScrollArea>
        </>
    );
}
