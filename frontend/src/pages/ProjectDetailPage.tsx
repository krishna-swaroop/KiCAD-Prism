import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Suspense, lazy, useEffect, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, History, Box, FolderOpen, ChevronLeft, ChevronRight, GitBranch, RotateCcw, PlayCircle, RefreshCw, Menu, Settings, Image } from "lucide-react";
import { toast } from "sonner";
import { fetchApi, fetchJson, readApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { User } from "@/types/auth";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const AssetsPortal = lazy(() =>
    import("@/components/assets-portal").then((module) => ({ default: module.AssetsPortal }))
);
const PathConfigDialog = lazy(() =>
    import("@/components/path-config-dialog").then((module) => ({ default: module.PathConfigDialog }))
);
const DocumentationBrowser = lazy(() =>
    import("@/components/documentation-browser").then((module) => ({ default: module.DocumentationBrowser }))
);
const HistoryViewer = lazy(() =>
    import("@/components/history-viewer").then((module) => ({ default: module.HistoryViewer }))
);
const Visualizer = lazy(() =>
    import("@/components/visualizer").then((module) => ({ default: module.Visualizer }))
);
const MarkdownContent = lazy(() =>
    import("@/components/markdown-content").then((module) => ({ default: module.MarkdownContent }))
);

interface Project {
    id: string;
    name: string;
    display_name?: string;
    description: string;
    path: string;
    folder_id?: string | null;
    last_modified: string;
    thumbnail_url?: string | null;
}

interface CommitDistanceResponse {
    commits_behind: number;
}

interface ProjectOverviewResponse {
    project: Project;
    readme: string | null;
}

interface WorkflowJobResponse {
    job_id: string;
}

interface WorkflowJobStatus {
    status: string;
    logs?: string[];
}

type Section = "overview" | "history" | "visualizers" | "assets" | "documentation" | "workflows";



export function ProjectDetailPage({ user }: { user: User | null }) {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const [project, setProject] = useState<Project | null>(null);
    const [readme, setReadme] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<Section>("overview");
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarHovered, setSidebarHovered] = useState(false);
    const [thumbnailLightbox, setThumbnailLightbox] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const [commitsBehind, setCommitsBehind] = useState<number>(0);
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);
    const [visualizerLoaded, setVisualizerLoaded] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [pathConfigOpen, setPathConfigOpen] = useState(false);
    const [thumbnailGenerating, setThumbnailGenerating] = useState(false);
    const [thumbnailBust, setThumbnailBust] = useState(0);
    const canMutateProject = user?.role === "admin" || user?.role === "designer";

    const handleGenerateThumbnail = async () => {
        if (!projectId || thumbnailGenerating) return;
        setThumbnailGenerating(true);
        const toastId = toast.loading("Generating thumbnail…");
        try {
            const res = await fetchApi(`/api/projects/${projectId}/thumbnail/generate`, { method: "POST" });
            if (!res.ok) throw new Error(await readApiError(res));
            const { job_id } = await res.json() as { job_id: string };
            for (let i = 0; i < 60; i++) {
                await new Promise((r) => setTimeout(r, 2000));
                const poll = await fetchApi(`/api/projects/thumbnail/jobs/${job_id}`);
                if (!poll.ok) break;
                const job = await poll.json() as { status: string; error?: string };
                if (job.status === "done") break;
                if (job.status === "error") throw new Error(job.error || "Generation failed");
            }
            toast.success("Thumbnail updated", { id: toastId });
            // Re-fetch project to pick up the new thumbnail_url (it may have been
            // null if the file was deleted before regeneration), then bust cache.
            try {
                const overview = await fetchJson<ProjectOverviewResponse>(
                    `/api/projects/${projectId}/overview`,
                    {},
                    "Failed to refresh project"
                );
                setProject(overview.project);
            } catch {
                // best-effort
            }
            setThumbnailBust(Date.now());
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Thumbnail generation failed", { id: toastId });
        } finally {
            setThumbnailGenerating(false);
        }
    };

    // Helper function to get display name
    const getDisplayName = (project: Project) => {
        return project.display_name || project.name;
    };

    useEffect(() => {
        if (activeSection === 'visualizers') {
            setVisualizerLoaded(true);
        }
    }, [activeSection]);

    const currentCommit = searchParams.get('commit');

    const handleViewCommit = (commitHash: string) => {
        setSearchParams({ commit: commitHash });
        setActiveSection("visualizers");
        setVisualizerLoaded(true);
    };

    const handleResetToLatest = () => {
        setSearchParams({});
    };

    const handleSync = async () => {
        if (!projectId || syncing || !canMutateProject) return;

        setSyncing(true);
        setSyncMessage(null);

        try {
            const data = await fetchJson<{ message?: string }>(
                `/api/projects/${projectId}/sync`,
                { method: "POST" },
                "Sync failed"
            );
            setSyncMessage(data.message || "Sync completed.");
            // Refresh project data and readme without full reload
            setRefreshKey((prev) => prev + 1);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Sync failed";
            setSyncMessage(`Sync failed: ${message}`);
        } finally {
            setSyncing(false);
        }
    };

    useEffect(() => {
        if (!projectId) {
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        setLoading(true);

        const fetchProjectData = async () => {
            try {
                const overviewUrl = currentCommit
                    ? `/api/projects/${projectId}/overview?commit=${encodeURIComponent(currentCommit)}`
                    : `/api/projects/${projectId}/overview`;
                const overview = await fetchJson<ProjectOverviewResponse>(
                    overviewUrl,
                    { signal: controller.signal },
                    "Failed to fetch project overview"
                );

                if (controller.signal.aborted) {
                    return;
                }

                setProject(overview.project);
                setReadme(overview.readme ?? "");
            } catch (err) {
                if (controller.signal.aborted) {
                    return;
                }
                console.error("Failed to fetch project details", err);
                setProject(null);
                setReadme("");
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        void fetchProjectData();
        return () => controller.abort();
    }, [projectId, currentCommit, refreshKey]);

    // Calculate commits behind when viewing specific commit
    useEffect(() => {
        if (!projectId) {
            setCommitsBehind(0);
            return;
        }

        const controller = new AbortController();

        const calculateCommitsBehind = async () => {
            if (!currentCommit) {
                setCommitsBehind(0);
                return;
            }

            try {
                const data = await fetchJson<CommitDistanceResponse>(
                    `/api/projects/${projectId}/commits/distance?commit=${encodeURIComponent(currentCommit)}`,
                    { signal: controller.signal },
                    "Failed to fetch commit distance"
                );

                if (controller.signal.aborted) {
                    return;
                }

                setCommitsBehind(data.commits_behind ?? 0);
            } catch (err) {
                if (controller.signal.aborted) {
                    return;
                }
                console.error("Failed to calculate commits behind", err);
            }
        };

        void calculateCommitsBehind();
        return () => controller.abort();
    }, [currentCommit, projectId]);

    if (loading) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>;
    }

    if (!project) {
        return <div className="flex items-center justify-center h-screen">Project not found</div>;
    }

    const navItems = [
        { id: "overview" as Section, label: "Overview", icon: FileText },
        { id: "history" as Section, label: "History", icon: History },
        { id: "visualizers" as Section, label: "Visualizers", icon: Box },
        { id: "workflows" as Section, label: "Workflows", icon: PlayCircle },
        { id: "assets" as Section, label: "Assets Portal", icon: FolderOpen },
        { id: "documentation" as Section, label: "Documentation", icon: FileText },
    ];

    const handleBackNavigation = () => {
        if (project.folder_id) {
            navigate(`/?folder=${encodeURIComponent(project.folder_id)}`);
            return;
        }
        navigate("/");
    };

    const resolveProjectAssetSrc = (src: string | undefined) => {
        if (!src) return src;
        if (src.startsWith('http')) return src;
        const assetUrl = `/api/projects/${projectId}/asset/${src}`;
        return currentCommit ? `${assetUrl}?commit=${encodeURIComponent(currentCommit)}` : assetUrl;
    };

    return (
        <div className="h-screen flex flex-col bg-background">
            <header className="border-b px-4 md:px-6 py-4 flex items-center gap-4">
                {/* Mobile Menu */}
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="md:hidden">
                            <Menu className="h-5 w-5" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[240px] sm:w-[300px] p-0">
                        <div className="py-4">
                            <h2 className="px-4 text-lg font-semibold tracking-tight mb-2">Project Navigation</h2>
                            <nav className="space-y-1 p-2">
                                {navItems.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => {
                                                setActiveSection(item.id);
                                                // Close sheet hack
                                                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                                                activeSection === item.id
                                                    ? "bg-primary text-primary-foreground"
                                                    : "hover:bg-muted text-foreground"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            <span className="flex-1 text-left">{item.label}</span>
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>
                    </SheetContent>
                </Sheet>

                <Button variant="ghost" size="sm" onClick={handleBackNavigation} className="hidden md:flex">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold truncate max-w-[200px] md:max-w-none">{project ? getDisplayName(project) : ''}</h1>
                    <p className="text-sm text-muted-foreground hidden md:block">{project?.description}</p>
                </div>

                {/* Sync Button */}
                {canMutateProject && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSync}
                        disabled={syncing}
                        className="flex items-center gap-2"
                        title="Sync with remote repository"
                    >
                        <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                        {syncing ? 'Syncing...' : 'Sync'}
                    </Button>
                )}

                {canMutateProject && (
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPathConfigOpen(true)}
                        title="Project settings"
                    >
                        <Settings className="h-4 w-4" />
                    </Button>
                )}

                {projectId && pathConfigOpen && (
                    <Suspense fallback={null}>
                        <PathConfigDialog
                            projectId={projectId}
                            open={pathConfigOpen}
                            onOpenChange={setPathConfigOpen}
                        />
                    </Suspense>
                )}
            </header>

            {/* Sync Message Banner */}
            {syncMessage && (
                <div className={cn(
                    "px-6 py-2 text-sm border-b",
                    syncMessage.includes('failed')
                        ? "bg-red-500/10 border-red-500/20 text-red-500"
                        : "bg-green-500/10 border-green-500/20 text-green-500"
                )}>
                    {syncMessage}
                    <button
                        onClick={() => setSyncMessage(null)}
                        className="ml-2 text-xs underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Version Banner */}
            {currentCommit && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <GitBranch className="h-4 w-4 text-amber-500" />
                        <span className="font-medium">
                            Viewing commit {currentCommit.substring(0, 7)}
                            {commitsBehind > 0 && (
                                <span className="text-muted-foreground ml-2">
                                    ({commitsBehind} {commitsBehind === 1 ? 'commit' : 'commits'} behind latest)
                                </span>
                            )}
                        </span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResetToLatest}
                        className="h-7"
                    >
                        <RotateCcw className="h-3 w-3 mr-2" />
                        Return to Latest
                    </Button>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                <aside
                    className={cn(
                        "hidden md:block border-r bg-muted/10 p-4 transition-all duration-300 relative",
                        (!sidebarCollapsed || sidebarHovered) ? "w-64" : "w-16"
                    )}
                    onMouseEnter={() => setSidebarHovered(true)}
                    onMouseLeave={() => setSidebarHovered(false)}
                >
                    <div className="absolute top-4 right-2 z-10">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            className="h-6 w-6 p-0"
                        >
                            {sidebarCollapsed ? (
                                <ChevronRight className="h-4 w-4" />
                            ) : (
                                <ChevronLeft className="h-4 w-4" />
                            )}
                        </Button>
                    </div>

                    {/* Thumbnail above nav — only when sidebar is expanded */}
                    {(!sidebarCollapsed || sidebarHovered) && (
                        <div className="mt-8 mb-3 space-y-1">
                            {project.thumbnail_url ? (
                                <button
                                    className="w-full overflow-hidden rounded-md border bg-muted/30 aspect-video focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                    onClick={() => setThumbnailLightbox(true)}
                                    title="Click to expand thumbnail"
                                >
                                    <img
                                        src={`${project.thumbnail_url}${thumbnailBust ? `?t=${thumbnailBust}` : ""}`}
                                        alt={getDisplayName(project)}
                                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                                    />
                                </button>
                            ) : (
                                <div className="w-full rounded-md border bg-muted/20 aspect-video flex items-center justify-center">
                                    <Image className="h-6 w-6 text-muted-foreground/40" />
                                </div>
                            )}
                            {canMutateProject && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full text-xs text-muted-foreground h-7"
                                    onClick={() => void handleGenerateThumbnail()}
                                    disabled={thumbnailGenerating}
                                >
                                    <Image className={`h-3 w-3 mr-1.5 ${thumbnailGenerating ? "animate-pulse" : ""}`} />
                                    {thumbnailGenerating ? "Generating…" : "Regenerate thumbnail"}
                                </Button>
                            )}
                        </div>
                    )}

                    <nav className={cn("space-y-1", !sidebarCollapsed || sidebarHovered ? "" : "mt-8")}>
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isExpanded = !sidebarCollapsed || sidebarHovered;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveSection(item.id)}
                                    className={cn(
                                        "w-full flex items-center rounded-md text-sm transition-colors",
                                        isExpanded ? "gap-3 px-3 py-2" : "justify-center py-2",
                                        activeSection === item.id
                                            ? "bg-primary text-primary-foreground"
                                            : "hover:bg-muted text-foreground"
                                    )}
                                    title={!isExpanded ? item.label : undefined}
                                >
                                    <Icon className="h-4 w-4 flex-shrink-0" />
                                    {isExpanded && (
                                        <span className="flex-1 text-left">{item.label}</span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {/* Thumbnail lightbox */}
                {thumbnailLightbox && project.thumbnail_url && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                        onClick={() => setThumbnailLightbox(false)}
                    >
                        <img
                            src={`${project.thumbnail_url}${thumbnailBust ? `?t=${thumbnailBust}` : ""}`}
                            alt={getDisplayName(project)}
                            className="max-w-[90vw] max-h-[90vh] object-contain rounded-md shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                )}

                <main className="flex-1 overflow-auto p-6">
                    {activeSection === "overview" && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>Last Updated: {project.last_modified}</span>
                            </div>

                            {readme && (
                                <Suspense fallback={<div className="text-sm text-muted-foreground">Loading README...</div>}>
                                    <MarkdownContent
                                        content={readme}
                                        resolveImageSrc={resolveProjectAssetSrc}
                                    />
                                </Suspense>
                            )}

                            {!readme && (
                                <p className="text-muted-foreground">No README.md found for this project.</p>
                            )}
                        </div>
                    )}

                    {activeSection === "assets" && (
                        <div>
                            {projectId && (
                                <Suspense fallback={<div className="text-sm text-muted-foreground">Loading assets...</div>}>
                                    <AssetsPortal projectId={projectId} commit={currentCommit} />
                                </Suspense>
                            )}
                        </div>
                    )}

                    {activeSection === "documentation" && (
                        <div>
                            {projectId && (
                                <Suspense fallback={<div className="text-sm text-muted-foreground">Loading documentation...</div>}>
                                    <DocumentationBrowser projectId={projectId} commit={currentCommit} key={activeSection} />
                                </Suspense>
                            )}
                        </div>
                    )}

                    {activeSection === "history" && (
                        <div>
                            {projectId && (
                                <Suspense fallback={<div className="text-sm text-muted-foreground">Loading history...</div>}>
                                    <HistoryViewer
                                        key={refreshKey}
                                        projectId={projectId}
                                        onViewCommit={handleViewCommit}
                                        canCompareDiffs={canMutateProject}
                                    />
                                </Suspense>
                            )}
                        </div>
                    )}

                    {visualizerLoaded && ( // Render only if visualizer has been loaded at least once
                        <div
                            className={cn(
                                "h-full flex flex-col -mt-6",
                                activeSection !== "visualizers" && "hidden" // Hide if not active
                            )}
                        >
                            <div className="flex-1 min-h-0">
                                {projectId && (
                                    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading visualizers...</div>}>
                                        <Visualizer projectId={projectId} user={user} commit={currentCommit} />
                                    </Suspense>
                                )}
                            </div>
                        </div>
                    )}

                    {activeSection === "workflows" && (
                        <div>
                            <WorkflowsPanel projectId={projectId!} user={user} canRun={canMutateProject} />
                        </div>
                    )}


                </main>
            </div>
        </div>
    );
}

// Workflows Sub-component
function WorkflowsPanel({ projectId, user, canRun }: { projectId: string, user: User | null, canRun: boolean }) {
    const [runningJob, setRunningJob] = useState<{ id: string, type: string } | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<string>("idle");

    useEffect(() => {
        let pollInterval: ReturnType<typeof window.setInterval> | null = null;

        if (runningJob) {
            pollInterval = setInterval(async () => {
                try {
                    const job = await fetchJson<WorkflowJobStatus>(`/api/projects/jobs/${runningJob.id}`);
                    setLogs(job.logs || []);
                    setStatus(job.status);

                    if (job.status === 'completed' || job.status === 'failed') {
                        // Keep logs visible but stop polling after a short delay to ensure final update
                        setTimeout(() => {
                            if (pollInterval) {
                                clearInterval(pollInterval);
                                pollInterval = null;
                            }
                            // Optional: Reset running job after some time? No, let user see result.
                        }, 1000);
                    }
                } catch (e) {
                    console.error("Poll error", e);
                }
            }, 1000);
        }

        return () => {
            if (pollInterval) {
                clearInterval(pollInterval);
            }
        };
    }, [runningJob]);

    const runWorkflow = async (type: string) => {
        if (!canRun) {
            alert("You do not have permission to run workflows.");
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
                alert(`Error: ${message}`);
                setStatus("idle");
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to start workflow";
            alert(message);
            setStatus("idle");
        }
    };

    return (
        <div className="max-w-5xl">
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
                        {status === 'running' && <span className="animate-pulse text-amber-500">Running...</span>}
                        {status === 'completed' && <span className="text-green-500">Completed</span>}
                        {status === 'failed' && <span className="text-red-500">Failed</span>}
                    </div>
                    <div className="space-y-1">
                        {logs.map((log, i) => (
                            <div key={i} className="break-all whitespace-pre-wrap">{log}</div>
                        ))}
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
            className="flex flex-col items-start p-6 rounded-lg border bg-card text-card-foreground shadow-sm hover:border-primary/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <div className="p-2 bg-primary/10 rounded-md mb-4 text-primary">
                <Icon className="h-6 w-6" />
            </div>
            <h3 className="font-semibold mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground">{desc}</p>
        </button>
    );
}
