/**
 * Tracker API client for settings and thread projections.
 *
 * Every call goes through `fetchApi` (session cookie). The browser never
 * requests a forge host and never receives provider tokens; reads that
 * accidentally include secret keys are stripped before they reach callers.
 */

import { ApiHttpError, fetchApi } from "@/lib/api";
import type {
    CommentTrackerProjection,
    ConnectorHealth,
    ConnectorTestResult,
    CreateConnectorRequest,
    LegacyForgeProjection,
    OAuthBeginResponse,
    ProjectTrackerSettings,
    TrackerConnector,
    TrackerErrorPayload,
    TrackerRepository,
    UpdateConnectorRequest,
    UpdateProjectTrackerRequest,
    UserIdentity,
} from "@/types/trackers";

const SECRET_KEYS = new Set([
    "accessToken",
    "refreshToken",
    "token",
    "tokenEnvelope",
    "token_envelope",
    "credentialEnvelope",
    "credential_envelope",
    "privateKey",
    "private_key",
    "clientSecret",
    "client_secret",
    "webhookSecret",
    "webhook_secret",
    "oauthClientSecret",
    "oauth_client_secret",
    "installationMaterial",
    "pem",
    "authorization",
    "credentials",
]);

export class TrackerApiError extends ApiHttpError {
    requiredRole?: string;
    currentRevision?: number | null;
    retryable?: boolean;
    resumeAt?: string | null;
    providerClass?: string;

    constructor(status: number, payload: TrackerErrorPayload) {
        super(status, payload.detail, payload.code);
        this.name = "TrackerApiError";
        this.requiredRole = payload.requiredRole;
        this.currentRevision = payload.currentRevision;
        this.retryable = payload.retryable;
        this.resumeAt = payload.resumeAt;
        this.providerClass = payload.class;
    }

    get isConflict(): boolean {
        return this.status === 409 || this.code === "revision_conflict";
    }

    get isPermission(): boolean {
        return this.status === 403 || this.code === "publication_required" || this.code === "admin_required";
    }

    get isRevoked(): boolean {
        return this.code === "identity_revoked" || this.providerClass === "auth_lost";
    }
}

export const TRACKER_ROUTES = {
    connectors: "/api/admin/trackers/connectors",
    connector: (id: string) => `/api/admin/trackers/connectors/${encodeURIComponent(id)}`,
    connectorTest: (id: string) => `/api/admin/trackers/connectors/${encodeURIComponent(id)}/test`,
    connectorPause: (id: string) => `/api/admin/trackers/connectors/${encodeURIComponent(id)}/pause`,
    connectorResume: (id: string) => `/api/admin/trackers/connectors/${encodeURIComponent(id)}/resume`,
    connectorRevoke: (id: string) => `/api/admin/trackers/connectors/${encodeURIComponent(id)}/revoke`,
    connectorHealth: (id: string) => `/api/admin/trackers/connectors/${encodeURIComponent(id)}/health`,
    connectorRepositories: (id: string) => `/api/admin/trackers/connectors/${encodeURIComponent(id)}/repositories`,
    identities: "/api/trackers/identities",
    identityBegin: (connectorId: string) =>
        `/api/trackers/connectors/${encodeURIComponent(connectorId)}/oauth/begin`,
    identityUnlink: (connectorId: string) =>
        `/api/trackers/identities/${encodeURIComponent(connectorId)}`,
    projectTracker: (projectId: string) =>
        `/api/projects/${encodeURIComponent(projectId)}/tracker`,
    projectAck: (projectId: string) =>
        `/api/projects/${encodeURIComponent(projectId)}/tracker/acknowledge`,
    commentPromote: (projectId: string, commentId: string) =>
        `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/promote`,
    commentRetry: (projectId: string, commentId: string) =>
        `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/tracker/retry`,
    commentUnlink: (projectId: string, commentId: string) =>
        `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/tracker/unlink`,
    commentRepromote: (projectId: string, commentId: string) =>
        `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/tracker/repromote`,
} as const;

function stripSecrets<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((entry) => stripSecrets(entry)) as T;
    }
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
            if (SECRET_KEYS.has(key)) {
                continue;
            }
            out[key] = stripSecrets(nested);
        }
        return out as T;
    }
    return value;
}

async function parseError(response: Response, fallback: string): Promise<TrackerApiError> {
    let payload: TrackerErrorPayload = { detail: fallback };
    try {
        const raw = (await response.json()) as Partial<TrackerErrorPayload> & { detail?: unknown };
        const detail = raw.detail;
        payload = {
            detail:
                typeof detail === "string" && detail.trim()
                    ? detail
                    : fallback,
            code: typeof raw.code === "string" ? raw.code : undefined,
            requiredRole: typeof raw.requiredRole === "string" ? raw.requiredRole : undefined,
            currentRevision:
                typeof raw.currentRevision === "number"
                    ? raw.currentRevision
                    : raw.currentRevision === null
                        ? null
                        : undefined,
            class: typeof raw.class === "string" ? (raw.class as TrackerErrorPayload["class"]) : undefined,
            retryable: typeof raw.retryable === "boolean" ? raw.retryable : undefined,
            resumeAt: typeof raw.resumeAt === "string" ? raw.resumeAt : undefined,
        };
    } catch {
        // Non-JSON bodies keep the fallback.
    }
    return new TrackerApiError(response.status, payload);
}

