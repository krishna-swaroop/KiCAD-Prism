import { lazy, Suspense, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Cpu, Box, FileText, List, MessageSquarePlus, MessageSquare, GitBranch, CircuitBoard, Link2, Copy, Check, RefreshCw, Layers, LayoutList } from "lucide-react";
import { BomDiffViewer } from "./bom-diff-viewer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CommentOverlay } from "./comment-overlay";
import { CommentForm } from "./comment-form";
import { CommentPanel } from "./comment-panel";
import { fetchApi } from "@/lib/api";
import { IBOM_ENABLED_KEY } from "./settings-dialog";
import type { User } from "@/types/auth";
import type { Comment, CommentContext } from "@/types/comments";
import type {
    CrossProbeContext,
    ECadViewerElement,
    KiCanvasSelectDetail,
} from "@/types/ecad-viewer";
import {
    COMMON_HOTKEYS,
    EcadInfoPanel,
    EcadViewerHost,
    HotkeysLegend,
    useBoardClickFix,
    useEcadInfoPanel,
    useViewerHotkeys,
} from "./ecad-viewer-shared";

const Model3DViewer = lazy(() =>
    import("./model-3d-viewer").then((module) => ({ default: module.Model3DViewer }))
);

const GerberViewer = lazy(() =>
    import("./gerber-viewer").then((module) => ({ default: module.GerberViewer }))
);

interface VisualizerProps {
    projectId: string;
    user: User | null;
    commit?: string | null;
}

// ---------------------------------------------------------------------------
// Diff overlay types (mirrors schematic-diff-viewer, kept local to avoid coupling)
// ---------------------------------------------------------------------------

interface DiffItem {
    type: string;
    uuid: string;
    x: number;
    y: number;
    // schematic fields
    reference?: string;
    value?: string;
    text?: string;
    sheet_name?: string;
    // pcb fields
    layer?: string;
    net_name?: string;
    name?: string;
}
interface DiffChangedItem { item: DiffItem; changes: Record<string, { old: unknown; new: unknown }>; }
interface DiffSet { added: DiffItem[]; removed: DiffItem[]; changed: DiffChangedItem[]; }
interface SchDiffSheet { filename: string; new_content: string | null; old_content: string | null; diff: DiffSet; }
interface SchDiffData { commit1: string; commit2: string; sheets: SchDiffSheet[]; }
interface PcbDiffBoard { filename: string; new_content: string | null; old_content: string | null; diff: DiffSet; }
interface PcbDiffData { commit1: string; commit2: string; boards: PcbDiffBoard[]; }
interface DiffMarker { kind: "added" | "removed" | "changed"; item: DiffItem; }

const DIFF_KIND_COLOR: Record<DiffMarker["kind"], string> = {
    added: "#22c55e",
    removed: "#ef4444",
    changed: "#f59e0b",
};

function _diffBoxHalfExtent(type: string): { hw: number; hh: number } {
    switch (type) {
        case "symbol":    return { hw: 5,   hh: 4   };
        case "sheet":     return { hw: 6,   hh: 5   };
        case "footprint": return { hw: 3,   hh: 3   };
        case "zone":      return { hw: 8,   hh: 8   };
        case "via":       return { hw: 0.6, hh: 0.6 };
        default:          return { hw: 3,   hh: 1.5 };
    }
}

// Reusable diff overlay — identical logic to schematic-diff-viewer's DiffOverlay
function CommitDiffOverlay({ markers, viewerRef }: {
    markers: DiffMarker[];
    viewerRef: React.RefObject<ECadViewerElement | null>;
}) {
    const boxRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const loopRef = useRef<number | null>(null);
    const draggingRef = useRef(false);

    const updatePositions = useCallback(() => {
        const viewer = viewerRef.current;
        if (!viewer?.getScreenLocation) return;
        try {
            const rect = viewer.getBoundingClientRect();
            for (const m of markers) {
                const el = boxRefs.current.get(m.item.uuid);
                if (!el) continue;
                const { hw, hh } = _diffBoxHalfExtent(m.item.type);
                const tl = viewer.getScreenLocation(m.item.x - hw, m.item.y - hh);
                const br = viewer.getScreenLocation(m.item.x + hw, m.item.y + hh);
                if (!tl || !br) { el.style.display = "none"; continue; }
                const left = Math.min(tl.x, br.x);
                const top  = Math.min(tl.y, br.y);
                const w    = Math.abs(br.x - tl.x);
                const h    = Math.abs(br.y - tl.y);
                const vis  = left + w > 0 && left < rect.width && top + h > 0 && top < rect.height;
                el.style.display = vis ? "" : "none";
                if (vis) { el.style.left = `${left}px`; el.style.top = `${top}px`; el.style.width = `${w}px`; el.style.height = `${h}px`; }
            }
        } catch { /* viewer transiently unavailable */ }
    }, [viewerRef, markers]);

    const runLoop = useCallback(() => {
        updatePositions();
        if (draggingRef.current) loopRef.current = requestAnimationFrame(runLoop);
        else loopRef.current = null;
    }, [updatePositions]);

    const startLoop = useCallback(() => {
        if (loopRef.current === null) loopRef.current = requestAnimationFrame(runLoop);
    }, [runLoop]);

    useEffect(() => {
        const onDown = () => { draggingRef.current = true; startLoop(); };
        const onUp   = () => { draggingRef.current = false; startLoop(); };
        window.addEventListener("mousedown", onDown);
        window.addEventListener("mouseup",   onUp);
        window.addEventListener("wheel", startLoop, { passive: true });
        window.addEventListener("resize", onUp);
        startLoop();
        return () => {
            window.removeEventListener("mousedown", onDown);
            window.removeEventListener("mouseup",   onUp);
            window.removeEventListener("wheel", startLoop);
            window.removeEventListener("resize", onUp);
            if (loopRef.current !== null) cancelAnimationFrame(loopRef.current);
        };
    }, [startLoop]);

    useEffect(() => { startLoop(); }, [markers, startLoop]);

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 15 }}>
            {markers.map((m) => (
                <div
                    key={m.item.uuid}
                    ref={(node) => { if (node) boxRefs.current.set(m.item.uuid, node); else boxRefs.current.delete(m.item.uuid); }}
                    className="absolute"
                    style={{
                        display: "none",
                        border: `2px solid ${DIFF_KIND_COLOR[m.kind]}`,
                        borderRadius: 3,
                        backgroundColor: `${DIFF_KIND_COLOR[m.kind]}22`,
                    }}
                />
            ))}
        </div>
    );
}

type VisualizerTab = "sch" | "pcb" | "3d" | "ibom" | "bom" | "gerber" | "stackup";

interface CommentsSourceUrls {
    project_id: string;
    project_name: string;
    base_url: string;
    list_url: string;
    patch_url_template: string;
    reply_url_template: string;
    delete_url_template: string;
}

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

interface StackupLayer {
    name: string;
    type: string;
    thickness: number | null;
    material: string | null;
    epsilon_r: number | null;
    loss_tangent: number | null;
    color: string | null;
}

interface StackupData {
    has_stackup: boolean;
    board_thickness: number | null;
    copper_finish: string | null;
    edge_connector: string | null;
    castellated_pads: boolean;
    edge_plating: boolean;
    layers: StackupLayer[];
}

interface StackupLayerChanges {
    [prop: string]: { old: unknown; new: unknown };
}

interface StackupLayerDiff {
    added: StackupLayer[];
    removed: StackupLayer[];
    changed: { name: string; old: StackupLayer; new: StackupLayer; changes: StackupLayerChanges }[];
    reordered: { name: string; old_index: number; new_index: number }[];
}

interface StackupBoardDiff {
    [prop: string]: { old: unknown; new: unknown };
}

interface StackupDiff {
    commit1: string;
    commit2: string;
    new_stackup: StackupData;
    old_stackup: StackupData;
    layer_diff: StackupLayerDiff;
    board_diff: StackupBoardDiff;
}

const CROSS_PROBE_MAX_RETRIES = 12;
const CROSS_PROBE_RETRY_DELAY_MS = 120;

type ViewerBlobSource = {
    filename: string;
    content: string;
};

