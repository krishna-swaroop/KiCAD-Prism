import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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
    Waypoints,
    X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/api";
import { selectionLabel } from "@/lib/prism-selection";
import type {
    PrismSelection,
    PrismSelectionContext,
    PrismSemanticIndex,
    SemanticComponent,
    SemanticNet,
    SemanticTerminal,
} from "@/types/prism-selection";

export interface LabelInstanceRef {
    uuid: string;
    sheet: string;
    name: string;
    kind?: "global" | "net" | "hierarchical";
}

interface SelectionInspectorProps {
    open: boolean;
    selection: PrismSelection | null;
    semanticIndex: PrismSemanticIndex | null;
    onOpenChange: (open: boolean) => void;
    onClear: () => void;
    onImportComponent?: () => void;
    canImportComponent?: boolean;
    importingComponent?: boolean;
    /** Matching label instances for SCH label / global-label selections. */
    labelInstances?: LabelInstanceRef[];
    onNavigateLabelInstance?: (direction: -1 | 1) => void;
    onFocusLabelInstance?: (uuid: string) => void;
    navigatingLabelInstance?: boolean;
    embedded?: boolean;
    /** Layer name -> swatch color, so the Layer row can show the layer's color. */
    layerColors?: Record<string, string>;
    /**
     * The view currently on screen. When set, the card presents the (cross-
     * probed) selection as it belongs to this view, overriding the context the
     * selection was originally made in.
     */
    viewContext?: "SCH" | "PCB";
}

const atIndex = <T,>(items: T[], index: number | undefined): T | undefined =>
    index === undefined ? undefined : items[index];

function resolveComponent(selection: PrismSelection, index: PrismSemanticIndex | null): SemanticComponent | undefined {
    if (!index || selection.kind === "net") return undefined;
    if (selection.componentUid) {
        const byUid = index.components.find((component) => component.componentUid === selection.componentUid);
        if (byUid) return byUid;
    }
    return atIndex(index.components, index.indexes.componentByReference?.[selection.reference]);
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
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 border-b py-2.5 last:border-b-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
        </div>
    );
}

// A Yes/No flag as a colored icon: green tick for the "good" state, red cross
// for the other. `goodWhenYes` flips which value is the green one.
function FlagValue({ value, goodWhenYes }: { value: string; goodWhenYes: boolean }) {
    const yes = value.trim().toLowerCase() === "yes";
    const good = goodWhenYes ? yes : !yes;
    return (
        <span className="inline-flex items-center justify-end gap-1.5">
            {good ? (
                <Check className="h-4 w-4 text-success" aria-hidden />
            ) : (
                <X className="h-4 w-4 text-destructive" aria-hidden />
            )}
            <span className="text-xs">{value}</span>
        </span>
    );
}

// A value that is a link: the text, followed by an external-link glyph, opening
// in a new tab. Used for datasheet/other URLs and the formed LCSC part link.
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
// row on the component card: the reference/value/footprint (shown elsewhere),
// KiCad's own attributes (kicad_*/ki_*/_source), and the sheet-location fields.
const HIDDEN_FIELD_KEYS = new Set(["Reference", "Value", "Footprint", "Sheetfile", "Sheetname"]);

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

// The LCSC catalog URL for a part code like "C125977".
function lcscUrl(part: string): string | null {
    const code = part.trim().match(/^C\d+$/i)?.[0];
    return code ? `https://www.lcsc.com/product-detail/${code.toUpperCase()}.html` : null;
}

