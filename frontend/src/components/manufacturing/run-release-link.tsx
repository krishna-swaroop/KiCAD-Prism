import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tag } from "lucide-react";

import { listCandidates } from "@/components/release-studio/api";
import type { ReleaseBuild, ReleaseCandidate } from "@/components/release-studio/types";
import { cn } from "@/lib/utils";

/** A production list shows many runs of one project: they share one lookup for a minute. */
const CANDIDATES_TTL_MS = 60_000;
const candidatesCache = new Map<string, { at: number; request: Promise<ReleaseCandidate[]> }>();

function candidatesFor(projectId: string): Promise<ReleaseCandidate[]> {
    const cached = candidatesCache.get(projectId);
    if (cached && Date.now() - cached.at < CANDIDATES_TTL_MS) return cached.request;
    const request = listCandidates(projectId);
    candidatesCache.set(projectId, { at: Date.now(), request });
    // A failed lookup is not kept, so the next link asks again.
    request.catch(() => candidatesCache.delete(projectId));
    return request;
}

/** Tests only: forget the shared lookups. */
export function resetReleaseLinkCache(): void {
    candidatesCache.clear();
}

/** The newest succeeded Release Studio build of a commit, if it has one. */
export function releaseBuildFor(candidates: ReleaseCandidate[], commitSha: string): string | null {
    const sha = commitSha.toLowerCase();
    let newest: ReleaseBuild | null = null;
    for (const candidate of candidates) {
        const own = candidate.commit_sha.toLowerCase();
        if (!own.startsWith(sha) && !sha.startsWith(own)) continue;
        const builds = candidate.builds ?? (candidate.latest_build ? [candidate.latest_build] : []);
        for (const build of builds) {
            if (build.status !== "succeeded") continue;
            if (!newest || (build.completed_at ?? "") > (newest.completed_at ?? "")) newest = build;
        }
    }
    return newest?.id ?? null;
}

/**
 * The run's release, linked to its package in Release Studio: the newest
 * successful build of the run's commit, opened at its outputs, or Release
 * Studio itself when that commit was never built.
 */
export function RunReleaseLink({ projectId, tag, commitSha, className }: {
    projectId: string;
    tag: string;
    commitSha: string;
    /** Merged over the link's classes, such as a smaller size in a list row. */
    className?: string;
}) {
    const [buildId, setBuildId] = useState<string | null>(null);

    // One lookup owned by the link that shows it; a failure keeps the plain link.
    // react-doctor-disable-next-line react-doctor/no-fetch-in-effect
    useEffect(() => {
        let cancelled = false;
        candidatesFor(projectId)
            .then((candidates) => {
                if (!cancelled) setBuildId(releaseBuildFor(candidates, commitSha));
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [projectId, commitSha]);

    // Straight to the package: the run's Outputs stage, not Release Studio's history list.
    const build = buildId ? `&build=${encodeURIComponent(buildId)}&stage=outputs` : "";
    return (
        <Link
            to={`/project/${projectId}?section=release-studio${build}`}
            // Rows that open on click must not open as well.
            onClick={(event) => event.stopPropagation()}
            className={cn("inline-flex min-w-0 max-w-full items-center gap-1 text-primary hover:underline", className)}
            title={buildId ? `Open the ${tag} package in Release Studio` : "Open Release Studio"}
        >
            <Tag className="h-3 w-3 shrink-0" />
            <span className="truncate">{tag}</span>
        </Link>
    );
}
