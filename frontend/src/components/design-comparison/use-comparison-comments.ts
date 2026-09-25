import type { Dispatch, SetStateAction } from "react";
import { useLiveComments, type CommentConnectionStatus } from "@/features/live-comments/use-live-comments";
import type { Comment } from "@/types/comments";

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
): [Comment[], Dispatch<SetStateAction<Comment[]>>, {
    status: CommentConnectionStatus;
    error: string | null;
    hasLoaded: boolean;
}] {
    const live = useLiveComments(projectId, { kind: "comparison", base, compare });
    return [live.comments, live.setComments, {
        status: live.status,
        error: live.error,
        hasLoaded: live.hasLoaded,
    }];
}
