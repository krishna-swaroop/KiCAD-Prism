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
    Waypoints,
    X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { selectionLabel } from "@/lib/prism-selection";
import type {
    PrismSelection,
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

const resolvedItemType = (selection: PrismSelection): string => {
    const raw = selection.anchor?.itemType?.trim();
    if (raw && raw.toLocaleLowerCase() !== "unknown") return raw;
    if (selection.kind === "component") {
        if (selection.sourceContext === "SCH") return "Schematic symbol";
        if (selection.sourceContext === "PCB") return "PCB footprint";
        return "Component";
    }
    if (selection.kind === "terminal") {
        return selection.sourceContext === "SCH" ? "Schematic pin" : "PCB pad";
    }
    if (selection.sourceContext === "SCH") return "Schematic net item";
    if (selection.sourceContext === "PCB") return "PCB copper net";
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
}: SelectionInspectorProps) {
    if (!open || !selection) return null;
    const component = resolveComponent(selection, semanticIndex);
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
                    {!embedded && (
                        <Button variant="ghost" size="icon-sm" aria-label="Close selection inspector" onClick={() => onOpenChange(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    )}
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
                                {capitalizeFirst(resolvedItemType(selection))}
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
                            <PropertyRow label="Item type" value={resolvedItemType(selection)} />
                            <PropertyRow label="Component UID" value={selection.kind !== "net" ? selection.componentUid : undefined} />
                            <PropertyRow label="Terminal UID" value={selection.kind === "terminal" ? selection.terminalUid : undefined} />
                            <PropertyRow label="Net UID" value={selection.kind !== "component" ? selection.netUid : undefined} />
                            <PropertyRow label="Source UUID" value={selection.uuid || selection.anchor?.uuid} />
                            <PropertyRow label="Page" value={selection.anchor?.page} />
                            <PropertyRow label="Layer" value={selection.anchor?.layer} />
                        </dl>
                    </CollapsibleSection>

                    {component && (
                        <>
                            <Separator />
                            <CollapsibleSection title="Component data">
                                <dl>
                                    <PropertyRow label="Value" value={component.value} />
                                    <PropertyRow label="Footprint" value={component.footprint} />
                                    {Object.entries(component.fields || {})
                                        .filter(([key, value]) => isDisplayableField(key, String(value)))
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
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    Stage this project component with commit-pinned provenance before release review.
                                </p>
                                <div className="mt-2 border bg-card/40 px-3">
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
