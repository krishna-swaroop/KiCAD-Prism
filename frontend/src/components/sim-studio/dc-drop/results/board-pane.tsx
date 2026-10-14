import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Loader2, Ruler } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalyticPack } from "@/hooks/use-analytic-pack";
import { fetchApi, fetchJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

import { LookPanel, gradientOf, useResultLook } from "../../result-look";
import { FIELD_QUANTITIES, type FieldQuantity, runPackUrl, useRunOverlay, type RunOverlayState } from "../../run-overlay";
import type { SimRun } from "../../types";

import { CursorProbe } from "./cursor-probe";
import { displayUnit, formatValue } from "./format";
import { ProfileTool } from "./profile-tool";

interface WebGpuStatus {
    available: boolean;
    status: string;
    bundle_url?: string;
    generated_at?: string;
}

/** Toolbar labels; the full names are the buttons' titles. */
const SHORT_QUANTITY: Partial<Record<FieldQuantity, string>> = {
    voltage_v: "Voltage",
    current_density_a_per_m2: "Current",
    power_density_w_per_m3: "Power",
};

export interface ProfilePoint {
    mm: [number, number];
    sliceKey?: string;
}

export interface BoardState {
    quantity: FieldQuantity;
    net: string | null;
    arrows: boolean;
}

type Props = {
    projectId: string;
    run: SimRun;
    canMutate: boolean;
    board: BoardState;
    onBoard: (change: Partial<BoardState>) => void;
    /** Profile tool: a line between two clicks on the copper. */
    profiling: boolean;
    onProfiling: (on: boolean) => void;
    onProfile: (points: [ProfilePoint, ProfilePoint] | null) => void;
    onViewer?: (viewer: PrismSemanticViewerElement | null) => void;
    onOverlay?: (overlay: RunOverlayState) => void;
};

/**
 * The run on the board: Prism's WebGPU viewer with the result over the
 * copper, under one docked toolbar of the view's controls.
 */
export function BoardPane({ projectId, run, canMutate, board, onBoard, profiling, onProfiling, onProfile, onViewer, onOverlay }: Props) {
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
    const [host, setHost] = useState<HTMLDivElement | null>(null);
    const look = useResultLook(viewer, live);
    const catalog = viewer?.analyticColormaps?.()?.colormaps ?? null;
    const bundleUrl = status?.available && status.bundle_url
        ? `${status.bundle_url}${status.bundle_url.includes("?") ? "&" : "?"}viewer=${encodeURIComponent(status.generated_at || "ready")}`
        : null;

    const unit = displayUnit(live ? overlay.units : undefined);
    return (
        <div className="flex h-full min-h-0 flex-col">
            {live && (
                <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b bg-background px-2 py-1">
                    <Tabs value={board.quantity} onValueChange={(value) => onBoard({ quantity: value as FieldQuantity })}>
                        <TabsList className="h-7">
                            {overlay.fields.scalars.map((name) => <TabsTrigger key={name} value={name} title={FIELD_QUANTITIES[name]} className="text-xs">{SHORT_QUANTITY[name] ?? FIELD_QUANTITIES[name]}</TabsTrigger>)}
                        </TabsList>
                    </Tabs>
                    {overlay.fieldNets.length > 1 && (
                        <Select value={overlay.net ?? ""} onValueChange={(value) => onBoard({ net: value })}>
                            <SelectTrigger size="sm" aria-label="Net" className="h-7 min-w-24 font-mono text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {overlay.fieldNets.map((name) => <SelectItem key={name} value={name} className="font-mono text-xs">{name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                    <Separator orientation="vertical" className="h-5" />
                    {overlay.fields.vectors && (
                        <Toggle on={board.arrows} title="Current arrows" onClick={() => onBoard({ arrows: !board.arrows })}>
                            <ArrowUpRight aria-hidden /> Arrows
                        </Toggle>
                    )}
                    <Toggle on={profiling} title="Draw a line on the copper and plot the field along it" onClick={() => onProfiling(!profiling)}>
                        <Ruler aria-hidden /> Profile
                    </Toggle>
                    <div className="ml-auto"><LookPanel look={look} catalog={catalog} /></div>
                </div>
            )}
            <div ref={setHost} className="relative min-h-0 flex-1 overflow-hidden bg-muted/40">
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
                        <p>{pending ? "Building the 3D view of this revision…" : "This revision has no 3D view yet."}</p>
                        {!pending && canMutate && <Button size="sm" onClick={() => void build()}>Build 3D view</Button>}
                    </div>
                )}
                {(pack.phase === "loading" || overlay.phase === "loading") && (
                    <Badge variant="secondary" className="absolute left-3 top-3 z-10 gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading result
                    </Badge>
                )}
                {(pack.phase === "failed" || overlay.phase === "failed") && (
                    <Badge variant="destructive" className="absolute left-3 top-3 z-10">
                        {pack.phase === "failed" ? pack.error : overlay.phase === "failed" ? overlay.error : ""}
                    </Badge>
                )}
                <CursorProbe viewer={viewer} host={host} active={live && !profiling} />
                <ProfileTool viewer={viewer} host={host} active={live && profiling} units={live ? overlay.units : undefined}
                    onLine={(line) => onProfile(line && [{ mm: line[0].mm, sliceKey: line[0].sliceKey }, { mm: line[1].mm, sliceKey: line[1].sliceKey }])} />
                {/* Bottom right: the viewer keeps its axis gizmo in the bottom-left corner. */}
                {live && (
                    <div className="absolute bottom-3 right-3 z-10 rounded-md border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
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
        </div>
    );
}

/** A toolbar button that stays pressed while its tool is on. */
function Toggle({ on, title, onClick, children }: { on: boolean; title: string; onClick: () => void; children: ReactNode }) {
    return (
        <Button variant="ghost" size="xs" title={title} aria-pressed={on} onClick={onClick}
            className={cn("text-muted-foreground", on && "bg-muted text-foreground")}>
            {children}
        </Button>
    );
}
