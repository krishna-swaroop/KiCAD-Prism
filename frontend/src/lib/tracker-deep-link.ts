/**
 * Frozen tracker deep-link contract (TR-24 backend, TR-41 frontend, C8).
 *
 * URL shapes are generated server-side by `deep_links.py` and consumed here
 * without provider calls. Canvas links use `view=pcb|sch`; comparison links use
 * `section=history` with `base`, `compare`, `diff`, optional `side` and `item`.
 */
import type { ComparisonUrlTab } from "@/components/design-comparison/comparison-url";

const LOGIN_NEXT_KEY = "kicad_prism_login_next";

export const FULL_SHA_RE = /^[0-9a-f]{40}$/i;

export type CanvasDeepLinkView = "sch" | "pcb";
export type VisualizerTabFromDeepLink = "sch" | "pcb";

export type TrackerDeepLinkIntent =
    | {
        kind: "canvas";
        commit: string;
        view: CanvasDeepLinkView;
        commentId: string;
        variant: string | null;
        semanticItemId: string | null;
    }
    | {
        kind: "comparison";
        baseCommit: string;
        compareCommit: string;
        diff: ComparisonUrlTab;
        commentId: string;
        selectedSide: "base" | "compare" | null;
        semanticItemId: string | null;
    }
    | { kind: "none" };

export type DeepLinkSourceState =
    | "idle"
    | "checking"
    | "available"
    | "unavailable"
    | "forbidden";

const CANVAS_VIEW_BY_CONTEXT: Record<string, CanvasDeepLinkView> = {
    pcb: "pcb",
    sch: "sch",
};

const COMPARISON_DIFF_BY_DOMAIN: Record<string, ComparisonUrlTab> = {
    pcb: "pcb",
    sch: "sch",
    bom: "bom",
    stackup: "stackup",
    fabrication: "fabrication",
};

export function normalizeCommitSha(raw: string | null | undefined): string | null {
    const value = (raw ?? "").trim().toLowerCase();
    return FULL_SHA_RE.test(value) ? value : null;
}

export function canvasVisualizerTab(
    view: string | null | undefined,
): VisualizerTabFromDeepLink {
    const normalized = (view ?? "").trim().toLowerCase();
    return CANVAS_VIEW_BY_CONTEXT[normalized] ?? "sch";
}

export function comparisonSideFromParam(
    raw: string | null | undefined,
): "base" | "compare" | null {
    const side = (raw ?? "").trim().toLowerCase();
    if (side === "base" || side === "compare") return side;
    return null;
}

export function comparisonDiffFromParam(
    raw: string | null | undefined,
): ComparisonUrlTab {
    const diff = (raw ?? "").trim().toLowerCase();
    return COMPARISON_DIFF_BY_DOMAIN[diff] ?? "sch";
}

export function readTrackerDeepLink(
    search: string | URLSearchParams = window.location.search,
): TrackerDeepLinkIntent {
    const params =
        typeof search === "string" ? new URLSearchParams(search) : search;
    const commentId = (params.get("comment") ?? "").trim();
    if (!commentId) return { kind: "none" };

    const baseCommit = normalizeCommitSha(params.get("base"));
    const compareCommit = normalizeCommitSha(params.get("compare"));
    if (baseCommit && compareCommit) {
        return {
            kind: "comparison",
            baseCommit,
            compareCommit,
            diff: comparisonDiffFromParam(params.get("diff")),
            commentId,
            selectedSide: comparisonSideFromParam(params.get("side")),
            semanticItemId: (params.get("item") ?? "").trim() || null,
        };
    }

    const commit = normalizeCommitSha(params.get("commit"));
    if (!commit) return { kind: "none" };

    return {
        kind: "canvas",
        commit,
        view: canvasVisualizerTab(params.get("view")),
        commentId,
        variant: (params.get("variant") ?? "").trim() || null,
        semanticItemId: (params.get("item") ?? "").trim() || null,
    };
}

export function isTrackerDeepLink(
    search: string | URLSearchParams = window.location.search,
): boolean {
    return readTrackerDeepLink(search).kind !== "none";
}

