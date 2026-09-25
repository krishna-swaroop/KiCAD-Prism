import type { ReactNode } from "react";
import { useState } from "react";
import {
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircuitBoard,
    Cpu,
    Database,
    ExternalLink,
    LibraryBig,
    LoaderCircle,
    Network,
    Route,
    Waypoints,
    X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { labelInstanceListLabel, type LabelInstanceRef } from "@/lib/label-instances";
import { netFromSelection, netLeafName, sameHighlightedNet, type HighlightedNet } from "@/lib/net-highlights";
import { selectionLabel } from "@/lib/prism-selection";
import type { EcadNetStatistics } from "@/types/ecad-viewer";
import type {
    PrismSelection,
    PrismSelectionContext,
    PrismSemanticIndex,
    SemanticComponent,
    SemanticNet,
    SemanticTerminal,
} from "@/types/prism-selection";

/** A highlighted net as the inspector lists it, with its copper summary. */
export interface HighlightedNetEntry {
    net: HighlightedNet;
    /** Null while the board is loading or when the board has no such net. */
    statistics: EcadNetStatistics | null;
}

interface SelectionInspectorProps {
    open: boolean;
    /** The inspected object; null shows the highlighted nets on their own. */
    selection: PrismSelection | null;
    semanticIndex: PrismSemanticIndex | null;
    /**
     * Effective components for the active assembly selection (VAR-11's
     * projection). When omitted the inspector shows the base index.
     */
    components?: SemanticComponent[] | null;
    onOpenChange: (open: boolean) => void;
    onClear: () => void;
    onImportComponent?: () => void;
    canImportComponent?: boolean;
    importingComponent?: boolean;
    /** Matching schematic label instances for net / global-label selections. */
    labelInstances?: LabelInstanceRef[];
    onNavigateLabelInstance?: (direction: -1 | 1) => void;
    onFocusLabelInstance?: (uuid: string) => void;
    navigatingLabelInstance?: boolean;
    embedded?: boolean;
    /** Layer name -> swatch color, so the Layer row can show the layer's color. */
    layerColors?: Record<string, string>;
    /**
     * Routing summary for the selected net (or the terminal's net), read from
     * the loaded board. Shown only in the PCB view; null while the board is
     * still loading or when the net has no copper.
     */
    netStatistics?: EcadNetStatistics | null;
    /**
     * The view currently on screen. When set, the card presents the (cross-
     * probed) selection as it belongs to this view, overriding the context the
     * selection was originally made in.
     */
    viewContext?: "SCH" | "PCB";
    /**
     * Every net in the review's highlight collection (#305), listed so the
     * panel reflects the whole set rather than only the last click.
     */
    highlightedNets?: readonly HighlightedNetEntry[];
    /** Make a listed net the inspected object. */
    onInspectHighlightedNet?: (net: HighlightedNet) => void;
    /** Drop a listed net from the collection. */
    onRemoveHighlightedNet?: (net: HighlightedNet) => void;
}

const NO_HIGHLIGHTS: readonly HighlightedNetEntry[] = [];

const atIndex = <T,>(items: T[], index: number | undefined): T | undefined =>
    index === undefined ? undefined : items[index];

function resolveComponent(
    selection: PrismSelection,
    index: PrismSemanticIndex | null,
    effectiveComponents?: SemanticComponent[] | null,
): SemanticComponent | undefined {
    if (!index || selection.kind === "net") return undefined;
    const components = effectiveComponents ?? index.components;
    if (selection.componentUid) {
        const byUid = components.find((component) => component.componentUid === selection.componentUid);
        if (byUid) return byUid;
    }
    return atIndex(components, index.indexes.componentByReference?.[selection.reference]);
}

function resolveNet(selection: PrismSelection, index: PrismSemanticIndex | null): SemanticNet | undefined {
    if (!index || selection.kind === "component") return undefined;
    if (selection.netUid) {
        const byUid = index.nets.find((net) => net.netUid === selection.netUid);
        if (byUid) return byUid;
    }
    return selection.netName ? atIndex(index.nets, index.indexes.netByName?.[selection.netName]) : undefined;
}

function resolveTerminal(selection: PrismSelection, index: PrismSemanticIndex | null): SemanticTerminal | undefined {
    if (!index || selection.kind !== "terminal") return undefined;
    if (selection.terminalUid) {
        const byUid = index.terminals.find((terminal) => terminal.terminalUid === selection.terminalUid);
        if (byUid) return byUid;
    }
    return atIndex(index.terminals, index.indexes.terminalByReferencePin?.[`${selection.reference}:${selection.pin}`]);
}

function PropertyRow({ label, value }: { label: string; value: ReactNode }) {
    if (value === undefined || value === null || value === "") return null;
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-b py-1.5 last:border-b-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
        </div>
    );
}

