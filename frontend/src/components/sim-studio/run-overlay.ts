import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api";
import type { PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

import type { DcDropAnalysis, SimRun, SimSetup } from "./types";

export const runBase = (projectId: string, runId: string) =>
    `/api/projects/${encodeURIComponent(projectId)}/sim/a0/runs/${encodeURIComponent(runId)}`;

/** The run's own materialization: result indices refer to exactly this geometry. */
export const runPackUrl = (projectId: string, runId: string) => `${runBase(projectId, runId)}/materialization`;

interface ResultArtifact {
    kind: string;
    path: string;
}

interface OperationValues {
    quantity: { name: string; unit: string };
    operation_indices: number[];
    values: number[];
    value_range?: { min: number; max: number };
}

export interface LoadResult {
    load: string;
    min_voltage_v: number;
    max_voltage_v: number;
    max_drop_v: number;
}

export interface RunResult {
    status: string;
    engine: { id: string; engine_version: string };
    summary?: {
        loads: LoadResult[];
        sources: { source: string; current_a: number }[];
        probes: { probe: string; voltage_v: number }[];
    };
    artifacts: ResultArtifact[];
}

export type RunOverlayState =
    | { phase: "off" }
    | { phase: "loading" }
    | {
        phase: "ready";
        quantity: string;
        units: string;
        range: [number, number];
        count: number;
        nets: string[];
        result: RunResult;
    }
    | { phase: "failed"; error: string };

/** Net names of the rails the run's analysis solved, from its frozen setup. */
export function solvedNets(setup: SimSetup, analysisId: string): string[] {
    const analysis = setup.analyses.find((item: DcDropAnalysis) => item.id === analysisId);
    const rails = new Set(analysis?.rails ?? []);
    return setup.rails
        .filter((rail) => rails.has(rail.id))
        .map((rail) => rail.net.slice(rail.net.indexOf(":") + 1));
}

/**
 * Shows a run's result on the viewer once the run's pack is drawn
 * (`packReady`): colours each operation by its value, and isolates the nets
 * the analysis solved, so only that copper shows. The viewer's result
 * colours outrank its lit-net glow. Clears both when the run changes.
 */
export function useRunOverlay(
    viewer: PrismSemanticViewerElement | null,
    packReady: boolean,
    projectId: string,
    run: SimRun | null,
): RunOverlayState {
    const [state, setState] = useState<RunOverlayState>({ phase: "off" });
    const runId = run?.run_id ?? null;
    const analysisId = run?.analysis_id ?? "";

    useEffect(() => {
        if (!viewer || !packReady || !runId || typeof viewer.setAnalyticOverlay !== "function") {
            setState({ phase: "off" });
            return;
        }
        let cancelled = false;
        let isolate: () => void = () => undefined;
        const stopIsolating = () => {
            viewer.removeEventListener("prism-semantic-viewer:viewstatechange", isolate);
            viewer.removeEventListener("prism-semantic-viewer:ready", isolate);
        };
        setState({ phase: "loading" });
        void (async () => {
            try {
                const base = runBase(projectId, runId);
                const [result, setup] = await Promise.all([
                    fetchJson<RunResult>(`${base}/result`),
                    fetchJson<SimSetup>(`${base}/setup`),
                ]);
                const artifact = result.artifacts.find((item) => item.kind === "operation-values");
                if (!artifact) throw new Error("The run has no per-operation result");
                const document = await fetchJson<OperationValues>(`${base}/files/${artifact.path}`);
                if (cancelled) return;
                const values: Record<number, number> = {};
                document.operation_indices.forEach((index, position) => { values[index] = document.values[position]; });
                const range: [number, number] = document.value_range
                    ? [document.value_range.min, document.value_range.max]
                    : [Math.min(...document.values), Math.max(...document.values)];
                viewer.setAnalyticOverlay({ kind: "operation_values", quantity: document.quantity.name, units: document.quantity.unit, values, range });
                const nets = solvedNets(setup, analysisId);
                isolate = () => {
                    if (cancelled || viewer.getViewState?.()?.isolateNet) {
                        stopIsolating();
                        return;
                    }
                    viewer.setHighlightedNets?.(nets.map((netName) => ({ netName })));
                    viewer.setNetIsolation?.(true);
                };
                // The viewer loads its net table progressively; isolation takes once the nets resolve.
                viewer.addEventListener("prism-semantic-viewer:viewstatechange", isolate);
                viewer.addEventListener("prism-semantic-viewer:ready", isolate);
                isolate();
                setState({ phase: "ready", quantity: document.quantity.name, units: document.quantity.unit, range, count: document.values.length, nets, result });
            } catch (error) {
                if (!cancelled) setState({ phase: "failed", error: error instanceof Error ? error.message : String(error) });
            }
        })();
        return () => {
            cancelled = true;
            stopIsolating();
            viewer.setAnalyticOverlay?.(null);
            viewer.setNetIsolation?.(false);
            viewer.setHighlightedNets?.([]);
        };
    }, [analysisId, packReady, projectId, runId, viewer]);

    return state;
}
