import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { AlertCircle, CircuitBoard, Cpu, Layers, Loader2, Minus, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { categorise, CATEGORY_META, type Category, type DiffKind, type GroupableItem, type KindedItem } from "@/lib/diff-grouping";
import type { ECadViewerElement } from "@/types/ecad-viewer";

type DiffDomain = "schematic" | "pcb";
type ViewerSide = "old" | "new";
const OVERLAY_REFRESH_INTERVAL_MS = 16;

interface SourceFile {
    filename: string;
    old_content: string | null;
    new_content: string | null;
}

interface DiffItem extends GroupableItem {
    id: string;
    uuid?: string;
    x?: number | null;
    y?: number | null;
    sheet_file?: string;
    [key: string]: unknown;
}

interface ChangedItem {
    item: DiffItem;
    old_item: DiffItem;
    changes: Record<string, { old: unknown; new: unknown }>;
}

interface NormalizedDiff {
    added: DiffItem[];
    removed: DiffItem[];
    changed: ChangedItem[];
    summary: { added: number; removed: number; changed: number };
}

interface DomainPayload {
    files: SourceFile[];
    diff: NormalizedDiff;
}

interface ChangeAwareDiffPayload {
    schema: string;
    commit1: string;
    commit2: string;
    schematic: DomainPayload;
    pcb: DomainPayload;
}

interface ChangeMarker {
    kind: DiffKind;
    item: DiffItem;
    old_item?: DiffItem;
    changes?: Record<string, { old: unknown; new: unknown }>;
}

interface ChangeAwareDiffViewerProps {
    projectId: string;
    commit1: string;
    commit2: string;
    onClose: () => void;
}

interface ViewerFile {
    filename: string;
    content: string;
}

function buildViewerKey(domain: DiffDomain, side: ViewerSide, commit: string, files: ViewerFile[]) {
    const signature = files.map((file) => `${file.filename}:${file.content.length}`).join("|");
    return `change-aware:${domain}:${side}:${commit}:${signature}`;
}

function EcadViewerPane({
    title,
    viewerKey,
    files,
    viewerRef,
    onSheetLoaded,
    children,
}: {
    title: string;
    viewerKey: string;
    files: ViewerFile[];
    viewerRef: MutableRefObject<ECadViewerElement | null>;
    onSheetLoaded?: (page: string | null) => void;
    children?: ReactNode;
}) {
    const setViewerRef = useCallback((node: ECadViewerElement | null) => {
        viewerRef.current = node;
    }, [viewerRef]);

    useLayoutEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || files.length === 0) return;
        let cancelled = false;
        onSheetLoaded?.(null);
        const handleSheetLoaded = (event: Event) => {
            const page = sheetPageFromEvent(event);
            if (page) onSheetLoaded?.(page);
        };

        viewer.addEventListener("kicanvas:sheet:loaded", handleSheetLoaded);

        const hydrate = async () => {
            await customElements.whenDefined("ecad-blob");
            if (cancelled || !viewerRef.current) return;
            const activeViewer = viewerRef.current;
            activeViewer.querySelectorAll("ecad-blob").forEach((blob) => blob.remove());
            for (const file of files) {
                const blob = document.createElement("ecad-blob") as HTMLElement & {
                    filename?: string;
                    content?: string;
                };
                blob.filename = file.filename;
                blob.content = file.content;
                activeViewer.appendChild(blob);
            }
            const loadable = activeViewer as ECadViewerElement & { load_src?: () => Promise<void> | void };
            await loadable.load_src?.();
            activeViewer.setCrossProbeEnabled?.(true);
        };

        void hydrate();
        return () => {
            cancelled = true;
            viewer.removeEventListener("kicanvas:sheet:loaded", handleSheetLoaded);
        };
    }, [files, viewerKey, viewerRef, onSheetLoaded]);

    return (
        <section className="relative min-h-0 flex-1 overflow-hidden border-r last:border-r-0 bg-background">
            <div className="absolute left-3 top-3 z-20 rounded-md border bg-background/90 px-2 py-1 text-xs font-medium shadow-sm">
                {title}
            </div>
            <ecad-viewer
                key={viewerKey}
                ref={setViewerRef}
                style={{ width: "100%", height: "100%" }}
                show-header="true"
                header-sections="beginning,end"
            />
            {children}
        </section>
    );
}

