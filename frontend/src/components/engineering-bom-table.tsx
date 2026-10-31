import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, ExternalLink, PackageSearch, RefreshCw, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DesignDataPending } from "@/components/design-data-state";
import {
    BomAssemblyFilterControl,
    filterComponentsForAssembly,
    isAssembled,
    type BomAssemblyFilter,
} from "@/components/design-variants/assembly-filter";
import { BOM_SUPPLY_COLUMNS, isSupplyColumn, rowSupply } from "@/features/supply/bom-supply";
import { BomSupplyBar } from "@/features/supply/bom-supply-bar";
import { SupplyCell } from "@/features/supply/bom-supply-cells";
import { useBomRowDetail } from "@/features/supply/use-bom-row-detail";
import { useBomSupply } from "@/features/supply/use-bom-supply";
import { buildBom, type BomLine } from "@/lib/engineering-bom";
import { canOpenSupply } from "@/lib/roles";
import { useScrollBelowHead } from "@/lib/use-scroll-below-head";
import { useWindowedRows } from "@/lib/use-windowed-rows";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type {
    PrismSelection,
    PrismSemanticIndex,
    SemanticComponent,
} from "@/types/prism-selection";

const EMPTY_COMPONENTS: SemanticComponent[] = [];

interface BomSearchTerm {
    field?: string;
    value: string;
    quoted: boolean;
}

interface EngineeringBomTableProps {
    /** The project the BOM is from; build plans are kept per project. */
    projectId?: string;
    semanticIndex: PrismSemanticIndex | null;
    loading: boolean;
    /** The semantic index is still being built rather than failed. */
    pending?: boolean;
    error?: string | null;
    selection: PrismSelection | null;
    onSelection: (selection: PrismSelection) => void;
    onRetry: () => void;
    /**
     * Effective components for the active assembly selection (VAR-11's
     * projection). When omitted the table shows the base index.
     */
    components?: SemanticComponent[] | null;
    /** Roles that may read supply data get stock, price and risk columns. Others see the table as before. */
    user?: User | null;
    /** False for a commit checked out from History: supply shows on the latest revision only. */
    atHead?: boolean;
}

const datasheetUrl = (value: string): string | null => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
};

const BOM_COLUMN_WIDTHS_KEY = "prism:bom-column-widths:v1";
const BOM_SUPPLY_COLUMNS_KEY = "prism:bom-supply-columns:v1";
const defaultColumnWidth = (column: string): number => {
    if (column === "Reference") return 240;
    if (column === "Qty") return 64;
    if (column === "Description") return 320;
    if (column === "Datasheet") return 160;
    if (column === "Footprint") return 260;
    if (column === "Value") return 180;
    return 170;
};

/** The supply set's widths: all ten columns, 1138 px with their borders, fit the 1144 px BOM tab of a 1400 px window. */
const SUPPLY_COLUMN_WIDTHS: Record<string, number> = {
    Reference: 170,
    "Manufacturer Part Number": 170,
    Qty: 48,
    Supply: 130,
    Stock: 90,
    Stores: 100,
    "Unit price": 120,
    Extended: 100,
    Distributor: 120,
    "Lead time": 80,
};