// Decide how one field's value should render: DNP/In BOM as flags, an LCSC part
// as a formed link, a URL as a link, otherwise plain text.
function renderFieldValue(key: string, value: string): ReactNode {
    if (key === "DNP") return <FlagValue value={value} goodWhenYes={false} />;
    if (key === "In BOM") return <FlagValue value={value} goodWhenYes={true} />;
    if (key === "LCSC Part") {
        const href = lcscUrl(value);
        return href ? <LinkValue href={href} text={value} /> : value;
    }
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

function IntegrationRow({ icon: Icon, title, description }: {
    icon: typeof LibraryBig;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3 border-b py-3 last:border-b-0">
            <div className="mt-0.5 border bg-muted/40 p-2">
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

function LibraryImportRow({ onImport, disabled, loading }: {
    onImport: () => void;
    disabled: boolean;
    loading: boolean;
}) {
    return (
        <div className="flex items-start gap-3 border-b py-3 last:border-b-0">
            <div className="mt-0.5 border bg-muted/40 p-2">
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

type AssetPresence = { assetType: string; inLibrary: boolean; matches: unknown[] };
type LibraryPresence = Record<"symbol" | "footprint" | "3dmodel", AssetPresence | undefined>;

// The library-presence assets in display order, with their labels.
const PRESENCE_ASSETS = [
    ["symbol", "Symbol"],
    ["footprint", "Footprint"],
    ["3dmodel", "3D model"],
] as const;

/** Ask the catalog whether a component's symbol/footprint/model are in the library. */
function useLibraryPresence(component: SemanticComponent | undefined) {
    const [presence, setPresence] = useState<LibraryPresence | null>(null);
    const symbol = component?.symbolLibId ?? "";
    const footprint = component?.footprint ?? "";
    const model = component?.modelName ?? "";

    useEffect(() => {
        setPresence(null);
        if (!symbol && !footprint && !model) return;
        const params = new URLSearchParams();
        if (symbol) params.set("symbol", symbol);
        if (footprint) params.set("footprint", footprint);
        if (model) params.set("model", model);
        let cancelled = false;
        void fetchJson<LibraryPresence>(`/api/catalog/assets/presence?${params.toString()}`)
            .then((data) => {
                if (!cancelled) setPresence(data);
            })
            .catch(() => {
                if (!cancelled) setPresence(null);
            });
        return () => {
            cancelled = true;
        };
    }, [symbol, footprint, model]);

    return presence;
}

// A compact per-asset in-library badge: green when present, muted when missing.
function PresenceBadge({ label, present }: { label: string; present: boolean }) {
    return (
        <Badge
            variant="outline"
            className={cn(
                "gap-1 px-1.5 py-0 text-[10px] font-medium",
                present ? "border-success/40 text-success" : "text-muted-foreground",
            )}
        >
            {present ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {label}
        </Badge>
    );
}

export function SelectionInspector({
    open,
    selection,
    semanticIndex,
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
    viewContext,
}: SelectionInspectorProps) {
    // Resolve the component before any early return so the presence hook is
    // called unconditionally (rules of hooks). It is undefined for nets or when
    // the panel is closed, and the hook no-ops then.
    const component = selection ? resolveComponent(selection, semanticIndex) : undefined;
    const libraryPresence = useLibraryPresence(component);
    if (!open || !selection) return null;
    const net = resolveNet(selection, semanticIndex);
    const terminal = resolveTerminal(selection, semanticIndex);
    const SelectionIcon = selection.kind === "component" ? Cpu : selection.kind === "terminal" ? Waypoints : Network;
    const title = selectionLabel(selection);
    const activeUuid = selection.uuid || selection.anchor?.uuid;
    const labelIndex = activeUuid
        ? labelInstances.findIndex((instance) => instance.uuid === activeUuid)
        : -1;
    const showLabelNav = labelInstances.length >= 2 && Boolean(onNavigateLabelInstance);
    const labelOrdinal = labelIndex >= 0 ? labelIndex + 1 : 1;

    // Which assets the library check covered, and how many of them are present.
    const presenceAssets = libraryPresence
        ? PRESENCE_ASSETS.filter(([key]) => libraryPresence[key])
        : [];
    const presentCount = presenceAssets.filter(([key]) => libraryPresence?.[key]?.inLibrary).length;
    const allInLibrary = presenceAssets.length > 0 && presentCount === presenceAssets.length;

    return (
        <aside
            className={cn(
                "flex h-full flex-col bg-background",
                embedded
                    ? "w-full"
                    : "relative z-30 w-96 shrink-0 border-l shadow-lg",
            )}
            aria-label="Selection inspector"
        >
            <header className="shrink-0 border-b bg-card/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <nav aria-label="Selection breadcrumb" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <span>Selection</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate capitalize text-foreground">{selection.kind}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate font-mono text-foreground">{title}</span>
                    </nav>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {/* Small right-aligned library indicator: fully in library
                            reads as a green tick, otherwise the n-of-m count. */}
                        {presenceAssets.length > 0 && (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1 text-[11px] font-medium",
                                    allInLibrary ? "text-success" : "text-muted-foreground",
                                )}
                                title={`${presentCount} of ${presenceAssets.length} assets in library`}
                            >
                                {allInLibrary ? <Check className="h-3.5 w-3.5" /> : <LibraryBig className="h-3.5 w-3.5" />}
                                {allInLibrary ? "In library" : `${presentCount}/${presenceAssets.length} in library`}
                            </span>
                        )}
                        {!embedded && (
                            <Button variant="ghost" size="icon-sm" aria-label="Close selection inspector" onClick={() => onOpenChange(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <div className="border bg-primary/10 p-2.5 text-primary">
                        <SelectionIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                        <h2 className="truncate font-mono text-lg font-semibold" title={title}>{title}</h2>
                        {/* Nudge just the tag up so its bottom lines up with the
                            icon's bottom, without reflowing the icon or title. */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 -translate-y-1.5">
                            <Badge variant="outline" className="px-2 py-0 text-[11px] font-medium">
                                {capitalizeFirst(resolvedItemType(selection, viewContext))}
                            </Badge>
                        </div>
                    </div>
                </div>
            </header>

            <ScrollArea className="themed-scrollbar min-h-0 flex-1">
                <div className="space-y-5 p-4 text-xs">
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
                                    <div className="mt-0.5 truncate text-muted-foreground" title={labelInstances[labelIndex]?.sheet}>
                                        {labelInstances[labelIndex >= 0 ? labelIndex : 0]?.sheet}
                                    </div>
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
                                                title={`${instance.sheet}:${instance.name}`}
                                            >
                                                {instance.sheet}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </CollapsibleSection>
                    )}

                    <CollapsibleSection title="Identity" icon={CircuitBoard}>
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
                                    <span className="inline-flex items-center justify-end gap-1.5">
                                        {layerColors?.[selection.anchor.layer] && (
                                            <span
                                                className="size-3 shrink-0 border"
                                                style={{ backgroundColor: layerColors[selection.anchor.layer] }}
                                                aria-hidden
                                            />
                                        )}
                                        <span>{selection.anchor.layer}</span>
                                    </span>
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
                                    {/* DNP and BOM always show, as flags, right at
                                        the top. Default to KiCad's defaults when
                                        the parse did not carry the field. */}
                                    <PropertyRow
                                        label="DNP"
                                        value={<FlagValue value={String(component.fields?.DNP ?? "No")} goodWhenYes={false} />}
                                    />
                                    <PropertyRow
                                        label="BOM"
                                        value={<FlagValue value={String(component.fields?.["In BOM"] ?? "Yes")} goodWhenYes={true} />}
                                    />
                                    {Object.entries(component.fields || {})
                                        .filter(([key, value]) => key !== "DNP" && key !== "In BOM" && isDisplayableField(key, String(value)))
                                        .map(([key, value]) => (
                                            <PropertyRow key={key} label={key} value={renderFieldValue(key, String(value))} />
                                        ))}
                                </dl>
                            </CollapsibleSection>
                        </>
                    )}

                    {selection.kind !== "net" && (
                        <>
                            <Separator />
                            <CollapsibleSection title="Library & sourcing">
                                {component && presenceAssets.length > 0 && (
                                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                        <span className="mr-1 text-xs text-muted-foreground">
                                            {presentCount} of {presenceAssets.length} in library
                                        </span>
                                        {presenceAssets.map(([key, label]) => (
                                            <PresenceBadge
                                                key={key}
                                                label={label}
                                                present={Boolean(libraryPresence?.[key]?.inLibrary)}
                                            />
                                        ))}
                                    </div>
                                )}
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

                    {(terminal || net) && (
                        <>
                            <Separator />
                            <CollapsibleSection title="Connectivity">
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

            <footer className="flex shrink-0 items-center justify-between gap-2 border-t bg-card/70 p-3">
                <span className="text-xs text-muted-foreground">Esc clears selection</span>
                <Button size="sm" variant="outline" onClick={onClear}>Clear</Button>
            </footer>
        </aside>
    );
}
