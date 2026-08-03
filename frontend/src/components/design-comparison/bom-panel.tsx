import { Fragment, useEffect, useMemo, useState } from "react";
import {
    ChevronDown,
    ChevronRight,
    Columns3,
    Download,
    ExternalLink,
    Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { csvCell, downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import type { BomChangeRow, BomDiff, BomRowStatus } from "./types";

interface BomPanelProps {
    bom: BomDiff | null;
}

type BomView = "changes" | "base" | "compare";

const STATUS_OPTIONS: Array<{
    id: Exclude<BomRowStatus, "unchanged">;
    label: string;
    marker: string;
}> = [
    { id: "added", label: "Added", marker: "bg-success" },
    { id: "removed", label: "Removed", marker: "bg-destructive" },
    { id: "changed", label: "Modified", marker: "bg-warning" },
];

function rowValue(row: BomChangeRow, field: string, view: BomView) {
    if (view === "base") return row.old?.[field] ?? "";
    return row.new?.[field] ?? "";
}

export function filterBomRows(
    bom: BomDiff,
    statuses: Set<BomRowStatus>,
    showUnchanged: boolean,
    search: string,
    filterField: string,
    fieldFilter: string,
    view: BomView = "changes",
) {
    const activeStatuses = new Set(statuses);
    if (showUnchanged) activeStatuses.add("unchanged");
    const query = search.trim().toLocaleLowerCase();
    const engineeringQuery = fieldFilter.trim().toLocaleLowerCase();
    return bom.changes.filter((row) => {
        // The status filter and "show unchanged" belong to the changes view,
        // which is about what differs. Base and compare show the full BOM for a
        // revision, so a row is included when it exists on that side: a removed
        // row has no compare entry, an added row has no base entry, everything
        // else appears. Without this, an unchanged BOM (every row "unchanged")
        // was filtered out entirely and base/compare rendered empty.
        if (view === "base") {
            if (!row.old) return false;
        } else if (view === "compare") {
            if (!row.new) return false;
        } else if (!activeStatuses.has(row.status)) {
            return false;
        }
        const values = [...Object.values(row.old ?? {}), ...Object.values(row.new ?? {})];
        if (query && ![row.ref, ...values].some((value) =>
            String(value ?? "").toLocaleLowerCase().includes(query)
        )) {
            return false;
        }
        if (engineeringQuery) {
            const oldValue = row.old?.[filterField] ?? "";
            const newValue = row.new?.[filterField] ?? "";
            if (![oldValue, newValue].some((value) =>
                value.toLocaleLowerCase().includes(engineeringQuery)
            )) {
                return false;
            }
        }
        return true;
    });
}

/**
 * Render one BOM value the way the Visualizer's engineering BOM does, so the
 * same field reads the same in both places: DNP as a badge rather than the
 * literal string "true", a datasheet as a link, everything else truncated with
 * the full value on hover instead of stretching the column.
 */
function BomValue({ field, value }: { field: string; value: string }) {
    const text = String(value ?? "").trim();
    if (field === "DNP" || field === "kicad_dnp") {
        const isDnp = ["yes", "true", "1"].includes(text.toLocaleLowerCase());
        return (
            <Badge variant={isDnp ? "destructive" : "outline"}>
                {isDnp ? "Yes" : "No"}
            </Badge>
        );
    }
    if (!text) return <span className="text-muted-foreground">—</span>;
    if (field === "Datasheet" && /^https?:\/\//i.test(text)) {
        return (
            <a
                href={text}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-xs items-center gap-1 truncate text-primary hover:underline"
                title={text}
            >
                Datasheet <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
        );
    }
    return (
        <span className="block max-w-sm truncate" title={text}>
            {text}
        </span>
    );
}

export function BomPanel({ bom }: BomPanelProps) {
    const [view, setView] = useState<BomView>("changes");
    const [statuses, setStatuses] = useState<Set<BomRowStatus>>(
        () => new Set(["added", "removed", "changed"]),
    );
    const [showUnchanged, setShowUnchanged] = useState(false);
    const [search, setSearch] = useState("");
    const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
    const [showColumns, setShowColumns] = useState(false);
    const [filterField, setFilterField] = useState("");
    const [fieldFilter, setFieldFilter] = useState("");
    const [expandedReference, setExpandedReference] = useState<string | null>(null);

    useEffect(() => {
        if (!bom) return;
        setVisibleFields(
            new Set(
                bom.fields.filter((field) =>
                    ["Reference", "Value", "Footprint", "Manufacturer", "Manufacturer Part Number"].includes(field)
                ),
            ),
        );
        setFilterField(bom.fields.find((field) => field !== "Reference") ?? "Reference");
    }, [bom]);

    const filteredRows = useMemo(() => {
        if (!bom) return [];
        return filterBomRows(
            bom,
            statuses,
            showUnchanged,
            search,
            filterField,
            fieldFilter,
            view,
        );
    }, [bom, statuses, showUnchanged, search, filterField, fieldFilter, view]);

    if (!bom) {
        return (
            <div className="flex h-full flex-1 flex-col items-center justify-center p-8 text-center">
                <h3 className="text-sm font-medium text-foreground">
                    BOM not available yet
                </h3>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    No BOM could be built from these revisions. The schematic must
                    parse for a BOM to exist. Render the project, then run the
                    comparison again.
                </p>
            </div>
        );
    }

    const fields = bom.fields.filter((field) => visibleFields.has(field));

    const exportCsv = () => {
        const header = ["Status", ...fields].map(csvCell).join(",");
        const body = filteredRows.map((row) => [
            csvCell(row.status),
            ...fields.map((field) => csvCell(
                view === "changes"
                    ? row.new?.[field] ?? row.old?.[field] ?? ""
                    : rowValue(row, field, view),
            )),
        ].join(","));
        downloadCsv(`bom-${view}-filtered.csv`, [header, ...body].join("\n"));
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-background">
            <div className="space-y-2 border-b p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-md border bg-muted/20 p-0.5">
                        {(["changes", "base", "compare"] as BomView[]).map((item) => (
                            <Button
                                key={item}
                                variant={view === item ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 capitalize"
                                onClick={() => setView(item)}
                                aria-pressed={view === item}
                            >
                                {item}
                            </Button>
                        ))}
                    </div>
                    <div className="relative min-w-52 flex-1">
                        <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search references and engineering fields…"
                            className="pl-8"
                        />
                    </div>
                    <div className="relative">
                        <Button
                            variant={showColumns ? "secondary" : "outline"}
                            size="sm"
                            className="h-8"
                            onClick={() => setShowColumns((value) => !value)}
                            aria-expanded={showColumns}
                        >
                            <Columns3 className="mr-2 h-3.5 w-3.5" />
                            Columns
                        </Button>
                        {showColumns && (
                            <div className="absolute right-0 top-9 z-30 max-h-72 w-64 overflow-auto rounded-md border bg-popover p-2 text-popover-foreground shadow-lg">
                                <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Detected fields
                                </div>
                                {bom.fields.map((field) => (
                                    <label
                                        key={field}
                                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={visibleFields.has(field)}
                                            onChange={() => {
                                                setVisibleFields((current) => {
                                                    const next = new Set(current);
                                                    if (next.has(field)) next.delete(field);
                                                    else next.add(field);
                                                    return next;
                                                });
                                            }}
                                            className="accent-primary"
                                        />
                                        <span className="truncate">{field}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                    <Button variant="outline" size="sm" className="h-8" onClick={exportCsv}>
                        <Download className="mr-2 h-3.5 w-3.5" />
                        Export filtered CSV
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {STATUS_OPTIONS.map((status) => (
                        <Button
                            key={status.id}
                            variant={statuses.has(status.id) ? "secondary" : "outline"}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                                setStatuses((current) => {
                                    const next = new Set(current);
                                    if (next.has(status.id)) next.delete(status.id);
                                    else next.add(status.id);
                                    return next;
                                });
                            }}
                            aria-pressed={statuses.has(status.id)}
                        >
                            <span className={cn("mr-1.5 h-2 w-2 rounded-full", status.marker)} />
                            {status.label} ({bom.summary[status.id]})
                        </Button>
                    ))}
                    <label className="ml-1 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={showUnchanged}
                            onChange={(event) => setShowUnchanged(event.target.checked)}
                            className="accent-primary"
                        />
                        Include unchanged
                    </label>
                    <span className="h-5 w-px bg-border" />
                    <select
                        value={filterField}
                        onChange={(event) => setFilterField(event.target.value)}
                        className="h-7 max-w-52 rounded border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Engineering field"
                    >
                        {bom.fields.map((field) => (
                            <option key={field} value={field}>{field}</option>
                        ))}
                    </select>
                    <Input
                        value={fieldFilter}
                        onChange={(event) => setFieldFilter(event.target.value)}
                        placeholder={`Filter ${filterField || "field"}…`}
                        className="h-7 w-52"
                    />
                    <span className="ml-auto text-xs text-muted-foreground">
                        {filteredRows.length} row{filteredRows.length === 1 ? "" : "s"}
                    </span>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                <table className="min-w-max border-separate border-spacing-0 text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b bg-muted text-muted-foreground">
                        <tr>
                            <th className="w-8 bg-muted px-2 py-2" aria-label="Details" />
                            <th className="border-r bg-muted px-3 py-2">Status</th>
                            {fields.map((field) => (
                                <th key={field} className="whitespace-nowrap border-b border-r bg-muted px-3 py-2 font-medium">
                                    {field}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.map((row) => {
                            const expanded = expandedReference === row.ref;
                            return (
                                <Fragment key={row.ref}>
                                    <tr
                                        className={cn(
                                            "border-b align-top hover:bg-muted/30",
                                            row.status === "added" && "bg-success/5",
                                            row.status === "removed" && "bg-destructive/5",
                                            row.status === "changed" && "bg-warning/5",
                                        )}
                                    >
                                        <td className="px-2 py-2">
                                            <button
                                                type="button"
                                                className="rounded p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                onClick={() => setExpandedReference(expanded ? null : row.ref)}
                                                aria-label={`${expanded ? "Collapse" : "Expand"} ${row.ref}`}
                                            >
                                                {expanded
                                                    ? <ChevronDown className="h-3.5 w-3.5" />
                                                    : <ChevronRight className="h-3.5 w-3.5" />}
                                            </button>
                                        </td>
                                        <td className="border-r px-3 py-2">
                                            <span className={cn(
                                                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                                row.status === "added" && "bg-success/15 text-success",
                                                row.status === "removed" && "bg-destructive/15 text-destructive",
                                                row.status === "changed" && "bg-warning/15 text-warning",
                                                row.status === "unchanged" && "bg-muted text-muted-foreground",
                                            )}>
                                                {row.status === "changed" ? "modified" : row.status}
                                            </span>
                                        </td>
                                        {fields.map((field) => {
                                            const diff = row.diffs?.[field];
                                            if (view === "changes" && diff) {
                                                return (
                                                    <td key={field} className="border-b border-r px-3 py-2">
                                                        <div className="space-y-1">
                                                            <div className="rounded border border-destructive/20 bg-destructive/10 px-1.5 py-1 text-destructive line-through">
                                                                <span className="sr-only">Old: </span>
                                                                {diff.old || "—"}
                                                            </div>
                                                            <div className="rounded border border-success/20 bg-success/10 px-1.5 py-1 font-medium text-success">
                                                                <span className="sr-only">New: </span>
                                                                {diff.new || "—"}
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            }
                                            const value = view === "changes"
                                                ? row.new?.[field] ?? row.old?.[field] ?? ""
                                                : rowValue(row, field, view);
                                            return (
                                                <td key={field} className="border-b border-r px-3 py-2">
                                                    <BomValue field={field} value={value} />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    {expanded && (
                                        <tr key={`${row.ref}-details`} className="border-b bg-muted/10">
                                            <td colSpan={fields.length + 2} className="p-4">
                                                <div className="grid gap-4 md:grid-cols-2">
                                                    <BomDetail title="Base values" values={row.old} fields={bom.fields} />
                                                    <BomDetail title="Compare values" values={row.new} fields={bom.fields} />
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                        {!filteredRows.length && (
                            <tr>
                                <td colSpan={fields.length + 2} className="px-4 py-16 text-center text-muted-foreground">
                                    No BOM rows match the selected filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function BomDetail({
    title,
    values,
    fields,
}: {
    title: string;
    values?: Record<string, string>;
    fields: string[];
}) {
    return (
        <section>
            <h3 className="mb-2 text-xs font-semibold">{title}</h3>
            <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1 text-[11px]">
                {fields.map((field) => (
                    <div key={field} className="contents">
                        <dt className="text-muted-foreground">{field}</dt>
                        <dd className="break-words">{values?.[field] || "—"}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