async function request<T>(input: string, init: RequestInit | undefined, fallback: string): Promise<T> {
    const response = await fetchApi(input, init);
    if (!response.ok) {
        throw await parseError(response, fallback);
    }
    if (response.status === 204) {
        return undefined as T;
    }
    return stripSecrets((await response.json()) as T);
}

function json(method: string, body: unknown): RequestInit {
    return { method, body: JSON.stringify(body) };
}

export function listConnectors(): Promise<TrackerConnector[]> {
    return request(TRACKER_ROUTES.connectors, undefined, "Failed to list connectors");
}

export function getConnector(connectorId: string): Promise<TrackerConnector> {
    return request(TRACKER_ROUTES.connector(connectorId), undefined, "Failed to load connector");
}

export function createConnector(payload: CreateConnectorRequest): Promise<TrackerConnector> {
    return request(TRACKER_ROUTES.connectors, json("POST", payload), "Failed to create connector");
}

export function updateConnector(connectorId: string, payload: UpdateConnectorRequest): Promise<TrackerConnector> {
    return request(TRACKER_ROUTES.connector(connectorId), json("PATCH", payload), "Failed to update connector");
}

export function testConnector(connectorId: string): Promise<TrackerConnector & { test: ConnectorTestResult }> {
    return request(TRACKER_ROUTES.connectorTest(connectorId), { method: "POST" }, "Failed to test connector");
}

export function pauseConnector(connectorId: string): Promise<TrackerConnector> {
    return request(TRACKER_ROUTES.connectorPause(connectorId), { method: "POST" }, "Failed to pause connector");
}

export function resumeConnector(connectorId: string): Promise<TrackerConnector> {
    return request(TRACKER_ROUTES.connectorResume(connectorId), { method: "POST" }, "Failed to resume connector");
}

export function revokeConnector(connectorId: string): Promise<TrackerConnector> {
    return request(TRACKER_ROUTES.connectorRevoke(connectorId), { method: "POST" }, "Failed to revoke connector");
}

export function listConnectorRepositories(connectorId: string): Promise<TrackerRepository[]> {
    return request(TRACKER_ROUTES.connectorRepositories(connectorId), undefined, "Failed to list repositories");
}

export function getConnectorHealth(connectorId: string): Promise<ConnectorHealth> {
    return request(TRACKER_ROUTES.connectorHealth(connectorId), undefined, "Failed to load connector health");
}

export function getProjectTracker(projectId: string): Promise<ProjectTrackerSettings> {
    return request(TRACKER_ROUTES.projectTracker(projectId), undefined, "Failed to load project tracker");
}

export function updateProjectTracker(
    projectId: string,
    payload: UpdateProjectTrackerRequest,
): Promise<ProjectTrackerSettings> {
    return request(TRACKER_ROUTES.projectTracker(projectId), json("PUT", payload), "Failed to update project tracker");
}

export function acknowledgeDestination(
    projectId: string,
    visibility: string,
): Promise<ProjectTrackerSettings> {
    return request(
        TRACKER_ROUTES.projectAck(projectId),
        json("POST", { visibility }),
        "Failed to acknowledge destination visibility",
    );
}

export function listIdentities(): Promise<UserIdentity[]> {
    return request(TRACKER_ROUTES.identities, undefined, "Failed to list connected accounts");
}

export function beginIdentityLink(connectorId: string, returnTo?: string): Promise<OAuthBeginResponse> {
    const query =
        returnTo && returnTo.trim()
            ? `?${new URLSearchParams({ returnTo: returnTo.trim() }).toString()}`
            : "";
    return request(
        `${TRACKER_ROUTES.identityBegin(connectorId)}${query}`,
        { method: "POST" },
        "Failed to start account linking",
    );
}

export function unlinkIdentity(connectorId: string): Promise<void> {
    return request(TRACKER_ROUTES.identityUnlink(connectorId), { method: "DELETE" }, "Failed to unlink account");
}

export function promoteComment(projectId: string, commentId: string): Promise<CommentTrackerProjection> {
    return request(
        TRACKER_ROUTES.commentPromote(projectId, commentId),
        { method: "POST" },
        "Failed to promote comment",
    );
}

export function retryThreadSync(projectId: string, commentId: string): Promise<CommentTrackerProjection> {
    return request(
        TRACKER_ROUTES.commentRetry(projectId, commentId),
        { method: "POST" },
        "Failed to retry tracker sync",
    );
}

export function unlinkThread(projectId: string, commentId: string): Promise<CommentTrackerProjection> {
    return request(
        TRACKER_ROUTES.commentUnlink(projectId, commentId),
        { method: "POST" },
        "Failed to unlink tracker thread",
    );
}

export function repromoteComment(projectId: string, commentId: string): Promise<CommentTrackerProjection> {
    return request(
        TRACKER_ROUTES.commentRepromote(projectId, commentId),
        { method: "POST" },
        "Failed to promote again",
    );
}

/**
 * Prefer the typed `tracker` object. Fall back to legacy forge_* columns so
 * older comment payloads still render a destination chip.
 */
export function projectionFromComment(comment: LegacyForgeProjection): CommentTrackerProjection {
    if (comment.tracker) {
        return comment.tracker;
    }
    if (comment.forgeIssueId) {
        return {
            linkState: "linked",
            provider: comment.forgeProvider ?? undefined,
            externalId: comment.forgeIssueId,
            externalUrl: comment.forgeIssueUrl ?? null,
            pendingIntent: null,
            remoteState: null,
            syncState: comment.forgeSyncState ?? null,
        };
    }
    return { linkState: null, pendingIntent: null, remoteState: null };
}

export { stripSecrets as stripTrackerSecrets };
