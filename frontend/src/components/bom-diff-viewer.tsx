import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Download, ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink } from "lucide-react";
import { fetchJson } from "@/lib/api";

// ---------------------------------------------------------------------------
// Scrollbar styles — injected once
// ---------------------------------------------------------------------------

let _scrollStyleInjected = false;
function ensureScrollStyle() {
    if (_scrollStyleInjected || typeof document === "undefined") return;
    _scrollStyleInjected = true;
    if (document.getElementById("prism-bom-scroll")) return;
    const s = document.createElement("style");
    s.id = "prism-bom-scroll";
    s.textContent = `
        .prism-bom-scroll { scrollbar-width: thin; scrollbar-color: hsl(var(--border)) transparent; }
        .prism-bom-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .prism-bom-scroll::-webkit-scrollbar-track { background: transparent; }
        .prism-bom-scroll::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 9999px; }
        .prism-bom-scroll::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.5); }
    `;
    document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BomKind = "added" | "removed" | "changed" | "unchanged";

interface FieldChange {
    old: string | null;
    new: string | null;
}

interface BomRow {
    kind: BomKind;
    references: string[];
    qty: number;
    value: string;
    footprint: string;
    lib_id: string;
    mpn: string;
    manufacturer: string;
    description: string;
    datasheet: string;
    dnp: boolean;
    changes: Record<string, FieldChange | null>;
}

interface BomDiffData {
    commit1: string;
    commit2: string;
    rows: BomRow[];
}

export interface BomDiffViewerProps {
    projectId: string;
    /** Required unless snapshot=true. */
    commit1?: string;
    /** Required unless snapshot=true. */
    commit2?: string;
    singleCommit?: boolean;
    /**
     * Plain BOM view (no diff): fetches HEAD snapshot, hides all diff UI
     * (kind badge, row colours, stats bar, change cells, "show unchanged" toggle).
     */
    snapshot?: boolean;
    onCrossProbe?: (reference: string) => void;
    /** Carries a seq number so re-delivering the same ref still triggers the effect. */
    crossProbeTarget?: { ref: string; seq: number };
}

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

type SortKey = "references" | "qty" | "value" | "footprint" | "mpn" | "manufacturer" | "description";
type SortDir = "asc" | "desc";

function refSortKey(ref: string): [string, number, string] {
    const m = ref.match(/^([A-Za-z]+)(\d+)(.*)$/);
    if (m) return [m[1], parseInt(m[2], 10), m[3]];
    return [ref, 0, ""];
}

function sortRows(rows: BomRow[], key: SortKey, dir: SortDir): BomRow[] {
    const mul = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
        let cmp = 0;
        if (key === "qty") {
            cmp = a.qty - b.qty;
        } else if (key === "references") {
            const [pa, na] = refSortKey(a.references[0] ?? "");
            const [pb, nb] = refSortKey(b.references[0] ?? "");
            cmp = pa < pb ? -1 : pa > pb ? 1 : na - nb;
        } else {
            const av = (a as unknown as Record<string, unknown>)[key] as string ?? "";
            const bv = (b as unknown as Record<string, unknown>)[key] as string ?? "";
            cmp = av < bv ? -1 : av > bv ? 1 : 0;
        }
        return cmp * mul;
    });
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

const KIND_ROW_STYLE: Record<BomKind, React.CSSProperties> = {
    added:     { background: "rgba(16,185,129,0.12)" },
    removed:   { background: "rgba(239,68,68,0.12)" },
    changed:   { background: "rgba(245,158,11,0.10)" },
    unchanged: {},
};

const KIND_ROW_HOVER: Record<BomKind, string> = {
    added:     "hover:bg-emerald-500/20",
    removed:   "hover:bg-red-500/20",
    changed:   "hover:bg-amber-500/20",
    unchanged: "hover:bg-muted/40",
};

const KIND_BADGE: Record<BomKind, { label: string; cls: string }> = {
    added:     { label: "+", cls: "text-emerald-500 font-bold" },
    removed:   { label: "−", cls: "text-red-500 font-bold" },
    changed:   { label: "~", cls: "text-amber-500 font-bold" },
    unchanged: { label: " ", cls: "" },
};

// Returns a text-colour class for a cell based on what kind of change the field has.
// Only applies when the row is "changed"; added/removed rows colour the whole row.
function cellHighlight(row: BomRow, field: string): string {
    if (row.kind !== "changed") return "";
    const ch = row.changes[field];
    if (!ch) return "";
    if (!ch.old && ch.new)  return "text-emerald-300";  // field added
    if (ch.old  && !ch.new) return "text-red-400";      // field removed
    return "text-amber-300";                             // field changed
}

