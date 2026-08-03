/**
 * Opt-in transition tracing for the design comparison.
 *
 * Every event here is a POST to the backend, and the workspace emits one on
 * each tab click, selection, hover and presentation switch. That traffic earns
 * its keep while a transition bug is being chased and is pure noise the rest of
 * the time, so tracing is off unless a reviewer asks for it.
 *
 * Turn it on with `?compareDebug=1`, which persists so a reload keeps tracing;
 * `?compareDebug=0` turns it back off. When it is off, no session exists and
 * `logComparisonDebug` returns at its own guard without touching the network.
 */

export type ComparisonDebugPayload = Record<string, unknown>;

const DEBUG_FLAG_KEY = "prism.compare.debug";
const DEBUG_QUERY_PARAM = "compareDebug";

type DebugSession = {
    key: string;
    projectId: string;
    sessionId: string;
    sequence: number;
    startedAt: number;
};

let session: DebugSession | null = null;
let writeTail: Promise<void> = Promise.resolve();

export function comparisonDebugEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
        const requested = new URLSearchParams(window.location.search)
            .get(DEBUG_QUERY_PARAM);
        if (requested === "1") {
            window.localStorage.setItem(DEBUG_FLAG_KEY, "1");
            return true;
        }
        if (requested === "0") {
            window.localStorage.removeItem(DEBUG_FLAG_KEY);
            return false;
        }
        return window.localStorage.getItem(DEBUG_FLAG_KEY) === "1";
    } catch {
        // Private browsing and some embedded webviews throw on localStorage
        // access. A diagnostic is never a reason to break the workspace.
        return false;
    }
}

function makeSessionId(): string {
    const suffix = globalThis.crypto?.randomUUID?.()
        ?? Math.random().toString(36).slice(2);
    return `design-compare-${Date.now()}-${suffix}`;
}

function serializeError(error: unknown): ComparisonDebugPayload {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }
    return { message: String(error) };
}

async function postEvent(
    active: DebugSession,
    event: string,
    payload: ComparisonDebugPayload,
    reset: boolean,
    timestamp: string,
    clientElapsedMs: number,
): Promise<void> {
    try {
        const response = await fetch(
            `/api/projects/${encodeURIComponent(active.projectId)}/design-compare/debug-log`,
            {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: active.sessionId,
                    sequence: active.sequence,
                    event,
                    timestamp,
                    payload: {
                        ...payload,
                        clientElapsedMs,
                    },
                    reset,
                }),
                keepalive: true,
            },
        );
        if (!response.ok) {
            console.warn(
                `[DesignComparisonDebug] Failed to write ${event}: ${response.status}`,
            );
        }
    } catch (error) {
        console.warn("[DesignComparisonDebug] Debug log write failed", error);
    }
}

function enqueue(
    active: DebugSession,
    event: string,
    payload: ComparisonDebugPayload,
    reset = false,
): void {
    const sequence = active.sequence++;
    const snapshot = { ...active, sequence };
    const timestamp = new Date().toISOString();
    const clientElapsedMs = Number(
        (performance.now() - active.startedAt).toFixed(3),
    );
    writeTail = writeTail
        .catch(() => undefined)
        .then(() => postEvent(
            snapshot,
            event,
            payload,
            reset,
            timestamp,
            clientElapsedMs,
        ));
}

/**
 * Begin tracing this comparison, or tear down any previous session when
 * tracing is off. Returns the session id, or the empty string when disabled.
 */
export function startComparisonDebugSession(input: {
    projectId: string;
    base: string;
    compare: string;
}): string {
    if (!comparisonDebugEnabled()) {
        // Clearing rather than just returning: opening a comparison without the
        // flag must not keep feeding events from whichever one traced last.
        session = null;
        return "";
    }
    const key = `${input.projectId}:${input.base}:${input.compare}`;
    if (session?.key === key) return session.sessionId;
    session = {
        key,
        projectId: input.projectId,
        sessionId: makeSessionId(),
        sequence: 0,
        startedAt: performance.now(),
    };
    enqueue(session, "session.start", {
        base: input.base,
        compare: input.compare,
        href: window.location.href,
        userAgent: navigator.userAgent,
    }, true);
    return session.sessionId;
}

export function logComparisonDebug(
    event: string,
    payload: ComparisonDebugPayload = {},
): void {
    if (!session) return;
    enqueue(session, event, payload);
}

export function logComparisonDebugError(
    event: string,
    error: unknown,
    payload: ComparisonDebugPayload = {},
): void {
    logComparisonDebug(event, { ...payload, error: serializeError(error) });
}

/** Wait for queued writes; primarily useful to settle diagnostics in tests. */
export function flushComparisonDebugLog(): Promise<void> {
    return writeTail.catch(() => undefined);
}
