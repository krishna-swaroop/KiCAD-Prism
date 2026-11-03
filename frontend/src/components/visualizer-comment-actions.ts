import { useCallback, useMemo, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toast } from "sonner";

import { fetchApi, ifMatch, readApiError } from "@/lib/api";
import { normalizeComment } from "@/lib/comment-overlays";
import type { EcadSemanticSelectionDetail } from "@/types/ecad-viewer";
import type { Comment } from "@/types/comments";

import type { CommentFormSubmitPayload } from "./comment-form";
import type { CommentDraft } from "./viewer-modes";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * One comment request. Resolves to the response's JSON when `json` is set,
 * to `true` otherwise; on failure, toasts the server's message (or `failure`)
 * and resolves to `null`.
 */
async function commentRequest(url: string, init: RequestInit, failure: string): Promise<true | null>;
async function commentRequest<T>(url: string, init: RequestInit, failure: string, json: true): Promise<T | null>;
async function commentRequest<T>(url: string, init: RequestInit, failure: string, json = false): Promise<T | true | null> {
    try {
        const response = await fetchApi(url, init);
        if (!response.ok) throw new Error(await readApiError(response, failure));
        return json ? await response.json() as T : true;
    } catch (error) {
        toast.error(error instanceof Error ? error.message : failure);
        return null;
    }
}

/**
 * The visualizer's comment writes. Each updates the live list in place from
 * the response (keeping the anchor the overlay resolved), or asks the list
 * to refresh when the server queued work whose result arrives later.
 */
export function useVisualizerCommentActions({
    projectId,
    commit,
    author,
    draft,
    setComments,
    refresh,
    lastSelection,
    onPosted,
    onDeleted,
}: {
    projectId: string;
    commit: string | null;
    author: string | undefined;
    draft: CommentDraft | null;
    setComments: Dispatch<SetStateAction<Comment[]>>;
    refresh: () => void;
    /** The last object selected in a viewer, for reattaching. */
    lastSelection: MutableRefObject<EcadSemanticSelectionDetail | null>;
    onPosted: () => void;
    onDeleted: (commentId: string) => void;
}) {
    const [submitting, setSubmitting] = useState(false);
    const base = `/api/projects/${projectId}/comments`;

    /** Replace one comment with the server's copy, keeping its resolved anchor. */
    const applyThread = useCallback((updated: Comment) => {
        setComments((prev) => prev.map((entry) => (entry.id === updated.id
            ? { ...normalizeComment(updated), anchorResolution: entry.anchorResolution } : entry)));
    }, [setComments]);

    const submit = useCallback(async (payload: CommentFormSubmitPayload) => {
        if (!draft) return;
        const { context, location, element } = draft;
        setSubmitting(true);
        let created: Comment | null;
        try {
            created = await commentRequest<Comment>(base, {
                method: "POST",
                body: JSON.stringify({
                    context,
                    location,
                    content: payload.content,
                    contentFormat: payload.contentFormat,
                    author,
                    elementId: element?.elementId,
                    elementRef: element?.elementRef,
                    elementType: element?.elementType,
                    ...(element?.relativePoint ? { metadata: { anchorRelativePoint: element.relativePoint } } : {}),
                    commentClass: payload.commentClass,
                    severity: payload.severity,
                    mentions: payload.mentions,
                    ...(commit ? { revision: { commit } } : {}),
                }),
            }, "Failed to post comment", true);
        } finally {
            setSubmitting(false);
        }
        if (!created) return;
        setComments((prev) => [...prev, normalizeComment(created)]);
        onPosted();
    }, [author, base, commit, draft, onPosted, setComments]);

    const resolve = useCallback(async (commentId: string, resolved: boolean) => {
        const updated = await commentRequest<Comment>(`${base}/${commentId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: resolved ? "RESOLVED" : "OPEN" }),
        }, "Failed to update comment", true);
        if (updated) applyThread({ ...updated, id: commentId });
    }, [applyThread, base]);

    const reply = useCallback(async (commentId: string, content: string) => {
        const payload = await commentRequest<{ comment: Comment }>(`${base}/${commentId}/replies`, {
            method: "POST",
            body: JSON.stringify({ content, contentFormat: "md" }),
        }, "Failed to add reply", true);
        if (payload) applyThread({ ...payload.comment, id: commentId });
    }, [applyThread, base]);

    const remove = useCallback(async (commentId: string) => {
        const done = await commentRequest(`${base}/${commentId}`, { method: "DELETE" }, "Failed to delete comment");
        if (!done) return;
        setComments((prev) => prev.filter((entry) => entry.id !== commentId));
        onDeleted(commentId);
    }, [base, onDeleted, setComments]);

    /** A request whose effect arrives later: refresh the list, then say so. */
    const queued = useCallback(async (url: string, failure: string, success?: string) => {
        if (!await commentRequest(url, { method: "POST" }, failure)) return;
        refresh();
        if (success) toast.success(success);
    }, [refresh]);

    const promote = useCallback((commentId: string) => queued(
        `${base}/${commentId}/promote`, "Failed to create issue", "Issue publication queued.",
    ), [base, queued]);
    const retrySync = useCallback((commentId: string) => queued(
        `${base}/${commentId}/tracker/retry`, "Failed to retry issue sync",
    ), [base, queued]);
    const shareReply = useCallback((commentId: string, replyId: string) => queued(
        `${base}/${commentId}/replies/${replyId}/share`, "Failed to share reply", "Reply queued for the linked issue.",
    ), [base, queued]);

    /** Move a comment's anchor onto the object selected now, on this revision. */
    const reattach = useCallback(async (comment: Comment) => {
        const selected = lastSelection.current;
        if (!commit || !selected?.uuid || selected.x === undefined || selected.y === undefined
            || selected.sourceContext !== comment.context || !comment.revision) {
            toast.error("Select an object in the matching viewer revision before reattaching.");
            return;
        }
        const bounds = selected.bounds;
        const relativePoint = bounds && bounds[2] > 0 && bounds[3] > 0
            ? [clamp01((selected.x - bounds[0]) / bounds[2]), clamp01((selected.y - bounds[1]) / bounds[3])]
            : undefined;
        const done = await commentRequest(`${base}/${comment.id}/reattach`, {
            method: "POST",
            headers: ifMatch("comment", comment.id, comment.revision),
            body: JSON.stringify({
                commit,
                elementId: selected.uuid,
                relativePoint,
                location: { x: selected.x, y: selected.y, layer: selected.layer ?? "", page: selected.page ?? "" },
            }),
        }, "Failed to reattach comment");
        if (!done) return;
        refresh();
        toast.success("Comment reattached on this revision.");
    }, [base, commit, lastSelection, refresh]);

    return useMemo(() => ({
        submitting, submit, resolve, reply, applyThread, remove, promote, retrySync, shareReply, reattach,
    }), [submitting, submit, resolve, reply, applyThread, remove, promote, retrySync, shareReply, reattach]);
}
