import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { ReleaseStudioPanel } from "@/components/release-studio/ReleaseStudioPanel";
import { ErrorBoundary } from "@/components/error-boundary";
import { ArrowLeft, FileText, History, Box, FolderOpen, ChevronLeft, ChevronRight, GitBranch, RotateCcw, PlayCircle, RefreshCw, Menu, Settings, ShieldCheck, Factory } from "lucide-react";
import { fetchApi, fetchJson, readApiError } from "@/lib/api";
import { toast } from "sonner";
import { throwIfJobFailed, watchPrismJob } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { User } from "@/types/auth";
import {
    comparisonIsOpen,
    readComparisonUrlState,
} from "@/components/design-comparison/comparison-url";
import {
    ProjectSectionPanel,
    useVisitedProjectSections,
    type ProjectSection,
} from "./project-section-cache";

import { VISUALIZER_DESIGN_SEARCH_SLOT_ID } from "@/lib/design-search";
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
const ProjectManufacturing = lazy(() =>
    import("@/components/manufacturing/project-manufacturing").then((module) => ({ default: module.ProjectManufacturing }))
);

interface Project {
    id: string;
    name: string;
    display_name?: string;
    description: string;
    path: string;
    folder_id?: string | null;
    last_modified: string;
}

interface CommitDistanceResponse {
    commits_behind: number;
}

interface ProjectOverviewResponse {
    project: Project;
    readme: string | null;
}

interface ProjectBranch {
    name: string;
    ref: string;
    source: "local" | "remote" | string;
    is_current: boolean;
    hash: string;
    commit: string;
}

interface ProjectBranchesResponse {
    branches: ProjectBranch[];
}

interface WorkflowJobResponse {
    job_id: string;
}

function sectionFromSearchParams(searchParams: URLSearchParams): ProjectSection {
    const section = searchParams.get("section");
    if (
        section === "history"
        || section === "visualizers"
        || section === "assets"
        || section === "documentation"
        || section === "workflows"
        || section === "release-studio"
        || section === "manufacturing"
    ) {
        return section;
    }
    return "overview";
}

