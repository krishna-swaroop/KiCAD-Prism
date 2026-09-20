import { useEffect, useState } from "react";
import { listComparisonComments } from "@/lib/comments-client";
import type { Comment, CommentContext } from "@/types/comments";

/**
 * Review threads anchored to this revision pair.
 *
 * Returns the setter alongside the list because the discussion rail posts new
 * comments and hands back the updated file rather than refetching.
 */
export function useComparisonComments(
    projectId: string,
    base: string,
    compare: string,
    domain?: CommentContext,
): [Comment[], (comments: Comment[]) => void] {
    const [comments, setComments] = useState<Comment[]>([]);

    useEffect(() => {
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

    return [comments, setComments];
}
