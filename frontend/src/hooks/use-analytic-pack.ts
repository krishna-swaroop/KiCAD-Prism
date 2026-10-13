import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import { isAbortError } from "@/lib/jobs";
import type { PrismAnalyticStats, PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

export type AnalyticPackState =
    | { phase: "off" }
    | { phase: "loading" }
    | { phase: "ready"; stats: PrismAnalyticStats | null }
    | { phase: "failed"; error: string };

/**
 * Draws the board from the analytic pack the backend wrote beside the 3D
 * bundle (`PRISM_ANALYTIC_PCB_ENABLED`). Without a pack URL the mesh board
 * stays. The element replays a loaded pack across its own reloads, so this
 * loads once per pack URL and unloads when the URL goes away.
 */
export function useAnalyticPack(
    viewer: PrismSemanticViewerElement | null,
    viewerReady: boolean,
    packUrl: string | null | undefined,
): AnalyticPackState {
    const [state, setState] = useState<AnalyticPackState>({ phase: "off" });

    useEffect(() => {
        if (!viewer || !viewerReady || !packUrl || typeof viewer.loadAnalyticPack !== "function") {
            setState({ phase: "off" });
            return;
        }
        const controller = new AbortController();
        setState({ phase: "loading" });
        void (async () => {
            try {
                const response = await fetchApi(packUrl, { signal: controller.signal });
                if (!response.ok) throw new Error(`Analytic pack request failed (${response.status})`);
                const bytes = await response.arrayBuffer();
                if (controller.signal.aborted) return;
                const stats = await viewer.loadAnalyticPack(bytes);
                if (!controller.signal.aborted) setState({ phase: "ready", stats });
            } catch (error) {
                if (controller.signal.aborted || isAbortError(error)) return;
                viewer.unloadAnalyticPack?.();
                setState({ phase: "failed", error: error instanceof Error ? error.message : String(error) });
            }
        })();
        return () => {
            controller.abort();
            viewer.unloadAnalyticPack?.();
        };
    }, [packUrl, viewer, viewerReady]);

    return state;
}