function itemCoordinate(item: DiffItem | undefined) {
    if (!item) return null;
    if (typeof item.x !== "number" || typeof item.y !== "number") return null;
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) return null;
    return { x: item.x, y: item.y };
}

function sheetPageFromEvent(event: Event): string | null {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail === "string") return detail;
    if (!detail || typeof detail !== "object") return null;
    const row = detail as Record<string, unknown>;
    for (const key of ["filename", "sheetName", "page", "name"]) {
        const value = row[key];
        if (typeof value === "string" && value.trim()) return value;
    }
    return null;
}

function normalisePageId(value: string | null | undefined) {
    return (value ?? "").trim().replace(/\\/g, "/");
}

function pageBasename(value: string) {
    return value.split("/").pop() ?? value;
}

function pagesMatch(itemPage: string | null | undefined, currentPage: string | null | undefined) {
    const item = normalisePageId(itemPage);
    const current = normalisePageId(currentPage);
    if (!item || !current) return false;
    if (item === current) return true;
    return pageBasename(item) === pageBasename(current);
}

function itemLabel(item: DiffItem) {
    return item.reference || item.net_name || item.text || item.name || item.sheet_name || item.sheet_file || item.id || item.type;
}

function kindLabel(kind: DiffKind) {
    return kind === "added" ? "Added" : kind === "removed" ? "Removed" : "Changed";
}

function kindClass(kind: DiffKind) {
    if (kind === "added") return "border-green-500/50 text-green-500";
    if (kind === "removed") return "border-red-500/50 text-red-500";
    return "border-amber-500/50 text-amber-500";
}

function displayValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function jsonBlock(value: unknown) {
    try {
        return JSON.stringify(value ?? null, null, 2);
    } catch {
        return String(value);
    }
}

function markerIdentityFields(marker: ChangeMarker) {
    const item = marker.kind === "removed" ? marker.old_item ?? marker.item : marker.item;
    const keys = ["reference", "net_name", "text", "name", "type", "value", "footprint", "lib_id", "sheet_file", "layer", "x", "y", "uuid"];
    return keys
        .map((key) => ({ key, value: item[key] }))
        .filter((row) => row.value !== undefined && row.value !== null && row.value !== "");
}

