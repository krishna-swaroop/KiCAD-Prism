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

const POLL_INTERVAL_MS = 800;

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
                if (!response.ok) {
                    throw new Error(await readApiError(
                        response,
                        "Failed to start semantic comparison",
                    ));
                }
                const data = (await response.json()) as { job_id: string };
                jobIdRef.current = data.job_id;
                setJobId(data.job_id);
            } catch (caught) {
                if (caught instanceof DOMException && caught.name === "AbortError") {
                    return;
                }
                setError(caught instanceof Error
                    ? caught.message
                    : "Failed to start semantic comparison");
            }
        })();
        return () => controller.abort();
    }, [projectId, base, head]);

    useEffect(() => {
        if (!jobId) return;
        const controller = new AbortController();
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
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
                }
                if (next.status === "failed") {
                    setError(next.message || "Semantic comparison failed");
                } else if (next.status === "completed") {
                    return;
                } else {
                    timer = setTimeout(poll, POLL_INTERVAL_MS);
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
