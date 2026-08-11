import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    GitCommit,
    GitBranch,
    Tag,
    Eye,
    Check,
    User,
    Clock,
    Calendar,
    ChevronDown,
    ChevronRight,
    FileText,
    Plus,
    Minus,
    RefreshCw,
    Loader2,
    CircuitBoard,
    Cpu,
    Settings,
    FileCode,
    ArrowLeftRight,
    X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBoundary } from "@/components/error-boundary";
import { DesignComparisonWorkspace } from "./design-comparison/design-comparison-workspace";
import {
    applyOpenComparisonParams,
    clearComparisonParams,
    comparisonIsOpen,
    readComparisonUrlState,
} from "./design-comparison/comparison-url";
import { fetchJson } from "@/lib/api";
import {
    selectRevisionSlot,
    type RevisionRef,
} from "./history-comparison-selection";

interface Release {
    tag: string;
    commit_hash: string;
    full_hash: string;
    date: string;
    message: string;
}

interface KicadChanges {
    sch: number;
    pcb: number;
    pro: number;
    other: number;
}

interface Commit {
    hash: string;
    full_hash: string;
    author: string;
    email: string;
    date: string;
    message: string;
    kicad_changes?: KicadChanges;
}

interface ReleasesResponse {
    releases: Release[];
    total: number | null;
    has_more: boolean;
    limit: number;
    offset: number;
}

interface CommitsResponse {
    commits: Commit[];
    total: number | null;
    has_more: boolean;
    limit: number;
    offset: number;
}

const COMMITS_PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const DEFAULT_COMMITS_PAGE_SIZE = 50;
const RELEASES_PAGE_SIZE = 9;

interface CommitFile {
    path: string;
    filename: string;
    status: "added" | "removed" | "modified" | "renamed";
    additions: number | null;
    deletions: number | null;
}

interface CommitSummary {
    files: CommitFile[];
    base_commit: string | null;
    compare_commit: string;
    parent_count: number;
    comparison_basis: "first-parent" | "root";
}

interface HistoryViewerProps {
    projectId: string;
    branchRef?: string | null;
    onViewCommit: (commitHash: string) => void;
    onOpenVisualizer: (commitHash: string, tab?: string) => void;
    canCompareDiffs: boolean;
    canComment: boolean;
    active?: boolean;
}

function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return date.toLocaleDateString();
}

const STATUS_COLOR: Record<string, string> = {
    added: "text-success",
    removed: "text-destructive",
    modified: "text-warning",
    renamed: "text-primary",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
    added:    <Plus className="h-3 w-3" />,
    removed:  <Minus className="h-3 w-3" />,
    modified: <RefreshCw className="h-3 w-3" />,
    renamed:  <RefreshCw className="h-3 w-3" />,
};

// Sort rank for the file list inside an expanded commit. Lower rank = shown
// first. Schematic and PCB files lead, followed by project, libraries, then
// everything else. Within a rank, original order is preserved (stable sort).
function fileSortRank(filename: string): number {
    if (filename.endsWith(".kicad_sch")) return 0;
    if (filename.endsWith(".kicad_pcb")) return 1;
    if (filename.endsWith(".kicad_pro")) return 2;
    if (filename.endsWith(".kicad_sym") || filename.endsWith(".kicad_mod")) return 3;
    return 4;
}

// File-type icon picker. Returns the icon + a colour class so KiCad files
// stand out from generic ones in the file list.
function fileTypeIcon(filename: string): { Icon: typeof FileText; color: string } {
    if (filename.endsWith(".kicad_sch")) return { Icon: CircuitBoard, color: "text-primary" };
    if (filename.endsWith(".kicad_pcb")) return { Icon: Cpu, color: "text-success" };
    if (filename.endsWith(".kicad_pro")) return { Icon: Settings, color: "text-muted-foreground" };
    if (filename.endsWith(".kicad_sym") || filename.endsWith(".kicad_mod")) {
        return { Icon: FileCode, color: "text-primary" };
    }
    return { Icon: FileText, color: "text-muted-foreground" };
}