/** Prism app route uses `/project/:id`; forge links may say `/projects/:id`. */
export function normalizePrismProjectPath(pathname: string): string {
    const match = pathname.match(/^\/projects\/([^/]+)\/?$/);
    if (!match) return pathname;
    return `/project/${match[1]}`;
}

export function prismProjectPath(projectId: string): string {
    return `/project/${encodeURIComponent(projectId)}`;
}

export function buildLoginReturnPath(
    projectId: string,
    search: string | URLSearchParams,
): string {
    const params =
        typeof search === "string" ? new URLSearchParams(search) : search;
    const query = params.toString();
    return query
        ? `${prismProjectPath(projectId)}?${query}`
        : prismProjectPath(projectId);
}

/**
 * Remember a tracker deep link before OIDC sign-in when the browser is still
 * on the project URL. Password sign-in keeps the URL and does not need this.
 */
export function stashTrackerDeepLinkLoginReturn(
    search: string | URLSearchParams = window.location.search,
    pathname: string = window.location.pathname,
): boolean {
    if (!isTrackerDeepLink(search)) return false;
    const normalized = normalizePrismProjectPath(pathname);
    const query =
        typeof search === "string" ? search.replace(/^\?/, "") : search.toString();
    const next = query ? `${normalized}?${query}` : normalized;
    window.sessionStorage.setItem(LOGIN_NEXT_KEY, next);
    return true;
}

export function applyCanvasDeepLinkNavigation(
    params: URLSearchParams,
): URLSearchParams {
    const intent = readTrackerDeepLink(params);
    if (intent.kind !== "canvas") return params;
    const next = new URLSearchParams(params);
    next.set("section", "visualizers");
    next.set("commit", intent.commit);
    next.set("tab", canvasVisualizerTab(intent.view));
    if (intent.variant) next.set("variant", intent.variant);
    else next.delete("variant");
    return next;
}

export function applyComparisonDeepLinkNavigation(
    params: URLSearchParams,
): URLSearchParams {
    const intent = readTrackerDeepLink(params);
    if (intent.kind !== "comparison") return params;
    const next = new URLSearchParams(params);
    next.set("section", "history");
    next.set("base", intent.baseCommit);
    next.set("compare", intent.compareCommit);
    next.set("view", "semantic");
    next.set("diff", intent.diff);
    if (intent.selectedSide) next.set("side", intent.selectedSide);
    if (intent.semanticItemId) next.set("item", intent.semanticItemId);
    return next;
}

export function explicitPinnedCommit(
    params: URLSearchParams,
    intent: TrackerDeepLinkIntent = readTrackerDeepLink(params),
): string | null {
    if (intent.kind === "canvas") return intent.commit;
    return normalizeCommitSha(params.get("commit"));
}

export function deepLinkSceneKey(
    projectId: string,
    intent: TrackerDeepLinkIntent,
): string | null {
    if (intent.kind === "canvas") {
        return [
            projectId,
            intent.commit,
            intent.view,
            intent.commentId,
            intent.variant ?? "",
            intent.semanticItemId ?? "",
        ].join(":");
    }
    if (intent.kind === "comparison") {
        return [
            projectId,
            intent.baseCommit,
            intent.compareCommit,
            intent.diff,
            intent.commentId,
            intent.selectedSide ?? "",
            intent.semanticItemId ?? "",
        ].join(":");
    }
    return null;
}

export function sourceUnavailableMessage(commit: string): string {
    const short = commit.slice(0, 7);
    return `Design source ${short} is no longer available in this project. Prism will not open a different revision instead.`;
}

export function sourceForbiddenMessage(): string {
    return "You do not have access to the design source requested by this link.";
}

export function markerMissingMessage(commentId: string): string {
    return `Comment ${commentId} is not available at this revision. The marker was not moved to another source.`;
}

export function shouldValidatePinnedCommit(intent: TrackerDeepLinkIntent): boolean {
    return intent.kind === "canvas";
}
