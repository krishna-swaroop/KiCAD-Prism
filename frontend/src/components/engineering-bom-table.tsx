import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, PackageSearch, RefreshCw, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
    PrismSelection,
    PrismSemanticIndex,
    SemanticComponent,
} from "@/types/prism-selection";

export const BOM_REQUIRED_COLUMNS = [
    "Reference",
    "Qty",
    "Value",
    "DNP",
    "Description",
    "Datasheet",
    "Manufacturer",
    "Manufacturer Part Number",
    "Vendor",
    "Vendor Part Number",
    "Footprint",
    "Mass (g)",
    "RQjC (C/W)",
    "RQjC_top (C/W)",
    "Temp_max (C)",
    "Temp_min (C)",
    "Power Dissipation (W)",
    "Rate",
] as const;

interface BomGroup {
    key: string;
    components: SemanticComponent[];
    fields: Record<string, string>;
}

interface BomSearchTerm {
    field?: string;
    value: string;
    quoted: boolean;
}

interface EngineeringBomTableProps {
    semanticIndex: PrismSemanticIndex | null;
    loading: boolean;
    error?: string | null;
    selection: PrismSelection | null;
    onSelection: (selection: PrismSelection) => void;
    onRetry: () => void;
}

const naturalReferenceSort = (left: SemanticComponent, right: SemanticComponent) =>
    left.reference.localeCompare(right.reference, undefined, { numeric: true, sensitivity: "base" });

const fieldText = (value: string | number | boolean | null | undefined): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
};

const componentFields = (component: SemanticComponent): Record<string, string> => ({
    Value: component.value || "",
    Footprint: component.footprint || "",
    ...Object.fromEntries(
        Object.entries(component.fields || {}).map(([key, value]) => [key, fieldText(value)]),
    ),
});

const isInternalField = (field: string) => {
    const normalized = field.toLocaleLowerCase();
    return normalized.startsWith("_") || normalized.startsWith("kicad_");
};

const datasheetUrl = (value: string): string | null => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
};

const BOM_COLUMN_WIDTHS_KEY = "prism:bom-column-widths:v1";
const defaultColumnWidth = (column: string): number => {
    if (column === "Reference") return 240;
    if (column === "Qty") return 64;
    if (column === "Description") return 320;
    if (column === "Datasheet") return 160;
    if (column === "Footprint") return 260;
    if (column === "Value") return 180;
    return 170;
};