function ChangedCell({ value, change, className = "" }: { value: string; change?: FieldChange | null; className?: string }) {
    if (!change) {
        return (
            <span className={className}>
                {value || <span className="text-muted-foreground/40 italic">—</span>}
            </span>
        );
    }

    const hadOld = !!change.old;
    const hasNew = !!change.new;

    // Field added (was blank, now has a value)
    if (!hadOld && hasNew) {
        return (
            <span className={`flex items-center gap-1 ${className}`}>
                <span className="text-[9px] font-semibold px-0.5 rounded bg-emerald-500/20 text-emerald-400 leading-none shrink-0">NEW</span>
                <span className="text-emerald-300 leading-tight">{change.new}</span>
            </span>
        );
    }

    // Field removed (had a value, now blank)
    if (hadOld && !hasNew) {
        return (
            <span className={`flex items-center gap-1 ${className}`}>
                <span className="text-[9px] font-semibold px-0.5 rounded bg-red-500/20 text-red-400 leading-none shrink-0">DEL</span>
                <span className="line-through text-red-400/70 leading-tight">{change.old}</span>
            </span>
        );
    }

    // Field changed (both non-empty, value is different)
    return (
        <span className={`flex flex-col gap-0.5 ${className}`}>
            <span className="line-through text-red-400/70 text-[10px] leading-tight">{change.old}</span>
            <span className="text-amber-300 leading-tight">{change.new}</span>
        </span>
    );
}

function DatasheetLink({ url }: { url: string }) {
    if (!url) return <span className="text-muted-foreground/40 italic">—</span>;
    const isUrl = url.startsWith("http://") || url.startsWith("https://");
    if (isUrl) {
        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 underline underline-offset-2"
                onClick={e => e.stopPropagation()}
            >
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate max-w-[8rem]">{url.split("/").pop() || "Link"}</span>
            </a>
        );
    }
    return <span className="truncate text-muted-foreground text-[11px]">{url}</span>;
}

// ---------------------------------------------------------------------------
// Sort header
// ---------------------------------------------------------------------------

function SortTh({
    label, col, sortKey, sortDir, onSort, className = "",
}: {
    label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir;
    onSort: (col: SortKey) => void; className?: string;
}) {
    const active = sortKey === col;
    return (
        <th
            className={`px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors ${className}`}
            onClick={() => onSort(col)}
        >
            <span className="flex items-center gap-1">
                {label}
                {active
                    ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
            </span>
        </th>
    );
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function exportCsv(rows: BomRow[], commit1: string) {
    const headers = ["Kind", "References", "Qty", "Value", "Footprint", "MPN", "Manufacturer", "Description", "Datasheet", "DNP"];
    const esc = (v: unknown) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(","),
        ...rows.map(r => [
            r.kind, r.references.join(" "), r.qty, r.value, r.footprint,
            r.mpn, r.manufacturer, r.description, r.datasheet, r.dnp ? "DNP" : "",
        ].map(esc).join(",")),
    ];
    triggerDownload(
        new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }),
        `bom-${commit1.slice(0, 7)}.csv`
    );
}

