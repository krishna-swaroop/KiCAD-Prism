import { useEffect, useRef, useState } from "react";
import { fetchApi, readApiError } from "@/lib/api";
import { isAbortError, watchPrismJob, type PrismJobStatus } from "@/lib/jobs";
import { hydrateDesignComparePayload } from "./comparison-result-loader";
import type { DesignCompareBundle, DesignCompareResult } from "./types";

/**
 * The comparison job's whole life: start it, poll it, hydrate each result
 * version as it lands, and release it on unmount.
 *
 * Kept together because these four effects are one conversation with the
 * backend, not four independent ones — the poll only exists because the POST
 * returned a job id, and the DELETE only matters because the POST created
 * something to delete.
 *
 * The job publishes results progressively: schematic and BOM are usable while
 * PCB and fabrication are still building, so the result is replaced whenever
 * `result_version` advances rather than only once at completion.
 */

export type DesignCompareJob = {
    result: DesignCompareResult | null;
    status: PrismJobStatus | null;
    error: string | null;
};

// Poll fast at first, then back off. A warm comparison is ready in a couple of
// seconds and the progressive initial result lands sooner, so a flat 800ms
// interval left the viewer waiting up to that long after the backend was
// already done. Starting tight catches those quick completions; widening keeps
// a long cold job from hammering the status endpoint.
const POLL_MIN_MS = 150;
const POLL_MAX_MS = 800;
const POLL_BACKOFF = 1.4;

/** How many result versions the job has published so far. */
function resultVersionOf(job: PrismJobStatus | undefined): number {
    return Number(job?.result_metadata?.result_version ?? 0);
}

export function useDesignCompareJob(
    projectId: string,
    base: string,
    head: string,
): DesignCompareJob {
    const [jobId, setJobId] = useState<string | null>(null);
    const [status, setStatus] = useState<PrismJobStatus | null>(null);
    const [result, setResult] = useState<DesignCompareResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const jobIdRef = useRef<string | null>(null);
    const resultVersionRef = useRef(0);

    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;
        setResult(null);
        setStatus(null);
        setError(null);
        resultVersionRef.current = 0;
        void (async () => {
            try {
                const response = await fetchApi(
                    `/api/projects/${projectId}/design-compare`,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            base,
                            head,
                            include_unchanged: true,
                        }),
                        signal: controller.signal,
                    },
                );
                if (cancelled) return;
                if (!response.ok) {
                    throw new Error(await readApiError(
                        response,
                        "Failed to start semantic comparison",
                    ));
                }
                const data = (await response.json()) as { job_id: string };
                if (cancelled) return;
                jobIdRef.current = data.job_id;
                setJobId(data.job_id);
            } catch (caught) {
                if (caught instanceof DOMException && caught.name === "AbortError") {
                    return;
                }
                if (!cancelled) {
                    setError(caught instanceof Error
                        ? caught.message
                        : "Failed to start semantic comparison");
                }
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [projectId, base, head]);

    useEffect(() => {
        if (!jobId) return;
        const controller = new AbortController();
        const { signal } = controller;
        void watchPrismJob(jobId, {
            signal,
            intervalMs: POLL_MIN_MS,
            maxIntervalMs: POLL_MAX_MS,
            backoff: POLL_BACKOFF,
            // A new result version means the job just advanced a stage, so the
            // next publish is likely close behind. Reset the backoff to catch
            // it quickly: by the time the first (progressive) result lands the
            // interval has already reached the ceiling.
            resetBackoff: (next, previous) => resultVersionOf(next) > resultVersionOf(previous),
            onUpdate: async (next) => {
                setStatus(next);
                const resultVersion = resultVersionOf(next);
                if (resultVersion <= resultVersionRef.current) return;
                const resultResponse = await fetchApi(
                    `/api/projects/${projectId}/design-compare/${jobId}`,
                    { signal },
                );
                if (!resultResponse.ok) {
                    throw new Error(await readApiError(
                        resultResponse,
                        "Failed to load comparison",
                    ));
                }
                const payload = (await resultResponse.json()) as
                    | DesignCompareResult
                    | DesignCompareBundle;
                const hydrated = await hydrateDesignComparePayload(payload, {
                    signal,
                    completed: next.status === "completed",
                });
                // A manifest that arrives before completion has no sidecars
                // yet; keep the last inline result and retry after completion.
                if (signal.aborted || hydrated === null) return;
                resultVersionRef.current = resultVersion;
                setResult(hydrated);
            },
        }).then((settled) => {
            if (signal.aborted || settled.status === "completed") return;
            setError(settled.error_message || settled.message || "Semantic comparison failed");
        }).catch((caught: unknown) => {
            if (isAbortError(caught) || signal.aborted) return;
            setError(caught instanceof Error
                ? caught.message
                : "Failed to load semantic comparison");
        });
        return () => controller.abort();
    }, [jobId, projectId]);

    // Release the server-side job when the workspace closes. Keyed on the ref
    // rather than on `jobId` so the cleanup does not fire on every poll.
    useEffect(() => {
        return () => {
            const id = jobIdRef.current;
            if (id) {
                void fetchApi(
                    `/api/projects/${projectId}/design-compare/${id}`,
                    { method: "DELETE" },
                );
            }
        };
    }, [projectId]);

    return { result, status, error };
}