// Which visualizer tab a changed file opens onto. Board and schematic have their
// own views; anything else (project, libraries) just opens the visualizer on its
// default tab, since there is no dedicated viewer for it.
function visualizerTabForFile(filename: string): string | undefined {
    if (filename.endsWith(".kicad_pcb")) return "pcb";
    if (filename.endsWith(".kicad_sch")) return "sch";
    return undefined;
}

// Small chip indicating that a commit (or file) touched N items of a given
// kind. Renders nothing when count is 0 so rows without that kind of change
// stay compact.
function KicadChip({ icon: Icon, label, count, color }: {
    icon: typeof FileText; label: string; count: number; color: string;
}) {
    if (count <= 0) return null;
    return (
        <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-medium leading-none ${color}`}
            title={`${count} ${label.toLowerCase()} file${count > 1 ? "s" : ""} changed`}
        >
            <Icon className="h-3 w-3" />
            {count > 1 ? <span className="font-mono">{count}</span> : null}
        </span>
    );
}

interface CommitItemProps {
    commit: Commit;
    projectId: string;
    onViewCommit: (hash: string) => void;
    onOpenVisualizer: (hash: string, tab?: string) => void;
    isBase: boolean;
    isCompare: boolean;
    onSetBase: () => void;
    onSetCompare: () => void;
    selectable: boolean;
}

function CommitItem({
    commit,
    projectId,
    onViewCommit,
    onOpenVisualizer,
    isBase,
    isCompare,
    onSetBase,
    onSetCompare,
    selectable,
}: CommitItemProps) {
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [summary, setSummary] = useState<CommitSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);
    const summaryAbortRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(commit.full_hash);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.warn("Failed to copy commit hash", error);
        }
    };

    const loadSummary = useCallback(async () => {
        if (summary || summaryLoading) return;
        setSummaryLoading(true);
        setSummaryError(null);
        const controller = new AbortController();
        summaryAbortRef.current = controller;
        try {
            const data = await fetchJson<CommitSummary>(
                `/api/projects/${projectId}/commits/${commit.full_hash}/summary`,
                { signal: controller.signal },
                "Failed to load commit summary"
            );
            if (mountedRef.current) setSummary(data);
        } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") return;
            if (mountedRef.current) {
                setSummaryError(e instanceof Error ? e.message : "Failed to load");
            }
        } finally {
            if (mountedRef.current) setSummaryLoading(false);
            if (summaryAbortRef.current === controller) {
                summaryAbortRef.current = null;
            }
        }
    }, [projectId, commit.full_hash, summary, summaryLoading]);

    const handleExpand = () => {
        const next = !expanded;
        setExpanded(next);
        if (next) loadSummary();
    };

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            summaryAbortRef.current?.abort();
        };
    }, []);

    return (
        <div className={`border rounded-lg transition-colors ${
            isBase || isCompare ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50"
        }`}>
            <div className="flex items-start gap-3 p-4">
                <div className="flex-shrink-0 mt-1 flex items-center justify-center">
                    <GitCommit className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                        <button
                            type="button"
                            className="text-sm font-medium leading-relaxed text-left hover:underline flex items-center gap-1.5 min-w-0"
                            onClick={handleExpand}
                            aria-expanded={expanded}
                        >
                            {expanded
                                ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                            <span className="truncate">{(commit.message || "").split('\n')[0]}</span>
                        </button>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-xs hover:bg-muted-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        onClick={handleCopy}
                                        aria-label={`Copy full commit hash ${commit.full_hash}`}
                                    >
                                        {copied
                                            ? <Check className="h-3 w-3 text-success" />
                                            : commit.hash}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {copied ? "Copied" : "Click to copy full hash"}
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => onOpenVisualizer(commit.full_hash)}
                                        aria-label={`Open commit ${commit.hash} in the visualizer`}
                                    >
                                        <Eye className="h-3 w-3" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Open this commit in the visualizer</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => onViewCommit(commit.full_hash)}
                                        aria-label={`View commit ${commit.hash} in history`}
                                    >
                                        <GitBranch className="h-3 w-3" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>View this commit in history</TooltipContent>
                            </Tooltip>
                            {selectable && (
                                <>
                                    <Button
                                        variant={isBase ? "secondary" : "ghost"}
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        onClick={onSetBase}
                                        disabled={isCompare}
                                        aria-pressed={isBase}
                                    >
                                        Base
                                    </Button>
                                    <Button
                                        variant={isCompare ? "secondary" : "ghost"}
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        onClick={onSetCompare}
                                        disabled={isBase}
                                        aria-pressed={isCompare}
                                    >
                                        Compare
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {commit.author || "Unknown"}
                        </div>
                        {commit.kicad_changes && (
                            <div className="flex items-center gap-1">
                                <KicadChip icon={CircuitBoard} label="Schematic" count={commit.kicad_changes.sch} color="text-primary" />
                                <KicadChip icon={Cpu} label="PCB" count={commit.kicad_changes.pcb} color="text-success" />
                                <KicadChip icon={Settings} label="Project" count={commit.kicad_changes.pro} color="text-muted-foreground" />
                            </div>
                        )}
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(commit.date)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Expandable changed-file summary. */}
            {expanded && (
                <div className="border-t px-4 py-3 space-y-1">
                    {summaryLoading && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading changes…
                        </div>
                    )}
                    {summaryError && (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            <span>{summaryError}</span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 shrink-0 px-2 text-[10px]"
                                onClick={() => void loadSummary()}
                            >
                                Try again
                            </Button>
                        </div>
                    )}
                    {summary && summary.files.length === 0 && (
                        <p className="text-xs text-muted-foreground py-1">No tracked files changed</p>
                    )}
                    {summary?.files
                        .slice()
                        .sort((a, b) => fileSortRank(a.filename) - fileSortRank(b.filename))
                        .map((file) => {
                            const { Icon: TypeIcon, color: typeColor } = fileTypeIcon(file.filename);
                            return (
                                <button
                                    key={file.path}
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => onOpenVisualizer(
                                        commit.full_hash,
                                        visualizerTabForFile(file.filename),
                                    )}
                                    title={`Open ${file.filename} at this commit`}
                                >
                                    <span className={`flex items-center gap-1 shrink-0 ${STATUS_COLOR[file.status] ?? "text-muted-foreground"}`}>
                                        {STATUS_ICON[file.status]}
                                    </span>
                                    <TypeIcon className={`h-3.5 w-3.5 shrink-0 ${typeColor}`} />
                                    <span className="font-medium truncate">{file.filename}</span>
                                    <span className="text-muted-foreground truncate hidden sm:block">
                                        {file.path.includes("/") ? file.path.substring(0, file.path.lastIndexOf("/")) : ""}
                                    </span>
                                    {(file.additions !== null || file.deletions !== null) && (
                                        <span className="ml-auto shrink-0 flex items-center gap-1.5 font-mono text-[10px]">
                                            {file.additions !== null && file.additions > 0 && (
                                                <span className="text-success">+{file.additions}</span>
                                            )}
                                            {file.deletions !== null && file.deletions > 0 && (
                                                <span className="text-destructive">-{file.deletions}</span>
                                            )}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                </div>
            )}
        </div>
    );
}

export function HistoryViewer({
    projectId,
    branchRef,
    onViewCommit,
    onOpenVisualizer,
    canCompareDiffs,
    canComment,
    active = true,
}: HistoryViewerProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const comparisonUrl = useMemo(
        () => readComparisonUrlState(searchParams),
        [searchParams],
    );
    const [releases, setReleases] = useState<Release[]>([]);
    const [commits, setCommits] = useState<Commit[]>([]);
    const [commitsHasMore, setCommitsHasMore] = useState(false);
    const [releasesHasMore, setReleasesHasMore] = useState(false);
    const [commitsPage, setCommitsPage] = useState(0);
    const [commitsPageSize, setCommitsPageSize] = useState(DEFAULT_COMMITS_PAGE_SIZE);
    const [releasesPage, setReleasesPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [branchTipSha, setBranchTipSha] = useState<string | null>(null);
    const [copiedReleaseTag, setCopiedReleaseTag] = useState<string | null>(null);
    const [baseRevision, setBaseRevision] = useState<RevisionRef | null>(() => {
        const sha = comparisonUrl.base;
        return sha ? { sha, label: sha.slice(0, 10), kind: "commit" } : null;
    });
    const [compareRevision, setCompareRevision] = useState<RevisionRef | null>(() => {
        const sha = comparisonUrl.compare;
        return sha ? { sha, label: sha.slice(0, 10), kind: "commit" } : null;
    });
    // URL is the single open/close signal. Do not flip a local showDiff flag
    // before base/compare land — that raced the workspace URL watcher and
    // immediately closed the review.
    const showDiff = comparisonIsOpen(comparisonUrl);

    useEffect(() => {
        if (comparisonUrl.base) {
            setBaseRevision((current) =>
                current?.sha === comparisonUrl.base
                    ? current
                    : {
                        sha: comparisonUrl.base!,
                        label: comparisonUrl.base!.slice(0, 10),
                        kind: "commit",
                    },
            );
        }
        if (comparisonUrl.compare) {
            setCompareRevision((current) =>
                current?.sha === comparisonUrl.compare
                    ? current
                    : {
                        sha: comparisonUrl.compare!,
                        label: comparisonUrl.compare!.slice(0, 10),
                        kind: "commit",
                    },
            );
        }
    }, [comparisonUrl]);

    const closeComparison = useCallback(() => {
        setSearchParams((current) => clearComparisonParams(current), {
            replace: true,
        });
    }, [setSearchParams]);

    const clearComparisonSelection = useCallback(() => {
        setBaseRevision(null);
        setCompareRevision(null);
        setSearchParams((current) => clearComparisonParams(current), {
            replace: true,
        });
    }, [setSearchParams]);

    const openComparison = useCallback((base: RevisionRef, compare: RevisionRef) => {
        setBaseRevision(base);
        setCompareRevision(compare);
        setSearchParams(
            (current) =>
                applyOpenComparisonParams(current, {
                    base: base.sha,
                    compare: compare.sha,
                }),
            { replace: true },
        );
    }, [setSearchParams]);

    const setRevision = (slot: "base" | "compare", revision: RevisionRef) => {
        if (!canCompareDiffs) return;
        const next = selectRevisionSlot(
            baseRevision,
            compareRevision,
            slot,
            revision,
        );
        setBaseRevision(next.base);
        setCompareRevision(next.compare);
    };

    const handleViewCommitLocal = useCallback((commitHash: string) => {
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set("section", "history");
            next.set("commit", commitHash);
            return next;
        }, { replace: true });
        onViewCommit(commitHash);
    }, [onViewCommit, setSearchParams]);

    const handleCopyReleaseHash = useCallback(async (tag: string, fullHash: string) => {
        try {
            await navigator.clipboard.writeText(fullHash);
            setCopiedReleaseTag(tag);
            setTimeout(() => setCopiedReleaseTag((current) => current === tag ? null : current), 2000);
        } catch (error) {
            console.warn("Failed to copy release hash", error);
        }
    }, []);

    useEffect(() => {
        setCommitsPage(0);
        setReleasesPage(0);
        setBranchTipSha(null);
    }, [projectId, branchRef]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);

        const fetchHistory = async () => {
            const params = new URLSearchParams();
            if (branchRef) params.set("ref", branchRef);
            params.set("limit", String(commitsPageSize));
            params.set("offset", String(commitsPage * commitsPageSize));
            params.set("include_total", "false");
            const commitsQuery = params.toString();

            const releaseParams = new URLSearchParams();
            if (branchRef) releaseParams.set("ref", branchRef);
            releaseParams.set("limit", String(RELEASES_PAGE_SIZE));
            releaseParams.set("offset", String(releasesPage * RELEASES_PAGE_SIZE));
            releaseParams.set("include_total", "false");
            const releasesQuery = releaseParams.toString();

            const [releasesResult, commitsResult] = await Promise.allSettled([
                fetchJson<ReleasesResponse>(
                    `/api/projects/${projectId}/releases?${releasesQuery}`,
                    { signal: controller.signal },
                    "Failed to load releases"
                ),
                fetchJson<CommitsResponse>(
                    `/api/projects/${projectId}/commits?${commitsQuery}`,
                    { signal: controller.signal },
                    "Failed to load commits"
                ),
            ]);

            if (controller.signal.aborted) {
                return;
            }

            if (releasesResult.status === "fulfilled") {
                setReleases(releasesResult.value.releases || []);
                setReleasesHasMore(Boolean(releasesResult.value.has_more));
            } else {
                setReleases([]);
                setReleasesHasMore(false);
            }

            if (commitsResult.status === "fulfilled") {
                setCommits(commitsResult.value.commits || []);
                if (commitsPage === 0) {
                    setBranchTipSha(
                        commitsResult.value.commits?.[0]?.full_hash ?? null,
                    );
                }
                setCommitsHasMore(Boolean(commitsResult.value.has_more));
            } else {
                setCommits([]);
                setCommitsHasMore(false);
            }

            if (releasesResult.status === "rejected" && commitsResult.status === "rejected") {
                const releaseMessage =
                    releasesResult.reason instanceof Error ? releasesResult.reason.message : "Failed to load releases";
                const commitMessage =
                    commitsResult.reason instanceof Error ? commitsResult.reason.message : "Failed to load commits";
                setError(`${releaseMessage}. ${commitMessage}`);
            } else if (releasesResult.status === "rejected") {
                const releaseMessage =
                    releasesResult.reason instanceof Error ? releasesResult.reason.message : "Failed to load releases";
                setError(releaseMessage);
            } else if (commitsResult.status === "rejected") {
                const commitMessage =
                    commitsResult.reason instanceof Error ? commitsResult.reason.message : "Failed to load commits";
                setError(commitMessage);
            } else {
                setError(null);
            }

            setLoading(false);
        };

        fetchHistory().catch((err: unknown) => {
            if (controller.signal.aborted) {
                return;
            }
            if (err instanceof DOMException && err.name === "AbortError") {
                return;
            }
            console.error("Failed to fetch history", err);
            setError("Failed to load history");
            setLoading(false);
        });

        return () => controller.abort();
    }, [projectId, branchRef, commitsPage, commitsPageSize, releasesPage]);

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            {/* Design Comparison Workspace */}
            {active && showDiff && baseRevision && compareRevision && (
                // Contained separately from the commit list: a comparison that
                // throws should still leave the reviewer their history, and the
                // revision pair they picked is what to retry on.
                <ErrorBoundary
                    label="the design comparison"
                    resetKeys={[projectId, baseRevision.sha, compareRevision.sha]}
                >
                    <DesignComparisonWorkspace
                        projectId={projectId}
                        base={baseRevision.sha}
                        head={compareRevision.sha}
                        branchTipSha={branchTipSha}
                        canComment={canComment}
                        onClose={closeComparison}
                    />
                </ErrorBoundary>
            )}

            {/* Releases Section */}
            {releases.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                        <Tag className="h-5 w-5" />
                        Releases
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {releases.map((release) => (
                            <div
                                key={release.tag}
                                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Tag className="h-4 w-4 text-success" />
                                        <span className="font-semibold">{release.tag}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-xs hover:bg-muted-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    onClick={() => handleCopyReleaseHash(release.tag, release.full_hash)}
                                                    aria-label={`Copy full release commit hash ${release.full_hash}`}
                                                >
                                                    {copiedReleaseTag === release.tag
                                                        ? <Check className="h-3 w-3 text-success" />
                                                        : release.commit_hash}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {copiedReleaseTag === release.tag ? "Copied" : "Click to copy full hash"}
                                            </TooltipContent>
                                        </Tooltip>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => handleViewCommitLocal(release.full_hash)}
                                            title="View this release"
                                            aria-label={`View release ${release.tag} in history`}
                                        >
                                            <Eye className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                                    {release.message || "No description"}
                                </p>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    {formatDate(release.date)}
                                </div>
                                {canCompareDiffs && (
                                    <div className="mt-4 flex justify-end gap-1.5">
                                        <Button
                                            variant={baseRevision?.sha === release.full_hash ? "secondary" : "outline"}
                                            size="sm"
                                            className="h-6 px-2.5 text-xs"
                                            disabled={compareRevision?.sha === release.full_hash}
                                            onClick={() => setRevision("base", {
                                                sha: release.full_hash,
                                                label: release.tag,
                                                kind: "release",
                                            })}
                                        >
                                            Base
                                        </Button>
                                        <Button
                                            variant={compareRevision?.sha === release.full_hash ? "secondary" : "outline"}
                                            size="sm"
                                            className="h-6 px-2.5 text-xs"
                                            disabled={baseRevision?.sha === release.full_hash}
                                            onClick={() => setRevision("compare", {
                                                sha: release.full_hash,
                                                label: release.tag,
                                                kind: "release",
                                            })}
                                        >
                                            Compare
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {(releasesPage > 0 || releasesHasMore) && (
                        <div className="flex items-center justify-between pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={releasesPage <= 0}
                                onClick={() => setReleasesPage((page) => Math.max(0, page - 1))}
                            >
                                Previous
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                Page {releasesPage + 1}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!releasesHasMore}
                                onClick={() => setReleasesPage((page) => page + 1)}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Commits Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                        <GitCommit className="h-5 w-5" />
                        Commits
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Per page</span>
                        <Select
                            value={String(commitsPageSize)}
                            onValueChange={(value) => {
                                setCommitsPageSize(Number(value));
                                setCommitsPage(0);
                            }}
                        >
                            <SelectTrigger size="sm" className="w-20" aria-label="Commits per page">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {COMMITS_PAGE_SIZE_OPTIONS.map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {commits.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                        No commits found
                    </p>
                ) : (
                    <div className="space-y-3">
                        {commits.map((commit) => (
                            <CommitItem
                                key={commit.full_hash}
                                commit={commit}
                                projectId={projectId}
                                onViewCommit={handleViewCommitLocal}
                                onOpenVisualizer={onOpenVisualizer}
                                isBase={baseRevision?.sha === commit.full_hash}
                                isCompare={compareRevision?.sha === commit.full_hash}
                                onSetBase={() => setRevision("base", {
                                    sha: commit.full_hash,
                                    label: commit.message.split("\n")[0] || commit.hash,
                                    kind: "commit",
                                })}
                                onSetCompare={() => setRevision("compare", {
                                    sha: commit.full_hash,
                                    label: commit.message.split("\n")[0] || commit.hash,
                                    kind: "commit",
                                })}
                                selectable={canCompareDiffs}
                            />
                        ))}
                    </div>
                )}
                {(commitsPage > 0 || commitsHasMore) && (
                    <div className="flex items-center justify-between pt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={commitsPage <= 0}
                            onClick={() => setCommitsPage((page) => Math.max(0, page - 1))}
                        >
                            Previous
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            Page {commitsPage + 1}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!commitsHasMore}
                            onClick={() => setCommitsPage((page) => page + 1)}
                        >
                            Next
                        </Button>
                    </div>
                )}
            </div>
            {canCompareDiffs && (baseRevision || compareRevision) && (
                <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
                    <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1 text-xs">
                        <span className="text-muted-foreground">Base: </span>
                        <span className="font-medium">{baseRevision?.label ?? "Choose revision"}</span>
                        <span className="mx-2 text-muted-foreground">→</span>
                        <span className="text-muted-foreground">Compare: </span>
                        <span className="font-medium">{compareRevision?.label ?? "Choose revision"}</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!baseRevision || !compareRevision || baseRevision.sha === compareRevision.sha}
                        onClick={() => {
                            const currentBase = baseRevision;
                            setBaseRevision(compareRevision);
                            setCompareRevision(currentBase);
                        }}
                    >
                        Swap
                    </Button>
                    <Button
                        size="sm"
                        disabled={!baseRevision || !compareRevision || baseRevision.sha === compareRevision.sha}
                        onClick={() => {
                            if (baseRevision && compareRevision) {
                                openComparison(baseRevision, compareRevision);
                            }
                        }}
                    >
                        Compare
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={clearComparisonSelection}
                        aria-label="Clear comparison"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}