async function exportXlsx(rows: BomRow[], commit1: string) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("BOM");

    const headers = ["Kind", "References", "Qty", "Value", "Footprint", "MPN", "Manufacturer", "Description", "Datasheet", "DNP"];
    const colWidths = [8, 20, 5, 14, 22, 14, 16, 28, 32, 5];

    ws.columns = headers.map((header, i) => ({ header, key: header, width: colWidths[i] }));

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.commit();

    for (const r of rows) {
        ws.addRow([
            r.kind, r.references.join(" "), r.qty, r.value, r.footprint,
            r.mpn, r.manufacturer, r.description, r.datasheet, r.dnp ? "DNP" : "",
        ]);
    }

    const buffer = await wb.xlsx.writeBuffer();
    triggerDownload(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `bom-${commit1.slice(0, 7)}.xlsx`
    );
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BomDiffViewer({
    projectId, commit1, commit2, singleCommit, snapshot, onCrossProbe, crossProbeTarget,
}: BomDiffViewerProps) {
    useEffect(() => { ensureScrollStyle(); }, []);

    const [data, setData] = useState<BomDiffData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [showUnchanged, setShowUnchanged] = useState(!singleCommit);
    const [sortKey, setSortKey] = useState<SortKey>("references");
    const [sortDir, setSortDir] = useState<SortDir>("asc");
    const [selected, setSelected] = useState<string | null>(null);
    const selectedRowRef = useRef<HTMLTableRowElement | null>(null);

    // Sync cross-probe target — seq changes even when ref is the same, ensuring
    // the effect fires every time the user switches tabs toward BOM.
    useEffect(() => {
        if (crossProbeTarget?.ref) setSelected(crossProbeTarget.ref);
    }, [crossProbeTarget?.ref, crossProbeTarget?.seq]);

    // Scroll selected row into view
    useEffect(() => {
        if (selected && selectedRowRef.current) {
            selectedRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }, [selected]);

    // Fetch BOM
    useEffect(() => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (snapshot) {
            params.set("snapshot", "1");
        } else {
            if (commit1) params.set("commit1", commit1);
            if (commit2) params.set("commit2", commit2);
            if (singleCommit) params.set("single", "1");
        }
        fetchJson<BomDiffData>(
            `/api/projects/${projectId}/bom-diff?${params}`,
            {},
            "Failed to load BOM"
        )
            .then(d => { setData(d); setLoading(false); })
            .catch(e => { setError(String(e)); setLoading(false); });
    }, [projectId, commit1, commit2, singleCommit, snapshot]);

    const handleSort = useCallback((col: SortKey) => {
        if (col === sortKey) {
            setSortDir(d => d === "asc" ? "desc" : "asc");
        } else {
            setSortKey(col);
            setSortDir("asc");
        }
    }, [sortKey]);

    // Cross-probe: emit the first reference and set selected.
    // Also accept any reference in the row for the selected highlight.
    const handleRowClick = useCallback((row: BomRow) => {
        const ref = row.references[0] ?? null;
        setSelected(ref);
        if (ref) onCrossProbe?.(ref);
    }, [onCrossProbe]);

    const filteredRows = useMemo(() => {
        if (!data) return [];
        let rows = data.rows;
        if (!showUnchanged) rows = rows.filter(r => r.kind !== "unchanged");
        if (filter.trim()) {
            const q = filter.trim().toLowerCase();
            rows = rows.filter(r =>
                r.references.some(ref => ref.toLowerCase().includes(q)) ||
                r.value.toLowerCase().includes(q) ||
                r.footprint.toLowerCase().includes(q) ||
                r.mpn.toLowerCase().includes(q) ||
                r.manufacturer.toLowerCase().includes(q) ||
                r.description.toLowerCase().includes(q)
            );
        }
        return sortRows(rows, sortKey, sortDir);
    }, [data, filter, showUnchanged, sortKey, sortDir]);

    const hasUnchanged = useMemo(() => data?.rows.some(r => r.kind === "unchanged") ?? false, [data]);

    const stats = useMemo(() => {
        if (!data) return null;
        return {
            added:   data.rows.filter(r => r.kind === "added").length,
            removed: data.rows.filter(r => r.kind === "removed").length,
            changed: data.rows.filter(r => r.kind === "changed").length,
        };
    }, [data]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                <span className="animate-pulse">Loading BOM…</span>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {error ?? "No BOM data available"}
            </div>
        );
    }

    if (filteredRows.length === 0 && !filter) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                {snapshot
                    ? <p className="text-sm font-medium">No components found</p>
                    : <>
                        <p className="text-sm font-medium">No BOM changes in this {singleCommit ? "commit" : "diff"}</p>
                        <p className="text-xs opacity-60">All parts are unchanged</p>
                      </>
                }
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-background">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 bg-muted/10">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 border border-border/40 flex-1 max-w-xs">
                    <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        placeholder="Filter by ref, value, MPN…"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60 min-w-0"
                    />
                </div>

                {!snapshot && stats && (stats.added > 0 || stats.removed > 0 || stats.changed > 0) && (
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                        {stats.added   > 0 && <span className="text-emerald-500">+{stats.added}</span>}
                        {stats.removed > 0 && <span className="text-red-500">−{stats.removed}</span>}
                        {stats.changed > 0 && <span className="text-amber-500">~{stats.changed}</span>}
                    </div>
                )}

                <div className="flex-1" />

                {!snapshot && hasUnchanged && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showUnchanged}
                            onChange={e => setShowUnchanged(e.target.checked)}
                            className="accent-primary h-3 w-3"
                        />
                        Show unchanged
                    </label>
                )}

                {/* Export buttons */}
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => exportCsv(filteredRows, commit1 ?? "")}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        title="Export CSV"
                    >
                        <Download className="h-3 w-3" />
                        CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => exportXlsx(filteredRows, commit1 ?? "")}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        title="Export XLSX"
                    >
                        <Download className="h-3 w-3" />
                        XLSX
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto prism-bom-scroll">
                <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
                        <tr>
                            {!snapshot && <th className="w-6 pl-4 pr-1 py-2" />}
                            <SortTh label="Reference(s)" col="references" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="min-w-[7rem]" />
                            <SortTh label="Qty"          col="qty"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-12" />
                            <SortTh label="Value"        col="value"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="min-w-[6rem]" />
                            <SortTh label="Footprint"    col="footprint"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="min-w-[9rem]" />
                            <SortTh label="MPN"          col="mpn"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="min-w-[7rem]" />
                            <SortTh label="Manufacturer" col="manufacturer" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="min-w-[7rem]" />
                            <SortTh label="Description"  col="description" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="min-w-[10rem]" />
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[6rem]">Datasheet</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-12">DNP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.map((row, i) => {
                            const isSelected = selected != null && row.references.includes(selected);
                            const badge = KIND_BADGE[row.kind];
                            return (
                                <tr
                                    key={i}
                                    ref={isSelected ? selectedRowRef : undefined}
                                    onClick={() => handleRowClick(row)}
                                    style={isSelected
                                        ? {
                                            ...(snapshot ? {} : KIND_ROW_STYLE[row.kind]),
                                            background: "color-mix(in srgb, hsl(var(--primary)) 14%, transparent)",
                                            boxShadow: "inset 3px 0 0 hsl(var(--primary))",
                                          }
                                        : (snapshot ? undefined : KIND_ROW_STYLE[row.kind])
                                    }
                                    className={`cursor-pointer transition-colors border-b border-border/20 ${snapshot ? "hover:bg-muted/40" : KIND_ROW_HOVER[row.kind]}`}
                                >
                                    {/* Kind badge — hidden in snapshot mode */}
                                    {!snapshot && (
                                        <td className={`pl-4 pr-1 py-2 text-center font-mono ${badge.cls}`}>
                                            {badge.label}
                                        </td>
                                    )}

                                    {/* References */}
                                    <td className={`${snapshot ? "pl-4 " : ""}px-3 py-2 font-mono font-medium whitespace-nowrap`}>
                                        {!snapshot && row.kind === "removed"
                                            ? <span className="line-through text-red-400/80">{row.references.join(" ")}</span>
                                            : <ChangedCell
                                                value={row.references.join(" ")}
                                                change={snapshot ? null : (row.changes.references ?? null)}
                                                className={snapshot ? "" : cellHighlight(row, "references")}
                                              />
                                        }
                                    </td>

                                    {/* Qty */}
                                    <td className="px-3 py-2 font-mono text-muted-foreground">
                                        {row.qty}
                                    </td>

                                    {/* Value */}
                                    <td className="px-3 py-2 max-w-[10rem] truncate">
                                        <ChangedCell
                                            value={row.value}
                                            change={snapshot ? null : (row.changes.value ?? null)}
                                            className={snapshot ? "" : cellHighlight(row, "value")}
                                        />
                                    </td>

                                    {/* Footprint — strip lib prefix for display */}
                                    <td className="px-3 py-2 max-w-[13rem] truncate font-mono text-[11px] text-muted-foreground">
                                        <ChangedCell
                                            value={row.footprint.split(":").pop() ?? row.footprint}
                                            change={snapshot || !row.changes.footprint ? null : {
                                                old: row.changes.footprint.old?.split(":").pop() ?? row.changes.footprint.old,
                                                new: row.changes.footprint.new?.split(":").pop() ?? row.changes.footprint.new,
                                            }}
                                            className={snapshot ? "" : cellHighlight(row, "footprint")}
                                        />
                                    </td>

                                    {/* MPN */}
                                    <td className="px-3 py-2 max-w-[9rem] truncate font-mono text-[11px]">
                                        <ChangedCell
                                            value={row.mpn}
                                            change={snapshot ? null : (row.changes.mpn ?? null)}
                                            className={snapshot ? "" : cellHighlight(row, "mpn")}
                                        />
                                    </td>

                                    {/* Manufacturer */}
                                    <td className="px-3 py-2 max-w-[9rem] truncate">
                                        <ChangedCell
                                            value={row.manufacturer}
                                            change={snapshot ? null : (row.changes.manufacturer ?? null)}
                                            className={snapshot ? "" : cellHighlight(row, "manufacturer")}
                                        />
                                    </td>

                                    {/* Description */}
                                    <td className="px-3 py-2 max-w-[14rem] truncate text-muted-foreground">
                                        <ChangedCell
                                            value={row.description}
                                            change={snapshot ? null : (row.changes.description ?? null)}
                                            className={snapshot ? "" : cellHighlight(row, "description")}
                                        />
                                    </td>

                                    {/* Datasheet */}
                                    <td className="px-3 py-2 max-w-[10rem]">
                                        {!snapshot && row.changes.datasheet
                                            ? <ChangedCell value={row.datasheet} change={row.changes.datasheet} />
                                            : <DatasheetLink url={row.datasheet} />
                                        }
                                    </td>

                                    {/* DNP */}
                                    <td className="px-3 py-2 text-center">
                                        {row.dnp && (
                                            <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-orange-500/20 text-orange-400">DNP</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {filteredRows.length === 0 && filter && (
                    <p className="text-xs text-muted-foreground italic px-4 py-4 text-center">No rows match "{filter}"</p>
                )}
            </div>
        </div>
    );
}
