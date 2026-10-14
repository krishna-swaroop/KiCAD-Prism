import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api";
import type { PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

/** Query parameter that opens the PCB 3D tab on a simulation run's result. */
export const SIM_RUN_PARAM = "simRun";

export const runBase = (projectId: string, runId: string) =>
    `/api/projects/${encodeURIComponent(projectId)}/sim/a0/runs/${encodeURIComponent(runId)}`;

/** The run's own materialization: overlay indices refer to exactly this geometry. */
export const runPackUrl = (projectId: string, runId: string) => `${runBase(projectId, runId)}/materialization`;

interface ResultArtifact {
    kind: string;
    path: string;
    quantity?: string;
}

interface OperationValues {
    quantity: { name: string; unit: string };
    operation_indices: number[];
    values: number[];
    value_range?: { min: number; max: number };
}

export type SimOverlayState =
    | { phase: "off" }
    | { phase: "loading" }
    | { phase: "ready"; quantity: string; units: string; range: [number, number]; count: number }
    | { phase: "failed"; error: string };

/**
 * Colours the analytic board from a run's per-operation result once the
 * run's pack is drawn (`packReady`). Clears the overlay when the run changes
 * or the tab unmounts.
 */
export function useSimRunOverlay(
    viewer: PrismSemanticViewerElement | null,
    packReady: boolean,
    projectId: string,
    runId: string | null,
): SimOverlayState {
    const [state, setState] = useState<SimOverlayState>({ phase: "off" });

    useEffect(() => {
        if (!viewer || !packReady || !runId || typeof viewer.setAnalyticOverlay !== "function") {
            setState({ phase: "off" });
            return;
        }
        let cancelled = false;
        setState({ phase: "loading" });
        void (async () => {
            try {
                const result = await fetchJson<{ artifacts: ResultArtifact[] }>(`${runBase(projectId, runId)}/result`);
                const artifact = result.artifacts.find((item) => item.kind === "operation-values");
                if (!artifact) throw new Error("The run has no per-operation result");
                const document = await fetchJson<OperationValues>(`${runBase(projectId, runId)}/files/${artifact.path}`);
                if (cancelled) return;
                const values: Record<number, number> = {};
                document.operation_indices.forEach((index, position) => { values[index] = document.values[position]; });
                const range: [number, number] = document.value_range
                    ? [document.value_range.min, document.value_range.max]
                    : [Math.min(...document.values), Math.max(...document.values)];
                viewer.setAnalyticOverlay({
                    kind: "operation_values",
                    quantity: document.quantity.name,
                    units: document.quantity.unit,
                    values,
                    range,
                });
                setState({ phase: "ready", quantity: document.quantity.name, units: document.quantity.unit, range, count: document.values.length });
            } catch (error) {
                if (!cancelled) setState({ phase: "failed", error: error instanceof Error ? error.message : String(error) });
            }
        })();
        return () => {
            cancelled = true;
            viewer.setAnalyticOverlay?.(null);
        };
    }, [packReady, projectId, runId, viewer]);

    return state;
}
