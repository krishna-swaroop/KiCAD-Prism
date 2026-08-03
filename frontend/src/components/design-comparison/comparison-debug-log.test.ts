import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    comparisonDebugEnabled,
    flushComparisonDebugLog,
    logComparisonDebug,
    startComparisonDebugSession,
} from "./comparison-debug-log";

const SESSION = {
    projectId: "debug-project",
    base: "base-sha",
    compare: "compare-sha",
};

/** Collects the bodies of every debug POST the module makes. */
function captureRequests(): RequestInit[] {
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
        requests.push(init);
        return new Response(JSON.stringify({ status: "logged" }), {
            status: 200,
        });
    }));
    return requests;
}

function visit(search: string): void {
    window.history.replaceState({}, "", `/projects/debug${search}`);
}

describe("comparison debug log", () => {
    beforeEach(() => {
        window.localStorage.clear();
        visit("");
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        window.localStorage.clear();
        visit("");
    });

    it("stays silent until a reviewer asks for tracing", async () => {
        // Every selection, hover and tab click calls logComparisonDebug. Left
        // always-on, an ordinary review session posts hundreds of events to the
        // backend, which is why this is opt-in.
        const requests = captureRequests();

        startComparisonDebugSession(SESSION);
        logComparisonDebug("difference.click", { id: "net:VCC" });
        await flushComparisonDebugLog();

        expect(comparisonDebugEnabled()).toBe(false);
        expect(requests).toHaveLength(0);
    });

    it("serializes a reset session followed by ordered transition events", async () => {
        visit("?compareDebug=1");
        const requests = captureRequests();

        startComparisonDebugSession(SESSION);
        logComparisonDebug("difference.click", {
            target: "item",
            id: "net:VCC",
        });
        await flushComparisonDebugLog();

        expect(requests).toHaveLength(2);
        const first = JSON.parse(String(requests[0]!.body));
        const second = JSON.parse(String(requests[1]!.body));
        expect(first).toMatchObject({
            sequence: 0,
            event: "session.start",
            reset: true,
        });
        expect(second).toMatchObject({
            sequence: 1,
            event: "difference.click",
            reset: false,
            payload: {
                target: "item",
                id: "net:VCC",
                clientElapsedMs: expect.any(Number),
            },
        });
        expect(second.session_id).toBe(first.session_id);
    });

    it("keeps tracing across a reload once it has been turned on", () => {
        visit("?compareDebug=1");
        expect(comparisonDebugEnabled()).toBe(true);

        // The reviewer navigates on without the parameter; the choice persists
        // so a reload mid-investigation does not silently stop recording.
        visit("");
        expect(comparisonDebugEnabled()).toBe(true);

        visit("?compareDebug=0");
        expect(comparisonDebugEnabled()).toBe(false);
        visit("");
        expect(comparisonDebugEnabled()).toBe(false);
    });

    it("drops a live session when a later comparison opens without the flag", async () => {
        visit("?compareDebug=1");
        startComparisonDebugSession(SESSION);

        visit("?compareDebug=0");
        const requests = captureRequests();
        startComparisonDebugSession({ ...SESSION, compare: "other-sha" });
        logComparisonDebug("difference.click", { id: "net:VCC" });
        await flushComparisonDebugLog();

        expect(requests).toHaveLength(0);
    });
});
