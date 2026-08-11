import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import type { Comment, CommentsFile } from "@/types/comments";

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
): [Comment[], (comments: Comment[]) => void] {
    const [comments, setComments] = useState<Comment[]>([]);

    useEffect(() => {
        const controller = new AbortController();
        void (async () => {
            try {
                const params = new URLSearchParams({ base, compare });
                const response = await fetchApi(
                    `/api/projects/${projectId}/comparison-comments?${params}`,
                    { signal: controller.signal },
                );
                if (!response.ok) return;
                const payload = (await response.json()) as CommentsFile;
                if (!controller.signal.aborted) {
                    setComments(payload.comments ?? []);
                }
            } catch (caught) {
                // The cleanup aborts this fetch on every re-run; that rejection
                // is expected, not an error. Without this catch it surfaced as
                // an "Uncaught (in promise) AbortError" on each render.
                if (caught instanceof DOMException && caught.name === "AbortError") {
                    return;
                }
                throw caught;
            }
        })();
        return () => controller.abort();
    }, [projectId, base, compare]);

    return [comments, setComments];
}
