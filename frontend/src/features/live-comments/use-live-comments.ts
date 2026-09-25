import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fetchApi } from "@/lib/api";
import { normalizeComment } from "@/lib/comment-overlays";
import type { Comment, CommentChangeEvent, CommentsFile } from "@/types/comments";

const FALLBACK_POLL_MS = 15_000;
const REFRESH_COALESCE_MS = 75;
const MAX_RECONNECT_MS = 30_000;
/** Beyond this many changed threads in one burst, one snapshot is cheaper. */
const MAX_THREAD_REFRESH = 20;

export type CommentConnectionStatus = "loading" | "live" | "reconnecting";

type CommentScope =
    | { kind: "canvas"; revision?: string }
    | { kind: "comparison"; base: string; compare: string };

interface LiveCommentsState {
    key: string;
    comments: Comment[];
    status: CommentConnectionStatus;
    error: string | null;
    hasLoaded: boolean;
}

interface LiveCommentsResult {
    comments: Comment[];
    setComments: Dispatch<SetStateAction<Comment[]>>;
    status: CommentConnectionStatus;
    error: string | null;
    hasLoaded: boolean;
    refresh: () => void;
}

function isRelevantChange(event: CommentChangeEvent, scope: CommentScope): boolean {
    if (event.scope !== scope.kind) return false;
    return scope.kind === "canvas"
        || (event.baseCommit === scope.base && event.compareCommit === scope.compare);
}