// A Yes/No flag as a colored icon: green tick for the "good" state, red cross
// for the other. `goodWhenYes` flips which value is the green one.
function FlagValue({ value, goodWhenYes }: { value: unknown; goodWhenYes: boolean }) {
    if (value === undefined || value === null || String(value).trim() === "") {
        return <span className="text-xs text-muted-foreground">Unknown</span>;
    }
    const text = String(value);
    const yes = text.trim().toLowerCase() === "yes";
    const good = goodWhenYes ? yes : !yes;
    return (
        <span className="inline-flex items-center justify-end gap-1.5">
            {good ? (
                <Check className="h-4 w-4 text-success" aria-hidden />
            ) : (
                <X className="h-4 w-4 text-destructive" aria-hidden />
            )}
            <span className="text-xs">{text}</span>
        </span>
    );
}

// A value that is a link: the text, followed by an external-link glyph, opening
// in a new tab. Used for datasheet and other URL fields.
function LinkValue({ href, text }: { href: string; text: string }) {
    // Wrap long URLs onto new lines instead of overflowing the card. break-all
    // lets the URL break mid-string; the glyph trails the last line inline.
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary hover:underline"
            title={href}
        >
            {text}
            <ExternalLink className="ml-1 inline-block h-3 w-3 shrink-0 align-text-bottom" aria-hidden />
        </a>
    );
}

// Fields shown separately or that are internal parser bookkeeping, not worth a
// row on the component card: the reference/value/footprint (shown elsewhere)
// and KiCad's own attributes (kicad_*/ki_*/_source). Sheetfile/Sheetname stay.
const HIDDEN_FIELD_KEYS = new Set(["Reference", "Value", "Footprint"]);

function isDisplayableField(key: string, value: string): boolean {
    if (HIDDEN_FIELD_KEYS.has(key)) return false;
    if (key.startsWith("_") || key.startsWith("kicad_") || key.startsWith("ki_")) return false;
    return value !== "";
}

const URL_PATTERN = /^(https?:\/\/|www\.)\S+$/i;

function normalizeUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!URL_PATTERN.test(trimmed)) return null;
    return trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
}

// Decide how one field's value should render: DNP/In BOM as flags, a URL as a
// link, otherwise plain text.
function renderFieldValue(key: string, value: string): ReactNode {
    if (key === "DNP") return <FlagValue value={value} goodWhenYes={false} />;
    if (key === "In BOM") return <FlagValue value={value} goodWhenYes={true} />;
    const url = normalizeUrl(value);
    if (url) return <LinkValue href={url} text={value} />;
    return value;
}

const capitalizeFirst = (value: string): string =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

// The context to present the selection in. When the reviewer switches views,
// the same (cross-probed) component should read as belonging to the active
// view, so the caller passes viewContext to override the selection's original
// sourceContext for display.
const effectiveContext = (
    selection: PrismSelection,
    viewContext?: "SCH" | "PCB",
): PrismSelectionContext | undefined => viewContext ?? selection.sourceContext;

const resolvedItemType = (
    selection: PrismSelection,
    viewContext?: "SCH" | "PCB",
): string => {
    const context = effectiveContext(selection, viewContext);
    // The anchor's own itemType is view-specific, so ignore it when presenting
    // the selection in a different view than the one it was made in.
    const anchorMatchesView = !viewContext || viewContext === selection.sourceContext;
    const raw = selection.anchor?.itemType?.trim();
    if (anchorMatchesView && raw && raw.toLocaleLowerCase() !== "unknown") return raw;
    if (selection.kind === "component") {
        if (context === "SCH") return "Schematic symbol";
        if (context === "PCB") return "PCB footprint";
        return "Component";
    }
    if (selection.kind === "terminal") {
        return context === "SCH" ? "Schematic pin" : "PCB pad";
    }
    if (context === "SCH") return "Schematic net item";
    if (context === "PCB") return "PCB copper net";
    return "Net geometry";
};