const commonFields = (components: SemanticComponent[]): Record<string, string> => {
    const rows = components.map(componentFields);
    const keys = new Set(rows.flatMap((row) => Object.keys(row)));
    return Object.fromEntries([...keys].map((key) => {
        const values = [...new Set(rows.map((row) => row[key] || ""))];
        return [key, values.length === 1 ? values[0] : "Mixed"];
    }));
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

const searchableField = (group: BomGroup, field: string): string => {
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

const groupMatchesQuery = (group: BomGroup, query: string): boolean => {
    const { terms, lockLastReference } = parseBomQuery(query);
    if (!terms.length) return true;
    const references = group.components.map((component) => component.reference.toLocaleLowerCase());
    const haystack = [...references, ...Object.values(group.fields)].join(" ").toLocaleLowerCase();
    return terms.every((term, index) => {
        if (term.field === "ref" || term.field === "reference") {
            return references.some((reference) => reference === term.value);
        }
        if (term.field) return searchableField(group, term.field).includes(term.value);
        const referenceLike = /^[a-z]+\d+[a-z0-9._-]*$/.test(term.value);
        if (referenceLike) {
            const exact = term.quoted || (lockLastReference && index === terms.length - 1);
            return references.some((reference) => exact ? reference === term.value : reference.startsWith(term.value));
        }
        return haystack.includes(term.value);
    });
};

export function EngineeringBomTable({
    semanticIndex,
    loading,
    error,
    selection,
    onSelection,
    onRetry,
}: EngineeringBomTableProps) {
    const [query, setQuery] = useState("");
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

    const columns = useMemo(() => {
        const required = new Set<string>(BOM_REQUIRED_COLUMNS);
        const extras = new Set<string>();
        for (const component of semanticIndex?.components || []) {
            for (const field of Object.keys(component.fields || {})) {
                if (!required.has(field) && !isInternalField(field)) extras.add(field);
            }
        }
        return [...BOM_REQUIRED_COLUMNS, ...[...extras].sort((left, right) => left.localeCompare(right))];
    }, [semanticIndex]);

    const groups = useMemo(() => {
        const byValue = new Map<string, SemanticComponent[]>();
        for (const component of semanticIndex?.components || []) {
            const fields = componentFields(component);
            const valueKey = fields.Value.trim().toLocaleLowerCase();
            const group = byValue.get(valueKey) || [];
            group.push(component);
            byValue.set(valueKey, group);
        }
        return [...byValue.entries()]
            .map(([key, components]): BomGroup => ({
                key: `value:${key}`,
                components: components.sort(naturalReferenceSort),
                fields: commonFields(components),
            }))
            .sort((left, right) =>
                (left.fields.Value || "").localeCompare(right.fields.Value || "", undefined, {
                    numeric: true,
                    sensitivity: "base",
                }),
            );
    }, [semanticIndex]);

    const visibleGroups = useMemo(() => {
        if (!query.trim()) return groups;
        return groups.filter((group) => groupMatchesQuery(group, query));
    }, [groups, query]);

    const selectedReference = selection?.kind === "component" || selection?.kind === "terminal"
        ? selection.reference
        : null;

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
                        className="h-8 max-w-xl"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                        Reference prefixes match while typing; add a trailing space to lock an exact reference. Filters: ref:, value:, mfr:, mpn:, vendor:, footprint:.
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{semanticIndex.components.length} components</span>
                    <Badge variant="outline">{visibleGroups.length} groups</Badge>
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
            <div className="min-h-0 flex-1 overflow-auto">
                <table className="min-w-max border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-20 bg-muted shadow-sm">
                        <tr>
                            {columns.map((column, index) => (
                                <th
                                    key={column}
                                    scope="col"
                                    className={cn(
                                        "group/column relative border-b border-r px-2 py-2 text-left font-medium text-foreground",
                                        index === 0 && "sticky left-0 z-30 bg-muted",
                                    )}
                                    style={{ width: columnWidths[column] || defaultColumnWidth(column), minWidth: columnWidths[column] || defaultColumnWidth(column), maxWidth: columnWidths[column] || defaultColumnWidth(column) }}
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
                                            resizeColumn(column, event.clientX, columnWidths[column] || defaultColumnWidth(column));
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                                            event.preventDefault();
                                            const delta = event.key === "ArrowLeft" ? -16 : 16;
                                            setColumnWidths((current) => ({
                                                ...current,
                                                [column]: Math.max(64, Math.min(640, (current[column] || defaultColumnWidth(column)) + delta)),
                                            }));
                                        }}
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleGroups.map((group) => {
                            const groupSelected = group.components.some((component) => component.reference === selectedReference);
                            return (
                                <tr key={group.key} className={cn("group", groupSelected && "bg-accent/60")}>
                                    {columns.map((column, index) => {
                                        let content: React.ReactNode;
                                        if (column === "Reference") {
                                            content = (
                                                <div className="flex max-w-md flex-wrap gap-1">
                                                    {group.components.map((component) => (
                                                        <Button
                                                            key={component.reference}
                                                            type="button"
                                                            size="sm"
                                                            variant={selectedReference === component.reference ? "default" : "ghost"}
                                                            className="h-6 px-1.5 font-mono text-xs"
                                                            onClick={() => onSelection({
                                                                kind: "component",
                                                                sourceContext: "BOM",
                                                                sourceRevisionKey: semanticIndex.sourceRevisionKey,
                                                                reference: component.reference,
                                                                componentUid: component.componentUid,
                                                            })}
                                                        >
                                                            {component.reference}
                                                        </Button>
                                                    ))}
                                                </div>
                                            );
                                        } else if (column === "Qty") {
                                            content = group.components.length;
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
                                                style={{ width: columnWidths[column] || defaultColumnWidth(column), minWidth: columnWidths[column] || defaultColumnWidth(column), maxWidth: columnWidths[column] || defaultColumnWidth(column) }}
                                            >
                                                {content}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {visibleGroups.length === 0 && (
                    <div className="p-10 text-center text-sm text-muted-foreground">No BOM rows match this filter.</div>
                )}
            </div>
        </div>
    );
}
