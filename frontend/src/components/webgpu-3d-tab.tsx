import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Box, Eye, EyeOff, Focus, Layers3, Loader2, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useCommittedRef } from "@/hooks/use-committed-ref";
import { dnpVisibilityNotice } from "./design-variants/dnp-visibility";
import { Semantic3dControls } from "./semantic-3d-controls";
import type { User } from "@/types/auth";
import type { PrismSelection } from "@/types/prism-selection";
import type { HighlightedNet } from "@/lib/net-highlights";
import type { PrismInsetScene3D } from "@/lib/inset-scene-3d";
import type {
    PrismRendererSelection,
    PrismSemanticContextMenuDetail,
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
    /** Nets accumulated with shift-click; every one renders emphasised (#305). */
    highlightedNets?: readonly HighlightedNet[];
    onSelection: (selection: PrismSelection) => void;
    onClearSelection: () => void;
    /** Unambiguous footprint-effective DNP references (VAR-19). */
    hiddenComponents?: readonly string[];
    /** References kept visible because they own several footprints. */
    ambiguousComponents?: readonly string[];
    /** Local Show DNP override; never changes the variant. */
    showDnp?: boolean;
    onShowDnpChange?: (showDnp: boolean) => void;
    /** IN-61: the 3D view of PCB insets, fed this tab's board. */
    insetScene?: PrismInsetScene3D;
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

const highlightsForRenderer = (nets: readonly HighlightedNet[]): PrismRendererSelection[] =>
    nets.map((net) => ({ netName: net.netName, netUid: net.netUid, netCode: net.netCode }));

/** Stable defaults: a fresh `[]` on every render would re-run the apply effect. */
const NO_COMPONENTS: readonly string[] = [];
const NO_NETS: readonly HighlightedNet[] = [];

// react-doctor-disable-next-line no-giant-component - WebGPU render loop lifecycle cannot be split without lifting GPU handles
export function WebGpu3dTab({
    projectId,
    commit,
    user,
    active,
    workspace,
    selection,
    highlightedNets = NO_NETS,
    onSelection,
    onClearSelection,
    hiddenComponents = NO_COMPONENTS,
    ambiguousComponents = NO_COMPONENTS,
    showDnp = false,
    onShowDnpChange,
    insetScene,
}: WebGpu3dTabProps) {
    const viewerRef = useRef<PrismSemanticViewerElement | null>(null);
    const selectionRef = useCommittedRef(selection);
    const generationStartedAt = useRef<number | null>(null);
    const readinessRevisionRef = useRef<string | null>(null);
    const [tabLoadStartedAt] = useState(() => performance.now());
    const [viewerElement, setViewerElement] = useState<PrismSemanticViewerElement | null>(null);
    const [status, setStatus] = useState<WebGpu3dStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewerReady, setViewerReady] = useState(false);
    const [job, setJob] = useState<WorkflowJob | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewerRevision, setViewerRevision] = useState(0);
    const [leftInset, setLeftInset] = useState(0);
    /** Models the reviewer hid from the 3D context menu, on top of the DNP set. */
    const [userHidden, setUserHidden] = useState<string[]>([]);
    /** The one model left visible by "Show only", or null. */
    const [isolated, setIsolated] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<PrismSemanticContextMenuDetail | null>(null);
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

    // The element replays the last set on its next controller, so applying
    // before ready or across a reload is safe.
    useEffect(() => {
        viewerRef.current?.setHighlightedNets?.(highlightsForRenderer(highlightedNets));
    }, [highlightedNets, viewerElement]);

    useEffect(() => {
        if (!active || !viewerReady) return;
        const frame = window.requestAnimationFrame(() => {
            const viewer = viewerRef.current;
            viewer?.resize();
            viewer?.setSelection(selectionForRenderer(selectionRef.current));
        });
        return () => window.cancelAnimationFrame(frame);
    }, [active, selectionRef, viewerReady]);

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
                tab_load_to_visible_ms: performance.now() - tabLoadStartedAt,
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
        const handleContextMenu = (event: Event) => {
            setContextMenu((event as CustomEvent<PrismSemanticContextMenuDetail>).detail);
        };
        const handleError = (event: Event) => {
            const custom = event as CustomEvent<{ error?: Error }>;
            setError(custom.detail?.error?.message || "The WebGPU renderer failed to load");
        };
        node.addEventListener("prism-semantic-viewer:ready", handleReady);
        node.addEventListener("prism-semantic-viewer:performance", handlePerformance);
        node.addEventListener("prism-semantic-viewer:selectionchange", handleSelection);
        node.addEventListener("prism-semantic-viewer:error", handleError);
        node.addEventListener("prism-semantic-viewer:contextmenu", handleContextMenu);
        return () => {
            node.removeEventListener("prism-semantic-viewer:ready", handleReady);
            node.removeEventListener("prism-semantic-viewer:performance", handlePerformance);
            node.removeEventListener("prism-semantic-viewer:selectionchange", handleSelection);
            node.removeEventListener("prism-semantic-viewer:error", handleError);
            node.removeEventListener("prism-semantic-viewer:contextmenu", handleContextMenu);
        };
    }, [onClearSelection, onSelection, projectId, selectionRef, status?.sourceRevisionKey, tabLoadStartedAt, viewerElement]);

    // VAR-19: the PCB 3D workspace hides unambiguous footprint-effective DNP
    // models. The element replays the set across reloads; this effect covers
    // mount, ready and plan changes, and the stackup workspace never changes
    // component visibility. Ambiguous pairs are never in this list (VAR-18
    // keeps them visible), so no DNP state is guessed.
    useEffect(() => {
        if (isStackup) return;
        const node = viewerElement;
        if (!node) return;
        let cancelled = false;
        void customElements.whenDefined("prism-semantic-viewer").then(() => {
            if (cancelled) return;
            // "Show only" hides every other reference; alternate-footprint parts
            // stay visible, as they do for DNP and Hide.
            const hidden = isolated
                ? (node.getComponentReferences?.() ?? []).filter((reference) => reference !== isolated)
                : [...hiddenComponents, ...userHidden];
            node.setHiddenComponents([...new Set(hidden)]);
        });
        return () => { cancelled = true; };
    }, [hiddenComponents, isStackup, isolated, userHidden, viewerElement, viewerReady]);

    const ambiguityNotice = dnpVisibilityNotice({
        hidden: [],
        ambiguous: [...ambiguousComponents],
        absent: [],
    });

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

    // IN-61: no bundle (or no WebGPU) is final for insets; a building bundle
    // without a viewer yet is too, until the next T after it is ready.
    const viewerFailed = Boolean(error) && !viewerReady;
    const insetUnavailable = !loading && (!canShowViewer || viewerFailed);
    useEffect(() => {
        if (!insetScene) return;
        if (insetUnavailable) insetScene.update({ kind: "unavailable" });
        else if (viewerElement) insetScene.update({ kind: "viewer", element: viewerElement });
        else insetScene.update({ kind: "loading" });
    }, [insetScene, insetUnavailable, viewerElement]);

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
        /*
         * The theme bridge sits on this wrapper, not on the viewer element.
         *
         * The viewer's own `:host` rule defines `--primary`, `--foreground`,
         * `--muted`, `--border` and `--primary-foreground` in terms of the
         * `--prism-*` values it is handed. Declaring the bridge on the host
         * itself therefore made each of those read its own output --
         * `--prism-primary: hsl(var(--primary))` resolving against a
         * `--primary` that is `var(--prism-primary, ...)`. CSS treats a custom
         * property cycle as invalid at computed-value time, so both sides came
         * out empty and every rule spending them was dropped: the stackup's
         * dimension lines lost their stroke on hover instead of picking up the
         * accent, and layer names rendered against no colour at all. Only
         * `--muted-foreground`, `--background`, `--card`, `--secondary` and
         * `--accent` escaped, because the viewer does not define those names.
         *
         * One element out, the same `var()` lookups resolve against the app's
         * own tokens, and the results inherit into the shadow tree.
         */
        <div
            className="relative h-full min-h-0 overflow-hidden bg-muted/20"
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
                "--prism-viewport-inset-left": `${isStackup ? 0 : leftInset}px`,
            } as CSSProperties}
        >
            <prism-semantic-viewer
                key={`${status?.sourceRevisionKey ?? job?.sourceRevisionKey ?? projectId}-${status?.generator?.build ?? "build"}-${readiness?.revision || viewerRevision}`}
                ref={attachViewer}
                bundle-url={bundleUrl}
                workspace={workspace}
                active={active && !isStackup ? "true" : undefined}
                hide-panel={isStackup ? undefined : "true"}
                className="block h-full min-h-0 w-full"
            />
            {!isStackup && (
                <Semantic3dControls viewer={viewerElement} onVisibleWidthChange={setLeftInset} />
            )}
            <DropdownMenu open={Boolean(contextMenu)} onOpenChange={(open) => { if (!open) setContextMenu(null); }}>
                <DropdownMenuTrigger asChild>
                    <span
                        aria-hidden="true"
                        className="pointer-events-none fixed size-0"
                        style={{ left: contextMenu?.clientX ?? 0, top: contextMenu?.clientY ?? 0 }}
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-auto" sideOffset={2}>
                    {contextMenu?.reference ? (
                        <>
                            <DropdownMenuItem
                                onSelect={() => {
                                    const reference = contextMenu.reference!;
                                    setIsolated(null);
                                    setUserHidden((current) => current.includes(reference) ? current : [...current, reference]);
                                }}
                            >
                                <EyeOff className="size-3.5" />
                                Hide {contextMenu.reference}
                                {contextMenu.value && (
                                    <span className="text-muted-foreground">{contextMenu.value}</span>
                                )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setIsolated(contextMenu.reference!)}>
                                <Focus className="size-3.5" />
                                Show only {contextMenu.reference}
                            </DropdownMenuItem>
                        </>
                    ) : (
                        <DropdownMenuItem disabled>No model here</DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            <div className={cn(
                "pointer-events-none absolute flex items-center gap-2",
                isStackup ? "right-5 top-5" : "top-3",
            )} style={isStackup ? undefined : { left: leftInset + 12 }}>
                {readinessStage !== "semantic-ready" && (
                    <Badge variant="secondary" className="pointer-events-auto gap-1 shadow-sm">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {stageLabel}
                    </Badge>
                )}
                {!isStackup && onShowDnpChange && (
                    <Button
                        className="pointer-events-auto shadow-sm"
                        size="sm"
                        variant={showDnp ? "default" : "secondary"}
                        aria-pressed={showDnp}
                        onClick={() => onShowDnpChange(!showDnp)}
                        title="Show components marked do-not-populate for the selected variant"
                    >
                        {showDnp ? <Eye className="mr-2 h-3.5 w-3.5" /> : <EyeOff className="mr-2 h-3.5 w-3.5" />}
                        {showDnp ? "Showing DNP" : "Show DNP"}
                    </Button>
                )}
                {!isStackup && (isolated || userHidden.length > 0) && (
                    <Button
                        className="pointer-events-auto shadow-sm"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                            setIsolated(null);
                            setUserHidden([]);
                        }}
                        title={isolated ? `Showing only ${isolated}` : `Hidden: ${userHidden.join(", ")}`}
                    >
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        {isolated ? `Show all (only ${isolated} shown)` : `Show all (${userHidden.length} hidden)`}
                    </Button>
                )}
                {!isStackup && ambiguityNotice && (
                    <Badge
                        variant="secondary"
                        className="pointer-events-auto shadow-sm"
                        title={ambiguityNotice}
                    >
                        {ambiguousComponents.length} alternate-footprint {ambiguousComponents.length === 1 ? "part" : "parts"} stay visible
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
