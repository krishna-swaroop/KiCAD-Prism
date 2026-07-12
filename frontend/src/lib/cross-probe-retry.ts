import { useCallback, useEffect, useRef } from "react";
import type { CrossProbeContext, ECadViewerElement } from "@/types/ecad-viewer";

// Modelled on visualizer.tsx — same constants and per-context run-id +
// timer pattern. ~1.4 s total retry window, with stale-probe cancellation.
const CROSS_PROBE_MAX_RETRIES = 12;
const CROSS_PROBE_RETRY_DELAY_MS = 120;

type TimerMap = Record<CrossProbeContext, number | null>;
type RunIdMap = Record<CrossProbeContext, number>;

/**
 * Returns a `run(viewer, sourceContext, targetContext, designator)` function
 * that calls `viewer.requestCrossProbe(...)` and retries up to 12 times at
 * 120 ms when the viewer reports "target-not-available". A new call cancels
 * any in-flight retries for the same targetContext via a run-id check.
 *
 * The hook cleans up its own timers on unmount.
 */
export function useCrossProbeRunner() {
    const timerRef = useRef<TimerMap>({ SCH: null, PCB: null });
    const runIdRef = useRef<RunIdMap>({ SCH: 0, PCB: 0 });

    const clearRetry = useCallback((targetContext: CrossProbeContext) => {
        const t = timerRef.current[targetContext];
        if (t !== null) {
            window.clearTimeout(t);
            timerRef.current[targetContext] = null;
        }
    }, []);

    const run = useCallback(function run(
        viewer: ECadViewerElement | null,
        sourceContext: CrossProbeContext,
        targetContext: CrossProbeContext,
        designator: string,
        attempts = 0,
        runId?: number,
    ) {
        if (attempts === 0) {
            clearRetry(targetContext);
            runIdRef.current[targetContext] += 1;
            runId = runIdRef.current[targetContext];
        }

        if (!viewer) {
            clearRetry(targetContext);
            return;
        }
        // Bail if a newer probe has superseded us.
        if (!runId || runIdRef.current[targetContext] !== runId) return;

        viewer.setCrossProbeEnabled?.(true);
        // The cross-probe API is optional on the viewer element — the Huaqiu
        // base fork does not implement `requestCrossProbe`. Guard the call so a
        // viewer without it degrades to a no-op instead of throwing (which, in a
        // passive effect, blanks the whole page). No retry when the API is
        // absent — retrying can't make a missing method appear.
        if (typeof viewer.requestCrossProbe !== "function") {
            clearRetry(targetContext);
            return;
        }
        const result = viewer.requestCrossProbe({
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
            timerRef.current[targetContext] = window.setTimeout(() => {
                run(viewer, sourceContext, targetContext, designator, attempts + 1, runId);
            }, CROSS_PROBE_RETRY_DELAY_MS);
            return;
        }

        clearRetry(targetContext);
    }, [clearRetry]);

    // Cleanup on unmount
    useEffect(() => () => {
        clearRetry("SCH");
        clearRetry("PCB");
    }, [clearRetry]);

    return { run };
}
