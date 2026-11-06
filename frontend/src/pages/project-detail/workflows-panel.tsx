import { useEffect, useState, type ComponentType } from "react";
import { Box, FileText } from "lucide-react";
import { toast } from "sonner";

import { fetchApi, readApiError } from "@/lib/api";
import { watchPrismJob } from "@/lib/jobs";
import type { User } from "@/types/auth";

interface WorkflowJobResponse {
    job_id: string;
}

/** Run the project's design, manufacturing and render workflows and follow their logs. */
export function WorkflowsPanel({ projectId, user, canRun }: { projectId: string, user: User | null, canRun: boolean }) {
    const [runningJob, setRunningJob] = useState<{ id: string, type: string } | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<string>("idle");

    useEffect(() => {
        if (!runningJob) return;
        const controller = new AbortController();
        void watchPrismJob(runningJob.id, {
            signal: controller.signal,
            includeLogs: true,
            onUpdate: (job, nextLogs) => {
                setLogs(nextLogs);
                setStatus(job.status);
            },
        }).catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") return;
            setStatus("failed");
            setLogs((current) => [
                ...current,
                error instanceof Error ? error.message : "Failed to poll workflow",
            ]);
        });
        return () => controller.abort();
    }, [runningJob]);

    const runWorkflow = async (type: string) => {
        if (!canRun) {
            toast.error("Your role does not allow you to run workflows.");
            return;
        }
        setLogs([]);
        setStatus("running");
        try {
            const res = await fetchApi(`/api/projects/${projectId}/workflows`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type,
                    author: user?.name || "anonymous"
                })
            });

            if (res.ok) {
                const data = (await res.json()) as WorkflowJobResponse;
                setRunningJob({ id: data.job_id, type });
            } else {
                const message = await readApiError(res, "Failed to start workflow");
                toast.error(message);
                setStatus("idle");
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to start workflow";
            toast.error(message);
            setStatus("idle");
        }
    };

    // Log lines arrive as whole-array snapshots from the job poller; position
    // is their only stable identity, and the array is replaced (not appended)
    // on every update, so index-based reconciliation is exact here.
    const logRows = logs.map((log, i) => (
        // react-doctor-disable-next-line react-doctor/no-array-index-as-key
        <div key={i} className="break-all whitespace-pre-wrap">{log}</div>
    ));

    return (
        <div className="max-w-5xl">
            <h2 className="text-2xl font-bold mb-6">Workflows</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <WorkflowCard
                    title="Design Outputs"
                    desc="Generate Schematics, Netlists, and BOMs."
                    icon={FileText}
                    onClick={() => runWorkflow("design")}
                    disabled={status === "running" || !canRun}
                />
                <WorkflowCard
                    title="Manufacturing Outputs"
                    desc="Generate Gerbers, Drill Files, and Pick & Place."
                    icon={Box}
                    onClick={() => runWorkflow("manufacturing")}
                    disabled={status === "running" || !canRun}
                />
                <WorkflowCard
                    title="3D Renders"
                    desc="Generate Ray-Traced Renders of the PCB."
                    icon={Box}
                    onClick={() => runWorkflow("render")}
                    disabled={status === "running" || !canRun}
                />
            </div>

            {/* Terminal / Logs Area */}
            {runningJob && (
                <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-4 font-mono text-xs md:text-sm h-96 overflow-auto shadow-inner text-zinc-300">
                    <div className="flex items-center justify-between mb-2 text-zinc-500 border-b border-zinc-800 pb-2">
                        <span>Job: {runningJob.type.toUpperCase()} ({status})</span>
                        {status === 'running' && <span className="animate-pulse text-warning">Running...</span>}
                        {status === 'completed' && <span className="text-success">Completed</span>}
                        {status === 'failed' && <span className="text-destructive">Failed</span>}
                    </div>
                    <div className="space-y-1">
                        {logRows}
                        {logs.length === 0 && <span className="text-zinc-600">Initializing...</span>}
                    </div>
                </div>
            )}
        </div>
    );
}

interface WorkflowCardProps {
    title: string;
    desc: string;
    icon: ComponentType<{ className?: string }>;
    onClick: () => void;
    disabled: boolean;
}

function WorkflowCard({ title, desc, icon: Icon, onClick, disabled }: WorkflowCardProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="flex flex-col items-start p-6 rounded-lg border bg-card text-card-foreground shadow-sm hover:border-primary/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <div className="p-2 bg-primary/10 rounded-md mb-4 text-primary">
                <Icon className="h-6 w-6" />
            </div>
            <h3 className="font-semibold mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground">{desc}</p>
        </button>
    );
}