function ChangeDetailsDialog({
    open,
    onOpenChange,
    marker,
    side,
    domain,
    commit1,
    commit2,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    marker: ChangeMarker | null;
    side: ViewerSide | null;
    domain: DiffDomain;
    commit1: string;
    commit2: string;
}) {
    if (!marker) {
        return null;
    }

    const label = itemLabel(marker.item);
    const sideLabel = side === "old" ? "Old" : "New";
    const domainLabel = domain === "schematic" ? "Schematic" : "PCB";
    const changedEntries = Object.entries(marker.changes ?? {});
    const primaryItem = marker.kind === "removed" ? marker.old_item ?? marker.item : marker.item;
    const location = primaryItem.sheet_file || primaryItem.layer;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[86vh] overflow-hidden p-0">
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle className="pr-8">
                        {kindLabel(marker.kind)} {label}
                    </DialogTitle>
                    <DialogDescription>
                        {domainLabel} / {sideLabel} view / {commit2.slice(0, 7)} {"->"} {commit1.slice(0, 7)}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[calc(86vh-6rem)]">
                    <div className="space-y-5 p-6">
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className={kindClass(marker.kind)}>
                                {kindLabel(marker.kind)}
                            </Badge>
                            <Badge variant="secondary">{primaryItem.type}</Badge>
                            <Badge variant="outline">{label}</Badge>
                            {location && <Badge variant="outline">{displayValue(location)}</Badge>}
                        </div>

                        <section className="space-y-3">
                            <div>
                                <h3 className="text-sm font-semibold">Summary</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {marker.kind === "added" && "Added in the new commit."}
                                    {marker.kind === "removed" && "Removed from the old commit."}
                                    {marker.kind === "changed" && `${changedEntries.length} field${changedEntries.length === 1 ? "" : "s"} changed.`}
                                </p>
                            </div>

                            {marker.kind === "changed" ? (
                                <div className="overflow-hidden rounded-md border">
                                    <div className="grid grid-cols-[minmax(8rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                                        <span>Field</span>
                                        <span>Old</span>
                                        <span>New</span>
                                    </div>
                                    {changedEntries.map(([field, diff]) => (
                                        <div
                                            key={field}
                                            className="grid grid-cols-[minmax(8rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] border-b px-3 py-2 text-sm last:border-b-0"
                                        >
                                            <span className="font-medium">{field}</span>
                                            <span className="break-words text-muted-foreground">{displayValue(diff.old)}</span>
                                            <span className="break-words">{displayValue(diff.new)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                                    {markerIdentityFields(marker).map(({ key, value }) => (
                                        <div key={key} className="min-w-0">
                                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key}</div>
                                            <div className="mt-1 break-words text-sm">{displayValue(value)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="space-y-3">
                            <h3 className="text-sm font-semibold">Raw Metadata</h3>
                            <div className="grid gap-3">
                                {[
                                    ["item", marker.item],
                                    ["old_item", marker.old_item ?? null],
                                    ["changes", marker.changes ?? null],
                                ].map(([title, value]) => (
                                    <details key={String(title)} className="rounded-md border">
                                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{String(title)}</summary>
                                        <ScrollArea className="max-h-56 border-t">
                                            <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs text-muted-foreground">
                                                {jsonBlock(value)}
                                            </pre>
                                        </ScrollArea>
                                    </details>
                                ))}
                            </div>
                        </section>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

function changeMarkers(diff: NormalizedDiff): ChangeMarker[] {
    return [
        ...diff.added.map((item) => ({ kind: "added" as const, item })),
        ...diff.removed.map((item) => ({ kind: "removed" as const, item })),
        ...diff.changed.map((item) => ({ kind: "changed" as const, ...item })),
    ];
}

function OverlayPins({
    markers,
    side,
    domain,
    currentPage,
    viewerRef,
    selectedId,
    onSelect,
}: {
    markers: ChangeMarker[];
    side: ViewerSide;
    domain: DiffDomain;
    currentPage: string | null;
    viewerRef: MutableRefObject<ECadViewerElement | null>;
    selectedId: string | null;
    onSelect: (marker: ChangeMarker) => void;
}) {
    const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

    const updatePositions = useCallback(() => {
        const viewer = viewerRef.current;
        if (!viewer?.getScreenLocation) return;
        const next: Record<string, { x: number; y: number }> = {};
        for (const marker of markers) {
            const item = side === "old" ? marker.old_item ?? marker.item : marker.item;
            if (domain === "schematic" && !pagesMatch(item.sheet_file, currentPage)) continue;
            const coord = itemCoordinate(item);
            if (!coord) continue;
            const screen = viewer.getScreenLocation(coord.x, coord.y);
            if (screen) next[item.id] = screen;
        }
        setPositions(next);
    }, [currentPage, domain, markers, side, viewerRef]);

    useEffect(() => {
        updatePositions();
        const viewer = viewerRef.current;
        if (!viewer) return;
        const handler = () => requestAnimationFrame(updatePositions);
        viewer.addEventListener("kicanvas:mousemove", handler);
        viewer.addEventListener("panzoom", handler);
        viewer.addEventListener("mouseup", handler);
        viewer.addEventListener("wheel", handler);
        viewer.addEventListener("kicanvas:sheet:loaded", handler);
        window.addEventListener("resize", handler);
        const interval = window.setInterval(updatePositions, OVERLAY_REFRESH_INTERVAL_MS);
        return () => {
            viewer.removeEventListener("kicanvas:mousemove", handler);
            viewer.removeEventListener("panzoom", handler);
            viewer.removeEventListener("mouseup", handler);
            viewer.removeEventListener("wheel", handler);
            viewer.removeEventListener("kicanvas:sheet:loaded", handler);
            window.removeEventListener("resize", handler);
            window.clearInterval(interval);
        };
    }, [updatePositions, viewerRef]);

    return (
        <div className="pointer-events-none absolute inset-0 z-10">
            {markers.map((marker) => {
                const item = side === "old" ? marker.old_item ?? marker.item : marker.item;
                if (domain === "schematic" && !pagesMatch(item.sheet_file, currentPage)) return null;
                const position = positions[item.id];
                if (!position) return null;
                return (
                    <button
                        key={`${side}-${marker.kind}-${item.id}`}
                        type="button"
                        className={cn(
                            "pointer-events-auto absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background shadow-sm",
                            marker.kind === "added" && "border-green-500",
                            marker.kind === "removed" && "border-red-500",
                            marker.kind === "changed" && "border-amber-500",
                            selectedId === item.id && "ring-2 ring-ring ring-offset-2 ring-offset-background"
                        )}
                        style={{ left: position.x, top: position.y }}
                        aria-label={`Select ${itemLabel(item)}`}
                        onClick={() => onSelect(marker)}
                    />
                );
            })}
        </div>
    );
}

function sourcesFor(files: SourceFile[], side: ViewerSide): ViewerFile[] {
    return files
        .map((file) => ({
            filename: file.filename,
            content: side === "old" ? file.old_content : file.new_content,
        }))
        .filter((file): file is ViewerFile => typeof file.content === "string" && file.content.length > 0);
}

function SummaryPill({
    label,
    value,
    kind,
    active,
    onClick,
}: {
    label: string;
    value: number;
    kind: DiffKind;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors",
                active ? "bg-background text-foreground" : "bg-muted/40 text-muted-foreground opacity-60"
            )}
            aria-pressed={active}
        >
            {kind === "added" && <Plus className="h-3 w-3 text-green-500" />}
            {kind === "removed" && <Minus className="h-3 w-3 text-red-500" />}
            {kind === "changed" && <RefreshCw className="h-3 w-3 text-amber-500" />}
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold text-foreground">{value}</span>
        </button>
    );
}

function focusViewerOnItem(viewer: ECadViewerElement | null, item: DiffItem | undefined, domain: DiffDomain) {
    if (!viewer || !item) return;
    const coord = itemCoordinate(item);
    const reference = item.reference;
    if (domain === "schematic" && item.sheet_file) {
        viewer.switchPage?.(item.sheet_file);
    }

    const runFocus = (attempt = 0) => {
        if (coord) {
            viewer.zoomToLocation?.(coord.x, coord.y);
        }
        if (reference) {
            const result = viewer.requestCrossProbe?.({
                sourceContext: domain === "schematic" ? "SCH" : "PCB",
                targetContext: domain === "schematic" ? "SCH" : "PCB",
                mode: "select",
                kind: "designator",
                value: reference,
                designator: reference,
            });
            if (
                result &&
                !result.resolved &&
                result.reason === "target-not-available" &&
                attempt < 12
            ) {
                window.setTimeout(() => runFocus(attempt + 1), 120);
            }
        }
    };

    if (domain === "schematic" && item.sheet_file) {
        window.setTimeout(() => runFocus(), 120);
    } else {
        runFocus();
    }
}

export function ChangeAwareDiffViewer({ projectId, commit1, commit2, onClose }: ChangeAwareDiffViewerProps) {
    const [payload, setPayload] = useState<ChangeAwareDiffPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [domain, setDomain] = useState<DiffDomain>("schematic");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [visibleKinds, setVisibleKinds] = useState<Record<DiffKind, boolean>>({
        added: true,
        removed: true,
        changed: true,
    });
    const [activePages, setActivePages] = useState<Record<ViewerSide, string | null>>({
        old: null,
        new: null,
    });
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [selectedMarker, setSelectedMarker] = useState<ChangeMarker | null>(null);
    const [selectedMarkerSide, setSelectedMarkerSide] = useState<ViewerSide | null>(null);
    const oldViewerRef = useRef<ECadViewerElement | null>(null);
    const newViewerRef = useRef<ECadViewerElement | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ commit1, commit2 });
        fetch(`/api/projects/${projectId}/change-aware-diff?${params}`, { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    throw new Error(body?.detail || `HTTP ${response.status}`);
                }
                return response.json() as Promise<ChangeAwareDiffPayload>;
            })
            .then((data) => {
                if (controller.signal.aborted) return;
                setPayload(data);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setError(err instanceof Error ? err.message : "Failed to load semantic diff");
                setLoading(false);
            });
        return () => controller.abort();
    }, [projectId, commit1, commit2]);

    const activePayload = payload?.[domain] ?? null;
    const allMarkers = useMemo(() => activePayload ? changeMarkers(activePayload.diff) : [], [activePayload]);
    const markers = useMemo(
        () => allMarkers.filter((marker) => visibleKinds[marker.kind]),
        [allMarkers, visibleKinds]
    );
    const groups = useMemo(() => {
        const input: KindedItem<DiffItem>[] = markers.map((marker) => ({ kind: marker.kind, item: marker.item }));
        return categorise(input);
    }, [markers]);
    const groupedSections = useMemo(() => {
        const sections = new Map<Category, typeof groups>();
        for (const group of groups) {
            const key = group.category;
            const existing = sections.get(key) ?? [];
            existing.push(group);
            sections.set(key, existing);
        }
        return Array.from(sections.entries()).map(([category, categoryGroups]) => ({
            category,
            groups: categoryGroups,
            count: categoryGroups.reduce((total, group) => total + group.members.length, 0),
        }));
    }, [groups]);
    const oldFiles = useMemo(() => activePayload ? sourcesFor(activePayload.files, "old") : [], [activePayload]);
    const newFiles = useMemo(() => activePayload ? sourcesFor(activePayload.files, "new") : [], [activePayload]);

    const setActivePageForSide = useCallback((side: ViewerSide, page: string | null) => {
        setActivePages((current) => current[side] === page ? current : { ...current, [side]: page });
    }, []);
    const handleOldSheetLoaded = useCallback((page: string | null) => {
        setActivePageForSide("old", page);
    }, [setActivePageForSide]);
    const handleNewSheetLoaded = useCallback((page: string | null) => {
        setActivePageForSide("new", page);
    }, [setActivePageForSide]);

    const focusMarker = useCallback((marker: ChangeMarker) => {
        setSelectedId(marker.item.id);
        focusViewerOnItem(newViewerRef.current, marker.item, domain);
        focusViewerOnItem(oldViewerRef.current, marker.old_item ?? marker.item, domain);
    }, [domain]);
    const openMarkerDetails = useCallback((marker: ChangeMarker, side: ViewerSide) => {
        focusMarker(marker);
        setSelectedMarker(marker);
        setSelectedMarkerSide(side);
        setDetailsOpen(true);
    }, [focusMarker]);

    useEffect(() => {
        if (!detailsOpen || !selectedMarker) return;
        const currentMarker = markers.find((marker) =>
            marker.kind === selectedMarker.kind &&
            marker.item.id === selectedMarker.item.id
        );
        if (!currentMarker) {
            setDetailsOpen(false);
            setSelectedMarker(null);
            setSelectedMarkerSide(null);
            return;
        }
        if (domain === "schematic" && selectedMarkerSide) {
            const item = selectedMarkerSide === "old"
                ? currentMarker.old_item ?? currentMarker.item
                : currentMarker.item;
            if (!pagesMatch(item.sheet_file, activePages[selectedMarkerSide])) {
                setDetailsOpen(false);
                setSelectedMarker(null);
                setSelectedMarkerSide(null);
                return;
            }
        }
        if (currentMarker !== selectedMarker) {
            setSelectedMarker(currentMarker);
        }
    }, [activePages, detailsOpen, domain, markers, selectedMarker, selectedMarkerSide]);

    const setDomainAndCloseDetails = useCallback((nextDomain: DiffDomain) => {
        setDomain(nextDomain);
        setDetailsOpen(false);
        setSelectedMarker(null);
        setSelectedMarkerSide(null);
    }, []);

    const summary = activePayload?.diff.summary ?? { added: 0, removed: 0, changed: 0 };
    const toggleKind = useCallback((kind: DiffKind) => {
        setVisibleKinds((current) => ({ ...current, [kind]: !current[kind] }));
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
            <header className="flex min-h-14 items-center gap-3 border-b px-3">
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close diff viewer">
                    <X className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-semibold">Change-Aware Diff</h2>
                        <Badge variant="outline" className="font-mono">
                            {commit2.slice(0, 7)} {"->"} {commit1.slice(0, 7)}
                        </Badge>
                    </div>
                </div>
                <div className="flex rounded-md border p-1">
                    <Button
                        variant={domain === "schematic" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setDomainAndCloseDetails("schematic")}
                    >
                        <CircuitBoard className="mr-2 h-4 w-4" />
                        Schematic
                    </Button>
                    <Button
                        variant={domain === "pcb" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setDomainAndCloseDetails("pcb")}
                    >
                        <Cpu className="mr-2 h-4 w-4" />
                        PCB
                    </Button>
                </div>
            </header>

            {loading && (
                <div className="flex flex-1 items-center justify-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading semantic diff...
                </div>
            )}

            {!loading && error && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-destructive">
                    <AlertCircle className="h-8 w-8" />
                    <div>
                        <p className="font-semibold">Diff failed</p>
                        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{error}</p>
                    </div>
                </div>
            )}

            {!loading && !error && activePayload && (
                <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="min-h-0 border-r bg-muted/20">
                        <div className="space-y-3 border-b p-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <Layers className="h-3.5 w-3.5" />
                                Semantic Changes
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <SummaryPill label="Added" value={summary.added} kind="added" active={visibleKinds.added} onClick={() => toggleKind("added")} />
                                <SummaryPill label="Removed" value={summary.removed} kind="removed" active={visibleKinds.removed} onClick={() => toggleKind("removed")} />
                                <SummaryPill label="Changed" value={summary.changed} kind="changed" active={visibleKinds.changed} onClick={() => toggleKind("changed")} />
                            </div>
                        </div>
                        <ScrollArea className="h-[calc(100vh-8.5rem)]">
                            <div className="space-y-4 p-3">
                                {groups.length === 0 && (
                                    <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
                                        No semantic changes detected for this view.
                                    </p>
                                )}
                                {groupedSections.map((section) => (
                                    <section key={section.category} className="space-y-1">
                                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            <span>{CATEGORY_META[section.category].label}</span>
                                            <span>{section.count}</span>
                                        </div>
                                        {section.groups.flatMap((group) => group.members).map((member) => {
                                            const marker = markers.find((item) => item.item.id === member.item.id);
                                            if (!marker) return null;
                                            return (
                                                <button
                                                    key={`${member.kind}-${member.item.id}`}
                                                    type="button"
                                                    onClick={() => focusMarker(marker)}
                                                    className={cn(
                                                        "w-full rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                                                        selectedId === member.item.id && "border-primary bg-primary/5"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                            "text-xs font-semibold",
                                                            member.kind === "added" && "text-green-500",
                                                            member.kind === "removed" && "text-red-500",
                                                            member.kind === "changed" && "text-amber-500"
                                                        )}>
                                                            {member.kind === "added" ? "+" : member.kind === "removed" ? "-" : "~"}
                                                        </span>
                                                        <span className="min-w-0 flex-1 truncate font-medium">{itemLabel(member.item)}</span>
                                                    </div>
                                                    {marker.changes && Object.keys(marker.changes).length > 0 && (
                                                        <p className="mt-1 truncate text-xs text-muted-foreground">
                                                            {Object.keys(marker.changes).join(", ")}
                                                        </p>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </section>
                                ))}
                            </div>
                        </ScrollArea>
                    </aside>
                    <main className="min-h-0">
                        {(oldFiles.length === 0 && newFiles.length === 0) ? (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                No {domain === "schematic" ? "schematic" : "PCB"} source files found at these commits.
                            </div>
                        ) : (
                            <div className="flex h-full min-h-0">
                                <EcadViewerPane
                                    title="Old"
                                    viewerKey={buildViewerKey(domain, "old", commit2, oldFiles)}
                                    files={oldFiles}
                                    viewerRef={oldViewerRef}
                                    onSheetLoaded={handleOldSheetLoaded}
                                >
                                    <OverlayPins
                                        markers={markers}
                                        side="old"
                                        domain={domain}
                                        currentPage={activePages.old}
                                        viewerRef={oldViewerRef}
                                        selectedId={selectedId}
                                        onSelect={(marker) => openMarkerDetails(marker, "old")}
                                    />
                                </EcadViewerPane>
                                <EcadViewerPane
                                    title="New"
                                    viewerKey={buildViewerKey(domain, "new", commit1, newFiles)}
                                    files={newFiles}
                                    viewerRef={newViewerRef}
                                    onSheetLoaded={handleNewSheetLoaded}
                                >
                                    <OverlayPins
                                        markers={markers}
                                        side="new"
                                        domain={domain}
                                        currentPage={activePages.new}
                                        viewerRef={newViewerRef}
                                        selectedId={selectedId}
                                        onSelect={(marker) => openMarkerDetails(marker, "new")}
                                    />
                                </EcadViewerPane>
                            </div>
                        )}
                    </main>
                </div>
            )}
            <ChangeDetailsDialog
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
                marker={selectedMarker}
                side={selectedMarkerSide}
                domain={domain}
                commit1={commit1}
                commit2={commit2}
            />
        </div>
    );
}
