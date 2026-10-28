import { fetchJson } from "@/lib/api";
import { useServerState } from "@/lib/server-state";

export interface ExtensionAction {
    id: string;
    label: string;
    url: string;
    kind: "link" | "panel";
}

export interface Extension {
    id: string;
    name: string;
    version: string;
    description: string;
    actions: ExtensionAction[];
}

export interface ExtensionRegistry {
    schema_version: 1;
    extensions: Extension[];
}

export function useExtensions(projectId?: string) {
    const path = projectId
        ? `/api/projects/${encodeURIComponent(projectId)}/extensions`
        : "/api/extensions";
    return useServerState(
        ["extensions", projectId ?? null],
        (signal) => fetchJson<ExtensionRegistry>(path, { signal }, "Unable to load extensions"),
        { retainMs: 0 },
    );
}

export interface ExtensionContext {
    origin: string;
    projectId: string;
    commit: string | null;
    branch: string | null;
}

/** Cookies ignore ports: extensions must use a separate hostname, not just an origin. */
export function extensionUrl(action: ExtensionAction, context: ExtensionContext): string | null {
    try {
        const url = new URL(action.url);
        const prismHost = new URL(context.origin).hostname.replace(/\.$/, "");
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
            || url.username || url.password || url.hash
            || url.hostname.replace(/\.$/, "") === prismHost) return null;
        for (const key of [...url.searchParams.keys()]) {
            if (key.startsWith("prism_")) url.searchParams.delete(key);
        }
        url.searchParams.set("prism_origin", context.origin);
        url.searchParams.set("prism_project_id", context.projectId);
        if (context.commit) url.searchParams.set("prism_commit", context.commit);
        if (context.branch) url.searchParams.set("prism_branch", context.branch);
        return url.href;
    } catch {
        return null;
    }
}
