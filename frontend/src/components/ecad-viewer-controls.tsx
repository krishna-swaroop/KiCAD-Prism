import {
    useCallback,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Eye,
    EyeOff,
    Layers3,
    ListFilter,
    PictureInPicture2,
    Search,
    Undo2,
    X,
} from "lucide-react";

import { MeasureModeToggle } from "@/components/pcb-measure";
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
import {
    groupPcbLayers,
    pcbVisibleSide,
    type PcbLayerGroup,
    type PcbLayerGroupId,
} from "@/lib/pcb-layer-groups";
import { useCommittedRef } from "@/hooks/use-committed-ref";
import { useEcadViewer, type EcadViewer, type PcbLayerPreset } from "@/lib/ecad-viewer";
import type { EcadPcbLayerState, EcadSchematicPageState } from "@/types/ecad-viewer";

type EcadViewerControlsProps = {
    context: "SCH" | "PCB";
    viewer: EcadViewer | null;
    onVisibleWidthChange?: (width: number) => void;
};

const DEFAULT_RAIL_WIDTH = 256;
const MIN_RAIL_WIDTH = 200;
const MAX_RAIL_WIDTH = 420;

const pcbPresets = [
    ["copper", "All copper"],
    ["outer-copper", "Outer copper"],
    ["inner-copper", "Inner copper"],
    ["drawings", "Drawings"],
    ["all", "Show all"],
    ["none", "Hide all"],
] as const;

/**
 * Inset mode of a viewer element: hovering a pin or pad opens a live view of
 * the other document. Mirrors the element's state and its change event, so
 * the I key and this toggle always agree.
 */
function useInsetMode(viewer: EcadViewer | null) {
    const { insetMode: on, insetsAvailable: available } = useEcadViewer(viewer);
    const toggle = useCallback(() => viewer?.setInsetMode(!on), [on, viewer]);
    return { on, toggle, available };
}

function InsetModeToggle({ viewer }: { viewer: EcadViewer | null }) {
    const { on, toggle, available } = useInsetMode(viewer);
    if (!available) return null;
    return (
        <Button
            variant={on ? "secondary" : "ghost"}
            size="icon"
            className={cn("size-8", on && "text-primary")}
            onClick={toggle}
            aria-pressed={on}
            aria-label="Insets"
            title="Insets · I"
        >
            <PictureInPicture2 className="size-4" />
        </Button>
    );
}

