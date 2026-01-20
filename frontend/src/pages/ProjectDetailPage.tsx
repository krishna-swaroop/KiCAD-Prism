import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, History, Box, FolderOpen, MessageSquare, ChevronLeft, ChevronRight, GitBranch, RotateCcw, PlayCircle, RefreshCw, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetsPortal } from "@/components/assets-portal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import "github-markdown-css/github-markdown-dark.css";
import { DocumentationBrowser } from "@/components/documentation-browser";
import { HistoryViewer } from "@/components/history-viewer";
import { Visualizer } from "@/components/visualizer";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface Project {
    id: string;
    name: string;
    description: string;
    path: string;
    last_modified: string;
}

type Section = "overview" | "history" | "visualizers" | "assets" | "documentation" | "collaboration" | "workflows";

export function ProjectDetailPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const [project, setProject] = useState<Project | null>(null);
    const [readme, setReadme] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<Section>("overview");
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarHovered, setSidebarHovered] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const [commitsBehind, setCommitsBehind] = useState<number>(0);
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);

    const currentCommit = searchParams.get('commit');

    const handleViewCommit = (commitHash: string) => {
        setSearchParams({ commit: commitHash });
    };

    const handleResetToLatest = () => {
        setSearchParams({});
    };

    const handleSync = async () => {
        if (!projectId || syncing) return;

        setSyncing(true);
        setSyncMessage(null);

        try {
            const response = await fetch(`/api/projects/${projectId}/sync`, {
                method: 'POST',
            });

            if (response.ok) {
                const data = await response.json();
                setSyncMessage(data.message);
                // Refresh project data and readme
                window.location.reload();
            } else {
                const error = await response.json();
                setSyncMessage(`Sync failed: ${error.detail}`);
            }
        } catch (err: any) {
            setSyncMessage(`Sync failed: ${err.message}`);
        } finally {
            setSyncing(false);
        }
    };

    useEffect(() => {
        const fetchProject = async () => {
            try {
                const response = await fetch(`/api/projects/${projectId}`);
                if (!response.ok) throw new Error("Failed to fetch project");
                const data = await response.json();
                setProject(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        const fetchReadme = async () => {
            try {
                const url = currentCommit
                    ? `/api/projects/${projectId}/readme?commit=${currentCommit}`
                    : `/api/projects/${projectId}/readme`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    setReadme(data.content);
                }
            } catch (err) {
                console.error("README not found", err);
            }
        };

        if (projectId) {
            fetchProject();
            fetchReadme();
        }
    }, [projectId, currentCommit]);

    // Calculate commits behind when viewing specific commit
    useEffect(() => {
        const calculateCommitsBehind = async () => {
            if (!currentCommit || !projectId) {
                setCommitsBehind(0);
                return;
            }

            try {
                const response = await fetch(`/api/projects/${projectId}/commits`);
                if (response.ok) {
                    const data = await response.json();
                    const commits = data.commits;
                    const index = commits.findIndex((c: any) => c.full_hash === currentCommit);
                    setCommitsBehind(index >= 0 ? index : 0);
                }
            } catch (err) {
                console.error("Failed to calculate commits behind", err);
            }
        };

        calculateCommitsBehind();
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
        { id: "collaboration" as Section, label: "Collaboration", icon: MessageSquare, disabled: true },
    ];

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
                                                if (!item.disabled) {
                                                    setActiveSection(item.id);
                                                    // Close sheet hack (simulate click on close or use ref - for simplicity we rely on user clicking outside or close button, 
                                                    // but ideally we'd control open state. Since we didn't add open state control, we accept this limitations for MVP or can improve)
                                                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                                                }
                                            }}
                                            disabled={item.disabled}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                                                activeSection === item.id
                                                    ? "bg-primary text-primary-foreground"
                                                    : "hover:bg-muted text-foreground",
                                                item.disabled && "opacity-50 cursor-not-allowed"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            <span className="flex-1 text-left">{item.label}</span>
                                            {item.disabled && <span className="text-xs">(Soon)</span>}
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>
                    </SheetContent>
                </Sheet>

                <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="hidden md:flex">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold truncate max-w-[200px] md:max-w-none">{project.name}</h1>
                    <p className="text-sm text-muted-foreground hidden md:block">{project.description}</p>
                </div>

                {/* Sync Button */}
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

                    <nav className="space-y-1 mt-8">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isExpanded = !sidebarCollapsed || sidebarHovered;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => !item.disabled && setActiveSection(item.id)}
                                    disabled={item.disabled}
                                    className={cn(
                                        "w-full flex items-center rounded-md text-sm transition-colors",
                                        isExpanded ? "gap-3 px-3 py-2" : "justify-center py-2",
                                        activeSection === item.id
                                            ? "bg-primary text-primary-foreground"
                                            : "hover:bg-muted text-foreground",
                                        item.disabled && "opacity-50 cursor-not-allowed"
                                    )}
                                    title={!isExpanded ? item.label : undefined}
                                >
                                    <Icon className="h-4 w-4 flex-shrink-0" />
                                    {isExpanded && (
                                        <>
                                            <span className="flex-1 text-left">{item.label}</span>
                                            {item.disabled && <span className="text-xs">(Soon)</span>}
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                <main className="flex-1 overflow-auto p-6">
                    {activeSection === "overview" && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>Last Updated: {project.last_modified}</span>
                            </div>

                            {readme && (
                                <div className="markdown-body" style={{ background: 'transparent' }}>
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw]}
                                        components={{
                                            img: ({ src, alt }) => {
                                                // Convert relative image paths to use backend API
                                                const imgSrc = src?.startsWith('http')
                                                    ? src
                                                    : `/api/projects/${projectId}/asset/${src}`;
                                                return (
                                                    <img
                                                        src={imgSrc}
                                                        alt={alt || ''}
                                                    />
                                                );
                                            }
                                        }}
                                    >
                                        {readme}
                                    </ReactMarkdown>
                                </div>
                            )}

                            {!readme && (
                                <p className="text-muted-foreground">No README.md found for this project.</p>
                            )}
                        </div>
                    )}

                    {activeSection === "assets" && (
                        <div>
                            <h2 className="text-2xl font-bold mb-6">Assets Portal</h2>
                            {projectId && <AssetsPortal projectId={projectId} />}
                        </div>
                    )}

                    {activeSection === "documentation" && (
                        <div>
                            <h2 className="text-2xl font-bold mb-6">Documentation</h2>
                            {projectId && <DocumentationBrowser projectId={projectId} commit={currentCommit} key={activeSection} />}
                        </div>
                    )}

                    {activeSection === "history" && (
                        <div>
                            <h2 className="text-2xl font-bold mb-6">History</h2>
                            {projectId && <HistoryViewer projectId={projectId} onViewCommit={handleViewCommit} />}
                        </div>
                    )}

                    {activeSection === "visualizers" && (
                        <div className="h-full flex flex-col">
                            <h2 className="text-2xl font-bold mb-6">Visualizers</h2>
                            <div className="flex-1 min-h-0">
                                {projectId && <Visualizer projectId={projectId} />}
                            </div>
                        </div>
                    )}

                    {activeSection === "workflows" && (
                        <div>
                            <WorkflowsPanel projectId={projectId!} />
                        </div>
                    )}

                    {activeSection === "collaboration" && (
                        <div className="flex items-center justify-center h-64 text-muted-foreground">
                            <p>Coming soon...</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

// Workflows Sub-component
function WorkflowsPanel({ projectId }: { projectId: string }) {
    const [runningJob, setRunningJob] = useState<{ id: string, type: string } | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<string>("idle");

    useEffect(() => {
        let pollInterval: any;

        if (runningJob) {
            pollInterval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/projects/jobs/${runningJob.id}`);
                    if (res.ok) {
                        const job = await res.json();
                        setLogs(job.logs || []);
                        setStatus(job.status);

                        if (job.status === 'completed' || job.status === 'failed') {
                            setStatus(job.status);
                            // Keep logs visible but stop polling after a short delay to ensure final update
                            setTimeout(() => {
                                clearInterval(pollInterval);
                                // Optional: Reset running job after some time? No, let user see result.
                            }, 1000);
                        }
                    }
                } catch (e) {
                    console.error("Poll error", e);
                }
            }, 1000);
        }

        return () => clearInterval(pollInterval);
    }, [runningJob]);

    const runWorkflow = async (type: string) => {
        setLogs([]);
        setStatus("running");
        try {
            const res = await fetch(`/api/projects/${projectId}/workflows`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type })
            });

            if (res.ok) {
                const data = await res.json();
                setRunningJob({ id: data.job_id, type });
            } else {
                const err = await res.json();
                alert(`Error: ${err.detail}`);
                setStatus("idle");
            }
        } catch (e: any) {
            alert(e.message);
            setStatus("idle");
        }
    };

    return (
        <div className="max-w-5xl">
            <h2 className="text-2xl font-bold mb-6">Workflows</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <WorkflowCard
                    title="Design Outputs"
                    desc="Generate Schematics, Netlists, and BOMs."
                    icon={FileText}
                    onClick={() => runWorkflow("design")}
                    disabled={status === "running"}
                />
                <WorkflowCard
                    title="Manufacturing Outputs"
                    desc="Generate Gerbers, Drill Files, and Pick & Place."
                    icon={Box}
                    onClick={() => runWorkflow("manufacturing")}
                    disabled={status === "running"}
                />
                <WorkflowCard
                    title="3D Renders"
                    desc="Generate Ray-Traced Renders of the PCB."
                    icon={Box}
                    onClick={() => runWorkflow("render")}
                    disabled={status === "running"}
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

function WorkflowCard({ title, desc, icon: Icon, onClick, disabled }: any) {
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
