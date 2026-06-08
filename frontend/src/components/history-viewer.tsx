import { useEffect, useMemo, useState } from "react";
import { GitCommit, Tag, Eye, Check, Copy, User, Clock, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChangeAwareDiffViewer } from "./change-aware-diff-viewer";
import { fetchJson } from "@/lib/api";

interface Release {
    tag: string;
    commit_hash: string;
    date: string;
    message: string;
}

interface Commit {
    hash: string;
    full_hash: string;
    author: string;
    email: string;
    date: string;
    message: string;
}

interface ReleasesResponse {
    releases: Release[];
}

interface CommitsResponse {
    commits: Commit[];
}

interface HistoryViewerProps {
    projectId: string;
    onViewCommit: (commitHash: string) => void;
    canCompareDiffs: boolean;
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

interface CommitItemProps {
    commit: Commit;
    onViewCommit: (hash: string) => void;
    isSelected: boolean;
    onSelect: () => void;
    selectable: boolean;
}

function CommitItem({ commit, onViewCommit, isSelected, onSelect, selectable }: CommitItemProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(commit.full_hash);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.warn("Failed to copy commit hash", error);
        }
    };

    return (
        <div className={`border rounded-lg p-4 transition-colors ${isSelected ? 'bg-primary/5 border-primary/50' : 'hover:bg-muted/50'}`}>
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1 flex items-center justify-center">
                    {selectable ? (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={onSelect}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                    ) : (
                        <GitCommit className="h-4 w-4 text-muted-foreground" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                        <p className="text-sm font-medium leading-relaxed">
                            {(commit.message || "").split('\n')[0]}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                                {commit.hash}
                            </code>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleCopy}
                                title="Copy full hash"
                            >
                                {copied ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                    <Copy className="h-3 w-3" />
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => onViewCommit(commit.full_hash)}
                                title="View this version"
                            >
                                <Eye className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {commit.author || "Unknown"}
                        </div>
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(commit.date)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function HistoryViewer({ projectId, onViewCommit, canCompareDiffs }: HistoryViewerProps) {
    const [releases, setReleases] = useState<Release[]>([]);
    const [commits, setCommits] = useState<Commit[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCommits, setSelectedCommits] = useState<string[]>([]);
    const [showDiff, setShowDiff] = useState(false);

    // Filter commits to find selected ones and determining newer/older
    const diffPair = useMemo(() => {
        if (selectedCommits.length !== 2) return null;

        // Commits are already sorted by date (newest first)
        const c1Index = commits.findIndex(c => c.full_hash === selectedCommits[0]);
        const c2Index = commits.findIndex(c => c.full_hash === selectedCommits[1]);

        if (c1Index === -1 || c2Index === -1) return null;

        // Smaller index = Newer commit
        const newerIndex = Math.min(c1Index, c2Index);
        const olderIndex = Math.max(c1Index, c2Index);

        return {
            newer: commits[newerIndex],
            older: commits[olderIndex]
        };
    }, [commits, selectedCommits]);

    const handleSelectCommit = (hash: string) => {
        if (!canCompareDiffs) {
            return;
        }
        setSelectedCommits(prev => {
            if (prev.includes(hash)) {
                return prev.filter(h => h !== hash);
            }
            if (prev.length >= 2) {
                // Remove oldest selection (first one added? or just FIFO)
                // Let's just create a new array with the new one
                return [prev[1], hash];
            }
            return [...prev, hash];
        });
    };

    useEffect(() => {
        if (!canCompareDiffs) {
            setSelectedCommits([]);
        }
    }, [canCompareDiffs]);

    useEffect(() => {
        const currentHashes = new Set(commits.map((commit) => commit.full_hash));
        setSelectedCommits((previous) => previous.filter((hash) => currentHashes.has(hash)).slice(-2));
    }, [commits]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);

        const fetchHistory = async () => {
            const [releasesResult, commitsResult] = await Promise.allSettled([
                fetchJson<ReleasesResponse>(
                    `/api/projects/${projectId}/releases`,
                    { signal: controller.signal },
                    "Failed to load releases"
                ),
                fetchJson<CommitsResponse>(
                    `/api/projects/${projectId}/commits`,
                    { signal: controller.signal },
                    "Failed to load commits"
                ),
            ]);

            if (controller.signal.aborted) {
                return;
            }

            if (releasesResult.status === "fulfilled") {
                setReleases(releasesResult.value.releases || []);
            } else {
                setReleases([]);
            }

            if (commitsResult.status === "fulfilled") {
                setCommits(commitsResult.value.commits || []);
            } else {
                setCommits([]);
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
    }, [projectId]);

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
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-500">
                    {error}
                </div>
            )}

            {/* Visual Diff Viewer */}
            {showDiff && diffPair && (
                <ChangeAwareDiffViewer
                    projectId={projectId}
                    commit1={diffPair.newer.full_hash}
                    commit2={diffPair.older.full_hash}
                    onClose={() => {
                        setShowDiff(false);
                    }}
                />
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
                                        <Tag className="h-4 w-4 text-green-500" />
                                        <span className="font-semibold">{release.tag}</span>
                                    </div>
                                    <code className="text-xs bg-muted px-2 py-1 rounded">
                                        {release.commit_hash}
                                    </code>
                                </div>
                                <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                                    {release.message || "No description"}
                                </p>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    {formatDate(release.date)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Commits Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                        <GitCommit className="h-5 w-5" />
                        Commits
                    </h3>
                    {canCompareDiffs && selectedCommits.length === 2 && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                    setShowDiff(true);
                                }}
                            >
                                <Eye className="h-4 w-4 mr-2" />
                                Compare Selected ({selectedCommits.length})
                            </Button>
                        </div>
                    )}
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
                                onViewCommit={onViewCommit}
                                isSelected={selectedCommits.includes(commit.full_hash)}
                                onSelect={() => handleSelectCommit(commit.full_hash)}
                                selectable={canCompareDiffs}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