export function EcadViewerControls({
    context,
    viewer,
    onVisibleWidthChange,
}: EcadViewerControlsProps) {
    const [section, setSection] = useState<"layers" | "objects">("layers");
    const { pcbViewState } = useEcadViewer(viewer);
    const pcbState = context === "PCB" ? pcbViewState : null;

    return (
        <ViewerSideRail
            ariaLabel={context === "SCH" ? "Schematic pages" : "PCB display controls"}
            icon={context === "SCH" ? <ListFilter className="size-4" /> : <Layers3 className="size-4" />}
            title={context === "SCH" ? "Schematic pages" : "Board display"}
            actions={(
                <>
                    {context === "PCB" && <MeasureModeToggle viewer={viewer} />}
                    <InsetModeToggle viewer={viewer} />
                </>
            )}
            onVisibleWidthChange={onVisibleWidthChange}
        >
            {context === "SCH" && <ViewerPageTree viewer={viewer} />}

            {context === "PCB" && (
                <>
                    <RailSectionSwitch
                        value={section}
                        onChange={setSection}
                        options={[["layers", "Layers"], ["objects", "Objects & filters"]]}
                    />
                    {section === "layers" ? (
                        <>
                            <div className="flex items-center gap-2 border-b p-3">
                                <PcbSideSwitch
                                    layers={pcbState?.layers ?? []}
                                    onApplyPreset={(preset) => viewer?.applyPcbLayerPreset(preset)}
                                />
                                <Select
                                    value=""
                                    onValueChange={(value) => viewer?.applyPcbLayerPreset(value as PcbLayerPreset)}
                                >
                                    <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" aria-label="Layer preset">
                                        <SelectValue placeholder="Presets" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {pcbPresets.map(([value, label]) => (
                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <ScrollArea className="themed-scrollbar min-h-0 flex-1">
                                <div className="p-2">
                                    <PcbLayerList
                                        layers={pcbState?.layers ?? []}
                                        onToggleVisibility={(name, visible) => viewer?.setPcbLayerVisibility(name, visible)}
                                        onHighlight={(name) => viewer?.setPcbLayerHighlight(name)}
                                    />
                                </div>
                            </ScrollArea>
                        </>
                    ) : (
                        <ScrollArea className="min-h-0 flex-1">
                            <div className="space-y-5 p-4">
                                <ControlHeading>Object opacity</ControlHeading>
                                {([
                                    ["tracks", "Tracks"],
                                    ["vias", "Vias"],
                                    ["pads", "Pads"],
                                    ["zones", "Zones"],
                                ] as const).map(([kind, label]) => (
                                    <RailSlider
                                        key={kind}
                                        label={label}
                                        value={pcbState?.objectOpacity[kind] ?? 1}
                                        onChange={(value) => viewer?.setPcbObjectOpacity(kind, value)}
                                    />
                                ))}
                                <Separator />
                                <ControlHeading>Visibility filters</ControlHeading>
                                {([
                                    ["references", "References"],
                                    ["values", "Values"],
                                    ["footprintText", "Footprint text"],
                                    ["hiddenText", "Hidden text"],
                                    ["padNumbers", "Pad numbers"],
                                    ["padNetNames", "Net names on pads"],
                                    ["trackNetNames", "Net names on tracks & vias"],
                                ] as const).map(([kind, label]) => (
                                    <RailCheckbox
                                        key={kind}
                                        label={label}
                                        checked={pcbState?.objectVisibility[kind] ?? false}
                                        onChange={(checked) => viewer?.setPcbObjectVisibility(kind, checked)}
                                    />
                                ))}
                                <RailCheckbox
                                    label="Highlight connected track"
                                    checked={pcbState?.highlightTracks ?? true}
                                    onChange={(checked) => viewer?.setPcbTrackHighlight(checked)}
                                />
                            </div>
                        </ScrollArea>
                    )}
                </>
            )}
        </ViewerSideRail>
    );
}

/**
 * The left side menu shared by the Schematic, PCB and 3D views: collapsible to
 * a handle, reviewer-resizable, and reporting its visible width so the viewer
 * can keep content clear of it. Children render only while it is open.
 */
export function ViewerSideRail({
    ariaLabel,
    icon,
    title,
    actions,
    onVisibleWidthChange,
    children,
}: {
    ariaLabel: string;
    icon: ReactNode;
    title: string;
    actions?: ReactNode;
    onVisibleWidthChange?: (width: number) => void;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(true);
    const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_WIDTH);
    const [resizing, setResizing] = useState(false);
    const railRef = useRef<HTMLElement | null>(null);
    const handleRef = useRef<HTMLDivElement | null>(null);
    const openRef = useCommittedRef(open);

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
    }, [onVisibleWidthChange, openRef]);

    useLayoutEffect(() => {
        if (!onVisibleWidthChange) return;
        const target = open ? railRef.current : handleRef.current;
        // The rail's width is a layout fact, measured after layout and reported
        // to the host that has to leave room for it. There is no earlier event
        // carrying it: laying out at this width *is* the event.
        // react-doctor-disable-next-line react-doctor/no-prop-callback-in-effect
        onVisibleWidthChange(target?.getBoundingClientRect().width ?? 0);
    }, [onVisibleWidthChange, open, railWidth]);

    const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!open) return;
        event.preventDefault();
        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startWidth = railWidth;
        const target = event.currentTarget;
        setResizing(true);
        target.setPointerCapture(pointerId);
        const onMove = (move: PointerEvent) => {
            const next = Math.min(
                MAX_RAIL_WIDTH,
                Math.max(MIN_RAIL_WIDTH, startWidth + (move.clientX - startX)),
            );
            setRailWidth(next);
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
            ref={railRef}
            className={cn(
                "absolute inset-y-0 left-0 z-30 flex flex-col border-r bg-background/95 shadow-lg backdrop-blur-sm",
                !resizing && "transition-transform duration-200",
                open ? "translate-x-0" : "-translate-x-[calc(100%_-_2.75rem)]",
            )}
            style={{ width: railWidth }}
            aria-label={ariaLabel}
        >
            <div className="flex h-10 shrink-0 items-center border-b">
                {/* Always reserve the leading flex area so the collapse handle stays on the
                    right edge of the panel. The closed transform keeps that right strip
                    visible; putting the handle on the left would hide it off-screen. */}
                <div className="flex min-w-0 flex-1 items-center gap-2 pl-3 text-xs font-medium">
                    {open && (
                        <>
                            {icon}
                            <span className="min-w-0 flex-1 truncate">{title}</span>
                            {actions}
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

            {open && children}

            {open && (
                <div
                    className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-primary/20"
                    onPointerDown={onResizePointerDown}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize side menu"
                />
            )}
        </aside>
    );
}

export function RailSectionSwitch<T extends string>({
    value,
    onChange,
    options,
}: {
    value: T;
    onChange: (value: T) => void;
    options: readonly (readonly [T, string])[];
}) {
    return (
        <div
            className="grid border-b p-2"
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        >
            {options.map(([option, label]) => (
                <Button
                    key={option}
                    variant={value === option ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => onChange(option)}
                    aria-pressed={value === option}
                >
                    {label}
                </Button>
            ))}
        </div>
    );
}

export function RailSlider({
    label,
    value,
    onChange,
}: {
    label: string;
    /** 0..1, shown as a percentage. */
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
                <span>{label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                    {Math.round(value * 100)}%
                </span>
            </div>
            <Slider
                min={0}
                max={1}
                step={0.01}
                value={[value]}
                onValueChange={([next]) => onChange(next ?? 1)}
            />
        </div>
    );
}

export function RailCheckbox({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="flex cursor-pointer items-center justify-between gap-3 text-xs">
            <span>{label}</span>
            <Checkbox
                checked={checked}
                onCheckedChange={(next) => onChange(next === true)}
            />
        </label>
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
export function PcbLayerSwatch({ color, dimmed = false }: { color: string; dimmed?: boolean }) {
    return (
        <span
            className={cn("size-3 shrink-0 border", dimmed && "opacity-35")}
            style={{ backgroundColor: color }}
            aria-hidden="true"
        />
    );
}

/**
 * Groups a review rarely needs open; their header still shows how many layers
 * are on. Documentation stays open when the board has renamed one of its
 * layers, since a named User layer is one somebody meant to be found.
 */
function layerGroupStartsOpen(group: PcbLayerGroup): boolean {
    if (group.id === "mask" || group.id === "fabrication" || group.id === "adhesive") return false;
    if (group.id === "documentation") return group.layers.some((row) => row.layer.userName);
    return true;
}

/**
 * Top / Bottom: show one side of the board (plus its outline), the two views a
 * reviewer flips between most. Lit while the visible layers are exactly one
 * side, so it also reads back a preset applied elsewhere.
 */
export function PcbSideSwitch({
    layers,
    onApplyPreset,
}: {
    layers: readonly EcadPcbLayerState[];
    onApplyPreset: (preset: "front" | "back") => void;
}) {
    const side = pcbVisibleSide(layers);
    return (
        <div className="flex shrink-0 rounded-md border p-0.5" role="group" aria-label="Board side">
            {([["front", "top", "Top"], ["back", "bottom", "Bottom"]] as const).map(([preset, value, label]) => (
                <Button
                    key={preset}
                    variant={side === value ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    aria-pressed={side === value}
                    onClick={() => onApplyPreset(preset)}
                >
                    {label}
                </Button>
            ))}
        </div>
    );
}

/**
 * Per-layer visibility and highlight rows, grouped by what each layer is on
 * the physical board (copper, solder mask, paste, silkscreen, ...).
 *
 * Presentational on purpose: the Visualizer drives the viewer directly while
 * the comparison wraps these in its own route-focus behaviour, so ownership of
 * the layer state stays with the caller. A group's eye shows or hides every
 * layer in it through the same per-layer callback.
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
    const groups = useMemo(() => groupPcbLayers(layers), [layers]);
    // Groups the reviewer opened or closed against their default.
    const [toggled, setToggled] = useState<ReadonlySet<PcbLayerGroupId>>(() => new Set());
    const toggleOpen = (id: PcbLayerGroupId) => setToggled((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    return (
        <>
            {groups.map((group) => {
                const visibleCount = group.layers.filter((row) => row.layer.visible).length;
                const anyVisible = visibleCount > 0;
                const open = layerGroupStartsOpen(group) !== toggled.has(group.id);
                return (
                    <section key={group.id} className="mb-1" aria-label={group.label}>
                        <div className="group/heading flex items-center gap-1 px-1 py-1">
                            <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-1 rounded-sm py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                                onClick={() => toggleOpen(group.id)}
                                aria-expanded={open}
                            >
                                {open
                                    ? <ChevronDown className="size-3.5 shrink-0" />
                                    : <ChevronRight className="size-3.5 shrink-0" />}
                                <span className="truncate">{group.label}</span>
                                <span className="ml-1 font-mono text-[10px] font-normal tabular-nums tracking-normal">
                                    {visibleCount}/{group.layers.length}
                                </span>
                            </button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => {
                                    for (const row of group.layers) {
                                        if (row.layer.visible === anyVisible) {
                                            onToggleVisibility(row.layer.name, !anyVisible);
                                        }
                                    }
                                }}
                                aria-label={`${anyVisible ? "Hide" : "Show"} all ${group.label.toLowerCase()} layers`}
                            >
                                {anyVisible
                                    ? <Eye className="size-3.5 text-muted-foreground" />
                                    : <EyeOff className="size-3.5 text-muted-foreground" />}
                            </Button>
                        </div>
                        {open && group.layers.map(({ layer, label, canonical }) => (
                            <div
                                key={layer.name}
                                className={cn(
                                    "group flex items-center gap-2 border-l-2 py-1 pl-6 pr-2 text-xs hover:bg-accent",
                                    layer.highlighted ? "border-primary bg-accent" : "border-transparent",
                                )}
                            >
                                <button
                                    type="button"
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    onClick={() => onHighlight?.(layer.name)}
                                    title={canonical ? `${label} (${canonical})` : label}
                                >
                                    <PcbLayerSwatch color={layer.color} dimmed={!layer.visible} />
                                    <span className={cn("truncate", !layer.visible && "text-muted-foreground")}>
                                        {label}
                                    </span>
                                    {canonical && (
                                        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                                            {canonical}
                                        </span>
                                    )}
                                </button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                        "size-7",
                                        // A visible layer's eye is noise in a long list; it shows
                                        // on hover and focus. A hidden layer always says so.
                                        layer.visible && "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                                    )}
                                    onClick={() => onToggleVisibility(layer.name, !layer.visible)}
                                    aria-label={`${layer.visible ? "Hide" : "Show"} ${canonical ? `${label} (${canonical})` : label}`}
                                >
                                    {layer.visible
                                        ? <Eye className="size-3.5" />
                                        : <EyeOff className="size-3.5 text-muted-foreground" />}
                                </Button>
                            </div>
                        ))}
                    </section>
                );
            })}
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
type SchematicNavigatorPage = EcadSchematicPageState & {
    navigatorKey?: string;
    parentNavigatorKey?: string;
    statusLabel?: string;
};

/** The tree over a viewer's own pages: a click switches the element's page. */
function ViewerPageTree({ viewer }: { viewer: EcadViewer | null }) {
    const { schematicPages } = useEcadViewer(viewer);
    return (
        <SchematicPageTree
            pages={schematicPages}
            onNavigate={(page) => viewer?.switchPage(page.projectPath)}
            onParent={() => viewer?.navigateSchematicParent()}
        />
    );
}

export function SchematicPageTree({
    pages,
    hasChanges,
    onNavigate,
    onParent,
}: {
    pages: SchematicNavigatorPage[];
    hasChanges?: (page: EcadSchematicPageState) => boolean;
    onNavigate?: (page: SchematicNavigatorPage) => void;
    /** The parent-sheet action, when the element navigates itself; otherwise `onNavigate` gets the parent page. */
    onParent?: () => void;
}) {
    const [query, setQuery] = useState("");

    const visiblePages = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        if (!normalized) return pages;
        return pages.filter((page) =>
            [page.name, page.filename, page.page]
                .filter(Boolean)
                .some((value) => value!.toLocaleLowerCase().includes(normalized)),
        );
    }, [pages, query]);
    const activePage = pages.find((page) => page.active);
    const parentPage = activePage
        ? pages.find((page) =>
            activePage.parentNavigatorKey
                ? (page.navigatorKey ?? page.projectPath)
                    === activePage.parentNavigatorKey
                : page.projectPath === activePage.parentProjectPath
        )
        : undefined;

    return (
        <>
            <div className="shrink-0 space-y-2 border-b p-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Find page…"
                        aria-label="Find schematic page"
                        className="h-8 pl-8 pr-8 text-xs"
                    />
                    {query && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0.5 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
                            onClick={() => setQuery("")}
                            aria-label="Clear page search"
                        >
                            <X className="size-3.5" />
                        </Button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 min-w-0 flex-1 justify-start text-xs"
                        disabled={!parentPage}
                        onClick={() => {
                            if (!parentPage) return;
                            if (onParent) onParent();
                            else onNavigate?.(parentPage);
                        }}
                    >
                        <Undo2 className="mr-2 size-3.5 shrink-0" />
                        <span className="truncate">Parent sheet</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">⌥⌫</span>
                    </Button>
                    <span
                        className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
                        aria-live="polite"
                    >
                        {visiblePages.length}/{pages.length}
                    </span>
                </div>
            </div>
            <ScrollArea
                className="min-h-0 flex-1 touch-pan-y overscroll-contain [scrollbar-gutter:stable]"
                aria-label="Schematic page list"
                tabIndex={0}
            >
                <div className="p-2">
                    {visiblePages.map((page) => (
                        <button
                            key={page.navigatorKey ?? page.projectPath}
                            type="button"
                            className={cn(
                                "flex w-full items-center gap-2 rounded-sm border-l-2 px-2 py-2 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                                page.active ? "border-primary bg-accent text-accent-foreground" : "border-transparent text-muted-foreground",
                            )}
                            style={{ paddingLeft: `${0.5 + Math.min(page.depth, 6) * 0.75}rem` }}
                            onClick={() => onNavigate?.(page)}
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
                            {page.statusLabel && (
                                <span className="shrink-0 rounded-sm border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {page.statusLabel}
                                </span>
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