const parseBomQuery = (query: string): { terms: BomSearchTerm[]; lockLastReference: boolean } => {
    const terms: BomSearchTerm[] = [];
    const tokenPattern = /[^\s:"]+:"[^"]*"|"[^"]*"|\S+/g;
    for (const match of query.matchAll(tokenPattern)) {
        const raw = match[0];
        const separator = raw.indexOf(":");
        const rawField = separator > 0 ? raw.slice(0, separator).toLocaleLowerCase() : undefined;
        const rawValue = separator > 0 ? raw.slice(separator + 1) : raw;
        const quoted = rawValue.startsWith('"') && rawValue.endsWith('"');
        const value = (quoted ? rawValue.slice(1, -1) : rawValue).trim().toLocaleLowerCase();
        if (value) terms.push({ field: rawField, value, quoted });
    }
    return { terms, lockLastReference: /\s$/.test(query) };
};

const searchableField = (group: BomLine, field: string): string => {
    const aliases: Record<string, string[]> = {
        value: ["Value"],
        dnp: ["DNP", "dnp"],
        desc: ["Description"],
        description: ["Description"],
        datasheet: ["Datasheet"],
        manufacturer: ["Manufacturer", "Manufacturer Name", "Manufacturer_Name"],
        mfr: ["Manufacturer", "Manufacturer Name", "Manufacturer_Name"],
        mpn: ["Manufacturer Part Number", "Manufacturer_Part_Number"],
        vendor: ["Vendor"],
        vpn: ["Vendor Part Number"],
        footprint: ["Footprint"],
    };
    return (aliases[field] || [field])
        .map((key) => group.fields[key] || "")
        .join(" ")
        .toLocaleLowerCase();
};

const groupMatchesQuery = (group: BomLine, query: string): boolean => {
    const { terms, lockLastReference } = parseBomQuery(query);
    if (!terms.length) return true;
    const references = group.references.map((reference) => reference.toLocaleLowerCase());
    const haystack = [...references, ...Object.values(group.fields)].join(" ").toLocaleLowerCase();
    // Each field search builds the same alias string per term; resolve it once
    // per field so repeated terms share the lookup.
    const fieldValues = new Map<string, string>();
    for (const term of terms) {
        if (term.field && !fieldValues.has(term.field)) {
            fieldValues.set(term.field, searchableField(group, term.field));
        }
    }
    return terms.every((term, index) => {
        if (term.field === "ref" || term.field === "reference") {
            return references.some((reference) => reference === term.value);
        }
// react-doctor-disable-next-line js-set-map-lookups - the receiver is a string haystack, not an array; a Set would break substring matching
        if (term.field) return (fieldValues.get(term.field) ?? "").includes(term.value);
        const referenceLike = /^[a-z]+\d+[a-z0-9._-]*$/.test(term.value);
        if (referenceLike) {
            const exact = term.quoted || (lockLastReference && index === terms.length - 1);
            return references.some((reference) => exact ? reference === term.value : reference.startsWith(term.value));
        }
        return haystack.includes(term.value);
    });
};

// react-doctor-disable-next-line no-giant-component - the table's grouping, field model, search syntax, resizing and rendering share one column/group model, and the D1 filter adds only its own small state on top; splitting it would scatter that single model across files.
export function EngineeringBomTable({
    semanticIndex,
    loading,
    pending = false,
    error,
    selection,
    onSelection,
    onRetry,
    components,
    user,
    projectId,
    atHead = true,
}: EngineeringBomTableProps) {
    const [query, setQuery] = useState("");
    const [assemblyFilter, setAssemblyFilter] =
        useState<BomAssemblyFilter>("all");
    const allComponents = components ?? semanticIndex?.components ?? EMPTY_COMPONENTS;
    const assemblyCount = useMemo(
        () => allComponents.filter(isAssembled).length,
        [allComponents],
    );
    const filteredComponents = useMemo(
        () => filterComponentsForAssembly(allComponents, assemblyFilter),
        [allComponents, assemblyFilter],
    );
    // Supply figures are for what is fitted, whichever rows the assembly filter shows.
    const fitted = useMemo(() => allComponents.filter(isAssembled), [allComponents]);
    // Nothing is looked up for a checked-out commit: the BOM is plain there.
    const supplyUser = atHead ? (user ?? null) : null;
    const supply = useBomSupply(fitted, supplyUser, projectId);
    const detail = useBomRowDetail(supply, supplyUser);
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
        if (typeof window === "undefined") return {};
        try {
            return JSON.parse(window.localStorage.getItem(BOM_COLUMN_WIDTHS_KEY) || "{}") as Record<string, number>;
        } catch {
            return {};
        }
    });

    useEffect(() => {
        window.localStorage.setItem(BOM_COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
    }, [columnWidths]);

    // The supply set is a reader's own view of the table, remembered per browser.
    const [supplyColumns, setSupplyColumns] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        try {
            return window.localStorage.getItem(BOM_SUPPLY_COLUMNS_KEY) === "1";
        } catch {
            return false;
        }
    });

    const toggleSupplyColumns = () => {
        const next = !supplyColumns;
        setSupplyColumns(next);
        try {
            if (next) window.localStorage.setItem(BOM_SUPPLY_COLUMNS_KEY, "1");
            else window.localStorage.removeItem(BOM_SUPPLY_COLUMNS_KEY);
        } catch {
            // A refused store costs the reader only the remembered choice.
        }
    };

    // A column the reader resized keeps its width; the supply set only changes the defaults, and only while it is on.
    const supplySetOn = supply.enabled && supplyColumns;
    const columnDefaultWidth = (column: string): number =>
        supplySetOn && SUPPLY_COLUMN_WIDTHS[column] !== undefined
            ? SUPPLY_COLUMN_WIDTHS[column]
            : defaultColumnWidth(column);

    const resizeColumn = useCallback((column: string, startX: number, startWidth: number) => {
        const handleMove = (event: PointerEvent) => {
            setColumnWidths((current) => ({
                ...current,
                [column]: Math.max(64, Math.min(640, startWidth + event.clientX - startX)),
            }));
        };
        const handleUp = () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
        };
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
    }, []);

    const bom = useMemo(
        () => buildBom(allComponents, assemblyFilter),
        [allComponents, assemblyFilter],
    );
    const { lines } = bom;
    const columns = useMemo(() => {
        if (!supply.enabled) return bom.columns;
        if (supplyColumns) {
            // Just what a supply engineer reads, in the order they read it.
            const base = ["Reference", "Manufacturer Part Number", "Qty"].filter((column) => bom.columns.includes(column));
            return [...base, ...BOM_SUPPLY_COLUMNS];
        }
        // Next to the manufacturer part number they are about.
        const after = bom.columns.indexOf("Manufacturer Part Number") + 1;
        return [...bom.columns.slice(0, after), ...BOM_SUPPLY_COLUMNS, ...bom.columns.slice(after)];
    }, [bom.columns, supply.enabled, supplyColumns]);

    const componentsByReference = useMemo(
        () => new Map(filteredComponents.map((component) => [component.reference, component])),
        [filteredComponents],
    );

    const visibleGroups = useMemo(() => {
        if (!query.trim()) return lines;
        return lines.filter((group) => groupMatchesQuery(group, query));
    }, [lines, query]);
    // A large board's BOM renders the rows near the view, with a spacer for the rest.
    const tableRef = useRef<HTMLTableElement>(null);
    const shown = useWindowedRows(visibleGroups.length, tableRef);
    // The scrollbar runs beside the rows, below the sticky header.
    const scrollRef = useRef<HTMLDivElement>(null);
    const headRef = useRef<HTMLTableSectionElement>(null);
    useScrollBelowHead(scrollRef, headRef);

    const selectedReference = selection?.kind === "component" || selection?.kind === "terminal"
        ? selection.reference
        : null;

    if (pending && !semanticIndex) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <DesignDataPending onRetry={onRetry} />
            </div>
        );
    }

    if (loading && !semanticIndex) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading the lightweight semantic index…
            </div>
        );
    }

    if (!semanticIndex) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="max-w-xl border bg-card p-6 text-center shadow-sm">
                    <PackageSearch className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                    <h3 className="text-base font-semibold">BOM metadata is not available</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Schematic and PCB viewing still work. The BOM appears after the independent semantic index is generated.
                    </p>
                    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry semantic index
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            <div className="flex shrink-0 items-center gap-3 border-b bg-card/70 p-2">
                <div className="min-w-0 flex-1">
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search references and fields…"
                        aria-label="Filter bill of materials"
                        // The syntax this accepts -- prefix matching, a
                        // trailing space to lock an exact reference, and the
                        // `ref:`/`value:`/`mfr:`/`mpn:`/`vendor:`/`footprint:`
                        // filters -- is documented on the field itself rather
                        // than in a paragraph under it.
                        title="Prefixes match while typing; add a trailing space to lock an exact reference. Filters: ref:, value:, mfr:, mpn:, vendor:, footprint:"
                        className="h-8 max-w-xl"
                    />
                </div>
                <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <BomAssemblyFilterControl
                        value={assemblyFilter}
                        onChange={setAssemblyFilter}
                        allCount={allComponents.length}
                        assemblyCount={assemblyCount}
                    />
                    <span>
                        {assemblyFilter === "all"
                            ? `${allComponents.length} components`
                            : `${filteredComponents.length} of ${allComponents.length} components`}
                    </span>
                    <Badge variant="outline">{visibleGroups.length} groups</Badge>
                    {supply.enabled ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            aria-pressed={supplyColumns}
                            onClick={toggleSupplyColumns}
                        >
                            <PackageSearch className="h-3.5 w-3.5" />
                            Supply columns
                        </Button>
                    ) : null}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setColumnWidths({})}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset columns
                    </Button>
                </div>
            </div>
            {!atHead && canOpenSupply(user?.role) ? (
                <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground" title="Supply shows on the latest revision">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Supply data shows on the latest revision only.</span>
                </div>
            ) : null}
            {supply.enabled ? <BomSupplyBar supply={supply} /> : null}
            {supply.enabled ? detail.element : null}
            <div ref={scrollRef} className="themed-scrollbar scroll-below-head min-h-0 flex-1 overflow-auto">
                <table ref={tableRef} className="min-w-max border-separate border-spacing-0 text-xs">
                    <thead ref={headRef} className="sticky top-0 z-20 bg-muted shadow-sm">
                        <tr>
                            {columns.map((column, index) => (
                                <th
                                    key={column}
                                    scope="col"
                                    className={cn(
                                        "group/column relative border-b border-r px-2 py-2 text-left font-medium text-foreground",
                                        index === 0 && "sticky left-0 z-30 bg-muted",
                                    )}
                                    style={{ width: columnWidths[column] || columnDefaultWidth(column), minWidth: columnWidths[column] || columnDefaultWidth(column), maxWidth: columnWidths[column] || columnDefaultWidth(column) }}
                                >
                                    {column}
                                    <button
                                        type="button"
                                        role="separator"
                                        aria-orientation="vertical"
                                        aria-label={`Resize ${column} column`}
                                        className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none opacity-0 outline-none transition-opacity hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:opacity-100 group-hover/column:opacity-100"
                                        onPointerDown={(event) => {
                                            event.preventDefault();
                                            resizeColumn(column, event.clientX, columnWidths[column] || columnDefaultWidth(column));
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                                            event.preventDefault();
                                            const delta = event.key === "ArrowLeft" ? -16 : 16;
                                            setColumnWidths((current) => ({
                                                ...current,
                                                [column]: Math.max(64, Math.min(640, (current[column] || columnDefaultWidth(column)) + delta)),
                                            }));
                                        }}
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.before > 0 ? <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: shown.before }} /></tr> : null}
                        {visibleGroups.slice(shown.start, shown.end).map((group) => {
                            const groupSelected = selectedReference !== null && group.references.includes(selectedReference);
                            return (
                                <tr key={group.key} data-row className={cn("group", groupSelected && "bg-accent/60")}>
                                    {columns.map((column, index) => {
                                        let content: React.ReactNode;
                                        if (column === "Reference") {
                                            content = (
                                                /* Rows are grouped by value, so a single row can carry
                                                   a dozen designators and each one selects a different
                                                   part. Ghost styling left them reading as plain text
                                                   until the pointer was already on one; a resting
                                                   outline says "these are separate things you can
                                                   pick" before anyone hovers, and the accent tint on
                                                   hover confirms it. */
                                                <div className="flex max-w-md flex-wrap gap-1">
                                                    {group.references.map((reference) => {
                                                        const component = componentsByReference.get(reference);
                                                        const isSelected = selectedReference === reference;
                                                        return (
                                                            <Button
                                                                key={reference}
                                                                type="button"
                                                                size="sm"
                                                                variant={isSelected ? "default" : "ghost"}
                                                                aria-pressed={isSelected}
                                                                title={`Select ${reference}`}
                                                                className={cn(
                                                                    "h-6 cursor-pointer px-1.5 font-mono text-xs transition-colors",
                                                                    !isSelected && [
                                                                        "border-border/70 bg-muted/40 text-muted-foreground",
                                                                        "hover:border-primary/60 hover:bg-primary/10",
                                                                        "hover:text-foreground",
                                                                    ],
                                                                )}
                                                                onClick={() => onSelection({
                                                                    kind: "component",
                                                                    sourceContext: "BOM",
                                                                    sourceRevisionKey: semanticIndex.designKey ?? semanticIndex.sourceRevisionKey,
                                                                    reference,
                                                                    componentUid: component?.componentUid,
                                                                })}
                                                            >
                                                                {reference}
                                                            </Button>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        } else if (column === "Qty") {
                                            content = group.quantity;
                                        } else if (isSupplyColumn(column)) {
                                            const lineComponents = group.references.flatMap((reference) => {
                                                const component = componentsByReference.get(reference);
                                                return component ? [component] : [];
                                            });
                                            content = (
                                                <SupplyCell
                                                    column={column}
                                                    supply={rowSupply(lineComponents, supply.lookup?.lines ?? null, supply.fittedKeys)}
                                                    onDetails={() => detail.open(lineComponents)}
                                                />
                                            );
                                        } else {
                                            const value = group.fields[column] || "";
                                            const url = column === "Datasheet" ? datasheetUrl(value) : null;
                                            if (url) {
                                                content = (
                                                    <a
                                                        href={url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex max-w-xs items-center gap-1 truncate text-primary hover:underline"
                                                        title={value}
                                                    >
                                                        Datasheet <ExternalLink className="h-3 w-3 shrink-0" />
                                                    </a>
                                                );
                                            } else if (column === "DNP") {
                                                const isDnp = value.toLocaleLowerCase() === "yes";
                                                content = <Badge variant={isDnp ? "destructive" : "outline"}>{value || "No"}</Badge>;
                                            } else if (column === "In BOM") {
                                                const excluded = value.toLocaleLowerCase() === "no";
                                                content = <Badge variant={excluded ? "destructive" : "outline"}>{value || "Yes"}</Badge>;
                                            } else {
                                                content = <span className="block max-w-sm truncate" title={value}>{value || "—"}</span>;
                                            }
                                        }
                                        return (
                                            <td
                                                key={column}
                                                className={cn(
                                                    "border-b border-r px-2 py-1.5 align-top text-foreground group-hover:bg-muted/40",
                                                    index === 0 && "sticky left-0 z-10 bg-background group-hover:bg-muted",
                                                    groupSelected && index === 0 && "bg-accent",
                                                )}
                                                style={{ width: columnWidths[column] || columnDefaultWidth(column), minWidth: columnWidths[column] || columnDefaultWidth(column), maxWidth: columnWidths[column] || columnDefaultWidth(column) }}
                                            >
                                                {content}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                        {shown.after > 0 ? <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: shown.after }} /></tr> : null}
                    </tbody>
                </table>
                {visibleGroups.length === 0 && (
                    <div className="p-10 text-center text-sm text-muted-foreground">No BOM rows match this filter.</div>
                )}
            </div>
        </div>
    );
}
