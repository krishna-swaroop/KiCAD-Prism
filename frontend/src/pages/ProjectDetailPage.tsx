import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReleaseStudioPanel } from "@/components/release-studio/ReleaseStudioPanel";
import { useSimStudioAvailable } from "@/components/sim-studio/use-sim-studio-available";
import { ErrorBoundary } from "@/components/error-boundary";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { toast } from "sonner";
import { throwIfJobFailed, watchPrismJob } from "@/lib/jobs";
import { invalidateServerState, useServerState } from "@/lib/server-state";
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
import { installPrismScriptApi } from "@/lib/prism-script-api";
import { canAdministerWorkspace, canCommentOnProjects, canManageProjects } from "@/lib/roles";
import { projectLastUpdated } from "@/lib/project-dates";
import { HelpMenu } from "@/features/bug-report/help-menu";
import { LibraryUsageButton } from "@/features/library-usage/library-usage-button";
import { canOpenSupply } from "@/lib/roles";
import { BranchSelect, type ProjectBranch } from "./project-detail/branch-select";
import { ProjectActionsMenu } from "./project-detail/project-actions-menu";
import { ProjectMobileNav, ProjectSidebar, projectNavItems } from "./project-detail/project-nav";
import { RevisionBanner } from "./project-detail/revision-banner";
import { WorkflowsPanel } from "./project-detail/workflows-panel";

