import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { ResizablePanel } from "@/components/ui/resizable-panel";
import { fetchJson } from "@/lib/api";
import type { PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

import { runBase, type RunOverlayState, type RunResult } from "../../run-overlay";
import type { SimRun, SimSetup } from "../../types";

import { BoardPane, Stat, type BoardState, type ProfilePoint } from "./board-pane";
import { Drawer, type DrawerTab } from "./drawer";
import { amps, density, percent, volts, watts, buildResultsModel, type ResultsModel } from "./results-model";
import { SidePanel, type Focus } from "./side-panel";

const DRAWER_KEY = "prism.sim.dc.results-drawer";

function storedHeight(): number {
    try {
        const value = Number(window.localStorage.getItem(DRAWER_KEY));
        return Number.isFinite(value) && value >= 120 ? value : 280;
    } catch {
        return 280;
    }
}

type Props = {
    projectId: string;
    run: SimRun;
    canMutate: boolean;
    /** The board viewer, for the studio's search. */
    onViewer?: (viewer: PrismSemanticViewerElement | null) => void;
};

/**
 * One run's results: the board (with headline numbers over it), a side panel
 * that suits the setup's shape, and an analysis drawer below.
 */
export function ResultsView({ projectId, run, canMutate, onViewer }: Props) {
    const [data, setData] = useState<{ result: RunResult; setup: SimSetup } | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    useEffect(() => {
        setData(null);
        setFailed(null);
        let cancelled = false;
        const base = runBase(projectId, run.run_id);
        Promise.all([fetchJson<RunResult>(`${base}/result`), fetchJson<SimSetup>(`${base}/setup`)])
            .then(([result, setup]) => { if (!cancelled) setData({ result, setup }); })
            .catch((error) => { if (!cancelled) setFailed(error instanceof Error ? error.message : String(error)); });
        return () => { cancelled = true; };
    }, [projectId, run.run_id]);
    const model = useMemo(() => (data ? buildResultsModel(data.result, data.setup, run.analysis_id) : null), [data, run.analysis_id]);

    const [board, setBoard] = useState<BoardState>({ quantity: "voltage_v", net: null, arrows: false, mode: "flat" });
    const changeBoard = useCallback((change: Partial<BoardState>) => setBoard((current) => ({ ...current, ...change })), []);
    const [profiling, setProfiling] = useState(false);
    const [points, setPoints] = useState<[ProfilePoint, ProfilePoint] | null>(null);
    const [tab, setTab] = useState<DrawerTab>("loads");
    const [overlay, setOverlay] = useState<RunOverlayState>({ phase: "off" });
    const viewer = useRef<PrismSemanticViewerElement | null>(null);
    const registerViewer = useCallback((value: PrismSemanticViewerElement | null) => {
        viewer.current = value;
        onViewer?.(value);
    }, [onViewer]);

    const focus = useCallback((target: Focus) => {
        const fieldNets = overlay.phase === "ready" ? overlay.fieldNets : [];
        if (target.net && fieldNets.includes(target.net)) changeBoard({ net: target.net, mode: "flat" });
        else if (target.net) viewer.current?.setSelection?.({ netName: target.net });
        if (target.component) {
            changeBoard({ mode: "flat" });
            viewer.current?.setSelection?.({ reference: target.component });
        }
    }, [changeBoard, overlay]);

    const [height, setHeight] = useState(storedHeight);
    const drag = useRef<{ y: number; h: number } | null>(null);
    const onDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;
        const next = Math.min(window.innerHeight * 0.7, Math.max(120, drag.current.h - (event.clientY - drag.current.y)));
        setHeight(next);
    };
    const endDrag = () => {
        drag.current = null;
        try { window.localStorage.setItem(DRAWER_KEY, String(Math.round(height))); } catch { /* the size is only a preference */ }
    };

    if (failed) return <p className="p-6 text-sm text-destructive">{failed}</p>;
    if (!data || !model) return <div className="flex flex-1 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
                <div className="min-w-0 flex-1">
                    <BoardPane
                        projectId={projectId}
                        run={run}
                        canMutate={canMutate}
                        board={board}
                        onBoard={changeBoard}
                        stats={<Stats model={model} onFocus={focus} onTab={setTab} onBoard={changeBoard} />}
                        profiling={profiling}
                        onProfiling={(on) => { setProfiling(on); if (on) setTab("profile"); }}
                        onProfile={(next) => { setPoints(next); setTab("profile"); }}
                        onViewer={registerViewer}
                        onOverlay={setOverlay}
                    />
                </div>
                <ResizablePanel side="left" storageKey="prism.sim.dc.results-side" defaultWidth={380} minWidth={280} maxWidth={720}
                    aria-label="Result summary" className="border-l">
                    <SidePanel model={model} onFocus={focus} />
                </ResizablePanel>
            </div>
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize the analysis drawer"
                className="h-1.5 shrink-0 cursor-row-resize border-t bg-background hover:bg-accent"
                onPointerDown={(event) => { drag.current = { y: event.clientY, h: height }; event.currentTarget.setPointerCapture(event.pointerId); }}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
            />
            <div style={{ height }} className="shrink-0">
                <Drawer
                    projectId={projectId}
                    run={run}
                    result={data.result}
                    model={model}
                    tab={tab}
                    onTab={setTab}
                    net={overlay.phase === "ready" ? overlay.net : null}
                    quantity={board.quantity}
                    profilePoints={points}
                    onFocus={focus}
                />
            </div>
        </div>
    );
}

/** The headline numbers for the setup's shape; each opens where it comes from. */
function Stats({ model, onFocus, onTab, onBoard }: {
    model: ResultsModel;
    onFocus: (focus: Focus) => void;
    onTab: (tab: DrawerTab) => void;
    onBoard: (change: Partial<BoardState>) => void;
}) {
    const worst = model.worst;
    const worstText = worst ? `${volts(worst.dropV)} · ${worst.component ?? worst.id} · ${percent(worst.share)}` : "—";
    const worstStat = (
        <Stat label="Worst drop" value={worstText} tone={worst?.share !== undefined ? (worst.share > 1 ? "bad" : "ok") : undefined}
            title="Largest drop against its budget (5 % of the rail unless the rail sets a tolerance)"
            onClick={() => { onTab("loads"); if (worst) onFocus({ component: worst.component }); }} />
    );
    const copper = <Stat label="Copper loss" value={watts(model.copperLossW)} onClick={() => onTab(model.rails.length > 1 ? "rails" : "loads")} />;
    const peak = model.peakJ && (
        <Stat label="Peak density" value={`${density(model.peakJ.value)}${model.peakJ.net ? ` · ${model.peakJ.net}` : ""}`}
            onClick={() => onBoard({ quantity: "current_density_a_per_m2", ...(model.peakJ?.net ? { net: model.peakJ.net } : {}), mode: "flat" })} />
    );
    if (model.shape === "tree") {
        const input = model.inputs[0];
        return (
            <>
                <Stat label="Input" value={`${watts(model.inputW)}${input ? ` · ${amps(input.currentA)}` : ""}`} title={model.inputs.map((item) => `${item.component ?? item.source}: ${amps(item.currentA)}`).join(", ")} />
                <Stat label="Efficiency" value={percent(model.efficiency)} title={`Converter losses ${watts(model.converterLossW)}`} onClick={() => onTab("converters")} />
                {worstStat}{copper}{peak}
            </>
        );
    }
    return (
        <>
            {model.rails.map((rail) => <Stat key={rail.id} label={rail.net} value={amps(rail.currentA)} onClick={() => onFocus({ net: rail.net })} />)}
            {worstStat}{copper}{peak}
        </>
    );
}