const buildViewerKey = (
    kind: "schematic" | "pcb",
    projectId: string,
    commit: string | null | undefined,
    sources: ViewerBlobSource[],
) => {
    const signature = sources
        .map(({ filename, content }) => `${filename}:${content.length}`)
        .join("|");
    return `${kind}:${projectId}:${commit ?? "latest"}:${signature}`;
};


function layerVisualColor(layerType: string): string {
    const t = layerType.toLowerCase();
    if (t === "copper") return "#c8a84b";
    if (t.includes("silk")) return "#f0f0f0";
    if (t.includes("mask")) return "#2d7040";
    if (t.includes("paste")) return "#888";
    if (t === "core") return "#d4b896";
    if (t === "prepreg") return "#c9a87a";
    return "#a0c8a0";
}

function layerDisplayType(layerType: string): string {
    const t = layerType.toLowerCase();
    if (t === "copper") return "Copper";
    if (t === "core") return "Core";
    if (t === "prepreg") return "Prepreg";
    if (t.includes("silk")) return "Silk Screen";
    if (t.includes("mask")) return "Solder Mask";
    if (t.includes("paste")) return "Solder Paste";
    return layerType;
}

const DIFF_ADDED   = "bg-green-500/15 border-l-2 border-green-500";
const DIFF_REMOVED = "bg-red-500/15 border-l-2 border-red-500";
const DIFF_CHANGED = "bg-amber-500/15 border-l-2 border-amber-500";

function DiffBadge({ kind }: { kind: "added" | "removed" | "changed" | "reordered" }) {
    const styles: Record<string, string> = {
        added:     "bg-green-500/20 text-green-600 dark:text-green-400",
        removed:   "bg-red-500/20 text-red-600 dark:text-red-400",
        changed:   "bg-amber-500/20 text-amber-600 dark:text-amber-400",
        reordered: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    };
    const labels: Record<string, string> = { added: "+added", removed: "−removed", changed: "~changed", reordered: "↕ moved" };
    return (
        <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${styles[kind]}`}>
            {labels[kind]}
        </span>
    );
}

function fmt(v: unknown): string {
    if (v == null) return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "number") return String(v);
    return String(v);
}

function StackupPanel({ data, error, loaded, diff, inCommitView }: {
    data: StackupData | null;
    error: string | null;
    loaded: boolean;
    diff: StackupDiff | null;
    inCommitView: boolean;
}) {
    if (!loaded && !inCommitView && !diff) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Loading stackup...</p>
            </div>
        );
    }

    // In commit view, use the new_stackup from diff if we don't have a direct stackup load
    const displayData: StackupData | null = data ?? (diff?.new_stackup ?? null);

    if (error && !displayData) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>{error}</p>
            </div>
        );
    }

    if (!displayData) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>No stackup data available.</p>
            </div>
        );
    }

    const ld = diff?.layer_diff ?? null;
    const bd = diff?.board_diff ?? null;
    const addedNames   = new Set(ld?.added.map(l => l.name) ?? []);
    const removedNames = new Set(ld?.removed.map(l => l.name) ?? []);
    const changedNames = new Set(ld?.changed.map(l => l.name) ?? []);
    const reorderedNames = new Set(ld?.reordered.map(l => l.name) ?? []);
    const changedMap   = new Map(ld?.changed.map(l => [l.name, l.changes]) ?? []);
    const reorderedMap = new Map(ld?.reordered.map(l => [l.name, l]) ?? []);

    // In commit view show new layers merged with removed ones (appended at bottom with strike)
    const layers = displayData.layers;
    const removedLayers = ld?.removed ?? [];

    const totalThickness = layers.reduce((sum, l) => sum + (l.thickness ?? 0), 0);
    const displayThickness = displayData.board_thickness ?? (totalThickness > 0 ? totalThickness : null);

    type PropRow = { label: string; value: string; propKey: string };
    const extraProps: PropRow[] = [];
    if (displayData.copper_finish) extraProps.push({ label: "Copper finish", value: displayData.copper_finish, propKey: "copper_finish" });
    extraProps.push({ label: "Edge connector",    value: displayData.edge_connector && displayData.edge_connector !== "no" ? displayData.edge_connector : "No", propKey: "edge_connector" });
    extraProps.push({ label: "Castellated pads",  value: displayData.castellated_pads ? "Yes" : "No", propKey: "castellated_pads" });
    extraProps.push({ label: "Plated board edge", value: displayData.edge_plating ? "Yes" : "No", propKey: "edge_plating" });

    return (
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
            {/* Thickness + warning */}
            <div>
                {!displayData.has_stackup && (
                    <p className="text-xs text-amber-500">
                        No explicit stackup in PCB file — showing estimated layer structure.
                    </p>
                )}
                {displayThickness != null && (
                    <p className="text-xs text-muted-foreground">
                        Total thickness:{" "}
                        <span className="font-medium text-foreground">{displayThickness.toFixed(3)} mm</span>
                        {bd?.board_thickness && (
                            <span className="ml-2 text-muted-foreground line-through">{fmt(bd.board_thickness.old)} mm</span>
                        )}
                    </p>
                )}
            </div>

            {/* Cross-section diagram — new state with diff badges */}
            {layers.length > 0 && (
                <div className="flex">
                    <div className="flex-1 border rounded overflow-hidden">
                        {layers.map((layer, i) => {
                            const color = layerVisualColor(layer.type);
                            const t = layer.type.toLowerCase();
                            const isThin = t.includes("silk") || t.includes("paste");
                            const isMask = t.includes("mask");
                            const isCopper = t === "copper";
                            const heightPx = isThin ? 10 : isMask ? 18 : isCopper ? 30 : 56;
                            const isAdded    = addedNames.has(layer.name);
                            const isChanged  = changedNames.has(layer.name);
                            const isReordered = reorderedNames.has(layer.name);
                            const overlay = isAdded ? "ring-2 ring-inset ring-green-500" : isChanged ? "ring-2 ring-inset ring-amber-500" : isReordered ? "ring-2 ring-inset ring-blue-500" : "";
                            return (
                                <div
                                    key={i}
                                    className={`flex items-center px-4 relative ${overlay}`}
                                    style={{ backgroundColor: color, height: heightPx }}
                                    title={`${layer.name} — ${layer.type}${layer.thickness ? ` — ${layer.thickness} mm` : ""}`}
                                >
                                    <span className="text-[11px] font-medium select-none truncate leading-none" style={{ color: "rgba(0,0,0,0.65)" }}>
                                        {layer.name}{layer.thickness ? ` — ${layer.thickness} mm` : ""}
                                        {isAdded && <span className="ml-2 text-[9px] font-bold">+NEW</span>}
                                        {isChanged && <span className="ml-2 text-[9px] font-bold">~</span>}
                                        {isReordered && <span className="ml-2 text-[9px] font-bold">↕</span>}
                                    </span>
                                </div>
                            );
                        })}
                        {/* Removed layers shown at bottom in red */}
                        {removedLayers.map((layer, i) => {
                            const color = layerVisualColor(layer.type);
                            const t = layer.type.toLowerCase();
                            const isThin = t.includes("silk") || t.includes("paste");
                            const isMask = t.includes("mask");
                            const isCopper = t === "copper";
                            const heightPx = isThin ? 10 : isMask ? 18 : isCopper ? 30 : 56;
                            return (
                                <div
                                    key={`removed-${i}`}
                                    className="flex items-center px-4 relative ring-2 ring-inset ring-red-500 opacity-50"
                                    style={{ backgroundColor: color, height: heightPx }}
                                    title={`REMOVED: ${layer.name}`}
                                >
                                    <span className="text-[11px] font-medium select-none truncate leading-none line-through" style={{ color: "rgba(0,0,0,0.65)" }}>
                                        {layer.name}{layer.thickness ? ` — ${layer.thickness} mm` : ""}
                                        <span className="ml-2 text-[9px] font-bold no-underline">−REMOVED</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Detail Table */}
            {layers.length > 0 && (
                <div className="rounded border overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b bg-muted/30 text-muted-foreground uppercase tracking-wider">
                                <th className="text-left px-3 py-2 font-medium">Layer</th>
                                <th className="text-left px-3 py-2 font-medium">Type</th>
                                <th className="text-right px-3 py-2 font-medium">mm</th>
                                <th className="text-left px-3 py-2 font-medium">Material</th>
                                <th className="text-right px-3 py-2 font-medium">εr</th>
                                <th className="text-right px-3 py-2 font-medium">tan δ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {layers.map((layer, i) => {
                                const isAdded    = addedNames.has(layer.name);
                                const isRemoved  = removedNames.has(layer.name);
                                const isChanged  = changedNames.has(layer.name);
                                const isReordered = reorderedNames.has(layer.name);
                                const changes    = changedMap.get(layer.name) ?? {};
                                const rowClass   = isAdded ? DIFF_ADDED : isRemoved ? DIFF_REMOVED : isChanged ? DIFF_CHANGED : "";
                                return (
                                    <tr key={i} className={`border-b last:border-0 hover:bg-muted/20 ${rowClass}`}>
                                        <td className="px-3 py-1.5 font-mono">
                                            <span
                                                className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle shrink-0"
                                                style={{ backgroundColor: layerVisualColor(layer.type) }}
                                            />
                                            {layer.name}
                                            {isAdded    && <DiffBadge kind="added" />}
                                            {isRemoved  && <DiffBadge kind="removed" />}
                                            {isChanged  && <DiffBadge kind="changed" />}
                                            {isReordered && !isChanged && <DiffBadge kind="reordered" />}
                                            {isReordered && !isChanged && (
                                                <span className="text-blue-500 ml-1">
                                                    ({reorderedMap.get(layer.name)!.old_index + 1}→{reorderedMap.get(layer.name)!.new_index + 1})
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-1.5 text-muted-foreground">{layerDisplayType(layer.type)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">
                                            {layer.thickness != null ? layer.thickness.toFixed(4) : "—"}
                                            {"thickness" in changes && (
                                                <span className="block text-muted-foreground line-through text-[10px]">{fmt(changes.thickness.old)}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-1.5 text-muted-foreground">
                                            {layer.material ?? "—"}
                                            {"material" in changes && (
                                                <span className="block line-through text-[10px]">{fmt(changes.material.old)}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                            {layer.epsilon_r != null ? layer.epsilon_r : "—"}
                                            {"epsilon_r" in changes && (
                                                <span className="block line-through text-[10px]">{fmt(changes.epsilon_r.old)}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                            {layer.loss_tangent != null ? layer.loss_tangent : "—"}
                                            {"loss_tangent" in changes && (
                                                <span className="block line-through text-[10px]">{fmt(changes.loss_tangent.old)}</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {/* Removed layers in table */}
                            {removedLayers.map((layer, i) => (
                                <tr key={`removed-${i}`} className={`border-b last:border-0 ${DIFF_REMOVED} opacity-60`}>
                                    <td className="px-3 py-1.5 font-mono line-through">
                                        <span
                                            className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle shrink-0"
                                            style={{ backgroundColor: layerVisualColor(layer.type) }}
                                        />
                                        {layer.name}
                                        <DiffBadge kind="removed" />
                                    </td>
                                    <td className="px-3 py-1.5 text-muted-foreground line-through">{layerDisplayType(layer.type)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums line-through">{layer.thickness != null ? layer.thickness.toFixed(4) : "—"}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground line-through">{layer.material ?? "—"}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground line-through">{layer.epsilon_r != null ? layer.epsilon_r : "—"}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground line-through">{layer.loss_tangent != null ? layer.loss_tangent : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Board properties — single compact column */}
            <div className="space-y-1 text-xs">
                {extraProps.map(({ label, value, propKey }) => {
                    const changed = bd && propKey in bd;
                    return (
                        <div key={label} className="flex gap-2 items-baseline">
                            <span className="text-muted-foreground whitespace-nowrap">{label}</span>
                            <span className={`font-medium ${changed ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</span>
                            {changed && (
                                <span className="text-muted-foreground line-through text-[10px]">{fmt(bd[propKey].old)}</span>
                            )}
                            {changed && <DiffBadge kind="changed" />}
                        </div>
                    );
                })}
            </div>

            {layers.length === 0 && (
                <p className="text-xs text-muted-foreground">No layer data found in the PCB file.</p>
            )}
        </div>
    );
}

