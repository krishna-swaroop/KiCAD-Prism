import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Box, Layers3, Loader2, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { fetchApi, fetchJson, readApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type { PrismSelection } from "@/types/prism-selection";
import type {
    PrismRendererSelection,
    PrismSemanticViewerElement,
    PrismSemanticViewerSelectionDetail,
} from "@/types/prism-semantic-viewer";

interface WebGpuGeneratorTag {
    name: string;
    version: string;
    build: string;
}

interface WebGpu3dStatus {
    schema: "prism.webgpu_3d_status_a0";
    status: "ready" | "building" | "missing" | "invalid";
    available: boolean;
    sourceRevisionKey: string;
    source_fingerprint: string;
    build_fingerprint: string;
    bundle_url?: string;
    generated_at?: string;
    commit?: string;
    message?: string;
    error?: string;
    generator: WebGpuGeneratorTag;
    readiness?: WebGpu3dReadiness;
}

interface WebGpu3dReadiness {
    schema: "prism.visualizer_readiness.a0";
    stage: "board-ready" | "components-ready" | "semantic-ready" | string;
    progress: number;
    available_assets: string[];
    revision: string;
    updated_at?: string;
}

interface WorkflowJob {
    job_id: string;
    status: "queued" | "running" | "completed" | "failed" | string;
    message?: string;
    percent?: number;
    logs?: string[];
    error?: string;
    readiness_stage?: string;
    readiness?: WebGpu3dReadiness;
    bundle_url?: string;
    sourceRevisionKey?: string;
}

interface GenerateResponse {
    job_id: string;
}

interface ViewerPerformanceDetail {
    schema: "prism.semantic_viewer_performance.a0";
    milestone: string;
    elapsed_ms?: number;
    timings?: Record<string, number>;
    readiness_stage?: string;
    readiness_progress?: number;
}

interface WebGpu3dTabProps {
    projectId: string;
    commit?: string | null;
    user: User | null;
    active: boolean;
    workspace: "pcb" | "stackup";
    selection: PrismSelection | null;
    onSelection: (selection: PrismSelection) => void;
    onClearSelection: () => void;
}

const selectionForRenderer = (selection: PrismSelection | null): PrismRendererSelection | null => {
    if (!selection) return null;
    if (selection.kind === "component") {
        return { reference: selection.reference };
    }
    if (selection.kind === "terminal") {
        return { reference: selection.reference, pin: selection.pin };
    }
    return {
        netName: selection.netName,
        netUid: selection.netUid,
        netCode: selection.netCode,
    };
};

export function WebGpu3dTab({
    projectId,
    commit,
    user,
    active,
    workspace,
    selection,
    onSelection,
    onClearSelection,
}: WebGpu3dTabProps) {
    const viewerRef = useRef<PrismSemanticViewerElement | null>(null);
    const selectionRef = useRef(selection);
    const generationStartedAt = useRef<number | null>(null);
    const readinessRevisionRef = useRef<string | null>(null);
    const tabLoadStartedAt = useRef(performance.now());
    selectionRef.current = selection;
    const [viewerElement, setViewerElement] = useState<PrismSemanticViewerElement | null>(null);
    const [status, setStatus] = useState<WebGpu3dStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewerReady, setViewerReady] = useState(false);
    const [job, setJob] = useState<WorkflowJob | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewerRevision, setViewerRevision] = useState(0);
    const canGenerate = user?.role === "admin" || user?.role === "designer";
    const isStackup = workspace === "stackup";

    const commitQuery = useMemo(
        () => commit ? `?commit=${encodeURIComponent(commit)}` : "",
        [commit],
    );
    const statusUrl = `/api/projects/${projectId}/webgpu-3d/status${commitQuery}`;

    const refreshStatus = useCallback(async () => {
        setLoading(true);
        try {
            const next = await fetchJson<WebGpu3dStatus>(
                statusUrl,
                undefined,
                "Failed to load WebGPU 3D asset status",
            );
            setStatus(next);
            readinessRevisionRef.current = next.readiness?.revision ?? null;
            setError(next.error ?? null);
        } catch (nextError) {
            setStatus(null);
            setError(nextError instanceof Error ? nextError.message : "Failed to load WebGPU 3D status");
        } finally {
            setLoading(false);
        }
    }, [statusUrl]);

    useEffect(() => {
        setViewerReady(false);
        setJob(null);
        setJobId(null);
        setError(null);
        void refreshStatus();
    }, [refreshStatus]);

    useEffect(() => {
        if (!jobId) return;
        let cancelled = false;
        let timer: number | null = null;

        const poll = async () => {
            try {
                const next = await fetchJson<WorkflowJob>(
                    `/api/projects/jobs/${jobId}`,
                    undefined,
                    "Failed to read WebGPU generation job",
                );
                if (cancelled) return;
                setJob(next);
                const nextReadinessRevision = next.readiness?.revision;
                if (
                    next.bundle_url
                    && nextReadinessRevision
                    && nextReadinessRevision !== readinessRevisionRef.current
                ) {
                    readinessRevisionRef.current = nextReadinessRevision;
                    setViewerRevision((revision) => revision + 1);
                    await refreshStatus();
                }
                if (next.status === "completed") {
                    setJobId(null);
                    setViewerRevision((revision) => revision + 1);
                    await refreshStatus();
                    return;
                }
                if (next.status === "failed") {
                    setJobId(null);
                    setError(next.error || next.message || "WebGPU 3D generation failed");
                    return;
                }
            } catch (nextError) {
                if (!cancelled) {
                    setJobId(null);
                    setError(nextError instanceof Error ? nextError.message : "Failed to poll WebGPU generation");
                }
                return;
            }
            timer = window.setTimeout(poll, 1000);
        };

        timer = window.setTimeout(poll, 500);
        return () => {
            cancelled = true;
            if (timer !== null) window.clearTimeout(timer);
        };
    }, [jobId, refreshStatus]);

    const generate = useCallback(async (force: boolean) => {
        if (!canGenerate || jobId) return;
        setError(null);
        generationStartedAt.current = performance.now();
        setJob({
            job_id: "pending",
            status: "queued",
            message: force ? "Queuing a forced rebuild" : "Queuing WebGPU 3D generation",
            percent: 0,
            logs: [],
        });
        try {
            const response = await fetchApi(`/api/projects/${projectId}/webgpu-3d/generate`, {
                method: "POST",
                body: JSON.stringify({ commit: commit || undefined, force }),
            });
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to start WebGPU 3D generation"));
            }
            const payload = await response.json() as GenerateResponse;
            setJobId(payload.job_id);
        } catch (nextError) {
            setJob(null);
            setError(nextError instanceof Error ? nextError.message : "Failed to start WebGPU generation");
        }
    }, [canGenerate, commit, jobId, projectId]);

    useEffect(() => {
        if (!viewerReady) return;
        viewerRef.current?.setSelection(selectionForRenderer(selection));
    }, [selection, viewerReady]);

    useEffect(() => {
        if (!active || !viewerReady) return;
        const frame = window.requestAnimationFrame(() => {
            const viewer = viewerRef.current;
            viewer?.resize();
            viewer?.setSelection(selectionForRenderer(selectionRef.current));
        });
        return () => window.cancelAnimationFrame(frame);
    }, [active, viewerReady]);

    const attachViewer = useCallback((node: PrismSemanticViewerElement | null) => {
        viewerRef.current = node;
        setViewerElement(node);
    }, []);

    useEffect(() => {
        const node = viewerElement;
        if (!node) return;

        const handleReady = (event: Event) => {
            const detail = (event as CustomEvent<ViewerPerformanceDetail>).detail;
            const browserMilestone = {
                schema: "prism.3d_cold_start_browser.a0",
                milestone: "board-visible",
                project_id: projectId,
                source_revision_key: status?.sourceRevisionKey,
                generation_to_visible_ms: generationStartedAt.current === null
                    ? null
                    : performance.now() - generationStartedAt.current,
                tab_load_to_visible_ms: performance.now() - tabLoadStartedAt.current,
                viewer: detail,
            };
            console.info("[prism-3d-cold-start]", browserMilestone);
            generationStartedAt.current = null;
            setViewerReady(true);
            node.setSelection(selectionForRenderer(selectionRef.current));
        };
        const handlePerformance = (event: Event) => {
            console.info("[prism-3d-cold-start]", (event as CustomEvent<ViewerPerformanceDetail>).detail);
        };
        const handleSelection = (event: Event) => {
            const detail = (event as CustomEvent<PrismSemanticViewerSelectionDetail>).detail;
            if (!detail?.selection) {
                onClearSelection();
                return;
            }
            onSelection({
                ...detail.selection,
                sourceContext: "3D",
                sourceRevisionKey: status?.sourceRevisionKey,
            });
        };
        const handleError = (event: Event) => {
            const custom = event as CustomEvent<{ error?: Error }>;
            setError(custom.detail?.error?.message || "The WebGPU renderer failed to load");
        };
        node.addEventListener("prism-semantic-viewer:ready", handleReady);
        node.addEventListener("prism-semantic-viewer:performance", handlePerformance);
        node.addEventListener("prism-semantic-viewer:selectionchange", handleSelection);
        node.addEventListener("prism-semantic-viewer:error", handleError);
        return () => {
            node.removeEventListener("prism-semantic-viewer:ready", handleReady);
            node.removeEventListener("prism-semantic-viewer:performance", handlePerformance);
            node.removeEventListener("prism-semantic-viewer:selectionchange", handleSelection);
            node.removeEventListener("prism-semantic-viewer:error", handleError);
        };
    }, [onClearSelection, onSelection, projectId, status?.sourceRevisionKey, viewerElement]);

    const readiness = job?.readiness ?? status?.readiness;
    const readinessStage = readiness?.stage || (status?.status === "ready" ? "semantic-ready" : "generating");
    const readinessProgress = job?.readiness?.progress ?? readiness?.progress ?? job?.percent ?? 0;
    const stageLabel = {
        "board-ready": "Board visible",
        "components-ready": "Board and components visible",
        "semantic-ready": "Semantic scene ready",
        generating: "Generating 3D assets",
    }[readinessStage] || readinessStage;
    const resolvedBundleUrl = status?.bundle_url ?? job?.bundle_url;
    const canShowViewer = Boolean(
        resolvedBundleUrl
        && (
            status?.available
            || status?.status === "building"
            || status?.status === "ready"
            || Boolean(job?.bundle_url && job?.readiness)
        ),
    );
    const bundleUrl = resolvedBundleUrl
        ? `${resolvedBundleUrl}${resolvedBundleUrl.includes("?") ? "&" : "?"}viewer=${encodeURIComponent(readiness?.revision || status?.generated_at || status?.sourceRevisionKey || "staged")}`
        : undefined;

    if (loading && !status) {
        return (
            <div className="flex h-full items-center justify-center bg-muted/20">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking revision-tagged 3D assets…
                </div>
            </div>
        );
    }

    if (!canShowViewer) {
        return (
            <div className="flex h-full items-center justify-center bg-muted/20 p-6">
                <Card className="w-full max-w-2xl" size="sm">
                    <CardHeader className="border-b">
                        <CardTitle className="flex items-center gap-2">
                            {isStackup
                                ? <Layers3 className="h-4 w-4 text-primary" />
                                : <Box className="h-4 w-4 text-primary" />}
                            {isStackup ? "Stackup data is not ready" : "WebGPU 3D assets are not ready"}
                        </CardTitle>
                        <CardDescription>
                            {isStackup
                                ? "Generate this revision’s 3D assets to compile the board stackup, fabrication properties, and design rules."
                                : "Schematic and PCB viewing remain available. Generate this revision’s isolated 3D bundle when needed."}
                        </CardDescription>
                        <CardAction>
                            <Badge variant="outline">{status?.status || "unavailable"}</Badge>
                        </CardAction>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {status?.generator && (
                            <div className="grid gap-1 rounded-none border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                                <span className="text-muted-foreground">Source revision</span>
                                <span className="truncate font-mono">{status.sourceRevisionKey}</span>
                                <span className="text-muted-foreground">Generator</span>
                                <span>{status.generator.name} {status.generator.version}</span>
                                <span className="text-muted-foreground">Generator build</span>
                                <span className="truncate font-mono">{status.generator.build}</span>
                            </div>
                        )}
                        {error && (
                            <p className="border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                                {error}
                            </p>
                        )}
                        {job && (
                            <div className="space-y-2 border bg-muted/30 p-3">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium">{job.message || job.status}</span>
                                    <span className="text-muted-foreground">{job.percent ?? 0}%</span>
                                </div>
                                {job.logs && job.logs.length > 0 && (
                                    <div className="max-h-48 overflow-auto font-mono text-xs text-muted-foreground">
                                        {job.logs.slice(-80).map((line, index) => (
                                            <div key={`${index}-${line}`} className="whitespace-pre-wrap break-words">{line}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => void generate(false)} disabled={!canGenerate || Boolean(jobId)}>
                                {jobId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                Generate 3D assets
                            </Button>
                            <Button variant="outline" onClick={() => void refreshStatus()} disabled={loading}>
                                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                                Refresh status
                            </Button>
                        </div>
                        {!canGenerate && (
                            <p className="text-xs text-muted-foreground">A designer or administrator can generate these assets.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="relative h-full min-h-0 overflow-hidden bg-muted/20">
            <prism-semantic-viewer
                key={`${status?.sourceRevisionKey ?? job?.sourceRevisionKey ?? projectId}-${status?.generator?.build ?? "build"}-${readiness?.revision || viewerRevision}`}
                ref={attachViewer}
                bundle-url={bundleUrl}
                workspace={workspace}
                active={active && !isStackup ? "true" : undefined}
                style={{
                    "--prism-shell": "hsl(var(--background))",
                    "--prism-panel": "hsl(var(--card))",
                    "--prism-panel-raised": "hsl(var(--muted))",
                    "--prism-control": "hsl(var(--secondary))",
                    "--prism-control-hover": "hsl(var(--accent))",
                    "--prism-foreground": "hsl(var(--foreground))",
                    "--prism-muted": "hsl(var(--muted-foreground))",
                    "--prism-border": "hsl(var(--border))",
                    "--prism-primary": "hsl(var(--primary))",
                    "--prism-primary-foreground": "hsl(var(--primary-foreground))",
                } as CSSProperties}
                className="block h-full min-h-0 w-full"
            />
            <div className={cn(
                "pointer-events-none absolute flex items-center gap-2",
                isStackup ? "right-5 top-5" : "left-3 top-3",
            )}>
                {readinessStage !== "semantic-ready" && (
                    <Badge variant="secondary" className="pointer-events-auto gap-1 shadow-sm">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {stageLabel}
                    </Badge>
                )}
                {canGenerate && (
                    <Button
                        className="pointer-events-auto shadow-sm"
                        size="sm"
                        variant="secondary"
                        onClick={() => void generate(true)}
                        disabled={Boolean(jobId)}
                    >
                        {jobId ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-2 h-3.5 w-3.5" />}
                        Regenerate
                    </Button>
                )}
            </div>
            {(jobId || status?.status === "building") && (
                <div className="pointer-events-none absolute bottom-3 left-3 right-3 mx-auto max-w-xl border bg-background/95 p-3 shadow-sm backdrop-blur-sm">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-foreground">{job?.message || stageLabel}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(readinessProgress)}%</span>
                    </div>
                    <div
                        className="h-1.5 overflow-hidden bg-muted"
                        role="progressbar"
                        aria-label="3D asset generation progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(readinessProgress)}
                    >
                        <div
                            className="h-full bg-primary transition-[width] duration-300"
                            style={{ width: `${Math.max(0, Math.min(100, readinessProgress))}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