const AssetsPortal = lazy(() =>
    import("@/components/assets-portal").then((module) => ({ default: module.AssetsPortal }))
);
// Experimental, and its charts are heavy: loaded when the section first opens.
const SimStudioPanel = lazy(() =>
    import("@/components/sim-studio/SimStudioPanel").then((module) => ({ default: module.SimStudioPanel }))
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
const ProjectSupplyTab = lazy(() =>
    import("@/features/supply/project-supply-tab").then((module) => ({ default: module.ProjectSupplyTab }))
);

interface Project {
    id: string;
    name: string;
    display_name?: string;
    description: string;
    path: string;
    folder_id?: string | null;
    last_modified: string;
    last_synced_at?: string | null;
}

interface CommitDistanceResponse {
    commits_behind: number;
}

interface ProjectOverviewResponse {
    project: Project;
    readme: string | null;
}

interface ProjectBranchesResponse {
    branches: ProjectBranch[];
}

const NO_BRANCHES: ProjectBranch[] = [];
const projectBranchesKey = (projectId: string) => ["project", projectId, "branches"] as const;

function sectionFromSearchParams(searchParams: URLSearchParams): ProjectSection {
    const section = searchParams.get("section");
    if (
        section === "history"
        || section === "visualizers"
        || section === "assets"
        || section === "documentation"
        || section === "workflows"
        || section === "release-studio"
        || section === "supply"
        || section === "simulation-studio"
    ) {
        return section;
    }
    return "overview";
}

// Closes over nothing in the component.
const getDisplayName = (project: Project) => {
    return project.display_name || project.name;
};

// react-doctor-disable-next-line no-giant-component - page aggregating tabs, builds, and branch state for one project
export function ProjectDetailPage({ user }: { user: User | null }) {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [project, setProject] = useState<Project | null>(null);
    // Where the Supply section puts its buttons: on its title row, a little higher than its own controls.
    const [supplyActions, setSupplyActions] = useState<HTMLElement | null>(null);
    const [readme, setReadme] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<ProjectSection>(() => (
        sectionFromSearchParams(searchParams)
    ));
    const [commitsBehind, setCommitsBehind] = useState<number>(0);
    const [syncing, setSyncing] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    // One poller per project, kept fresh while the tab is visible. It does not
    // restart when the section, branch or commit changes.
    const branchesRead = useServerState(
        projectId ? projectBranchesKey(projectId) : null,
        (signal) => fetchJson<ProjectBranchesResponse>(
            `/api/projects/${projectId}/branches`,
            { signal },
            "Failed to load branches"
        ),
        { pollMs: 30_000, whileVisible: true },
    );
    const branches = branchesRead.data?.branches ?? NO_BRANCHES;
    const branchesLoading = branchesRead.loading;
    const branchError = branchesRead.error?.message ?? null;
    const canMutateProject = canManageProjects(user?.role);
    const simStudioAvailable = useSimStudioAvailable();
    const canComment = canCommentOnProjects(user?.role);

    const selectedBranchRef = searchParams.get('branch');
    const currentCommit = searchParams.get('commit');
    // Matched on ref first, then on name. Prism's clone never checks branches out, so
    // a branch somebody pushed exists in it only as origin/<name> and its ref reads
    // "origin/test" where the user (and anything linking here, like the KiCad plugin)
    // calls it "test". Without the fallback that link selected nothing and the picker
    // fell back to its first option, showing the wrong branch for the commit on screen.
    const selectedBranch = useMemo(
        () =>
            branches.find((branch) => branch.ref === selectedBranchRef) ||
            branches.find((branch) => branch.name === selectedBranchRef) ||
            null,
        [branches, selectedBranchRef]
    );
    // The empty-value option means "the branch the repo is checked out to".
    // Show that branch's name rather than the generic "Current checkout".
    const currentBranch = useMemo(
        () => branches.find((branch) => branch.is_current) || null,
        [branches]
    );
    const defaultBranch = currentBranch || branches[0] || null;
    const activeBranchRef = selectedBranchRef || defaultBranch?.ref || null;
    const activeCommit = currentCommit || selectedBranch?.commit || defaultBranch?.commit || null;
    const viewerSelectionKey = `${projectId ?? ""}:${activeBranchRef ?? ""}:${currentCommit ?? ""}`;
    const [viewerPin, setViewerPin] = useState<{ key: string; commit: string } | null>(null);
    const viewerCommit = currentCommit
        || (viewerPin?.key === viewerSelectionKey ? viewerPin.commit : activeCommit);
    // On the visualizers without a pinned commit, the viewer holds the commit it
    // opened on; a newer branch head is offered, not loaded.
    if (activeSection === "visualizers" && !currentCommit && activeCommit && viewerPin?.key !== viewerSelectionKey) {
        setViewerPin({ key: viewerSelectionKey, commit: activeCommit });
    }
    const newerViewerRevisionAvailable = activeSection === "visualizers" && !currentCommit
        && !!activeCommit && !!viewerCommit && activeCommit !== viewerCommit;
    const comparisonUrl = useMemo(
        () => readComparisonUrlState(searchParams),
        [searchParams],
    );
    const comparisonOpen = comparisonIsOpen(comparisonUrl);
    const comparisonVisible = comparisonOpen && activeSection === "history";

    useEffect(() => {
        setActiveSection(sectionFromSearchParams(searchParams));
    }, [searchParams]);

    // `window.prism` (MCP-21) lives for the project page, not one section:
    // link/open work from anywhere on the page, and the viewer reports what it
    // can read when it is mounted.
    const latestSearch = useRef(searchParams);
    const latestPath = useRef(location.pathname);
    useEffect(() => {
        latestSearch.current = searchParams;
        latestPath.current = location.pathname;
    }, [location.pathname, searchParams]);
    useEffect(() => {
        if (!projectId) return;
        return installPrismScriptApi(projectId, {
            search: () => latestSearch.current,
            pathname: () => latestPath.current,
            navigate: (url) => navigate(url),
        });
    }, [navigate, projectId]);

    const visitedSections = useVisitedProjectSections(projectId, activeSection);
    const navItems = useMemo(
        () => projectNavItems(user?.role, simStudioAvailable),
        [user?.role, simStudioAvailable],
    );

    const handleSectionChange = (section: ProjectSection) => {
        if (section === "visualizers" && !currentCommit && activeCommit) {
            setViewerPin((previous) => previous?.key === viewerSelectionKey
                ? previous : { key: viewerSelectionKey, commit: activeCommit });
        }
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
        const branch = branches.find((entry) => entry.ref === branchRef)
            || (branchRef ? null : defaultBranch);
        if (activeSection === "visualizers" && branch?.commit) {
            setViewerPin({
                key: `${projectId ?? ""}:${branchRef || defaultBranch?.ref || ""}:`,
                commit: branch.commit,
            });
        }
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
            void invalidateServerState(projectBranchesKey(projectId));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Sync failed";
            toast.error(message, { id: toastId });
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
        let cancelled = false;
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

                if (cancelled) {
                    return;
                }

                setProject(overview.project);
                setReadme(overview.readme ?? "");
            } catch (err) {
                if (cancelled) {
                    return;
                }
                console.error("Failed to fetch project details", err);
                setProject(null);
                setReadme("");
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void fetchProjectData();
        return () => {
            cancelled = true;
            controller.abort();
        };
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
                const refQuery = activeBranchRef ? `&ref=${encodeURIComponent(activeBranchRef)}` : "";
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
    }, [activeBranchRef, currentCommit, projectId]);

    // Only a project not shown yet blanks the page. Reading the overview again for another commit (the branch head, once it is known)
    // keeps the page up: blanking it unmounted every open section, which then loaded everything a second time.
    if (loading && project?.id !== projectId) {
        return <div className="flex items-center justify-center h-app-viewport">Loading...</div>;
    }

    if (!project) {
        return <div className="flex items-center justify-center h-app-viewport">Project not found</div>;
    }

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
        <div className="h-app-viewport flex flex-col bg-background">
            <header className="flex min-h-12 items-center gap-3 border-b px-3 py-1.5 md:px-4">
                <ProjectMobileNav items={navItems} active={activeSection} onSelect={handleSectionChange} />

                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleBackNavigation}
                    className="hidden md:inline-flex"
                    title="Back"
                    aria-label="Back"
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                {/* The title takes whatever the header has left; it truncates only when
                    there is genuinely no room, rather than at a fixed pixel cap. */}
                <div className="min-w-[7rem] flex-1">
                    <h1 className={cn(
                        "truncate text-base font-semibold tracking-tight",
                        activeSection === "visualizers" ? "" : "max-w-[200px] md:max-w-none",
                    )}>
                        {project ? getDisplayName(project) : ""}
                    </h1>
                    <p className={cn(
                        "truncate text-xs text-muted-foreground",
                        activeSection === "visualizers" ? "hidden" : "hidden md:block",
                    )}>
                        {project?.description}
                    </p>
                </div>
                {activeSection === "visualizers" ? (
                    <div
                        id={VISUALIZER_DESIGN_SEARCH_SLOT_ID}
                        // Compact at rest so the project name is not squeezed; grows while
                        // the search field or its results have focus.
                        className="flex w-full min-w-0 max-w-sm shrink justify-center px-2 transition-[max-width] duration-150 focus-within:max-w-lg"
                    />
                ) : null}

                <BranchSelect
                    branches={branches}
                    selected={selectedBranch}
                    current={currentBranch}
                    loading={branchesLoading}
                    error={branchError}
                    onChange={handleBranchChange}
                />

                {newerViewerRevisionAvailable && activeCommit && (
                    <Button variant="outline" size="sm"
                        onClick={() => setViewerPin({ key: viewerSelectionKey, commit: activeCommit })}>
                        New revision available · View
                    </Button>
                )}

                {projectId && <LibraryUsageButton projectId={projectId} canScan={canMutateProject} />}

                {canMutateProject && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSync}
                        disabled={syncing}
                        title="Sync with remote repository"
                    >
                        <RefreshCw className={cn(syncing && "animate-spin")} />
                        {syncing ? "Syncing…" : "Sync"}
                    </Button>
                )}

                {projectId && (
                    <ProjectActionsMenu
                        projectId={projectId}
                        canManage={canMutateProject}
                        isAdmin={canAdministerWorkspace(user?.role)}
                    />
                )}

                <HelpMenu />
            </header>

            {(currentCommit || selectedBranch) && (
                <RevisionBanner
                    commit={currentCommit}
                    branchRef={selectedBranch?.ref || selectedBranchRef}
                    branchHash={selectedBranch?.hash ?? null}
                    commitsBehind={commitsBehind}
                    onReset={handleResetToLatest}
                />
            )}

            <div className="flex flex-1 overflow-hidden">
                <ProjectSidebar
                    items={navItems}
                    active={activeSection}
                    onSelect={handleSectionChange}
                    railByDefault={activeSection === "visualizers"}
                />

                <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
                    {visitedSections.has("overview") && (
                        <ProjectSectionPanel
                            key={`${projectId}:overview`}
                            active={activeSection === "overview"}
                        >
                            <ErrorBoundary label="the project overview" resetKeys={[projectId, activeCommit, refreshKey]}>
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <span>Last updated: {projectLastUpdated(project)}</span>
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

                    {visitedSections.has("history") && (
                        <ProjectSectionPanel
                            key={`${projectId}:history`}
                            active={activeSection === "history"}
                        >
                            <h2 className="mb-6 text-2xl font-bold">History</h2>
                            {projectId && (
                                <ErrorBoundary label="the history viewer" resetKeys={[projectId, activeBranchRef, refreshKey]}>
                                    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading history...</div>}>
                                        <HistoryViewer
                                            // The identity the ErrorBoundary
                                            // above already resets on.
                                            key={`${projectId}:${activeBranchRef}:${refreshKey}`}
                                            projectId={projectId}
                                            branchRef={activeBranchRef}
                                            onViewCommit={handleViewCommit}
                                            onOpenVisualizer={handleOpenCommitVisualizer}
                                            canCompareDiffs
                                            canComment={canComment}
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
                                <ErrorBoundary label="the visualizer" resetKeys={[projectId, viewerCommit]}>
                                    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading visualizers...</div>}>
                                        <Visualizer
                                            // The identity the ErrorBoundary
                                            // beside it already resets on.
                                            key={`${projectId}:${viewerCommit ?? ""}`}
                                            projectId={projectId}
                                            user={user}
                                            commit={viewerCommit}
                                            supplyAtHead={!currentCommit}
                                            active={!comparisonVisible && activeSection === "visualizers"}
                                        />
                                    </Suspense>
                                </ErrorBoundary>
                            )}
                        </ProjectSectionPanel>
                    )}

                    {simStudioAvailable && visitedSections.has("simulation-studio") && (
                        <ProjectSectionPanel
                            key={`${projectId}:simulation-studio`}
                            active={activeSection === "simulation-studio"}
                            fill
                        >
                            <ErrorBoundary label="the simulation studio panel" resetKeys={[projectId]}>
                                <Suspense fallback={null}>
                                    <SimStudioPanel key={projectId} projectId={projectId!} canMutate={canMutateProject} active={activeSection === "simulation-studio"} />
                                </Suspense>
                            </ErrorBoundary>
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

                    {visitedSections.has("supply") && canOpenSupply(user?.role) && (
                        <ProjectSectionPanel
                            key={`${projectId}:supply`}
                            active={activeSection === "supply"}
                            className="themed-scrollbar"
                        >
                            <ErrorBoundary label="the project's supply" resetKeys={[projectId]}>
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <h2 className="text-2xl font-bold">Supply</h2>
                                    <div ref={setSupplyActions} className="flex flex-wrap items-center gap-2" />
                                </div>
                                {projectId && (
                                    <Suspense fallback={<Skeleton className="h-48 w-full" aria-label="Loading the project's supply" />}>
                                        <ProjectSupplyTab projectId={projectId} user={user} actionsSlot={supplyActions} />
                                    </Suspense>
                                )}
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
