import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Layers, Loader2, Mountain, Ruler, Spline } from "lucide-react";
import { toast } from "sonner";

import { FloatingToolbar } from "@/features/system-builder/workspace/floating-toolbar";
import { ToolbarButton } from "@/features/system-builder/workspace/toolbar-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAnalyticPack } from "@/hooks/use-analytic-pack";
import { fetchApi, fetchJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PrismAnalyticHit, PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

import { LookPanel, gradientOf, useResultLook } from "../../result-look";
import { FIELD_QUANTITIES, type FieldQuantity, runPackUrl, useRunOverlay, type RunOverlayState } from "../../run-overlay";
import type { SimRun } from "../../types";

import { MountainView } from "./mountain";

interface WebGpuStatus {
    available: boolean;
    status: string;
    bundle_url?: string;
    generated_at?: string;
}

export type BoardMode = "flat" | "mountain";

export interface ProfilePoint {
    mm: [number, number];
    sliceKey?: string;
}

export interface BoardState {
    quantity: FieldQuantity;
    net: string | null;
    arrows: boolean;
    mode: BoardMode;
}

type Props = {
    projectId: string;
    run: SimRun;
    canMutate: boolean;
    board: BoardState;
    onBoard: (change: Partial<BoardState>) => void;
    /** Headline numbers, floating across the top. */
    stats: ReactNode;
    /** Profile tool: collects two clicks on the copper. */
    profiling: boolean;
    onProfiling: (on: boolean) => void;
    onProfile: (points: [ProfilePoint, ProfilePoint]) => void;
    onViewer?: (viewer: PrismSemanticViewerElement | null) => void;
    onOverlay?: (overlay: RunOverlayState) => void;
};

/**
 * The run on the board: Prism's WebGPU viewer with the result over the
 * copper (Flat), or the shown field as a 3D surface (Mountain). Every
 * control floats over the view, so it takes the whole pane.
 */
export function BoardPane({ projectId, run, canMutate, board, onBoard, stats, profiling, onProfiling, onProfile, onViewer, onOverlay }: Props) {
    const [status, setStatus] = useState<WebGpuStatus | null>(null);
    const [building, setBuilding] = useState(false);
    const [viewer, setViewer] = useState<PrismSemanticViewerElement | null>(null);
    const [ready, setReady] = useState(false);
    const query = run.commit ? `?commit=${encodeURIComponent(run.commit)}` : "";

    const loadStatus = useCallback(async () => {
        try {
            setStatus(await fetchJson<WebGpuStatus>(`/api/projects/${encodeURIComponent(projectId)}/webgpu-3d/status${query}`));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    }, [projectId, query]);
    useEffect(() => { void loadStatus(); }, [loadStatus]);
    const pending = building || status?.status === "building";
    useEffect(() => {
        if (!pending) return;
        const timer = window.setInterval(() => void loadStatus(), 3000);
        return () => window.clearInterval(timer);
    }, [loadStatus, pending]);
    useEffect(() => { if (status?.status === "ready") setBuilding(false); }, [status?.status]);
    const build = async () => {
        setBuilding(true);
        try {
            await fetchApi(`/api/projects/${encodeURIComponent(projectId)}/webgpu-3d/generate`, {
                method: "POST",
                body: JSON.stringify({ commit: run.commit || undefined }),
            });
        } catch (error) {
            setBuilding(false);
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    useEffect(() => {
        setReady(false);
        onViewer?.(viewer);
        if (!viewer) return;
        const onReady = () => setReady(true);
        viewer.addEventListener("prism-semantic-viewer:ready", onReady);
        return () => viewer.removeEventListener("prism-semantic-viewer:ready", onReady);
    }, [viewer, onViewer]);

    const pack = useAnalyticPack(viewer, ready, runPackUrl(projectId, run.run_id));
    const overlay = useRunOverlay(viewer, pack.phase === "ready", projectId, run, board.quantity, board.arrows, board.net);
    useEffect(() => { onOverlay?.(overlay); }, [overlay, onOverlay]);
    const live = overlay.phase === "ready";
    const probe = useCursorProbe(viewer, live && board.mode === "flat");
    const look = useResultLook(viewer, live);
    const catalog = viewer?.analyticColormaps?.()?.colormaps ?? null;
    const bundleUrl = status?.available && status.bundle_url
        ? `${status.bundle_url}${status.bundle_url.includes("?") ? "&" : "?"}viewer=${encodeURIComponent(status.generated_at || "ready")}`
        : null;

    // Profile: two clicks on the copper, each read where it landed.
    const [marks, setMarks] = useState<{ point: ProfilePoint; x: number; y: number }[]>([]);
    useEffect(() => { if (!profiling) setMarks([]); }, [profiling]);
    const down = useRef<{ x: number; y: number } | null>(null);
    const pick = async (event: React.PointerEvent<HTMLDivElement>) => {
        const start = down.current;
        down.current = null;
        if (!profiling || !viewer || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const hit = await viewer.analyticAt(event.clientX, event.clientY);
        if (!hit?.boardMm) {
            toast.info("Click on the shown copper.");
            return;
        }
        const mark = { point: { mm: hit.boardMm as [number, number], sliceKey: hit.sliceKey }, x: event.clientX - rect.left, y: event.clientY - rect.top };
        const next = marks.length >= 2 ? [mark] : [...marks, mark];
        setMarks(next);
        if (next.length === 2) onProfile([next[0].point, next[1].point]);
    };

    const unit = displayUnit(live ? overlay.units : undefined);
    return (
        <div className="relative h-full min-h-0 overflow-hidden bg-muted/40"
            onPointerDown={(event) => { down.current = { x: event.clientX, y: event.clientY }; }}
            onPointerUp={(event) => void pick(event)}
            onPointerMove={probe.move}
            onPointerLeave={probe.leave}
        >
            {bundleUrl ? (
                <prism-semantic-viewer
                    key={bundleUrl}
                    ref={setViewer}
                    bundle-url={bundleUrl}
                    workspace="pcb"
                    active="true"
                    hide-panel="true"
                    className={cn("block h-full w-full", board.mode === "mountain" && "invisible")}
                />
            ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                    {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    <p>{pending ? "Building the 3D view of this revision…" : "This revision has no 3D view yet."}</p>
                    {!pending && canMutate && <Button size="sm" onClick={() => void build()}>Build 3D view</Button>}
                </div>
            )}
            {board.mode === "mountain" && live && (
                <div className="absolute inset-0 z-[5] bg-background pt-24">
                    <MountainView projectId={projectId} run={run} overlay={overlay} quantity={board.quantity} stops={look.fieldStops} />
                </div>
            )}

            <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2">
                <div className="pointer-events-auto flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-background/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
                    {stats}
                </div>
            </div>
            {live && (
                <div className="pointer-events-none absolute left-3 top-14 z-10 flex flex-wrap items-center gap-2">
                    <FloatingToolbar label="Field">
                        {overlay.fields.scalars.map((name) => (
                            <ToolbarButton key={name} active={board.quantity === name} title={FIELD_QUANTITIES[name]} aria-label={FIELD_QUANTITIES[name]}
                                onClick={() => onBoard({ quantity: name })}>
                                {FIELD_QUANTITIES[name]}
                            </ToolbarButton>
                        ))}
                    </FloatingToolbar>
                    <FloatingToolbar label="View">
                        <ToolbarButton active={board.mode === "flat"} title="Result on the copper" onClick={() => onBoard({ mode: "flat" })}>
                            <Layers className="size-3.5" aria-hidden /> Flat
                        </ToolbarButton>
                        <ToolbarButton active={board.mode === "mountain"} title="The field as height, one layer at a time" onClick={() => onBoard({ mode: "mountain" })}>
                            <Mountain className="size-3.5" aria-hidden /> Mountain
                        </ToolbarButton>
                    </FloatingToolbar>
                    {overlay.fieldNets.length > 1 && (
                        <FloatingToolbar label="Net">
                            <select aria-label="Net" className="h-7 rounded bg-transparent px-1.5 font-mono text-xs outline-none"
                                value={overlay.net ?? ""} onChange={(event) => onBoard({ net: event.target.value })}>
                                {overlay.fieldNets.map((name) => <option key={name} value={name}>{name}</option>)}
                            </select>
                        </FloatingToolbar>
                    )}
                    {board.mode === "flat" && (
                        <FloatingToolbar label="Tools">
                            {overlay.fields.vectors && (
                                <ToolbarButton active={board.arrows} title="Current arrows" onClick={() => onBoard({ arrows: !board.arrows })}>
                                    <ArrowUpRight className="size-3.5" aria-hidden /> Arrows
                                </ToolbarButton>
                            )}
                            <ToolbarButton active={profiling} title="Profile: click two points on the copper" onClick={() => onProfiling(!profiling)}>
                                <Ruler className="size-3.5" aria-hidden /> Profile
                            </ToolbarButton>
                        </FloatingToolbar>
                    )}
                    <div className="pointer-events-auto"><LookPanel look={look} catalog={catalog} /></div>
                </div>
            )}

            {(pack.phase === "loading" || overlay.phase === "loading") && (
                <Badge variant="secondary" className="absolute left-3 top-14 z-10 gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading result
                </Badge>
            )}
            {(pack.phase === "failed" || overlay.phase === "failed") && (
                <Badge variant="destructive" className="absolute left-3 top-14 z-10">
                    {pack.phase === "failed" ? pack.error : overlay.phase === "failed" ? overlay.error : ""}
                </Badge>
            )}
            {board.mode === "flat" && probe.reading && <ProbeMarker reading={probe.reading} />}
            {board.mode === "flat" && probe.reading && <ProbeLabel reading={probe.reading} />}
            {profiling && board.mode === "flat" && (
                <>
                    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full">
                        {marks.length === 2 && (
                            <line x1={marks[0].x} y1={marks[0].y} x2={marks[1].x} y2={marks[1].y} stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 3" />
                        )}
                        {marks.map((mark, index) => <circle key={index} cx={mark.x} cy={mark.y} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={1.5} />)}
                    </svg>
                    <Badge variant="info" className="absolute bottom-3 right-3 z-10 gap-1">
                        <Spline className="size-3" aria-hidden /> {marks.length === 1 ? "Click the end point" : "Click the start point"}
                    </Badge>
                </>
            )}
            {live && board.mode === "flat" && (
                <div className="absolute bottom-3 left-3 z-10 rounded-md border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
                    <div className="mb-1 font-medium">{FIELD_QUANTITIES[overlay.quantity as FieldQuantity] ?? overlay.quantity} ({unit.unit})</div>
                    <div className="h-2 w-48 rounded-sm" style={{ background: gradientOf(look.fieldStops) }} />
                    <div className="mt-1 flex justify-between font-mono text-muted-foreground">
                        <span>{formatValue(overlay.range[0], overlay.units, false)}</span>
                        <span>{overlay.quantity === "voltage_v" ? "" : "≥ "}{formatValue(overlay.range[1], overlay.units, false)}</span>
                    </div>
                    {overlay.arrows && (
                        <>
                            <div className="mb-1 mt-2 font-medium">Arrows: current, |J| ({displayUnit("A/m^2").unit})</div>
                            <div className="h-2 w-48 rounded-sm" style={{ background: gradientOf(look.arrowStops) }} />
                            <div className="mt-1 flex justify-between font-mono text-muted-foreground">
                                <span>0</span><span>≥ {formatValue(overlay.arrows.reference, "A/m^2", false)}</span>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

/** A headline number in the stat strip. */
export function Stat({ label, value, tone, onClick, title }: {
    label: string;
    value: string;
    tone?: "ok" | "bad";
    onClick?: () => void;
    title?: string;
}) {
    const body = (
        <>
            <span className="text-muted-foreground">{label}</span>
            <span className={cn("font-medium tabular-nums", tone === "ok" && "text-success", tone === "bad" && "text-destructive")}>{value}</span>
        </>
    );
    return onClick
        ? <button type="button" title={title} onClick={onClick} className="flex items-baseline gap-1.5 whitespace-nowrap hover:underline">{body}</button>
        : <span title={title} className="flex items-baseline gap-1.5 whitespace-nowrap">{body}</span>;
}

type ProbeReading = { hit: PrismAnalyticHit; x: number; y: number; left: number; top: number };

/**
 * The overlay value under the cursor: one viewer pick per animation frame
 * at most, none while a button is held (the camera is being dragged), and
 * a stale pick never replaces a newer one.
 */
function useCursorProbe(viewer: PrismSemanticViewerElement | null, active: boolean) {
    const [reading, setReading] = useState<ProbeReading | null>(null);
    const pending = useRef<{ clientX: number; clientY: number; x: number; y: number; left: number; top: number } | null>(null);
    const busy = useRef(false);
    const sequence = useRef(0);

    const flush = useCallback(async () => {
        if (busy.current || !viewer || !pending.current) return;
        busy.current = true;
        const point = pending.current;
        pending.current = null;
        const ticket = ++sequence.current;
        try {
            const hit = await viewer.analyticAt(point.clientX, point.clientY);
            if (ticket === sequence.current) {
                setReading(hit && Number.isFinite(hit.value) ? { hit, x: point.x, y: point.y, left: point.left, top: point.top } : null);
            }
        } catch {
            setReading(null);
        } finally {
            busy.current = false;
            if (pending.current) window.requestAnimationFrame(() => void flush());
        }
    }, [viewer]);

    const move = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!active || event.buttons !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        pending.current = { clientX: event.clientX, clientY: event.clientY, x: event.clientX - rect.left, y: event.clientY - rect.top, left: rect.left, top: rect.top };
        window.requestAnimationFrame(() => void flush());
    }, [active, flush]);

    const leave = useCallback(() => {
        pending.current = null;
        sequence.current += 1;
        setReading(null);
    }, []);

    useEffect(() => { if (!active) setReading(null); }, [active]);
    return { reading, move, leave };
}

/** Engineering units a board designer reads: A/mm^2 and W/mm^3 rather than SI per metre. */
export function displayUnit(units?: string): { scale: number; unit: string } {
    if (units === "A/m^2") return { scale: 1e-6, unit: "A/mm²" };
    if (units === "W/m^3") return { scale: 1e-9, unit: "W/mm³" };
    return { scale: 1, unit: units ?? "" };
}

export function formatValue(value: number, units?: string, withUnit = true): string {
    if (units === "V") return withUnit ? `${value.toFixed(5)} V` : value.toFixed(4);
    const { scale, unit } = displayUnit(units);
    const shown = value * scale;
    const magnitude = Math.abs(shown);
    const text = magnitude !== 0 && (magnitude < 1e-2 || magnitude >= 1e4) ? shown.toExponential(3) : shown.toPrecision(4);
    return withUnit && unit ? `${text} ${unit}` : text;
}

/** A ring on the copper face being read, drawn with that face's tilt. */
function ProbeMarker({ reading }: { reading: ProbeReading }) {
    const marker = reading.hit.marker;
    if (!marker) return null;
    const at = (p: { x: number; y: number }) => `${p.x - reading.left},${p.y - reading.top}`;
    const centre = { x: marker.centre.x - reading.left, y: marker.centre.y - reading.top };
    return (
        <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible">
            <polygon points={marker.ring.map(at).join(" ")} fill="rgba(255,255,255,0.18)" stroke="black" strokeWidth={3} strokeOpacity={0.55} />
            <polygon points={marker.ring.map(at).join(" ")} fill="none" stroke="white" strokeWidth={1.5} />
            <circle cx={centre.x} cy={centre.y} r={1.8} fill="white" stroke="black" strokeWidth={0.8} />
        </svg>
    );
}

/** A small label next to the cursor: the value, and where it was read. */
function ProbeLabel({ reading }: { reading: ProbeReading }) {
    const { hit, x, y } = reading;
    const where = [
        hit.sliceKey?.replace(/^copper\./, ""),
        hit.boardMm ? `${hit.boardMm[0].toFixed(2)}, ${hit.boardMm[1].toFixed(2)} mm` : null,
    ].filter(Boolean).join(" · ");
    return (
        <div className="pointer-events-none absolute z-10 rounded-md border bg-background/95 px-2 py-1 text-xs shadow-sm" style={{ left: x + 14, top: y + 14 }}>
            <div className="font-mono font-medium">{formatValue(hit.value as number, hit.units)}</div>
            {where && <div className="text-muted-foreground">{where}</div>}
        </div>
    );
}
