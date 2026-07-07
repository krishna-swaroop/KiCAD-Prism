import { useEffect, useState } from "react";

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

function fmt(v: unknown): string {
    if (v == null) return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
}

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

const DIFF_ADDED   = "bg-green-500/15 border-l-2 border-green-500";
const DIFF_REMOVED = "bg-red-500/15 border-l-2 border-red-500";
const DIFF_CHANGED = "bg-amber-500/15 border-l-2 border-amber-500";

function StackupDiffView({ diff }: { diff: StackupDiff }) {
    const { new_stackup: data, layer_diff: ld, board_diff: bd } = diff;

    const addedNames    = new Set(ld.added.map(l => l.name));
    const removedNames  = new Set(ld.removed.map(l => l.name));
    const changedNames  = new Set(ld.changed.map(l => l.name));
    const reorderedNames = new Set(ld.reordered.map(l => l.name));
    const changedMap    = new Map(ld.changed.map(l => [l.name, l.changes]));
    const reorderedMap  = new Map(ld.reordered.map(l => [l.name, l]));

    const layers = data.layers;
    const removedLayers = ld.removed;

    const totalThickness = layers.reduce((sum, l) => sum + (l.thickness ?? 0), 0);
    const displayThickness = data.board_thickness ?? (totalThickness > 0 ? totalThickness : null);

    const hasAnyDiff =
        ld.added.length > 0 || ld.removed.length > 0 ||
        ld.changed.length > 0 || ld.reordered.length > 0 ||
        Object.keys(bd).length > 0;

    type PropRow = { label: string; value: string; propKey: string };
    const extraProps: PropRow[] = [];
    if (data.copper_finish) extraProps.push({ label: "Copper finish", value: data.copper_finish, propKey: "copper_finish" });
    extraProps.push({ label: "Edge connector",    value: data.edge_connector && data.edge_connector !== "no" ? data.edge_connector : "No", propKey: "edge_connector" });
    extraProps.push({ label: "Castellated pads",  value: data.castellated_pads ? "Yes" : "No", propKey: "castellated_pads" });
    extraProps.push({ label: "Plated board edge", value: data.edge_plating ? "Yes" : "No", propKey: "edge_plating" });

    return (
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
            {/* Header */}
            <div>
                {!data.has_stackup && (
                    <p className="text-xs text-amber-500">
                        No explicit stackup in PCB file — showing estimated layer structure.
                    </p>
                )}
                {displayThickness != null && (
                    <p className="text-xs text-muted-foreground">
                        Total thickness:{" "}
                        <span className="font-medium text-foreground">{displayThickness.toFixed(3)} mm</span>
                        {bd.board_thickness && (
                            <span className="ml-2 text-muted-foreground line-through">{fmt(bd.board_thickness.old)} mm</span>
                        )}
                    </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-mono">{diff.commit2.slice(0, 7)}</span>
                    {" → "}
                    <span className="font-mono">{diff.commit1.slice(0, 7)}</span>
                    {!hasAnyDiff && <span className="ml-2 text-muted-foreground">— no stackup changes</span>}
                </p>
            </div>

            {/* Cross-section diagram */}
            {layers.length > 0 && (
                <div className="border rounded overflow-hidden">
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
                        const ring = isAdded ? "ring-2 ring-inset ring-green-500" : isChanged ? "ring-2 ring-inset ring-amber-500" : isReordered ? "ring-2 ring-inset ring-blue-500" : "";
                        return (
                            <div
                                key={i}
                                className={`flex items-center px-4 ${ring}`}
                                style={{ backgroundColor: color, height: heightPx }}
                                title={`${layer.name}${layer.thickness ? ` — ${layer.thickness} mm` : ""}`}
                            >
                                <span className="text-[11px] font-medium select-none truncate leading-none" style={{ color: "rgba(0,0,0,0.65)" }}>
                                    {layer.name}{layer.thickness ? ` — ${layer.thickness} mm` : ""}
                                    {isAdded    && <span className="ml-2 text-[9px] font-bold">+NEW</span>}
                                    {isChanged  && <span className="ml-2 text-[9px] font-bold">~</span>}
                                    {isReordered && !isChanged && <span className="ml-2 text-[9px] font-bold">↕</span>}
                                </span>
                            </div>
                        );
                    })}
                    {removedLayers.map((layer, i) => {
                        const color = layerVisualColor(layer.type);
                        const t = layer.type.toLowerCase();
                        const isThin = t.includes("silk") || t.includes("paste");
                        const isMask = t.includes("mask");
                        const isCopper = t === "copper";
                        const heightPx = isThin ? 10 : isMask ? 18 : isCopper ? 30 : 56;
                        return (
                            <div
                                key={`rm-${i}`}
                                className="flex items-center px-4 ring-2 ring-inset ring-red-500 opacity-50"
                                style={{ backgroundColor: color, height: heightPx }}
                                title={`REMOVED: ${layer.name}`}
                            >
                                <span className="text-[11px] font-medium select-none truncate leading-none line-through" style={{ color: "rgba(0,0,0,0.65)" }}>
                                    {layer.name}{layer.thickness ? ` — ${layer.thickness} mm` : ""}
                                    <span className="ml-2 text-[9px] font-bold not-italic">−REMOVED</span>
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Detail table */}
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
                                const isChanged  = changedNames.has(layer.name);
                                const isReordered = reorderedNames.has(layer.name);
                                const changes    = changedMap.get(layer.name) ?? {};
                                const rowClass   = isAdded ? DIFF_ADDED : isChanged ? DIFF_CHANGED : "";
                                return (
                                    <tr key={i} className={`border-b last:border-0 hover:bg-muted/20 ${rowClass}`}>
                                        <td className="px-3 py-1.5 font-mono">
                                            <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle shrink-0"
                                                style={{ backgroundColor: layerVisualColor(layer.type) }} />
                                            {layer.name}
                                            {isAdded    && <DiffBadge kind="added" />}
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
                                            {"thickness" in changes && <span className="block text-muted-foreground line-through text-[10px]">{fmt(changes.thickness.old)}</span>}
                                        </td>
                                        <td className="px-3 py-1.5 text-muted-foreground">
                                            {layer.material ?? "—"}
                                            {"material" in changes && <span className="block line-through text-[10px]">{fmt(changes.material.old)}</span>}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                            {layer.epsilon_r != null ? layer.epsilon_r : "—"}
                                            {"epsilon_r" in changes && <span className="block line-through text-[10px]">{fmt(changes.epsilon_r.old)}</span>}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                            {layer.loss_tangent != null ? layer.loss_tangent : "—"}
                                            {"loss_tangent" in changes && <span className="block line-through text-[10px]">{fmt(changes.loss_tangent.old)}</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                            {removedLayers.map((layer, i) => (
                                <tr key={`rm-${i}`} className={`border-b last:border-0 ${DIFF_REMOVED} opacity-60`}>
                                    <td className="px-3 py-1.5 font-mono line-through">
                                        <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle shrink-0"
                                            style={{ backgroundColor: layerVisualColor(layer.type) }} />
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

            {/* Board properties */}
            <div className="space-y-1 text-xs">
                {extraProps.map(({ label, value, propKey }) => {
                    const changed = propKey in bd;
                    return (
                        <div key={label} className="flex gap-2 items-baseline">
                            <span className="text-muted-foreground whitespace-nowrap">{label}</span>
                            <span className={`font-medium ${changed ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</span>
                            {changed && <span className="text-muted-foreground line-through text-[10px]">{fmt(bd[propKey].old)}</span>}
                            {changed && <DiffBadge kind="changed" />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function StackupDiffPanel({ projectId, commit1, commit2 }: {
    projectId: string;
    commit1: string;
    commit2: string;
}) {
    const [diff, setDiff] = useState<StackupDiff | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setDiff(null);
        setError(null);
        setLoading(true);
        const controller = new AbortController();
        fetch(
            `/api/projects/${projectId}/stackup-diff?commit1=${encodeURIComponent(commit1)}&commit2=${encodeURIComponent(commit2)}`,
            { signal: controller.signal }
        )
            .then(r => r.ok ? r.json() as Promise<StackupDiff> : Promise.reject(new Error(`${r.status}`)))
            .then(d => { setDiff(d); setError(null); })
            .catch(e => { if (!(e instanceof DOMException && e.name === "AbortError")) setError("No PCB stackup found for these commits."); })
            .finally(() => { setLoading(false); });
        return () => controller.abort();
    }, [projectId, commit1, commit2]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Loading stackup diff…
            </div>
        );
    }

    if (error || !diff) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {error ?? "No stackup data available."}
            </div>
        );
    }

    return <StackupDiffView diff={diff} />;
}