// One layer name with its swatch, for the Layer row and the routing layer list.
function LayerValue({ name, color }: { name: string; color?: string }) {
    return (
        <span className="inline-flex items-center justify-end gap-1.5">
            {color && (
                <span
                    className="size-3 shrink-0 border"
                    style={{ backgroundColor: color }}
                    aria-hidden
                />
            )}
            <span>{name}</span>
        </span>
    );
}

// Millimetres to four places, KiCad's Net Inspector precision.
const formatLength = (mm: number): string => `${mm.toFixed(4)} mm`;

function IntegrationRow({ icon: Icon, title, description }: {
    icon: typeof LibraryBig;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-2.5 border-b py-2 last:border-b-0">
            <div className="mt-0.5 border bg-muted/40 p-1.5">
                <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{title}</span>
                    <Badge variant="outline">Planned</Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}

/**
 * A card section whose body can be folded away. Cards with many fields get long
 * fast, so each section collapses independently; the header stays as a compact
 * row you can scan and click to expand. Defaults to open.
 */
function CollapsibleSection({
    title,
    icon: Icon,
    defaultOpen = true,
    children,
}: {
    title: string;
    icon?: typeof CircuitBoard;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section>
            <button
                type="button"
                className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
            >
                <ChevronDown
                    className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !open && "-rotate-90")}
                />
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span>{title}</span>
            </button>
            {open && <div className="mt-1">{children}</div>}
        </section>
    );
}

