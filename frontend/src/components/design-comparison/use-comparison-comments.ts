import { useEffect, useState } from "react";
import { listComparisonComments } from "@/lib/comments-client";
import { isWorkPending } from "@/components/tracker-integration/tracked-thread-chip";
import { projectionFromComment } from "@/lib/trackers-client";
import type { Comment, CommentContext } from "@/types/comments";
import type { LegacyForgeProjection } from "@/types/trackers";

/**
 * Review threads anchored to this revision pair.
 *
 * Returns the setter alongside the list because the discussion rail posts new
 * comments and hands back the updated file rather than refetching.
 *
 * Clears prior comments synchronously when the pair/project changes so
 * navigation cannot retain the previous thread list. Polls while any thread
 * has pending tracker sync work (server remains URL/query authority).
 */
export function useComparisonComments(
    projectId: string,
    base: string,
    compare: string,
    domain?: CommentContext,
): [Comment[], (comments: Comment[]) => void] {
    const [comments, setComments] = useState<Comment[]>([]);

    useEffect(() => {
        // Drop prior identity immediately — do not flash the previous project's threads.
        setComments([]);
        const controller = new AbortController();
        let cancelled = false;
        void (async () => {
            try {
                const listed = await listComparisonComments(
                    projectId,
                    base,
                    compare,
                    domain,
                    controller.signal,
                );
                if (!cancelled) setComments(listed);
            } catch (caught) {
                // The cleanup aborts this fetch on every re-run; that rejection
                // is expected, not an error. Without this catch it surfaced as
                // an "Uncaught (in promise) AbortError" on each render.
                if (caught instanceof DOMException && caught.name === "AbortError") {
                    return;
                }
                if (caught instanceof Error && caught.name === "AbortError") {
                    return;
                }
                if (!cancelled) setComments([]);
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [projectId, base, compare, domain]);

    useEffect(() => {
        const hasPending = comments.some((entry) =>
            isWorkPending(projectionFromComment(entry as Comment & LegacyForgeProjection)),
        );
        if (!hasPending) return;
        const timer = window.setInterval(() => {
            void listComparisonComments(projectId, base, compare, domain)
                .then((listed) => setComments(listed))
                .catch(() => undefined);
        }, 4000);
        return () => window.clearInterval(timer);
    }, [comments, projectId, base, compare, domain]);

    return [comments, setComments];
}
