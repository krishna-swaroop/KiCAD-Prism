import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, Circle, Loader2, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import * as api from "../api";
import type {
    BuildLogStep,
    PipelineState,
    PipelineStep,
    PipelineStepStatus,
} from "../types";

const NO_LIVE_LOGS: string[] = [];

export function ObserveBuildStep({
    pipeline,
    jobStatus,
    message,
    percent,
    liveLogs = NO_LIVE_LOGS,
    canCancel = false,
    cancelling = false,
    onCancel,
    projectId,
    buildId,
    errorCode = "",
    errorMessage = "",
}: {
    pipeline: PipelineState | null;
    jobStatus: string;
    message: string;
    percent: number;
    liveLogs?: string[];
    canCancel?: boolean;
    cancelling?: boolean;
    onCancel?: () => void;
    projectId?: string;
    buildId?: string | null;
    errorCode?: string;
    errorMessage?: string;
}) {
    const jobs = useMemo(() => pipeline?.jobs ?? [], [pipeline]);
    const [selectedId, setSelectedId] = useState(() =>
        jobs.find((job) => job.status === "failure" || job.status === "in_progress")?.id
            ?? jobs[0]?.id
            ?? "",
    );
    const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];
    const [openStep, setOpenStep] = useState<string | null>(() =>
        selected?.steps.find((step) => step.status === "failure" || step.status === "in_progress")?.id ?? null,
    );
    const logRef = useRef<HTMLPreElement>(null);
    const live = jobStatus === "queued" || jobStatus === "running" || jobStatus === "cancel_requested";

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [liveLogs]);

    useEffect(() => {
        const focus = jobs.find((job) => job.status === "failure")
            ?? jobs.find((job) => job.status === "in_progress");
        if (focus && !jobs.some((job) => job.id === selectedId)) setSelectedId(focus.id);
        const step = focus?.steps.find((item) => item.status === "failure")
            ?? focus?.steps.find((item) => item.status === "in_progress");
        if (step && !jobs.flatMap((job) => job.steps).some((item) => item.id === openStep)) setOpenStep(step.id);
    }, [jobs, openStep, selectedId]);

    // Live logs are only the worker stdout for this attempt. Reopening a
    // finished run does not replay them; they were never stored for the UI.
    // The recorded failure and the archived per-step logs are what remain, and
    // they are the whole reason someone reopens a failed attempt.
    if (jobs.length === 0 && projectId && buildId && !live) {
        return (
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Build</h3>
                <BuildFailure code={errorCode} message={errorMessage} />
                <ArchivedStepLogs key={`${projectId}:${buildId}`} projectId={projectId} buildId={buildId} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <BuildFailure code={errorCode} message={errorMessage} />
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                    <h3 className="text-lg font-semibold">Build</h3>
                    <p className="text-sm text-muted-foreground">
                        {jobStatus ? `Run ${jobStatus}` : "Waiting for the worker."}
                        {message ? ` — ${message}` : ""}
                    </p>
                    <div
                        className="h-1.5 overflow-hidden bg-muted"
                        role="progressbar"
                        aria-label="Release build progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(percent || 0)}
                    >
                        <div
                            className="h-full bg-primary transition-[width] duration-300"
                            style={{ width: `${Math.max(0, Math.min(100, percent || 0))}%` }}
                        />
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">{Math.round(percent || 0)}%</p>
                </div>
                {canCancel && onCancel && (
                    <Button className="ml-auto" size="sm" variant="destructive" disabled={cancelling} onClick={onCancel}>
                        {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-3 w-3 fill-current" />}
                        Cancel build
                    </Button>
                )}
            </div>
            <div className="grid min-h-[28rem] grid-cols-1 border lg:grid-cols-[16rem_minmax(0,1fr)]">
                <nav className="border-b lg:border-b-0 lg:border-r">
                    {jobs.length === 0 && (
                        <p className="p-3 text-sm text-muted-foreground">Queued…</p>
                    )}
                    {jobs.map((job) => (
                        <button
                            key={job.id}
                            type="button"
                            onClick={() => setSelectedId(job.id)}
                            className={cn(
                                "flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0",
                                selected?.id === job.id ? "bg-muted" : "hover:bg-muted/40",
                            )}
                        >
                            <StatusIcon status={job.status} />
                            <span className="flex-1 truncate">{job.name}</span>
                            <Duration steps={job.steps} />
                        </button>
                    ))}
                </nav>
                <div className="p-3">
                    {!selected && <p className="text-sm text-muted-foreground">Select a job.</p>}
                    {selected && (
                        <ol className="space-y-1">
                            {selected.steps.map((step) => {
                                const open = openStep === step.id;
                                return (
                                    <li key={step.id} className="border">
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                                            onClick={() => setOpenStep(open ? null : step.id)}
                                        >
                                            <StatusIcon status={step.status} />
                                            <span className="flex-1">{step.name}</span>
                                            {typeof step.elapsed_ms === "number" && (
                                                <span className="text-xs text-muted-foreground">
                                                    {(step.elapsed_ms / 1000).toFixed(1)}s
                                                </span>
                                            )}
                                        </button>
                                        {open && (step.log || step.message) && (
                                            <pre className="max-h-64 overflow-auto border-t bg-muted/30 p-2 text-xs">
                                                {step.message ? `${step.message}\n` : ""}
                                                {step.log}
                                            </pre>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>
            </div>
            {(liveLogs.length > 0 || live) && (
                <div className="overflow-hidden rounded-md border bg-muted/30">
                    <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
                        {live && <Loader2 className="h-3 w-3 animate-spin" />}
                        <span className="font-mono">live.log</span>
                        <span className="ml-auto tabular-nums">{Math.round(percent || 0)}%</span>
                    </div>
                    <pre
                        ref={logRef}
                        aria-label="Live build log"
                        className="h-72 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-5"
                    >
                        {liveLogs.join("\n") || "Waiting for worker output…"}
                    </pre>
                </div>
            )}
        </div>
    );
}

/** The reason the attempt ended, as the build row recorded it. */
function BuildFailure({ code, message }: { code?: string; message?: string }) {
    if (!message?.trim() && !code?.trim()) return null;
    return (
        <div
            aria-label="Build failure"
            className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3"
        >
            {code?.trim() && (
                <p className="font-mono text-xs uppercase tracking-wide text-destructive">{code}</p>
            )}
            {message?.trim() && (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-destructive">
                    {message}
                </pre>
            )}
        </div>
    );
}

/**
 * Per-step logs kept in build-evidence for as long as the release lives.
 *
 * The worker's stdout tail is pruned on the job retention schedule, so for any
 * attempt older than that this is the only surviving record of what each step
 * did. Loaded on demand: a log is only worth a request once someone opens it.
 */
function ArchivedStepLogs({ projectId, buildId }: { projectId: string; buildId: string }) {
    const [steps, setSteps] = useState<BuildLogStep[]>([]);
    const [openStep, setOpenStep] = useState<string | null>(null);
    const [logs, setLogs] = useState<Record<string, string>>({});

    // Keyed on the build by its call site, so a different build is a different
    // panel and starts empty without being emptied.
    useEffect(() => {
        let cancelled = false;
        void api.listBuildLogs(projectId, buildId)
            .then((index) => {
                if (!cancelled) setSteps(index.steps ?? []);
            })
            .catch(() => {
                // An attempt that predates log archiving simply has none.
                if (!cancelled) setSteps([]);
            });
        return () => { cancelled = true; };
    }, [projectId, buildId]);

    const toggle = (stepId: string) => {
        if (openStep === stepId) {
            setOpenStep(null);
            return;
        }
        setOpenStep(stepId);
        if (logs[stepId] !== undefined) return;
        void api.fetchBuildLog(projectId, buildId, stepId)
            .then((text) => setLogs((current) => ({ ...current, [stepId]: text })))
            .catch(() => setLogs((current) => ({ ...current, [stepId]: "" })));
    };

    if (steps.length === 0) return null;

    return (
        <div className="space-y-1">
            <h4 className="text-sm font-semibold">Archived step logs</h4>
            <ol className="space-y-1">
                {steps.map((step) => (
                    <li key={step.step_id} className="border">
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                            onClick={() => toggle(step.step_id)}
                        >
                            <span className="flex-1 font-mono">{step.step_id}</span>
                            {step.skipped_reason
                                ? <span className="text-xs text-muted-foreground">skipped</span>
                                : typeof step.returncode === "number" && (
                                    <span className={cn("text-xs", step.returncode === 0 ? "text-muted-foreground" : "text-destructive")}>
                                        exit {step.returncode}
                                    </span>
                                )}
                            {Boolean(step.elapsed_ms) && (
                                <span className="text-xs text-muted-foreground">
                                    {(step.elapsed_ms / 1000).toFixed(1)}s
                                </span>
                            )}
                        </button>
                        {openStep === step.step_id && (
                            <pre className="max-h-64 overflow-auto border-t bg-muted/30 p-2 text-xs">
                                {step.skipped_reason ? `${step.skipped_reason}\n` : ""}
                                {logs[step.step_id] ?? "Loading…"}
                            </pre>
                        )}
                    </li>
                ))}
            </ol>
        </div>
    );
}

function StatusIcon({ status }: { status: PipelineStepStatus }) {
    if (status === "in_progress") {
        return <Loader2 className="h-4 w-4 animate-spin text-warning" aria-label="in progress" />;
    }
    if (status === "success") {
        return <Check className="h-4 w-4 text-success" aria-label="success" />;
    }
    if (status === "failure") {
        return <X className="h-4 w-4 text-destructive" aria-label="failure" />;
    }
    if (status === "cancelled") {
        return <Ban className="h-4 w-4 text-warning" aria-label="cancelled" />;
    }
    return <Circle className="h-3 w-3 text-muted-foreground" aria-label={status} />;
}

function Duration({ steps }: { steps: PipelineStep[] }) {
    const total = steps.reduce((sum, step) => sum + (step.elapsed_ms ?? 0), 0);
    if (!total) return null;
    return <span className="text-xs text-muted-foreground">{(total / 1000).toFixed(0)}s</span>;
}

// A local copy of the queued jobs/steps tree used to live here as an
// optimistic placeholder. It was a hand-transcribed duplicate of
// `pipeline_skeleton()` in `app/release_studio/pipeline.py`, already missing
// that function's per-vendor steps, and it would have drifted again the first
// time the backend catalogue changed. The worker emits the real skeleton with
// its first progress update, so the nav simply reads "Queued…" until it lands.
