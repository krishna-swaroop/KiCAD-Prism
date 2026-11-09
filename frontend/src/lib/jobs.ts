import { fetchApi, readApiError } from "@/lib/api";

import type { PipelineState } from "@/components/release-studio/types";

/**
 * The one way the browser waits on a Prism job.
 *
 * `watchPrismJob` owns the status endpoint (`/api/jobs/{id}`), the terminal
 * states, the poll interval and its backoff, abort, and the stuck-job ceiling.
 * Callers only react to updates and to the settled job. The job source and the
 * clock are seams so the loop can be tested without a network or real time.
 */

export type PrismJobState =
    | "queued"
    | "running"
    | "retry_wait"
    | "cancel_requested"
    | "completed"
    | "failed"
    | "cancelled";

export type PrismJobStatus = {
    job_id: string;
    kind: string;
    status: PrismJobState;
    stage: string;
    message: string;
    percent: number;
    attempt?: number;
    error_code?: string;
    error_message?: string;
    result_metadata?: Record<string, unknown>;
    pipeline?: PipelineState;
};

/** Where the watcher reads a job from. The default reads `/api/jobs/{id}`. */
export type JobSource = {
    read: (jobId: string, signal?: AbortSignal) => Promise<PrismJobStatus>;
    logs: (jobId: string, signal?: AbortSignal) => Promise<string[]>;
};

export type JobClock = {
    now: () => number;
    sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

type WatchPrismJobOptions = {
    signal?: AbortSignal;
    /** First delay between polls. */
    intervalMs?: number;
    /** Upper bound for the delay once `backoff` has widened it. */
    maxIntervalMs?: number;
    /** Multiplier applied to the delay after each poll; 1 keeps it flat. */
    backoff?: number;
    /** Return true to drop the delay back to `intervalMs` (the job just advanced). */
    resetBackoff?: (job: PrismJobStatus, previous: PrismJobStatus | undefined) => boolean;
    /**
     * Stuck-job ceiling: give up with `JobStalledError` once the job's status,
     * stage, percent and message have not changed for this long. The job itself
     * keeps running; only the wait ends.
     */
    stallTimeoutMs?: number;
    includeLogs?: boolean;
    /** Awaited before the next poll; a throw ends the watch with that error. */
    onUpdate?: (job: PrismJobStatus, logs: string[]) => void | Promise<void>;
    source?: JobSource;
    clock?: JobClock;
};

const terminalStatuses = new Set<PrismJobState>(["completed", "failed", "cancelled"]);

export function isTerminalJobStatus(status: PrismJobState): boolean {
    return terminalStatuses.has(status);
}

export function isAbortError(error: unknown): boolean {
    return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

export class JobStalledError extends Error {
    readonly job: PrismJobStatus;

    constructor(job: PrismJobStatus, stalledMs: number) {
        super(`Job made no progress for ${Math.round(stalledMs / 60_000)} min`);
        this.name = "JobStalledError";
        this.job = job;
    }
}

const abortError = () => new DOMException("Aborted", "AbortError");

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw abortError();
}

const abortableDelay = (milliseconds: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError());
            return;
        }
        const onAbort = () => {
            window.clearTimeout(timeout);
            reject(abortError());
        };
        const timeout = window.setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, milliseconds);
        signal?.addEventListener("abort", onAbort, { once: true });
    });

const realClock: JobClock = { now: () => Date.now(), sleep: abortableDelay };

const apiJobSource: JobSource = {
    async read(jobId, signal) {
        const response = await fetchApi(`/api/jobs/${encodeURIComponent(jobId)}`, { signal });
        if (!response.ok) {
            throw new Error(await readApiError(response, "Failed to read job status"));
        }
        return response.json() as Promise<PrismJobStatus>;
    },
    async logs(jobId, signal) {
        const response = await fetchApi(
            `/api/jobs/${encodeURIComponent(jobId)}/logs?tail=300`,
            { signal },
        );
        if (!response.ok) return [];
        const payload = await response.json() as { lines?: string[] };
        return payload.lines ?? [];
    },
};

export async function cancelPrismJob(jobId: string): Promise<void> {
    const response = await fetchApi(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: "POST",
    });
    if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to cancel the job"));
    }
}

const progressKey = (job: PrismJobStatus): string =>
    [job.status, job.stage, job.percent, job.message, job.attempt ?? ""].join("\u0000");

export async function watchPrismJob(
    jobId: string,
    {
        signal,
        intervalMs = 750,
        maxIntervalMs = intervalMs,
        backoff = 1,
        resetBackoff,
        stallTimeoutMs,
        includeLogs = false,
        onUpdate,
        source = apiJobSource,
        clock = realClock,
    }: WatchPrismJobOptions = {},
): Promise<PrismJobStatus> {
    let delay = intervalMs;
    let previous: PrismJobStatus | undefined;
    let lastProgressKey = "";
    let lastProgressAt = clock.now();
    while (true) {
        throwIfAborted(signal);
        const job = await source.read(jobId, signal);
        const logs = includeLogs ? await source.logs(jobId, signal) : [];
        // A response that lands after the caller stopped watching is stale.
        throwIfAborted(signal);
        await onUpdate?.(job, logs);
        if (isTerminalJobStatus(job.status)) return job;

        const now = clock.now();
        const key = progressKey(job);
        if (key !== lastProgressKey) {
            lastProgressKey = key;
            lastProgressAt = now;
        } else if (stallTimeoutMs !== undefined && now - lastProgressAt >= stallTimeoutMs) {
            throw new JobStalledError(job, now - lastProgressAt);
        }
        if (resetBackoff?.(job, previous)) delay = intervalMs;
        previous = job;
        await clock.sleep(delay, signal);
        delay = Math.min(maxIntervalMs, Math.round(delay * backoff));
    }
}

export function throwIfJobFailed(job: PrismJobStatus, fallback: string): void {
    if (job.status === "failed" || job.status === "cancelled") {
        throw new Error(job.error_message || job.message || fallback);
    }
}

export function jobPipeline(job: PrismJobStatus): PipelineState | undefined {
    if (job.pipeline) return job.pipeline;
    const meta = job.result_metadata?.pipeline;
    if (meta && typeof meta === "object") return meta as PipelineState;
    return undefined;
}
