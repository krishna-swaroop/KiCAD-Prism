import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAnalyticPack } from "@/hooks/use-analytic-pack";
import { fetchApi, fetchJson } from "@/lib/api";
import type { PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

import { runPackUrl, useRunOverlay } from "./run-overlay";
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

const VIRIDIS = "linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)";

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
    const overlay = useRunOverlay(viewer, pack.phase === "ready", projectId, run);
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
                    </>
                )}
            </header>
            <div className="relative h-[460px] overflow-hidden rounded-md border bg-muted">
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
                {overlay.phase === "ready" && (
                    <div className="absolute bottom-3 left-3 rounded-md bg-background/90 px-3 py-2 text-xs shadow-sm">
                        <div className="mb-1 font-medium">{overlay.quantity} ({overlay.units})</div>
                        <div className="h-2 w-48 rounded" style={{ background: VIRIDIS }} />
                        <div className="mt-1 flex justify-between font-mono">
                            <span>{overlay.range[0].toFixed(3)}</span>
                            <span>{overlay.range[1].toFixed(3)}</span>
                        </div>
                    </div>
                )}
            </div>
            {overlay.phase === "ready" && overlay.result.summary && <Summary summary={overlay.result.summary} />}
        </section>
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