export function ProjectDetailPage({ user }: { user: User | null }) {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [project, setProject] = useState<Project | null>(null);
    const [readme, setReadme] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<ProjectSection>(() => (
        sectionFromSearchParams(searchParams)
    ));
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarHovered, setSidebarHovered] = useState(false);
    const [commitsBehind, setCommitsBehind] = useState<number>(0);
    const [syncing, setSyncing] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [pathConfigOpen, setPathConfigOpen] = useState(false);
    const [branches, setBranches] = useState<ProjectBranch[]>([]);
    const [branchesLoading, setBranchesLoading] = useState(false);
    const [branchError, setBranchError] = useState<string | null>(null);
    const canMutateProject = user?.role === "admin" || user?.role === "designer";

    // Helper function to get display name
    const getDisplayName = (project: Project) => {
        return project.display_name || project.name;
    };

    const selectedBranchRef = searchParams.get('branch');
    const currentCommit = searchParams.get('commit');
    const selectedBranch = useMemo(
        () => branches.find((branch) => branch.ref === selectedBranchRef) || null,
        [branches, selectedBranchRef]
    );
    // The empty-value option means "the branch the repo is checked out to".
    // Show that branch's name rather than the generic "Current checkout".
    const currentBranch = useMemo(
        () => branches.find((branch) => branch.is_current) || null,
        [branches]
    );
    const activeCommit = currentCommit || selectedBranch?.commit || null;
    const comparisonUrl = useMemo(
        () => readComparisonUrlState(searchParams),
        [searchParams],
    );
    const comparisonOpen = comparisonIsOpen(comparisonUrl);
    const comparisonVisible = comparisonOpen && activeSection === "history";

    useEffect(() => {
        setActiveSection(sectionFromSearchParams(searchParams));
    }, [searchParams]);

    const visitedSections = useVisitedProjectSections(projectId, activeSection);

    const handleSectionChange = (section: ProjectSection) => {
        setActiveSection(section);
        const next = new URLSearchParams(searchParams);
        next.set("section", section);
        setSearchParams(next);
    };

    const handleViewCommit = (commitHash: string) => {
        const next = new URLSearchParams(searchParams);
        next.set("section", "history");
        next.set("commit", commitHash);
        setSearchParams(next);
    };

    // Open the design at a commit directly in the visualizer, read-only. Distinct
    // from handleViewCommit, which keeps you in the history section. An optional
    // tab opens straight onto a specific view (e.g. a changed .kicad_pcb).
    const handleOpenCommitVisualizer = (commitHash: string, tab?: string) => {
        const next = new URLSearchParams(searchParams);
        next.set("section", "visualizers");
        next.set("commit", commitHash);
        if (tab) next.set("tab", tab);
        else next.delete("tab");
        setSearchParams(next);
    };

    const handleResetToLatest = () => {
        if (currentCommit && selectedBranchRef) {
            setSearchParams({ branch: selectedBranchRef });
            return;
        }
        setSearchParams({});
    };

    const handleBranchChange = (branchRef: string) => {
        const next = new URLSearchParams(searchParams);
        if (branchRef) next.set("branch", branchRef);
        else next.delete("branch");
        setSearchParams(next);
    };

    const handleSync = async () => {
        if (!projectId || syncing || !canMutateProject) return;

        setSyncing(true);
        // One toast, updated in place, so progress and outcome share a slot
        // instead of the app having two feedback systems. Success and failure
        // come from the job's own state rather than from reading its prose.
        const toastId = toast.loading("Syncing repository");

        try {
            const data = await fetchJson<{ job_id: string; message?: string }>(
                `/api/projects/${projectId}/sync`,
                { method: "POST" },
                "Sync failed"
            );
            const job = await watchPrismJob(data.job_id, {
                onUpdate: (update) => {
                    toast.loading(
                        `${update.message || "Syncing repository"} (${Math.round(update.percent)}%)`,
                        { id: toastId },
                    );
                },
            });
            throwIfJobFailed(job, "Sync failed");
            toast.success(job.message || "Sync completed", { id: toastId });
            // Refresh project data and readme without full reload
            setRefreshKey((prev) => prev + 1);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Sync failed";
            toast.error(message, { id: toastId });
        } finally {
            setSyncing(false);
        }
    };

    useEffect(() => {
        if (!projectId) {
            setBranches([]);
            return;
        }

        const controller = new AbortController();
        setBranchesLoading(true);
        setBranchError(null);

        const fetchBranches = async () => {
            try {
                const data = await fetchJson<ProjectBranchesResponse>(
                    `/api/projects/${projectId}/branches`,
                    { signal: controller.signal },
                    "Failed to load branches"
                );
                if (!controller.signal.aborted) {
                    setBranches(data.branches || []);
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    setBranches([]);
                    setBranchError(err instanceof Error ? err.message : "Failed to load branches");
                }
            } finally {
                if (!controller.signal.aborted) {
                    setBranchesLoading(false);
                }
            }
        };

        void fetchBranches();
        return () => controller.abort();
    }, [projectId, refreshKey]);

    useEffect(() => {
        if (!projectId) {
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        setLoading(true);

        const fetchProjectData = async () => {
            try {
                const overviewUrl = activeCommit
                    ? `/api/projects/${projectId}/overview?commit=${encodeURIComponent(activeCommit)}`
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
    }, [projectId, activeCommit, refreshKey]);

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
                const refQuery = selectedBranchRef ? `&ref=${encodeURIComponent(selectedBranchRef)}` : "";
                const data = await fetchJson<CommitDistanceResponse>(
                    `/api/projects/${projectId}/commits/distance?commit=${encodeURIComponent(currentCommit)}${refQuery}`,
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
    }, [currentCommit, projectId, selectedBranchRef]);

    if (loading) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>;
    }

    if (!project) {
        return <div className="flex items-center justify-center h-screen">Project not found</div>;
    }

    const navItems = [
        { id: "overview" as ProjectSection, label: "Overview", icon: FileText },
        { id: "history" as ProjectSection, label: "History", icon: History },
        { id: "visualizers" as ProjectSection, label: "Visualizers", icon: Box },
        { id: "workflows" as ProjectSection, label: "Workflows", icon: PlayCircle },
        { id: "release-studio" as ProjectSection, label: "Release Studio", icon: ShieldCheck },
        { id: "manufacturing" as ProjectSection, label: "Manufacturing", icon: Factory },
        { id: "assets" as ProjectSection, label: "Assets Portal", icon: FolderOpen },
        { id: "documentation" as ProjectSection, label: "Documentation", icon: FileText },
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
        return activeCommit ? `${assetUrl}?commit=${encodeURIComponent(activeCommit)}` : assetUrl;
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
                                                handleSectionChange(item.id);
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
                <div className={cn("min-w-0", activeSection === "visualizers" ? "shrink-0" : "flex-1")}>
                    <h1 className={cn(
                        "text-xl font-bold truncate",
                        activeSection === "visualizers" ? "max-w-[140px] md:max-w-[220px]" : "max-w-[200px] md:max-w-none",
                    )}>
                        {project ? getDisplayName(project) : ""}
                    </h1>
                    <p className={cn(
                        "text-sm text-muted-foreground",
                        activeSection === "visualizers" ? "hidden" : "hidden md:block",
                    )}>
                        {project?.description}
                    </p>
                </div>
                {activeSection === "visualizers" ? (
                    <div
                        id={VISUALIZER_DESIGN_SEARCH_SLOT_ID}
                        className="flex min-w-0 flex-1 justify-center px-2"
                    />
                ) : null}

                <div className="hidden min-w-0 items-center gap-2 md:flex">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <select
                        // An explicit ?branch= for the current branch has no
                        // option of its own (it lives in the default entry), so
                        // map it back to the default value to keep the select
                        // in sync rather than falling through to the first item.
                        value={
                            selectedBranchRef && selectedBranchRef !== currentBranch?.ref
                                ? selectedBranchRef
                                : ""
                        }
                        onChange={(event) => handleBranchChange(event.target.value)}
                        disabled={branchesLoading}
                        title={branchError || "View this project on another branch"}
                        className="h-9 max-w-[260px] appearance-none rounded-md border border-input bg-background bg-no-repeat py-0 pl-3 pr-8 text-sm text-foreground shadow-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                            backgroundImage:
                                "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                            backgroundPosition: "right 0.5rem center",
                            backgroundSize: "1rem",
                        }}
                    >
                        <option value="">
                            {branchesLoading
                                ? "Loading branches..."
                                : currentBranch?.name || "Current checkout"}
                        </option>
                        {/* The default option above already represents the
                            current branch by name, so skip it here rather than
                            listing it a second time with a "(current)" suffix. */}
                        {branches
                            .filter((branch) => !branch.is_current)
                            .map((branch) => (
                                <option key={branch.ref} value={branch.ref}>
                                    {branch.source === "remote" ? branch.ref : branch.name}
                                </option>
                            ))}
                    </select>
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

            {/* Version Banner */}
            {(currentCommit || selectedBranch) && (
                <div className="bg-warning/10 border-b border-warning/20 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <GitBranch className="h-4 w-4 text-warning" />
                        <span className="font-medium">
                            {currentCommit
                                ? `Viewing commit ${currentCommit.substring(0, 7)}`
                                : `Viewing branch ${selectedBranch?.ref || selectedBranchRef}`}
                            {selectedBranch && (
                                <span className="text-muted-foreground ml-2">@ {selectedBranch.hash}</span>
                            )}
                            {currentCommit && commitsBehind > 0 && (
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
                        {currentCommit && selectedBranchRef ? "Return to Branch Head" : "Return to Current Checkout"}
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
                                    onClick={() => handleSectionChange(item.id)}
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

                <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
                    {visitedSections.has("overview") && (
                        <ProjectSectionPanel
                            key={`${projectId}:overview`}
                            active={activeSection === "overview"}
                        >
                            <ErrorBoundary label="the project overview" resetKeys={[projectId, activeCommit, refreshKey]}>
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <span>Last Updated: {project.last_modified}</span>
                                    </div>
                                    {readme ? (
                                        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading README...</div>}>
                                            <MarkdownContent
                                                content={readme}
                                                resolveImageSrc={resolveProjectAssetSrc}
                                            />
                                        </Suspense>
                                    ) : (
                                        <p className="text-muted-foreground">No README.md found for this project.</p>
                                    )}
                                </div>
                            </ErrorBoundary>
                        </ProjectSectionPanel>
                    )}

                    {visitedSections.has("assets") && (
                        <ProjectSectionPanel
                            key={`${projectId}:assets`}
                            active={activeSection === "assets"}
                        >
                            <ErrorBoundary label="the assets portal" resetKeys={[projectId, activeCommit, refreshKey]}>
                                <h2 className="mb-6 text-2xl font-bold">Assets Portal</h2>
                                {projectId && (
                                    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading assets...</div>}>
                                        <AssetsPortal projectId={projectId} commit={activeCommit} />
                                    </Suspense>
                                )}
                            </ErrorBoundary>
                        </ProjectSectionPanel>
                    )}

                    {visitedSections.has("documentation") && (
                        <ProjectSectionPanel
                            key={`${projectId}:documentation`}
                            active={activeSection === "documentation"}
                        >
                            <ErrorBoundary label="the documentation browser" resetKeys={[projectId, activeCommit, refreshKey]}>
                                <h2 className="mb-6 text-2xl font-bold">Documentation</h2>
                                {projectId && (
                                    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading documentation...</div>}>
                                        <DocumentationBrowser projectId={projectId} commit={activeCommit} />
                                    </Suspense>
                                )}
                            </ErrorBoundary>
                        </ProjectSectionPanel>
                    )}

                    {visitedSections.has("manufacturing") && (
                        <ProjectSectionPanel
                            key={`${projectId}:manufacturing`}
                            active={activeSection === "manufacturing"}
                        >
                            <h2 className="mb-6 text-2xl font-bold">Manufacturing</h2>
                            {projectId && (
                                <ErrorBoundary label="the manufacturing panel" resetKeys={[projectId, refreshKey]}>
                                    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading manufacturing...</div>}>
                                        <ProjectManufacturing
                                            projectId={projectId}
                                            canEdit={canMutateProject}
                                            onNewRun={() => navigate("/?section=manufacturing")}
                                            onOpenRun={() => navigate("/?section=manufacturing")}
                                        />
                                    </Suspense>
                                </ErrorBoundary>
                            )}
                        </ProjectSectionPanel>
                    )}

                    {visitedSections.has("history") && (
                        <ProjectSectionPanel
                            key={`${projectId}:history`}
                            active={activeSection === "history"}
                        >
                            <h2 className="mb-6 text-2xl font-bold">History</h2>
                            {projectId && (
                                <ErrorBoundary label="the history viewer" resetKeys={[projectId, selectedBranchRef, refreshKey]}>
                                    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading history...</div>}>
                                        <HistoryViewer
                                            key={refreshKey}
                                            projectId={projectId}
                                            branchRef={selectedBranchRef}
                                            onViewCommit={handleViewCommit}
                                            onOpenVisualizer={handleOpenCommitVisualizer}
                                            canCompareDiffs
                                            canComment={canMutateProject}
                                            active={activeSection === "history"}
                                        />
                                    </Suspense>
                                </ErrorBoundary>
                            )}
                        </ProjectSectionPanel>
                    )}

                    {visitedSections.has("visualizers") && (
                        <ProjectSectionPanel
                            key={`${projectId}:visualizers`}
                            active={activeSection === "visualizers"}
                            fill
                        >
                            {projectId && (
                                <ErrorBoundary label="the visualizer" resetKeys={[projectId, activeCommit]}>
                                    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading visualizers...</div>}>
                                        <Visualizer
                                            projectId={projectId}
                                            user={user}
                                            commit={activeCommit}
                                            active={!comparisonVisible && activeSection === "visualizers"}
                                        />
                                    </Suspense>
                                </ErrorBoundary>
                            )}
                        </ProjectSectionPanel>
                    )}

                    {visitedSections.has("release-studio") && (
                        <ProjectSectionPanel
                            key={`${projectId}:release-studio`}
                            active={activeSection === "release-studio"}
                            fill
                        >
                            <ErrorBoundary label="the release studio panel" resetKeys={[projectId]}>
                                <ReleaseStudioPanel
                                    projectId={projectId!}
                                    canMutate={canMutateProject}
                                    userRole={user?.role}
                                />
                            </ErrorBoundary>
                        </ProjectSectionPanel>
                    )}

                    {visitedSections.has("workflows") && (
                        <ProjectSectionPanel
                            key={`${projectId}:workflows`}
                            active={activeSection === "workflows"}
                        >
                            <ErrorBoundary label="the workflows panel" resetKeys={[projectId]}>
                                <WorkflowsPanel projectId={projectId!} user={user} canRun={canMutateProject} />
                            </ErrorBoundary>
                        </ProjectSectionPanel>
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
