import { useEffect, useState } from "react";

import { checkRemote } from "@/lib/kicad-libraries-client";

export interface RemoteRefs {
    /** idle: no usable address yet; checking: asking the server; ready/failed: its answer. */
    status: "idle" | "checking" | "ready" | "failed";
    tags: string[];
    branches: string[];
    defaultBranch: string | null;
    error: string | null;
}

const IDLE: RemoteRefs = { status: "idle", tags: [], branches: [], defaultBranch: null, error: null };
const CHECKING: RemoteRefs = { ...IDLE, status: "checking" };
// Wait for a pause in typing before asking the server.
const DEBOUNCE_MS = 600;
const ADDRESS = /^https:\/\/[^\s/]+\/\S+$/;

interface Answer {
    git: string;
    refs: RemoteRefs;
}

/**
 * The tags and branches of the repository at `git`, read as soon as the address looks complete.
 * An answer for an earlier address is never shown for a later one.
 */
export function useRemoteRefs(git: string): RemoteRefs {
    const address = git.trim();
    const usable = ADDRESS.test(address);
    const [answer, setAnswer] = useState<Answer | null>(null);

    useEffect(() => {
        if (!usable) return undefined;
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            try {
                const result = await checkRemote(address, controller.signal);
                const refs: RemoteRefs = result.reachable
                    ? { status: "ready", tags: result.tags, branches: result.branches, defaultBranch: result.defaultBranch, error: null }
                    : { ...IDLE, status: "failed", error: result.error ?? "The repository did not answer" };
                setAnswer({ git: address, refs });
            } catch (error) {
                if (controller.signal.aborted) return;
                const message = error instanceof Error ? error.message : "Failed to check the repository";
                setAnswer({ git: address, refs: { ...IDLE, status: "failed", error: message } });
            }
        }, DEBOUNCE_MS);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [address, usable]);

    if (!usable) return IDLE;
    return answer?.git === address ? answer.refs : CHECKING;
}