export function Visualizer({ projectId, user, commit }: VisualizerProps) {
    const [schematicViewerElement, setSchematicViewerElement] = useState<ECadViewerElement | null>(null);
    const [pcbViewerElement, setPcbViewerElement] = useState<ECadViewerElement | null>(null);
    const schematicViewerRef = useRef<ECadViewerElement | null>(null);
    const pcbViewerRef = useRef<ECadViewerElement | null>(null);

    // Callback refs to sync state and refs
    const setSchematicViewerRef = useCallback((node: ECadViewerElement | null) => {
        schematicViewerRef.current = node;
        setSchematicViewerElement(node);
    }, []);

    const setPcbViewerRef = useCallback((node: ECadViewerElement | null) => {
        pcbViewerRef.current = node;
        setPcbViewerElement(node);
    }, []);

    const [activeTab, setActiveTab] = useState<VisualizerTab>("sch");
    const [schematicContent, setSchematicContent] = useState<string | null>(null);
    const [subsheets, setSubsheets] = useState<{ filename: string, content: string }[]>([]);
    const [pcbContent, setPcbContent] = useState<string | null>(null);

    // Refs to the wrapper divs that contain each ecad-viewer — needed by the
    // shared info-panel hook so it can listen for kicanvas:select events.
    const schematicWrapperRef = useRef<HTMLDivElement | null>(null);
    const pcbWrapperRef = useRef<HTMLDivElement | null>(null);

    const { detail: schSelectedDetail, clear: clearSchSelectedDetail } = useEcadInfoPanel({
        containerRef: schematicWrapperRef,
        viewerRefs: useRef([schematicViewerRef]).current,
        projectId,
    });
    const { detail: pcbSelectedDetail, clear: clearPcbSelectedDetail } = useEcadInfoPanel({
        containerRef: pcbWrapperRef,
        viewerRefs: useRef([pcbViewerRef]).current,
        projectId,
    });

    // PCB-only: layer-visibility map fix + pad-priority click reordering.
    useBoardClickFix({ viewerRefs: useRef([pcbViewerRef]).current, rebindKey: pcbViewerElement });

    // Shared container ref + hotkey hook. The hook targets whichever viewer is
    // currently visible by relying on :hover resolution inside the wrapper.
    const visualizerContentRef = useRef<HTMLDivElement | null>(null);
    const visualizerViewerRefs = useRef([schematicViewerRef, pcbViewerRef]).current;
    useViewerHotkeys({
        containerRef: visualizerContentRef,
        viewerRefs: visualizerViewerRefs,
    });
    const [modelUrl, setModelUrl] = useState<string | null>(null);
    const [ibomUrl, setIbomUrl] = useState<string | null>(null);
    const [schematicContentLoaded, setSchematicContentLoaded] = useState(false);
    const [pcbContentLoaded, setPcbContentLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stackupData, setStackupData] = useState<StackupData | null>(null);
    const [stackupError, setStackupError] = useState<string | null>(null);
    const [stackupLoaded, setStackupLoaded] = useState(false);

    const [comments, setComments] = useState<Comment[]>([]);
    const [activePage, setActivePage] = useState<string>("root.kicad_sch");
    const [commentMode, setCommentMode] = useState(false);
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [showCommentPanel, setShowCommentPanel] = useState(false);
    const [pendingLocation, setPendingLocation] = useState<{ x: number, y: number, layer: string } | null>(null);
    const [pendingContext, setPendingContext] = useState<CommentContext>("PCB");
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [isPushingComments, setIsPushingComments] = useState(false);
    const [pushMessage, setPushMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showPushDialog, setShowPushDialog] = useState(false);
    const [commentsSourceUrls, setCommentsSourceUrls] = useState<CommentsSourceUrls | null>(null);
    const [isUrlsPopoverOpen, setIsUrlsPopoverOpen] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const canModifyComments = user?.role === "admin" || user?.role === "designer";

    // Diff overlay state — populated when viewing a historical commit
    const [diffData, setDiffData] = useState<SchDiffData | null>(null);
    const [pcbDiffData, setPcbDiffData] = useState<PcbDiffData | null>(null);
    const [stackupDiff, setStackupDiff] = useState<StackupDiff | null>(null);
    const [showDiffOverlay, setShowDiffOverlay] = useState(true);
    const lastCrossProbeRef = useRef<Record<CrossProbeContext, string | null>>({
        SCH: null,
        PCB: null,
    });
    const crossProbeRetryTimerRef = useRef<Record<CrossProbeContext, number | null>>({
        SCH: null,
        PCB: null,
    });
    const crossProbeRunIdRef = useRef<Record<CrossProbeContext, number>>({
        SCH: 0,
        PCB: 0,
    });
    const crossProbeSeqRef = useRef(0);
    const [bomCrossProbeTarget, setBomCrossProbeTarget] = useState<{ ref: string; seq: number } | undefined>();

    const activeCommentContext: CommentContext | null = activeTab === "sch" ? "SCH" : activeTab === "pcb" ? "PCB" : null;

    const applyCommentModeToViewer = useCallback((viewer: ECadViewerElement | null, enabled: boolean) => {
        if (!viewer) return;
        if (viewer.setCommentMode) {
            viewer.setCommentMode(enabled);
            return;
        }

        if (enabled) {
            viewer.setAttribute("comment-mode", "true");
        } else {
            viewer.removeAttribute("comment-mode");
        }
    }, []);

    const normalizeDesignator = useCallback((value: unknown): string | null => {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        return /^[A-Za-z]+\d+/.test(trimmed) ? trimmed : null;
    }, []);

    const extractDesignatorFromSelection = useCallback((item: unknown): string | null => {
        const findDesignator = (value: unknown, depth = 0): string | null => {
            if (!value || typeof value !== "object" || depth > 3) return null;
            const entry = value as Record<string, unknown>;

            const direct = [
                entry.reference,
                entry.Reference,
                entry.designator,
                entry.elementRef,
                entry.ref,
                entry.Ref,
            ];
            for (const candidate of direct) {
                const designator = normalizeDesignator(candidate);
                if (designator) return designator;
            }

            if (typeof entry.get_property_text === "function") {
                try {
                    const fromProperty = normalizeDesignator(
                        (entry.get_property_text as (name: string) => unknown)("Reference")
                    );
                    if (fromProperty) return fromProperty;
                } catch {
                    // noop
                }
            }

            const properties = entry.properties;
            if (properties instanceof Map) {
                const refProp = properties.get("Reference");
                if (refProp && typeof refProp === "object") {
                    const propEntry = refProp as Record<string, unknown>;
                    const fromMap = normalizeDesignator(
                        propEntry.shown_text ?? propEntry.text ?? propEntry.value
                    );
                    if (fromMap) return fromMap;
                }
            }

            const defaultInstance = entry.default_instance;
            if (defaultInstance && typeof defaultInstance === "object") {
                const fromDefault = normalizeDesignator(
                    (defaultInstance as Record<string, unknown>).reference
                );
                if (fromDefault) return fromDefault;
            }

            return (
                findDesignator(entry.parent, depth + 1) ||
                findDesignator(entry.item, depth + 1) ||
                findDesignator(entry.context, depth + 1)
            );
        };

        return findDesignator(item);
    }, [normalizeDesignator]);

    const getCrossProbeTargetContext = useCallback(
        (sourceContext: CrossProbeContext): CrossProbeContext =>
            sourceContext === "SCH" ? "PCB" : "SCH",
        [],
    );

    const clearCrossProbeRetry = useCallback((targetContext: CrossProbeContext) => {
        const timerId = crossProbeRetryTimerRef.current[targetContext];
        if (timerId !== null) {
            window.clearTimeout(timerId);
            crossProbeRetryTimerRef.current[targetContext] = null;
        }
    }, []);

    const runCrossProbe = useCallback(
        function runCrossProbe(
            targetViewer: ECadViewerElement | null,
            sourceContext: "SCH" | "PCB",
            designator: string,
            attempts = 0,
            runId?: number,
        ) {
            const targetContext = getCrossProbeTargetContext(sourceContext);

            if (attempts === 0) {
                clearCrossProbeRetry(targetContext);
                crossProbeRunIdRef.current[targetContext] += 1;
                runId = crossProbeRunIdRef.current[targetContext];
            }

            if (!targetViewer) {
                clearCrossProbeRetry(targetContext);
                return;
            }

            if (!runId || crossProbeRunIdRef.current[targetContext] !== runId) {
                return;
            }

            const result = targetViewer.requestCrossProbe({
                sourceContext,
                targetContext,
                mode: "select",
                kind: "designator",
                value: designator,
                designator,
            });

            if (
                !result.resolved &&
                result.reason === "target-not-available" &&
                attempts < CROSS_PROBE_MAX_RETRIES
            ) {
                crossProbeRetryTimerRef.current[targetContext] = window.setTimeout(() => {
                    runCrossProbe(
                        targetViewer,
                        sourceContext,
                        designator,
                        attempts + 1,
                        runId,
                    );
                }, CROSS_PROBE_RETRY_DELAY_MS);
                return;
            }

            clearCrossProbeRetry(targetContext);
        },
        [clearCrossProbeRetry, getCrossProbeTargetContext],
    );

    const copyToClipboard = async (label: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedField(label);
            setTimeout(() => setCopiedField(null), 1400);
        } catch (error) {
            console.warn("Failed to copy URL", error);
        }
    };

    const appendCommit = useCallback((url: string) => {
        if (!commit) return url;
        return `${url}${url.includes("?") ? "&" : "?"}commit=${encodeURIComponent(commit)}`;
    }, [commit]);

    useEffect(() => {
        setModelUrl(null);
        setIbomUrl(null);
        setSchematicContent(null);
        setPcbContent(null);
        setSubsheets([]);
        setSchematicContentLoaded(false);
        setPcbContentLoaded(false);
    }, [projectId, commit]);

    // Initial Data Fetch
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchData = async () => {
            setLoading(true);
            const baseUrl = `/api/projects/${projectId}`;

            try {
                // Parallel fetch for main assets (excluding schematic and PCB content for now)
                const [modelRes, ibomRes, commentsRes, filesRes] = await Promise.allSettled([
                    fetch(appendCommit(`${baseUrl}/3d-model`), { signal }),
                    fetch(appendCommit(`${baseUrl}/ibom`), { signal }),
                    fetch(`/api/projects/${projectId}/comments`, { signal }),
                    fetch(appendCommit(`${baseUrl}/files?type=design`), { signal }),
                ]);

                // Handle 3D
                let glbUrl = null;
                if (filesRes.status === "fulfilled" && filesRes.value.ok) {
                    try {
                        const files = await filesRes.value.json();
                        if (signal.aborted) return;
                        const glbFile = files.find((f: any) =>
                            f.path.toLowerCase().startsWith("3dmodel/") &&
                            f.name.toLowerCase().endsWith(".glb")
                        );
                        if (glbFile) {
                            glbUrl = appendCommit(`${baseUrl}/download?path=${encodeURIComponent(glbFile.path)}&type=design&inline=true`);
                        }
                    } catch (e) {
                        if (!isAbortError(e)) {
                            console.warn("Error parsing design files", e);
                        }
                    }
                }

                if (glbUrl) {
                    setModelUrl(glbUrl);
                } else if (modelRes.status === "fulfilled" && modelRes.value.ok) {
                    setModelUrl(appendCommit(`${baseUrl}/3d-model`));
                } else {
                    setModelUrl(null);
                }

                // Handle iBoM
                if (ibomRes.status === "fulfilled" && ibomRes.value.ok) {
                    setIbomUrl(appendCommit(`${baseUrl}/ibom`));
                } else {
                    setIbomUrl(null);
                }


                // Handle Comments
                if (commentsRes.status === "fulfilled" && commentsRes.value.ok) {
                    const cData = await commentsRes.value.json();
                    if (signal.aborted) return;
                    setComments(cData.comments || []);
                } else {
                    setComments([]);
                }

                try {
                    const sourceResponse = await fetch(`/api/projects/${projectId}/comments/source-urls`, { signal });

                    if (sourceResponse.ok) {
                        const sourceData = await sourceResponse.json();
                        if (signal.aborted) return;
                        setCommentsSourceUrls(sourceData);
                    } else {
                        setCommentsSourceUrls(null);
                    }
                } catch (sourceError) {
                    if (!isAbortError(sourceError)) {
                        console.warn("Failed to load comments source URLs", sourceError);
                    }
                }

            } catch (err) {
                if (!isAbortError(err)) {
                    console.error("Error loading visualizer data", err);
                }
            } finally {
                if (!signal.aborted) {
                    setLoading(false);
                }
            }
        };

        void fetchData();
        return () => controller.abort();
    }, [projectId, appendCommit]);

    // When diff data arrives (commit view), populate schematic content from it directly
    useEffect(() => {
        if (!diffData) return;
        const mainSheet = diffData.sheets.find(s => s.new_content);
        if (!mainSheet?.new_content) return;
        setSchematicContent(mainSheet.new_content);
        const rest = diffData.sheets
            .filter(s => s.filename !== mainSheet.filename && s.new_content)
            .map(s => ({ filename: s.filename, content: s.new_content! }));
        setSubsheets(rest);
        setSchematicContentLoaded(true);
    }, [diffData]);

    // When PCB diff data arrives, populate PCB content from it
    useEffect(() => {
        if (!pcbDiffData) return;
        const board = pcbDiffData.boards.find(b => b.new_content);
        if (!board?.new_content) return;
        setPcbContent(board.new_content);
        setPcbContentLoaded(true);
    }, [pcbDiffData]);

    // Lazy load schematic content when schematic tab is first accessed
    useEffect(() => {
        if (activeTab === "sch" && !schematicContentLoaded) {
            // If we're in commit-view mode, diff effect handles content loading
            if (commit) return;

            const controller = new AbortController();
            const signal = controller.signal;

            const loadSchematic = async () => {
                try {
                    const baseUrl = `/api/projects/${projectId}`;

                    const [schRes, subsheetsRes] = await Promise.allSettled([
                        fetch(appendCommit(`${baseUrl}/schematic`), { signal }),
                        fetch(appendCommit(`${baseUrl}/schematic/subsheets`), { signal })
                    ]);

                    // Handle Schematic
                    if (schRes.status === "fulfilled" && schRes.value.ok) {
                        const schematicText = await schRes.value.text();
                        if (signal.aborted) return;
                        setSchematicContent(schematicText);
                    } else {
                        console.error("Schematic not found");
                        setSchematicContent(null);
                    }

                    // Handle Subsheets
                    if (subsheetsRes.status === "fulfilled" && subsheetsRes.value.ok) {
                        const data = await subsheetsRes.value.json();
                        if (signal.aborted) return;
                        if (data.files?.length) {
                            const subsheetResults = await Promise.allSettled(data.files.map(async (f: any) => {
                                const cRes = await fetch(f.url, { signal });
                                if (!cRes.ok) {
                                    throw new Error(`Failed to load subsheet: ${f.url}`);
                                }
                                let filename = f.name || f.path || f.url.split("/")?.pop() || "subsheet.kicad_sch";
                                if (!filename.endsWith('.kicad_sch')) filename += '.kicad_sch';
                                if (!filename.includes("/") && f.url.includes("Subsheets")) filename = `Subsheets/${filename}`;
                                return { filename, content: await cRes.text() };
                            }));

                            if (signal.aborted) return;

                            const loadedSubsheets = subsheetResults
                                .filter((result): result is PromiseFulfilledResult<{ filename: string; content: string }> => result.status === "fulfilled")
                                .map((result) => result.value);
                            setSubsheets(loadedSubsheets);

                            subsheetResults
                                .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                                .forEach((result) => {
                                    console.warn("Failed to load one subsheet", result.reason);
                                });
                        }
                    } else {
                        setSubsheets([]);
                    }
                } catch (err) {
                    if (!isAbortError(err)) {
                        console.error("Error loading schematic content", err);
                    }
                } finally {
                    if (!signal.aborted) {
                        setSchematicContentLoaded(true);
                    }
                }
            };

            void loadSchematic();
            return () => controller.abort();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, schematicContentLoaded, projectId]); // commit intentionally omitted — diff mode is handled by a separate effect

    // Lazy load PCB content when PCB tab is first accessed
    useEffect(() => {
        if (activeTab === "pcb" && !pcbContentLoaded) {
            if (commit) return; // PCB content comes from pcbDiffData when in commit mode

            const controller = new AbortController();
            const signal = controller.signal;

            const loadPcb = async () => {
                try {
                    const baseUrl = `/api/projects/${projectId}`;
                    const pcbRes = await fetch(appendCommit(`${baseUrl}/pcb`), { signal });

                    if (pcbRes.ok) {
                        const pcbText = await pcbRes.text();
                        if (signal.aborted) return;
                        setPcbContent(pcbText);
                    } else {
                        console.error("PCB not found");
                        setPcbContent(null);
                    }
                } catch (err) {
                    if (!isAbortError(err)) {
                        console.error("Error loading PCB content", err);
                    }
                } finally {
                    if (!signal.aborted) {
                        setPcbContentLoaded(true);
                    }
                }
            };

            void loadPcb();
            return () => controller.abort();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, pcbContentLoaded, projectId]); // commit intentionally omitted — diff mode is handled by a separate effect

    // Fetch schematic + PCB diffs when viewing a specific commit; also resets content state
    useEffect(() => {
        setSchematicContentLoaded(false);
        setSchematicContent(null);
        setSubsheets([]);
        setDiffData(null);
        setPcbDiffData(null);
        setStackupDiff(null);

        if (!commit) return;

        const controller = new AbortController();

        fetch(`/api/projects/${projectId}/schematic-diff?commit1=${encodeURIComponent(commit)}`, { signal: controller.signal })
            .then(r => r.ok ? r.json() as Promise<SchDiffData> : Promise.reject())
            .then(d => { setDiffData(d); setShowDiffOverlay(true); })
            .catch(e => { if (!(e instanceof DOMException && e.name === "AbortError")) setDiffData(null); });

        fetch(`/api/projects/${projectId}/pcb-diff?commit1=${encodeURIComponent(commit)}`, { signal: controller.signal })
            .then(r => r.ok ? r.json() as Promise<PcbDiffData> : Promise.reject())
            .then(d => { setPcbDiffData(d); setShowDiffOverlay(true); })
            .catch(e => { if (!(e instanceof DOMException && e.name === "AbortError")) setPcbDiffData(null); });

        fetch(`/api/projects/${projectId}/stackup-diff?commit1=${encodeURIComponent(commit)}`, { signal: controller.signal })
            .then(r => r.ok ? r.json() as Promise<StackupDiff> : Promise.reject())
            .then(d => setStackupDiff(d))
            .catch(e => { if (!(e instanceof DOMException && e.name === "AbortError")) setStackupDiff(null); });

        return () => controller.abort();
    }, [projectId, commit]);

    // Lazy load stackup when stackup tab is first accessed (skipped in commit view — diff provides the data)
    useEffect(() => {
        if (activeTab !== "stackup" || stackupLoaded || commit) return;
        const controller = new AbortController();
        fetch(`/api/projects/${projectId}/stackup`, { signal: controller.signal })
            .then(r => r.ok ? r.json() as Promise<StackupData> : Promise.reject(new Error("Not found")))
            .then(d => { setStackupData(d); setStackupError(null); })
            .catch(e => { if (!(e instanceof DOMException && e.name === "AbortError")) setStackupError("Failed to load stackup data"); })
            .finally(() => { if (!controller.signal.aborted) setStackupLoaded(true); });
        return () => controller.abort();
    }, [activeTab, stackupLoaded, projectId]);

    // Reset lazy loading flags when project changes
    useEffect(() => {
        setSchematicContentLoaded(false);
        setPcbContentLoaded(false);
        setSchematicContent(null);
        setSubsheets([]);
        setPcbContent(null);
        setModelUrl(null);
        setIbomUrl(null);
        setComments([]);
        setCommentsSourceUrls(null);
        setStackupData(null);
        setStackupError(null);
        setStackupLoaded(false);
        setStackupDiff(null);
        setActivePage("root.kicad_sch");
        setCommentMode(false);
        setShowCommentForm(false);
        setShowCommentPanel(false);
        setPendingLocation(null);
        setPendingContext("PCB");
        setIsSubmittingComment(false);
        setIsPushingComments(false);
        setPushMessage(null);
        setShowPushDialog(false);
        setIsUrlsPopoverOpen(false);
        setCopiedField(null);
        lastCrossProbeRef.current = { SCH: null, PCB: null };
        clearCrossProbeRetry("SCH");
        clearCrossProbeRetry("PCB");
        crossProbeRunIdRef.current = { SCH: 0, PCB: 0 };
        crossProbeSeqRef.current = 0;
        setBomCrossProbeTarget(undefined);
    }, [projectId, clearCrossProbeRetry]);

    useEffect(() => {
        return () => {
            clearCrossProbeRetry("SCH");
            clearCrossProbeRetry("PCB");
        };
    }, [clearCrossProbeRetry]);

    // Event Listeners for ecad-viewer
    useEffect(() => {
        const schematicViewer = schematicViewerElement;
        const pcbViewer = pcbViewerElement;

        if (!schematicViewer && !pcbViewer) return;

        const handleCommentClick = (e: CustomEvent) => {
            if (!canModifyComments) {
                return;
            }
            if (activeCommentContext !== "SCH" && activeCommentContext !== "PCB") {
                return;
            }

            const detail = e.detail;
            setPendingLocation({
                x: detail.worldX,
                y: detail.worldY,
                layer: detail.layer || "F.Cu",
            });
            setPendingContext(activeCommentContext);
            setShowCommentForm(true);
        };

        const handleSheetLoad = (e: CustomEvent) => {
            if (typeof e.detail === 'string') setActivePage(e.detail);
            else if (e.detail?.filename) setActivePage(e.detail.filename);
            else if (e.detail?.sheetName) setActivePage(e.detail.sheetName);
        };

        // Add listeners to both viewers
        if (schematicViewer) {
            schematicViewer.addEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
            schematicViewer.addEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
        }

        if (pcbViewer) {
            pcbViewer.addEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
            pcbViewer.addEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
        }

        return () => {
            if (schematicViewer) {
                schematicViewer.removeEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
                schematicViewer.removeEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
            }
            if (pcbViewer) {
                pcbViewer.removeEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
                pcbViewer.removeEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
            }
        };
    }, [activeCommentContext, canModifyComments, schematicViewerElement, pcbViewerElement]);

    // Toggle Comment Mode
    const toggleCommentMode = () => {
        if (!canModifyComments) {
            return;
        }
        setCommentMode((previous) => {
            const next = !previous;
            applyCommentModeToViewer(schematicViewerRef.current, next);
            applyCommentModeToViewer(pcbViewerRef.current, next);
            return next;
        });
    };

    useEffect(() => {
        applyCommentModeToViewer(schematicViewerElement, commentMode);
        applyCommentModeToViewer(pcbViewerElement, commentMode);
    }, [commentMode, schematicViewerElement, pcbViewerElement, applyCommentModeToViewer]);

    useEffect(() => {
        if (!commentMode) return;

        if (activeTab === "sch") {
            applyCommentModeToViewer(schematicViewerRef.current, true);
            return;
        }

        if (activeTab === "pcb") {
            applyCommentModeToViewer(pcbViewerRef.current, true);
        }
    }, [activeTab, commentMode, applyCommentModeToViewer]);

    useEffect(() => {
        schematicViewerRef.current?.setCrossProbeEnabled(true);
        pcbViewerRef.current?.setCrossProbeEnabled(true);
    }, [schematicViewerElement, pcbViewerElement]);

    useEffect(() => {
        const schematicViewer = schematicViewerElement;
        const pcbViewer = pcbViewerElement;
        if (!schematicViewer && !pcbViewer) return;

        const handleCrossProbeSelection = (
            fallbackSourceContext: CrossProbeContext,
            targetViewer: ECadViewerElement | null,
            event: Event,
        ) => {
            const detail = (event as CustomEvent<KiCanvasSelectDetail>).detail;
            const sourceContext = detail?.sourceContext ?? fallbackSourceContext;
            const designator = extractDesignatorFromSelection(detail?.item);
            if (!designator) return;
            lastCrossProbeRef.current[sourceContext] = designator;
            runCrossProbe(targetViewer, sourceContext, designator);
            // Also update BOM highlight
            crossProbeSeqRef.current += 1;
            setBomCrossProbeTarget({ ref: designator, seq: crossProbeSeqRef.current });
        };

        const onSchematicSelect = (event: Event) =>
            handleCrossProbeSelection("SCH", pcbViewerRef.current, event);
        const onPcbSelect = (event: Event) =>
            handleCrossProbeSelection("PCB", schematicViewerRef.current, event);

        schematicViewer?.addEventListener("kicanvas:select", onSchematicSelect as EventListener);
        pcbViewer?.addEventListener("kicanvas:select", onPcbSelect as EventListener);

        return () => {
            schematicViewer?.removeEventListener("kicanvas:select", onSchematicSelect as EventListener);
            pcbViewer?.removeEventListener("kicanvas:select", onPcbSelect as EventListener);
        };
    }, [schematicViewerElement, pcbViewerElement, extractDesignatorFromSelection, runCrossProbe]);

    useEffect(() => {
        if (activeTab === "pcb" && lastCrossProbeRef.current.SCH) {
            runCrossProbe(pcbViewerRef.current, "SCH", lastCrossProbeRef.current.SCH);
        } else if (activeTab === "sch" && lastCrossProbeRef.current.PCB) {
            runCrossProbe(schematicViewerRef.current, "PCB", lastCrossProbeRef.current.PCB);
        }
    }, [activeTab, runCrossProbe, schematicViewerElement, pcbViewerElement]);

    // When a BOM row is clicked, cross-probe both SCH and PCB viewers and track for tab-switch
    const handleBomCrossProbe = useCallback((designator: string) => {
        lastCrossProbeRef.current.SCH = designator;
        lastCrossProbeRef.current.PCB = designator;
        runCrossProbe(schematicViewerRef.current, "PCB", designator);
        runCrossProbe(pcbViewerRef.current, "SCH", designator);
    }, [runCrossProbe]);

    // Submit Comment
    const handleSubmitComment = async (content: string) => {
        if (!pendingLocation || !canModifyComments) return;
        setIsSubmittingComment(true);
        try {
            const location = { ...pendingLocation, page: pendingContext === "SCH" ? activePage : "" };
            const response = await fetchApi(`/api/projects/${projectId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    context: pendingContext,
                    location,
                    content,
                    author: user?.name || "anonymous"
                })
            });

            if (response.ok) {
                const newComment = await response.json();
                setComments(prev => [...prev, newComment]);
                setShowCommentForm(false);
                setPendingLocation(null);
                // Turn off comment mode after posting? User might want to post multiple. Keep it on.
            }
        } catch (err) {
            console.error("Create comment failed", err);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    // Navigate to Comment
    const handleCommentNavigate = (comment: Comment) => {
        // Force switch to appropriate tab if in 3D/iBom
        if (comment.context === "SCH" && activeTab !== "sch") {
            setActiveTab("sch");
        } else if (comment.context === "PCB" && activeTab !== "pcb") {
            setActiveTab("pcb");
        }

        // Get the appropriate viewer
        const viewer = comment.context === "SCH" ? schematicViewerRef.current : pcbViewerRef.current;
        if (!viewer) return;

        if (comment.context === "SCH" && comment.location.page) {
            viewer.switchPage(comment.location.page);
        }

        if (viewer.zoomToLocation) {
            viewer.zoomToLocation(comment.location.x, comment.location.y);
        }
    };

    // Resolving/Replying
    const handleResolveComment = async (commentId: string, resolved: boolean) => {
        if (!canModifyComments) return;
        const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: resolved ? "RESOLVED" : "OPEN" })
        });
        if (response.ok) {
            const updated = await response.json();
            setComments(prev => prev.map(c => c.id === commentId ? updated : c));
        }
    };

    const handleReplyComment = async (commentId: string, content: string) => {
        if (!canModifyComments) return;
        const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}/replies`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content,
                author: user?.name || "anonymous"
            })
        });
        if (response.ok) {
            const data = await response.json();
            setComments(prev => prev.map(c => c.id === commentId ? data.comment : c));
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!canModifyComments) return;
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}`, {
                method: "DELETE",
            });
            if (response.ok) {
                setComments(prev => prev.filter(c => c.id !== commentId));
            }
        } catch (err) {
            console.error("Failed to delete comment", err);
        }
    };

    // Export comments.json artifact from DB snapshot
    const handlePushComments = async () => {
        if (!canModifyComments) return;
        setIsPushingComments(true);
        setPushMessage(null);

        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/push`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            const data = await response.json();

            if (response.ok) {
                const artifactPath = data.comments_path ? ` (${data.comments_path})` : "";
                setPushMessage({ type: "success", text: `${data.message || "Generated comments artifact."}${artifactPath}` });
                setShowPushDialog(false);
            } else {
                setPushMessage({ type: "error", text: data.detail || "Failed to generate comments artifact." });
            }
        } catch (err: any) {
            setPushMessage({ type: "error", text: err.message || "Network error while generating comments artifact." });
        } finally {
            setIsPushingComments(false);
            // Clear message after 5 seconds
            setTimeout(() => setPushMessage(null), 5000);
        }
    };

    // Filtering comments for Overlay
    const overlayComments = comments.filter(c => {
        if (!activeCommentContext) return false;

        // Must match context
        if (c.context !== activeCommentContext) return false;

        // If SCH, match page
        if (activeCommentContext === "SCH") {
            const norm = (p: string) => p ? p.split('/').pop() || p : "";
            const cPage = norm(c.location.page || "");
            const aPage = norm(activePage);
            // Root handling
            const isRootC = cPage === "root.kicad_sch" || cPage === "root";
            const isRootA = aPage === "root.kicad_sch" || aPage === "root";

            if (isRootA && isRootC) return true;
            return cPage === aPage;
        }
        return true;
    });

    const shouldShowOverlay =
        (activeTab === "sch" && Boolean(schematicContent && schematicViewerElement)) ||
        (activeTab === "pcb" && Boolean(pcbContent && pcbViewerElement));
    const schematicSources = useMemo<ViewerBlobSource[]>(
        () => (schematicContent
            ? [{ filename: "root.kicad_sch", content: schematicContent }, ...subsheets]
            : []),
        [schematicContent, subsheets],
    );
    const pcbSources = useMemo<ViewerBlobSource[]>(
        () => (pcbContent
            ? [{ filename: "board.kicad_pcb", content: pcbContent }]
            : []),
        [pcbContent],
    );
    // When viewing a commit, use a stable key so the viewer doesn't remount when diff content arrives
    const schematicViewerKey = commit
        ? `schematic:${projectId}:commit:${commit}`
        : buildViewerKey("schematic", projectId, commit, schematicSources);
    const pcbViewerKey = commit
        ? `pcb:${projectId}:commit:${commit}`
        : buildViewerKey("pcb", projectId, commit, pcbSources);

    // Build diff markers for the active schematic page
    const diffMarkers = useMemo<DiffMarker[]>(() => {
        if (!diffData || !showDiffOverlay) return [];
        const sheet = diffData.sheets.find(s => s.filename === activePage || s.filename.endsWith("/" + activePage))
            ?? diffData.sheets[0];
        if (!sheet) return [];
        const markers: DiffMarker[] = [];
        for (const item of sheet.diff.added)   markers.push({ kind: "added",   item });
        for (const item of sheet.diff.removed)  markers.push({ kind: "removed", item });
        for (const { item } of sheet.diff.changed) markers.push({ kind: "changed", item });
        return markers;
    }, [diffData, showDiffOverlay, activePage]);

    // PCB diff markers — footprints and zones only (segments/vias too numerous to box)
    const pcbDiffMarkers = useMemo<DiffMarker[]>(() => {
        if (!pcbDiffData || !showDiffOverlay) return [];
        const board = pcbDiffData.boards[0];
        if (!board) return [];
        const SHOW_TYPES = new Set(["footprint", "zone", "gr_text"]);
        const markers: DiffMarker[] = [];
        for (const item of board.diff.added)   if (SHOW_TYPES.has(item.type)) markers.push({ kind: "added",   item });
        for (const item of board.diff.removed)  if (SHOW_TYPES.has(item.type)) markers.push({ kind: "removed", item });
        for (const { item } of board.diff.changed) if (SHOW_TYPES.has(item.type)) markers.push({ kind: "changed", item });
        return markers;
    }, [pcbDiffData, showDiffOverlay]);

    // Tab Config
    const ibomEnabled = (() => { try { return localStorage.getItem(IBOM_ENABLED_KEY) === "true"; } catch { return false; } })();
    const tabs: { id: VisualizerTab; label: string; icon: any }[] = [
        { id: "sch", label: "Schematic", icon: Cpu },
        { id: "pcb", label: "PCB Layout", icon: CircuitBoard },
        { id: "3d", label: "3D View", icon: Box },
        { id: "bom", label: "BOM", icon: List },
        ...(ibomEnabled ? [{ id: "ibom" as VisualizerTab, label: "iBoM", icon: FileText }] : []),
        { id: "gerber", label: "Gerber", icon: Layers },
        { id: "stackup", label: "Stackup", icon: LayoutList },
    ];

    if (loading) return <div className="flex justify-center items-center h-full">Loading Visualizer...</div>;

    return (
        <div className="flex flex-col h-full bg-background relative selection-none">
            {/* Toolbar */}
            <div className="flex items-center gap-0 border-b bg-background/95 backdrop-blur shrink-0 px-0.5">
                <div className="flex-1 flex items-center">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                    active
                                        ? "border-primary text-foreground"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                                }`}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Diff overlay controls — only when viewing a specific commit */}
                {commit && (diffData || pcbDiffData) && (activeTab === "sch" || activeTab === "pcb") && (() => {
                    const markers = activeTab === "sch" ? diffMarkers : pcbDiffMarkers;
                    const added   = markers.filter(m => m.kind === "added").length;
                    const removed = markers.filter(m => m.kind === "removed").length;
                    const changed = markers.filter(m => m.kind === "changed").length;
                    return (
                        <div className="flex items-center gap-1.5 border-r pr-2 mr-1 shrink-0">
                            <span className="text-[10px] text-muted-foreground font-mono">
                                {added   > 0 && <span className="text-green-500 mr-1">+{added}</span>}
                                {removed > 0 && <span className="text-red-500 mr-1">-{removed}</span>}
                                {changed > 0 && <span className="text-amber-500">~{changed}</span>}
                            </span>
                            <Button
                                variant={showDiffOverlay ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setShowDiffOverlay(v => !v)}
                                className="h-8 px-3 text-xs font-medium rounded-md border border-border/60 bg-background/60 shadow-sm hover:bg-muted"
                                title="Toggle diff highlights"
                            >
                                <RefreshCw className="w-3.5 h-3.5 mr-2" />
                                Highlights
                            </Button>
                        </div>
                    );
                })()}

                {commit && (
                    <p className="text-xs text-muted-foreground font-mono pr-3 shrink-0">
                        {commit.slice(0, 7)}
                    </p>
                )}

                {/* Comment Controls */}
                {(activeTab === "sch" || activeTab === "pcb") && (
                    <>
                        <Popover open={isUrlsPopoverOpen} onOpenChange={setIsUrlsPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-xs font-medium rounded-md border-border/60 bg-background/60 shadow-sm hover:bg-muted"
                                    aria-label="Show KiCad comments REST URLs"
                                >
                                    <Link2 className="w-3.5 h-3.5 mr-2" />
                                    REST URLs
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" side="bottom" className="w-[520px] max-w-[calc(100vw-2rem)] p-3">
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-sm font-medium">KiCad Comments REST URLs</p>
                                        <p className="text-xs text-muted-foreground">
                                            Copy these into KiCad Comments Source Settings.
                                        </p>
                                    </div>
                                    {commentsSourceUrls ? (
                                        <div className="space-y-2">
                                            {[
                                                { label: "List URL", value: commentsSourceUrls.list_url },
                                                { label: "Patch URL Template", value: commentsSourceUrls.patch_url_template },
                                                { label: "Reply URL Template", value: commentsSourceUrls.reply_url_template },
                                                { label: "Delete URL Template", value: commentsSourceUrls.delete_url_template },
                                            ].map((entry) => (
                                                <div key={entry.label} className="rounded border bg-muted/30 p-2">
                                                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">{entry.label}</div>
                                                    <div className="flex items-start gap-2">
                                                        <code className="flex-1 break-all rounded bg-background px-2 py-1 text-[11px]">{entry.value}</code>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 shrink-0"
                                                            onClick={() => copyToClipboard(entry.label, entry.value)}
                                                        >
                                                            {copiedField === entry.label ? (
                                                                <>
                                                                    <Check className="h-3 w-3 mr-1" />
                                                                    Copied
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Copy className="h-3 w-3 mr-1" />
                                                                    Copy
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Loading URL helpers...</p>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Button
                            variant={commentMode ? "default" : "outline"}
                            size="sm"
                            onClick={toggleCommentMode}
                            disabled={!canModifyComments}
                            className={`h-8 px-3 text-xs font-medium rounded-md border-border/60 shadow-sm ml-1.5 ${commentMode ? "bg-amber-600 text-white hover:bg-amber-700 border-amber-600" : "bg-background/60 hover:bg-muted"}`}
                        >
                            <MessageSquarePlus className="w-3.5 h-3.5 mr-2" />
                            {commentMode ? "Commenting Mode" : "Add Comment"}
                        </Button>
                        <Button
                            variant={showCommentPanel ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => setShowCommentPanel(!showCommentPanel)}
                            className="h-8 px-3 text-xs font-medium rounded-md border-border/60 bg-background/60 shadow-sm hover:bg-muted ml-1.5"
                        >
                            <MessageSquare className="w-3.5 h-3.5 mr-2" />
                            Comments
                            <span className="ml-1 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-[10px] leading-none">
                                {comments.length}
                            </span>
                        </Button>
                        {canModifyComments && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowPushDialog(true)}
                                className="h-8 px-3 text-xs font-medium rounded-md border-border/60 bg-background/60 shadow-sm hover:bg-muted ml-1.5"
                                title="Generate comments.json artifact from DB"
                            >
                                <GitBranch className="w-3.5 h-3.5 mr-2" />
                                Generate JSON
                            </Button>
                        )}
                    </>
                )}
            </div>

            {/* Push Message Feedback */}
            {pushMessage && (
                <div className={`px-4 py-2 text-sm border-b ${pushMessage.type === "success"
                    ? "bg-green-500/10 border-green-500/20 text-green-500"
                    : "bg-red-500/10 border-red-500/20 text-red-500"
                    }`}>
                    {pushMessage.text}
                    <button
                        onClick={() => setPushMessage(null)}
                        className="ml-2 text-xs underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Generate comments.json Dialog */}
            <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Generate Comments Artifact</DialogTitle>
                        <DialogDescription>
                            This writes the latest DB comments to `.comments/comments.json`. Push to remote is handled by your Git workflow.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPushDialog(false)} disabled={isPushingComments}>
                            Cancel
                        </Button>
                        <Button onClick={handlePushComments} disabled={isPushingComments}>
                            {isPushingComments ? "Generating..." : "Generate"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Content Area */}
            <div ref={visualizerContentRef} className="flex-1 relative overflow-hidden">
                {/* Schematic View - always mounted but conditionally visible */}
                <div
                    ref={schematicWrapperRef}
                    className={`absolute inset-0 z-10 transition-opacity duration-200 ${activeTab === "sch" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                >
                    {schematicContentLoaded ? (
                        schematicSources.length > 0 ? (
                            <EcadViewerHost
                                viewerKey={schematicViewerKey}
                                files={schematicSources}
                                onViewer={setSchematicViewerRef}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                <p>No schematic files found.</p>
                            </div>
                        )
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            <p>Loading schematic...</p>
                        </div>
                    )}
                    {activeTab === "sch" && (
                        <EcadInfoPanel
                            detail={schSelectedDetail}
                            onClose={clearSchSelectedDetail}
                            position="bottom-right"
                        />
                    )}
                </div>

                {/* PCB View - always mounted but conditionally visible */}
                <div
                    ref={pcbWrapperRef}
                    className={`absolute inset-0 z-10 transition-opacity duration-200 ${activeTab === "pcb" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                >
                    {pcbContentLoaded ? (
                        pcbSources.length > 0 ? (
                            <EcadViewerHost
                                viewerKey={pcbViewerKey}
                                files={pcbSources}
                                onViewer={setPcbViewerRef}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                <p>No PCB files found.</p>
                            </div>
                        )
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            <p>Loading PCB...</p>
                        </div>
                    )}
                    {activeTab === "pcb" && (
                        <EcadInfoPanel
                            detail={pcbSelectedDetail}
                            onClose={clearPcbSelectedDetail}
                            position="bottom-right"
                        />
                    )}
                </div>

                {/* Comment Overlay - only visible on sch/pcb tabs */}
                {shouldShowOverlay ? (
                    <CommentOverlay
                        comments={overlayComments}
                        viewerRef={activeTab === "sch" ? schematicViewerRef : pcbViewerRef}
                        onPinClick={() => {
                            setShowCommentPanel(true);
                        }}
                    />
                ) : null}

                {/* Diff highlights overlay — schematic */}
                {activeTab === "sch" && diffMarkers.length > 0 && (
                    <CommitDiffOverlay markers={diffMarkers} viewerRef={schematicViewerRef} />
                )}

                {/* Diff highlights overlay — PCB */}
                {activeTab === "pcb" && pcbDiffMarkers.length > 0 && (
                    <CommitDiffOverlay markers={pcbDiffMarkers} viewerRef={pcbViewerRef} />
                )}

                {/* Keyboard shortcuts legend — only on the kicanvas tabs */}
                {(activeTab === "sch" || activeTab === "pcb") && (
                    <HotkeysLegend entries={COMMON_HOTKEYS} />
                )}

                {/* 3D View */}
                {activeTab === "3d" && (
                    <div className="absolute inset-0 z-20 bg-background">
                        {modelUrl ? (
                            <Suspense fallback={<div className="p-10">Loading 3D Viewer...</div>}>
                                <Model3DViewer modelUrl={modelUrl} sceneKey={`project:${projectId}:tab:3d`} />
                            </Suspense>
                        ) : (
                            <div className="p-10">No 3D Model</div>
                        )}
                    </div>
                )}

                {/* BOM View — always mounted, hidden when not active */}
                <div className="absolute inset-0 z-20" style={{ display: activeTab === "bom" ? undefined : "none" }}>
                    <BomDiffViewer
                        projectId={projectId}
                        snapshot
                        onCrossProbe={handleBomCrossProbe}
                        crossProbeTarget={bomCrossProbeTarget}
                    />
                </div>

                {/* iBoM View */}
                {activeTab === "ibom" && (
                    <div className="absolute inset-0 z-20 bg-white">
                        {ibomUrl ? <iframe src={ibomUrl} className="w-full h-full border-0" /> : <div className="p-10">No iBoM Found</div>}
                    </div>
                )}

                {/* Stackup View */}
                {activeTab === "stackup" && (
                    <div className="absolute inset-0 z-20 bg-background overflow-y-auto">
                        <StackupPanel data={stackupData} error={stackupError} loaded={stackupLoaded} diff={stackupDiff} inCommitView={!!commit} />
                    </div>
                )}

                {/* Gerber View */}
                {activeTab === "gerber" && (
                    <div className="absolute inset-0 z-20 bg-background">
                        <Suspense fallback={<div className="p-10 text-sm text-muted-foreground">Loading Gerber Viewer...</div>}>
                            <GerberViewer projectId={projectId} />
                        </Suspense>
                    </div>
                )}

                {/* Sidebar Overlay */}
                {showCommentPanel && (
                    <div className="absolute top-0 right-0 bottom-0 z-50 animate-in slide-in-from-right">
                        <CommentPanel
                            comments={comments}
                            onClose={() => setShowCommentPanel(false)}
                            onResolve={handleResolveComment}
                            onReply={handleReplyComment}
                            onDelete={handleDeleteComment}
                            onCommentClick={handleCommentNavigate}
                            canModify={canModifyComments}
                        />
                    </div>
                )}
            </div>

            {/* Modals */}
            <CommentForm
                isOpen={showCommentForm}
                onClose={() => setShowCommentForm(false)}
                onSubmit={handleSubmitComment}
                location={pendingLocation}
                context={pendingContext}
                isSubmitting={isSubmittingComment}
            />
        </div>
    );
}