function HighlightedNetsSection({
    entries,
    inspected,
    layerColors,
    viewContext,
    onInspect,
    onRemove,
}: {
    entries: readonly HighlightedNetEntry[];
    inspected: HighlightedNet | null;
    layerColors?: Record<string, string>;
    viewContext?: "SCH" | "PCB";
    onInspect?: (net: HighlightedNet) => void;
    onRemove?: (net: HighlightedNet) => void;
}) {
    return (
        <CollapsibleSection title={`Highlighted nets (${entries.length})`} icon={Network}>
            <ul className="border bg-card/40" aria-label="Highlighted nets">
                {entries.map(({ net, statistics }) => {
                    const label = netLeafName(net.netName);
                    const current = inspected !== null && sameHighlightedNet(inspected, net);
                    // Routing numbers describe copper, so they belong to the
                    // PCB view; the schematic lists the names only.
                    const routing = viewContext === "PCB" ? statistics : null;
                    return (
                        <li
                            key={net.netName}
                            className={cn(
                                "flex items-start gap-1 border-b px-2 py-1.5 last:border-b-0",
                                current && "bg-primary/10",
                            )}
                            aria-current={current ? "true" : undefined}
                        >
                            <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                title={net.netName}
                                aria-label={`Inspect ${label}`}
                                onClick={() => onInspect?.(net)}
                                disabled={!onInspect}
                            >
                                <span className="block truncate font-mono font-medium">{label}</span>
                                {routing && (
                                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                                        <span className="tabular-nums">{formatLength(routing.routedLength)}</span>
                                        {routing.layers.map((layer) => (
                                            <LayerValue key={layer} name={layer} color={layerColors?.[layer]} />
                                        ))}
                                    </span>
                                )}
                                {viewContext === "PCB" && !routing && (
                                    <span className="mt-0.5 block text-muted-foreground">No copper on this board</span>
                                )}
                            </button>
                            {onRemove && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className="size-6 shrink-0"
                                    aria-label={`Remove ${label} from highlights`}
                                    onClick={() => onRemove(net)}
                                >
                                    <X className="size-3.5" aria-hidden />
                                </Button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </CollapsibleSection>
    );
}

const inspectorAsideClassName = (embedded: boolean): string => cn(
    "flex h-full flex-col bg-background",
    embedded ? "w-full" : "relative z-30 w-96 shrink-0 border-l shadow-lg",
);

function InspectorFooter({ onClear }: { onClear: () => void }) {
    return (
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t bg-card/70 p-2">
            <span className="text-xs text-muted-foreground">Esc clears selection</span>
            <Button size="sm" variant="outline" onClick={onClear}>Clear</Button>
        </footer>
    );
}

/** The panel with nothing inspected: only the highlight collection. */
function HighlightsOnlyInspector({ embedded, onOpenChange, footer, children }: {
    embedded: boolean;
    onOpenChange: (open: boolean) => void;
    footer: ReactNode;
    children: ReactNode;
}) {
    return (
        <aside className={inspectorAsideClassName(embedded)} aria-label="Selection inspector">
            <header className="shrink-0 border-b bg-card/70 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                    <nav aria-label="Selection breadcrumb" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <span>Selection</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-foreground">Highlighted nets</span>
                    </nav>
                    {!embedded && (
                        <Button variant="ghost" size="icon-sm" aria-label="Close selection inspector" onClick={() => onOpenChange(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </header>
            <ScrollArea className="themed-scrollbar min-h-0 flex-1">
                <div className="space-y-3 p-3 text-xs">{children}</div>
            </ScrollArea>
            {footer}
        </aside>
    );
}

function LibraryImportRow({ onImport, disabled, loading }: {
    onImport: () => void;
    disabled: boolean;
    loading: boolean;
}) {
    return (
        <div className="flex items-start gap-2.5 border-b py-2 last:border-b-0">
            <div className="mt-0.5 border bg-muted/40 p-1.5">
                <LibraryBig className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">Library Manager</span>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Stage this component's symbol, footprint, 3D model, and project metadata for review.
                </p>
                <Button className="mt-2" size="sm" variant="outline" onClick={onImport} disabled={disabled || loading}>
                    {loading && <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    {loading ? "Staging…" : "Import into Library"}
                </Button>
            </div>
        </div>
    );
}

export function SelectionInspector({
    open,
    selection,
    semanticIndex,
    components,
    onOpenChange,
    onClear,
    onImportComponent,
    canImportComponent = false,
    importingComponent = false,
    labelInstances = [],
    onNavigateLabelInstance,
    onFocusLabelInstance,
    navigatingLabelInstance = false,
    embedded = false,
    layerColors,
    netStatistics,
    viewContext,
    highlightedNets = NO_HIGHLIGHTS,
    onInspectHighlightedNet,
    onRemoveHighlightedNet,
}: SelectionInspectorProps) {
    if (!open) return null;
    const asideClassName = inspectorAsideClassName(embedded);
    const footer = <InspectorFooter onClear={onClear} />;
    const highlightedSection = highlightedNets.length > 0 && (
        <HighlightedNetsSection
            entries={highlightedNets}
            inspected={netFromSelection(selection, semanticIndex)}
            layerColors={layerColors}
            viewContext={viewContext}
            onInspect={onInspectHighlightedNet}
            onRemove={onRemoveHighlightedNet}
        />
    );
    if (!selection) {
        // Nothing inspected, but the collection still stands: list it so the
        // reviewer can see, inspect and prune what they have accumulated.
        if (!highlightedSection) return null;
        return (
            <HighlightsOnlyInspector embedded={embedded} onOpenChange={onOpenChange} footer={footer}>
                {highlightedSection}
            </HighlightsOnlyInspector>
        );
    }
    const component = resolveComponent(selection, semanticIndex, components);
    const net = resolveNet(selection, semanticIndex);
    const terminal = resolveTerminal(selection, semanticIndex);
    const SelectionIcon = selection.kind === "component" ? Cpu : selection.kind === "terminal" ? Waypoints : Network;
    const title = selectionLabel(selection);
    const activeUuid = selection.uuid || selection.anchor?.uuid;
    const labelIndex = activeUuid
        ? labelInstances.findIndex((instance) => instance.uuid === activeUuid)
        : -1;
    const showLabelNav = labelInstances.length >= 2 && Boolean(onNavigateLabelInstance);
    // Routing numbers describe copper, so they belong to the PCB view only;
    // the same net selected in the schematic shows connectivity instead.
    const routing = selection.kind !== "component" && viewContext === "PCB" ? netStatistics ?? null : null;
    const labelOrdinal = labelIndex >= 0 ? labelIndex + 1 : 1;
    const currentInstance = labelInstances[labelIndex >= 0 ? labelIndex : 0];
    const currentInstanceLabel = currentInstance
        ? labelInstanceListLabel(currentInstance, labelInstances)
        : undefined;

    return (
        <aside className={asideClassName} aria-label="Selection inspector">
            <header className="shrink-0 border-b bg-card/70 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                    <nav aria-label="Selection breadcrumb" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <span>Selection</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate capitalize text-foreground">{selection.kind}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate font-mono text-foreground">{title}</span>
                    </nav>
                    {!embedded && (
                        <Button variant="ghost" size="icon-sm" aria-label="Close selection inspector" onClick={() => onOpenChange(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                <div className="mt-2.5 flex items-center gap-2.5">
                    <div className="border bg-primary/10 p-2 text-primary">
                        <SelectionIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                        <h2 className="truncate font-mono text-base font-semibold" title={title}>{title}</h2>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="px-2 py-0 text-[11px] font-medium">
                                {capitalizeFirst(resolvedItemType(selection, viewContext))}
                            </Badge>
                        </div>
                    </div>
                </div>
            </header>

            <ScrollArea className="themed-scrollbar min-h-0 flex-1">
                <div className="space-y-3 p-3 text-xs">
                    {highlightedSection && (
                        <>
                            {highlightedSection}
                            <Separator />
                        </>
                    )}
                    {showLabelNav && (
                        <CollapsibleSection title="Instances">
                            <div className="flex items-center justify-between gap-2 border bg-card/40 px-3 py-2">
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="outline"
                                    aria-label="Previous label instance"
                                    disabled={navigatingLabelInstance}
                                    onClick={() => onNavigateLabelInstance?.(-1)}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="min-w-0 flex-1 text-center">
                                    <div className="font-medium tabular-nums">
                                        {labelOrdinal} / {labelInstances.length}
                                    </div>
                                    {currentInstanceLabel && (
                                        <div className="mt-0.5 truncate text-muted-foreground" title={currentInstanceLabel}>
                                            {currentInstanceLabel}
                                        </div>
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="outline"
                                    aria-label="Next label instance"
                                    disabled={navigatingLabelInstance}
                                    onClick={() => onNavigateLabelInstance?.(1)}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                            <ul className="themed-scrollbar mt-2 max-h-40 space-y-1 overflow-y-auto border bg-card/20 p-2">
                                {labelInstances.map((instance) => {
                                    const active = instance.uuid === activeUuid;
                                    const label = labelInstanceListLabel(instance, labelInstances);
                                    return (
                                        <li key={instance.uuid}>
                                            <button
                                                type="button"
                                                className={`w-full truncate rounded-sm px-2 py-1.5 text-left font-mono transition-colors ${
                                                    active
                                                        ? "bg-primary/10 text-foreground"
                                                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                                }`}
                                                disabled={navigatingLabelInstance || active}
                                                onClick={() => onFocusLabelInstance?.(instance.uuid)}
                                                title={`${label}:${instance.name}`}
                                            >
                                                {label}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </CollapsibleSection>
                    )}

                    <CollapsibleSection title="Identity" icon={CircuitBoard} defaultOpen={false}>
                        <dl>
                            {selection.kind !== "net" && <PropertyRow label="Reference" value={selection.reference} />}
                            {selection.kind === "terminal" && <PropertyRow label="Pin / pad" value={selection.pin} />}
                            {selection.kind === "net" && <PropertyRow label="Net" value={selection.netName} />}
                            <PropertyRow label="Item type" value={resolvedItemType(selection, viewContext)} />
                            <PropertyRow label="Component UID" value={selection.kind !== "net" ? selection.componentUid : undefined} />
                            <PropertyRow label="Terminal UID" value={selection.kind === "terminal" ? selection.terminalUid : undefined} />
                            <PropertyRow label="Net UID" value={selection.kind !== "component" ? selection.netUid : undefined} />
                            <PropertyRow label="Source UUID" value={selection.uuid || selection.anchor?.uuid} />
                            <PropertyRow label="Page" value={selection.anchor?.page} />
                            <PropertyRow
                                label="Layer"
                                value={selection.anchor?.layer && (
                                    <LayerValue
                                        name={selection.anchor.layer}
                                        color={layerColors?.[selection.anchor.layer]}
                                    />
                                )}
                            />
                        </dl>
                    </CollapsibleSection>

                    {component && (
                        <>
                            <Separator />
                            <CollapsibleSection title="Component data">
                                <dl>
                                    <PropertyRow label="Value" value={component.value} />
                                    <PropertyRow label="Footprint" value={component.footprint} />
                                    {/* DNP and BOM always show under Value and
                                        Footprint. Missing parse → Unknown, never
                                        a guessed KiCad default. */}
                                    <PropertyRow
                                        label="DNP"
                                        value={<FlagValue value={component.fields?.DNP} goodWhenYes={false} />}
                                    />
                                    <PropertyRow
                                        label="BOM"
                                        value={<FlagValue value={component.fields?.["In BOM"]} goodWhenYes={true} />}
                                    />
                                    {Object.entries(component.fields || {}).flatMap(([key, value]) => (
                                        key !== "DNP" && key !== "In BOM" && isDisplayableField(key, String(value))
                                            ? [
                                                <PropertyRow
                                                    key={key}
                                                    label={key}
                                                    value={renderFieldValue(key, String(value))}
                                                />,
                                            ]
                                            : []
                                    ))}
                                </dl>
                            </CollapsibleSection>
                        </>
                    )}

                    {selection.kind !== "net" && (
                        <>
                            <Separator />
                            <CollapsibleSection title="Library & sourcing">
                                <div className="border bg-card/40 px-3">
                                    {onImportComponent ? (
                                        <LibraryImportRow
                                            onImport={onImportComponent}
                                            disabled={!canImportComponent}
                                            loading={importingComponent}
                                        />
                                    ) : (
                                        <IntegrationRow icon={LibraryBig} title="Library Manager" description="Open the selected symbol, footprint, and project overrides." />
                                    )}
                                    <IntegrationRow icon={Database} title="Component database" description="Lifecycle, alternates, approved vendors, and organization metadata." />
                                </div>
                            </CollapsibleSection>
                        </>
                    )}

                    {routing && (
                        <>
                            <Separator />
                            <CollapsibleSection title="Routing" icon={Route}>
                                <dl data-testid="net-routing">
                                    <PropertyRow label="Routed length" value={formatLength(routing.routedLength)} />
                                    <PropertyRow
                                        label="Layers used"
                                        value={routing.layers.length > 0 ? (
                                            <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                                                {routing.layers.map((layer) => (
                                                    <LayerValue key={layer} name={layer} color={layerColors?.[layer]} />
                                                ))}
                                            </span>
                                        ) : undefined}
                                    />
                                    <PropertyRow label="Tracks" value={routing.trackCount} />
                                    <PropertyRow label="Vias" value={routing.viaCount} />
                                </dl>
                            </CollapsibleSection>
                        </>
                    )}

                    {(terminal || net) && (
                        <>
                            <Separator />
                            <CollapsibleSection title="Connectivity" defaultOpen={false}>
                                <dl>
                                    <PropertyRow label="Net" value={terminal?.netName || net?.name} />
                                    <PropertyRow label="Net class" value={net?.netClass} />
                                    <PropertyRow label="Net code" value={net?.netCode} />
                                    <PropertyRow label="Schematic pin UUID" value={terminal?.schematicPinUuid} />
                                    <PropertyRow label="PCB pad UUID" value={terminal?.pcbPadUuid} />
                                </dl>
                            </CollapsibleSection>
                        </>
                    )}

                    {!semanticIndex && (
                        <p className="border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                            Showing low-level viewer identity. Component, terminal, and connectivity metadata will fill in when the lightweight semantic index is ready.
                        </p>
                    )}
                </div>
            </ScrollArea>

            {footer}
        </aside>
    );
}
