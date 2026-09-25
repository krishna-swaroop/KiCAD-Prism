import { useEffect, useRef, useState } from "react";
import { fetchApi, readApiError } from "@/lib/api";
import { hydrateDesignComparePayload } from "./comparison-result-loader";
import type {
    DesignCompareBundle,
    DesignCompareJobStatus,
    DesignCompareResult,
} from "./types";

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
    status: DesignCompareJobStatus | null;
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

function nextPollDelay(current: number): number {
    return Math.min(POLL_MAX_MS, Math.round(current * POLL_BACKOFF));
}

export function useDesignCompareJob(
    projectId: string,
    base: string,
    head: string,
): DesignCompareJob {
    const [jobId, setJobId] = useState<string | null>(null);
    const [status, setStatus] = useState<DesignCompareJobStatus | null>(null);
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

    // The pending timeout is cleared in this effect's cleanup; the assignment
    // happens inside the async poll loop, where the rule cannot see it.
    // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
    useEffect(() => {
        if (!jobId) return;
        const controller = new AbortController();
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let pollDelay = POLL_MIN_MS;
        const poll = async () => {
            try {
                const response = await fetchApi(
                    `/api/projects/${projectId}/design-compare/${jobId}/status`,
                );
                if (!response.ok) {
                    throw new Error(await readApiError(
                        response,
                        "Failed to poll comparison",
                    ));
                }
                const next = (await response.json()) as DesignCompareJobStatus;
                if (cancelled) return;
                setStatus(next);
                const resultVersion = next.result_version ?? 0;
                if (resultVersion > resultVersionRef.current) {
                    const resultResponse = await fetchApi(
                        `/api/projects/${projectId}/design-compare/${jobId}`,
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
                    const hydrated = await hydrateDesignComparePayload(
                        payload,
                        controller.signal,
                    );
                    if (cancelled) return;
                    resultVersionRef.current = resultVersion;
                    setResult(hydrated);
                    // A new result version means the job just advanced a stage,
                    // so the next publish is likely close behind. Reset the
                    // backoff to catch it quickly: by the time the first
                    // (progressive) result lands the interval has already reached
                    // the ceiling, so without this the final publish is polled at
                    // the old flat rate.
                    pollDelay = POLL_MIN_MS;
                }
                if (next.status === "failed") {
                    setError(next.message || "Semantic comparison failed");
                } else if (next.status === "completed") {
                    return;
                } else {
                    timer = setTimeout(poll, pollDelay);
                    pollDelay = nextPollDelay(pollDelay);
                }
            } catch (caught) {
                if (!cancelled) {
                    setError(caught instanceof Error
                        ? caught.message
                        : "Failed to load semantic comparison");
                }
            }
        };
        void poll();
        return () => {
            cancelled = true;
            controller.abort();
            if (timer) clearTimeout(timer);
        };
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
