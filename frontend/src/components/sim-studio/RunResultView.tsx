import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAnalyticPack } from "@/hooks/use-analytic-pack";
import { fetchApi, fetchJson } from "@/lib/api";
import type { PrismAnalyticHit, PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

import { LookPanel, gradientOf, useResultLook } from "./result-look";
import { FIELD_QUANTITIES, type FieldQuantity, runPackUrl, useRunOverlay } from "./run-overlay";
import type { SimRun } from "./types";

interface WebGpuStatus {
    available: boolean;
    status: string;
    bundle_url?: string;
    generated_at?: string;
}

type Props = {
    projectId: string;
    run: SimRun;
    canMutate: boolean;
};


/**
 * A run's result, inside Simulation Studio: the regular semantic viewer on
 * the run revision's cached 3D bundle, drawing the run's own analytic pack,
 * with the solved nets isolated and coloured by the result.
 */
export function RunResultView({ projectId, run, canMutate }: Props) {
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
        if (!viewer) return;
        const onReady = () => setReady(true);
        viewer.addEventListener("prism-semantic-viewer:ready", onReady);
        return () => viewer.removeEventListener("prism-semantic-viewer:ready", onReady);
    }, [viewer]);

    const pack = useAnalyticPack(viewer, ready, runPackUrl(projectId, run.run_id));
    const [quantity, setQuantity] = useState<FieldQuantity>("voltage_v");
    const [arrows, setArrows] = useState(false);
    const overlay = useRunOverlay(viewer, pack.phase === "ready", projectId, run, quantity, arrows);
    const probe = useCursorProbe(viewer, overlay.phase === "ready");
    const look = useResultLook(viewer, overlay.phase === "ready");
    const catalog = viewer?.analyticColormaps?.()?.colormaps ?? null;
    const bundleUrl = status?.available && status.bundle_url
        ? `${status.bundle_url}${status.bundle_url.includes("?") ? "&" : "?"}viewer=${encodeURIComponent(status.generated_at || "ready")}`
        : null;

    return (
        <section aria-label="Run result" className="space-y-2">
            <header className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">Result · {run.run_id}</h3>
                {overlay.phase === "ready" && (
                    <>
                        <Badge variant="outline">{overlay.result.engine.id} {overlay.result.engine.engine_version}</Badge>
                        <Badge variant="outline">{overlay.nets.join(", ")}</Badge>
                        <select
                            aria-label="Field"
                            className="ml-auto h-7 rounded-md border bg-background px-2 text-xs"
                            value={quantity}
                            onChange={(event) => setQuantity(event.target.value as FieldQuantity)}
                        >
                            {overlay.fields.scalars.map((name) => <option key={name} value={name}>{FIELD_QUANTITIES[name]}</option>)}
                        </select>
                        {overlay.fields.vectors && (
                            <label className="flex items-center gap-1 text-xs">
                                <input type="checkbox" checked={arrows} onChange={() => setArrows(!arrows)} />
                                Current arrows
                            </label>
                        )}
                        <LookPanel look={look} catalog={catalog} />
                    </>
                )}
            </header>
            <div
                className="relative h-[460px] overflow-hidden rounded-md border bg-muted"
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
                        className="block h-full w-full"
                    />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                        <p>{pending ? "Building the 3D view of this revision..." : "This revision has no 3D view yet."}</p>
                        {!pending && canMutate && <Button size="sm" onClick={() => void build()}>Build 3D view</Button>}
                    </div>
                )}
                {(pack.phase === "loading" || overlay.phase === "loading") && (
                    <Badge variant="secondary" className="absolute left-3 top-3 gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading result
                    </Badge>
                )}
                {(pack.phase === "failed" || overlay.phase === "failed") && (
                    <Badge variant="destructive" className="absolute left-3 top-3">
                        {pack.phase === "failed" ? pack.error : overlay.phase === "failed" ? overlay.error : ""}
                    </Badge>
                )}
                {probe.reading && <ProbeMarker reading={probe.reading} />}
                {probe.reading && <ProbeLabel reading={probe.reading} />}
                {overlay.phase === "ready" && (
                    <div className="absolute bottom-3 left-3 rounded-md bg-background/90 px-3 py-2 text-xs shadow-sm">
                        <div className="mb-1 font-medium">{FIELD_QUANTITIES[overlay.quantity as FieldQuantity] ?? overlay.quantity} ({displayUnit(overlay.units).unit})</div>
                        <div className="h-2 w-48 rounded" style={{ background: gradientOf(look.fieldStops) }} />
                        <div className="mt-1 flex justify-between font-mono">
                            <span>{formatValue(overlay.range[0], overlay.units, false)}</span>
                            <span>{overlay.quantity === "voltage_v" ? "" : "≥ "}{formatValue(overlay.range[1], overlay.units, false)}</span>
                        </div>
                        {overlay.arrows && (
                            <>
                                <div className="mb-1 mt-2 font-medium">Arrows: current flow, |J| ({displayUnit("A/m^2").unit})</div>
                                <div className="h-2 w-48 rounded" style={{ background: gradientOf(look.arrowStops) }} />
                                <div className="mt-1 flex justify-between font-mono">
                                    <span>0</span>
                                    <span>≥ {formatValue(overlay.arrows.reference, "A/m^2", false)}</span>
                                </div>
                                <div className="mt-1 text-muted-foreground">
                                    Longer and further along the ramp with more current; peak {formatValue(overlay.arrows.max, "A/m^2")}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
            {overlay.phase === "ready" && overlay.result.realization && <MeshLine realization={overlay.result.realization} />}
            {overlay.phase === "ready" && overlay.result.summary && <Summary summary={overlay.result.summary} />}
        </section>
    );
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
function displayUnit(units?: string): { scale: number; unit: string } {
    if (units === "A/m^2") return { scale: 1e-6, unit: "A/mm²" };
    if (units === "W/m^3") return { scale: 1e-9, unit: "W/mm³" };
    return { scale: 1, unit: units ?? "" };
}

function formatValue(value: number, units?: string, withUnit = true): string {
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
        <div
            className="pointer-events-none absolute z-10 rounded-md bg-background/95 px-2 py-1 text-xs shadow-md ring-1 ring-border"
            style={{ left: x + 14, top: y + 14 }}
        >
            <div className="font-mono font-medium">{formatValue(hit.value as number, hit.units)}</div>
            {where && <div className="text-muted-foreground">{where}</div>}
        </div>
    );
}

const STOP_REASONS: Record<string, string> = {
    "unknown-budget": "reached the unknown budget",
    "max-passes": "reached the pass limit",
    "target-error": "reached the target error",
    "nothing-to-refine": "nothing left to refine",
};

/** How the result was discretized: the uniform pitch, or the adaptive passes. */
function MeshLine({ realization }: { realization: import("./run-overlay").RunRealization }) {
    const mesh = realization.mesh;
    const grid = realization.grids?.[0];
    if (!mesh || !grid) return null;
    const um = (m: number) => `${(m * 1e6).toFixed(m < 1e-5 ? 1 : 0)} µm`;
    const adaptive = mesh.adaptive;
    if (!adaptive) {
        return (
            <p className="text-xs text-muted-foreground">
                Uniform mesh · {mesh.unknowns.toLocaleString()} unknowns · {um(grid.dx_m)} cells
            </p>
        );
    }
    const last = adaptive.passes[adaptive.passes.length - 1];
    const finest = grid.dx_m / 2 ** (last?.max_level ?? 0);
    return (
        <p className="text-xs text-muted-foreground">
            Adaptive mesh · {adaptive.passes.length} passes · {mesh.unknowns.toLocaleString()} unknowns · cells
            {" "}{um(grid.dx_m)} down to {um(finest)} · {STOP_REASONS[adaptive.stop] ?? adaptive.stop}
        </p>
    );
}

function Summary({ summary }: { summary: NonNullable<import("./run-overlay").RunResult["summary"]> }) {
    return (
        <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
                <tr><th className="py-1">Load</th><th>Min V</th><th>Max V</th><th>Max drop</th></tr>
            </thead>
            <tbody className="font-mono">
                {summary.loads.map((load) => (
                    <tr key={load.load}>
                        <td className="py-0.5">{load.load}</td>
                        <td>{load.min_voltage_v.toFixed(4)}</td>
                        <td>{load.max_voltage_v.toFixed(4)}</td>
                        <td>{(load.max_drop_v * 1000).toFixed(1)} mV</td>
                    </tr>
                ))}
                {summary.sources.map((source) => (
                    <tr key={source.source} className="text-muted-foreground">
                        <td className="py-0.5">{source.source} (source)</td>
                        <td colSpan={3}>{source.current_a.toFixed(3)} A</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