function socketUrl(projectId: string, cursor: number): string {
    const url = new URL(`/api/projects/${encodeURIComponent(projectId)}/comments/live`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("after", String(cursor));
    return url.toString();
}

/**
 * HTTP remains authoritative. The socket carries only invalidations, and its
 * cursor is advanced only after a successful snapshot read. A reconnect can
 * therefore replay changes missed during a failed read or a disconnected tab.
 */
export function useLiveComments(projectId: string, scope: CommentScope): LiveCommentsResult {
    const base = scope.kind === "comparison" ? scope.base : "";
    const compare = scope.kind === "comparison" ? scope.compare : "";
    const revision = scope.kind === "canvas" ? scope.revision ?? "" : "";
    const key = JSON.stringify([projectId, scope.kind, base, compare, revision]);
    const [state, setState] = useState<LiveCommentsState>({
        key,
        comments: [],
        status: "loading",
        error: null,
        hasLoaded: false,
    });
    const localVersionRef = useRef(0);
    const refreshRef = useRef<() => void>(() => undefined);

    const setComments = useCallback<Dispatch<SetStateAction<Comment[]>>>((update) => {
        localVersionRef.current += 1;
        setState((current) => {
            const previous = current.key === key ? current.comments : [];
            return {
                ...(current.key === key ? current : {
                    key, status: "loading" as const, error: null, hasLoaded: false,
                }),
                comments: typeof update === "function" ? update(previous) : update,
            };
        });
    }, [key]);

    const refresh = useCallback(() => refreshRef.current(), []);

    // Timers, the visibility listener, in-flight request, and socket are all
    // torn down in the returned cleanup; timer assignment is inside helpers.
    // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
    useEffect(() => {
        const currentScope: CommentScope = scope.kind === "canvas"
            ? { kind: "canvas" }
            : { kind: "comparison", base, compare };
        const projectPath = `/api/projects/${encodeURIComponent(projectId)}`;
        const snapshotPath = currentScope.kind === "canvas"
            ? `${projectPath}/comments${revision ? `?${new URLSearchParams({ revision })}` : ""}`
            : `${projectPath}/comparison-comments?${new URLSearchParams({ base, compare })}`;
        const threadPath = (commentId: string) => `${projectPath}/comments/${encodeURIComponent(commentId)}/thread${
            currentScope.kind === "canvas" && revision ? `?${new URLSearchParams({ revision })}` : ""}`;
        let disposed = false;
        let cursor = 0;
        let requestInFlight = false;
        let refreshAgain = false;
        let hasSnapshot = false;
        // A live change names one thread; fetch just those threads unless a
        // full snapshot is already due (reconnect, resync, poll, visibility).
        let snapshotDue = false;
        const pendingThreads = new Map<string, number>();
        let retryCount = 0;
        let socket: WebSocket | null = null;
        let refreshTimer: ReturnType<typeof setTimeout> | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let pollTimer: ReturnType<typeof setInterval> | null = null;
        let requestController: AbortController | null = null;

        const updateStatus = (status: CommentConnectionStatus, error?: string | null) => {
            if (disposed) return;
            setState((current) => current.key === key
                ? { ...current, status, error: error === undefined ? current.error : error }
                : current);
        };

        const armTimer = () => {
            if (disposed) return;
            if (requestInFlight) {
                refreshAgain = true;
                return;
            }
            if (refreshTimer) return;
            refreshTimer = setTimeout(() => {
                refreshTimer = null;
                if (snapshotDue || !hasSnapshot || pendingThreads.size > MAX_THREAD_REFRESH) {
                    void readSnapshot();
                } else if (pendingThreads.size) {
                    void readThreads();
                }
            }, REFRESH_COALESCE_MS);
        };

        const scheduleRefresh = () => {
            snapshotDue = true;
            armTimer();
        };

        const scheduleThread = (commentId: string, eventCursor: number) => {
            pendingThreads.set(commentId, Math.max(eventCursor, pendingThreads.get(commentId) ?? 0));
            armTimer();
        };

        const belongsHere = (comment: Comment) => currentScope.kind === "canvas"
            ? comment.scope !== "comparison"
            : comment.scope === "comparison"
                && comment.baseCommit === currentScope.base && comment.compareCommit === currentScope.compare;

        const readThreads = async () => {
            if (disposed || requestInFlight || !pendingThreads.size) return;
            requestInFlight = true;
            const batch = new Map(pendingThreads);
            pendingThreads.clear();
            const localVersion = localVersionRef.current;
            const controller = new AbortController();
            requestController = controller;
            try {
                const results = await Promise.all([...batch.keys()].map(async (commentId) => {
                    const response = await fetchApi(threadPath(commentId), { signal: controller.signal });
                    if (!response.ok) throw new Error(`Comment could not be loaded (${response.status}).`);
                    const payload = await response.json() as { comment: Comment | null };
                    return { commentId, comment: payload.comment ? normalizeComment(payload.comment) : null };
                }));
                if (disposed) return;
                if (localVersion !== localVersionRef.current) {
                    batch.forEach((eventCursor, commentId) => scheduleThread(commentId, eventCursor));
                    return;
                }
                setState((current) => {
                    if (current.key !== key) return current;
                    let comments = current.comments;
                    for (const { commentId, comment } of results) {
                        const index = comments.findIndex((entry) => entry.id === commentId);
                        if (!comment || !belongsHere(comment)) {
                            if (index >= 0) comments = comments.filter((entry) => entry.id !== commentId);
                        } else if (index >= 0) {
                            comments = comments.map((entry, at) => (at === index ? comment : entry));
                        } else {
                            comments = [...comments, comment];
                        }
                    }
                    return { ...current, comments, error: null };
                });
                // Every change in the batch is now reflected; replaying it adds nothing.
                cursor = Math.max(cursor, ...batch.values());
            } catch {
                if (disposed || controller.signal.aborted) return;
                // A thread read failed: fall back to the authoritative snapshot.
                snapshotDue = true;
                refreshAgain = true;
            } finally {
                requestInFlight = false;
                requestController = null;
                if (refreshAgain && !disposed) {
                    refreshAgain = false;
                    armTimer();
                }
            }
        };

        const readSnapshot = async () => {
            if (disposed || requestInFlight) return;
            requestInFlight = true;
            snapshotDue = false;
            pendingThreads.clear();
            const localVersion = localVersionRef.current;
            const controller = new AbortController();
            requestController = controller;
            try {
                const response = await fetchApi(snapshotPath, { signal: controller.signal });
                if (!response.ok) throw new Error(`Comments could not be loaded (${response.status}).`);
                const payload = await response.json() as CommentsFile;
                if (!Array.isArray(payload.comments) || !Number.isSafeInteger(payload.cursor)
                    || (payload.cursor ?? -1) < 0) {
                    throw new Error("Comments response is incomplete; keeping the last loaded comments.");
                }
                if (disposed) return;
                if (localVersion !== localVersionRef.current) {
                    snapshotDue = true;
                    refreshAgain = true;
                    return;
                }
                cursor = payload.cursor!;
                hasSnapshot = true;
                setState(() => ({
                    key,
                    comments: payload.comments.map(normalizeComment),
                    status: socket?.readyState === 1 ? "live" : "reconnecting",
                    error: null,
                    hasLoaded: true,
                }));
            } catch (error) {
                if (disposed || controller.signal.aborted) return;
                updateStatus(socket?.readyState === 1 ? "live" : "reconnecting",
                    error instanceof Error ? error.message : "Comments could not be loaded.");
            } finally {
                requestInFlight = false;
                requestController = null;
                if (refreshAgain && !disposed) {
                    refreshAgain = false;
                    armTimer();
                }
            }
        };

        const startFallbackPoll = () => {
            if (pollTimer || disposed) return;
            pollTimer = setInterval(scheduleRefresh, FALLBACK_POLL_MS);
        };
        const stopFallbackPoll = () => {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
        };
        const reconnect = () => {
            if (disposed || retryTimer) return;
            const delay = Math.min(MAX_RECONNECT_MS, 1_000 * 2 ** Math.min(retryCount++, 5));
            retryTimer = setTimeout(() => {
                retryTimer = null;
                connect();
            }, delay);
        };
        const connect = () => {
            if (disposed || typeof WebSocket === "undefined") {
                startFallbackPoll();
                return;
            }
            try {
                socket = new WebSocket(socketUrl(projectId, cursor));
            } catch {
                updateStatus("reconnecting");
                startFallbackPoll();
                reconnect();
                return;
            }
            socket.onopen = () => {
                if (disposed) return;
                retryCount = 0;
                stopFallbackPoll();
                updateStatus("live");
                // Reconcile any edits between the last snapshot and socket open.
                scheduleRefresh();
            };
            socket.onmessage = (message) => {
                let event: CommentChangeEvent | { type: "resync" };
                try {
                    event = JSON.parse(String(message.data)) as CommentChangeEvent | { type: "resync" };
                } catch {
                    return;
                }
                if (event.type === "resync") {
                    scheduleRefresh();
                    socket?.close();
                    return;
                }
                if (event.type !== "change" || !Number.isSafeInteger(event.cursor)
                    || event.cursor <= cursor || !isRelevantChange(event, currentScope)) return;
                if (typeof event.commentId === "string" && event.commentId) {
                    scheduleThread(event.commentId, event.cursor);
                } else {
                    scheduleRefresh();
                }
            };
            socket.onerror = () => socket?.close();
            socket.onclose = () => {
                if (disposed) return;
                updateStatus("reconnecting");
                startFallbackPoll();
                reconnect();
            };
        };

        const onVisible = () => {
            if (document.visibilityState === "visible") scheduleRefresh();
        };
        refreshRef.current = scheduleRefresh;
        document.addEventListener("visibilitychange", onVisible);
        startFallbackPoll();
        void readSnapshot().finally(connect);

        return () => {
            disposed = true;
            refreshRef.current = () => undefined;
            document.removeEventListener("visibilitychange", onVisible);
            requestController?.abort();
            socket?.close();
            if (refreshTimer) clearTimeout(refreshTimer);
            if (retryTimer) clearTimeout(retryTimer);
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
        };
    }, [projectId, key, scope.kind, base, compare, revision]);

    const current = state.key === key ? state : {
        key, comments: [], status: "loading" as const, error: null, hasLoaded: false,
    };
    return { ...current, setComments, refresh };
}
