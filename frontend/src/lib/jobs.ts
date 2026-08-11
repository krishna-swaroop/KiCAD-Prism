import { fetchApi, readApiError } from "@/lib/api";

export type PrismJobStatus = {
    job_id: string;
    kind: string;
    status: "queued" | "running" | "retry_wait" | "cancel_requested" | "completed" | "failed" | "cancelled";
    stage: string;
    message: string;
    percent: number;
    error_code?: string;
    error_message?: string;
    result_metadata?: Record<string, unknown>;
};

type WatchPrismJobOptions = {
    signal?: AbortSignal;
    intervalMs?: number;
    includeLogs?: boolean;
    onUpdate?: (job: PrismJobStatus, logs: string[]) => void;
};

const terminalStatuses = new Set<PrismJobStatus["status"]>([
    "completed",
    "failed",
    "cancelled",
]);

const abortableDelay = (milliseconds: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const onAbort = () => {
            window.clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
        };
        const timeout = window.setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, milliseconds);
        signal?.addEventListener("abort", onAbort, { once: true });
    });

async function readJob(jobId: string, signal?: AbortSignal): Promise<PrismJobStatus> {
    const response = await fetchApi(`/api/jobs/${encodeURIComponent(jobId)}`, { signal });
    if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to read job status"));
    }
    return response.json() as Promise<PrismJobStatus>;
}

async function readJobLogs(jobId: string, signal?: AbortSignal): Promise<string[]> {
    const response = await fetchApi(
        `/api/jobs/${encodeURIComponent(jobId)}/logs?tail=300`,
        { signal },
    );
    if (!response.ok) return [];
    const payload = await response.json() as { lines?: string[] };
    return payload.lines ?? [];
}

export async function watchPrismJob(
    jobId: string,
    {
        signal,
        intervalMs = 750,
        includeLogs = false,
        onUpdate,
    }: WatchPrismJobOptions = {},
): Promise<PrismJobStatus> {
    while (true) {
        const job = await readJob(jobId, signal);
        const logs = includeLogs ? await readJobLogs(jobId, signal) : [];
        onUpdate?.(job, logs);
        if (terminalStatuses.has(job.status)) return job;
        await abortableDelay(intervalMs, signal);
    }
}

export function throwIfJobFailed(job: PrismJobStatus, fallback: string): void {
    if (job.status === "failed" || job.status === "cancelled") {
        throw new Error(job.error_message || job.message || fallback);
    }
}
