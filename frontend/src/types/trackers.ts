/**
 * Tracker wire types frozen in docs/tracker-integration/dto-examples.json.
 *
 * The browser never talks to a forge and never stores provider tokens.
 * Additive fields are allowed; renames are a contract revision.
 */

export type LinkState = "linked" | "inaccessible" | "deleted" | "transferred";

export type IdentityStatus = "active" | "revoked" | "expired";

export type ContainerKind = "repo" | "group" | "project";

export type TrackerVisibility = "public" | "private" | "unknown";

export type ProviderErrorClass =
    | "rate_limited"
    | "auth_lost"
    | "forbidden"
    | "not_found_uncertain"
    | "gone_confirmed"
    | "moved"
    | "transient"
    | "invalid_request"
    | "capability_missing"
    | "paused"
    | "visibility"
    | "visibility_unknown"
    | "connector_missing";

export type TrackerErrorCode =
    | "revision_conflict"
    | "publication_required"
    | "status_role_required"
    | "not_owner"
    | "legacy_admin_only"
    | "admin_required"
    | "visibility_ack_required"
    | "connector_paused"
    | "identity_revoked"
    | string;

/** Destination identity is connector + remote container id + generation. */
export interface TrackerDestination {
    connectorId: string;
    containerKind: ContainerKind;
    containerPath: string;
    remoteContainerId: string;
    generation: number;
    visibility?: TrackerVisibility | null;
}

export interface ProviderErrorDto {
    class: ProviderErrorClass;
    message: string;
    resumeAt?: string | null;
    status?: number | null;
    retryable: boolean;
    newRef?: string | null;
}

export interface ProviderCapabilities {
    provider: string;
    canEditOwnComment: boolean;
    canDeleteOwnComment: boolean;
    canEditIssueBody: boolean;
    hasStateEvents: boolean;
    hasTransferEvents: boolean;
    supportsConditionalGet: boolean;
    maxAssignees: number;
    apiVersion: string;
    instanceKind: string;
}

/**
 * Admin-visible connector. `credentialConfigured` is the only secret signal;
 * ciphertext and PEMs never appear on this object.
 */
export interface TrackerBotIdentity {
    id: string | null;
    login: string | null;
}

export interface TrackerConnector {
    id: string;
    provider: string;
    displayName: string;
    instanceKind: string;
    baseUrl: string;
    bot: TrackerBotIdentity;
    credentialConfigured: boolean;
    webhookConfigured?: boolean;
    /** Forge-facing inbound webhook URL derived server-side from PUBLIC_BASE_URL; null when unset. */
    webhookUrl?: string | null;
    oauthClientConfigured?: boolean;
    paused: boolean;
    pausedReason?: string | null;
    writesEnabled?: boolean;
    auditCount?: number;
    /** Hostname people recognise, e.g. ``gitlab.acme.io``. */
    host?: string;
    capabilities?: CodeHostCapabilities;
}

/** What a code host can do in Prism today. */
export interface CodeHostCapabilities {
    /** Promote threads to issues (GitHub only for now). */
    issues: boolean;
    /** An OAuth app is registered, so people can link accounts. */
    accountLinking: boolean;
}

/** A code host a signed-in person can link under Connected accounts. */
export interface LinkableCodeHost {
    id: string;
    provider: string;
    instanceKind: string;
    displayName: string;
    host: string;
}

/** A repository the connector's installation can publish to (destination picker). */
export interface TrackerRepository {
    id: string;
    fullName: string;
    private: boolean;
    archived: boolean;
    htmlUrl: string;
}

export interface ConnectorTestResult {
    ok: boolean;
    writesEnabled: boolean;
    pausedReason?: string | null;
    visibility?: string | null;
    permissions?: Record<string, string>;
    bot?: TrackerBotIdentity;
}

export interface ConnectorHealth {
    connectorId: string;
    paused: boolean;
    lastWebhookAt?: string | null;
    lastPollAt?: string | null;
    lastSweepAt?: string | null;
    pendingOps: number;
    sentOps: number;
    quarantinedOps: number;
    failedOps: number;
    oldestPendingOpAge?: string | null;
    oldestUnappliedHintAge?: string | null;
    rateLimitResumeAt?: string | null;
    degraded: boolean;
    lastError?: ProviderErrorDto | null;
}

export interface DestinationAcknowledgement {
    visibility: TrackerVisibility;
    acknowledgedBy: string;
    acknowledgedAt: string;
    valid: boolean;
}

export interface ProjectTrackerSettings {
    projectId: string;
    connectorId: string;
    /** Provider of that connection, e.g. ``github`` or ``gitlab``. */
    provider?: string;
    /** `owner/name` of the project's own GitHub remote, or null; offered as the default destination. */
    projectRepoPath?: string | null;
    destination: Omit<TrackerDestination, "connectorId"> & { connectorId?: string };
    acknowledgement?: DestinationAcknowledgement | null;
    autoMinSeverity: string;
    autoTaskClass: boolean;
    promoteMinRole: string;
    labels: {
        base: string;
        severityPrefix: string;
        classPrefix: string;
        boardPrefix: string;
    };
}

export interface UserIdentity {
    connectorId: string;
    provider: string;
    forgeUserId: string;
    forgeLogin: string;
    scopes: string[];
    linkedAt: string;
    expiresAt?: string | null;
    status: IdentityStatus;
}

export interface TrackedThread {
    id: string;
    commentId: string;
    projectTrackerId: string;
    destinationGeneration: number;
    externalId: string;
    externalUrl?: string | null;
    linkState: LinkState;
    pausedReason?: string | null;
    bodyAuthority: string;
    remoteState?: string | null;
    remoteVersion?: { updatedAt?: string | null; etag?: string | null } | null;
    lastTitleHash?: string | null;
    pendingOpId?: string | null;
    lastVerifiedAt?: string | null;
    unlinkedAt?: string | null;
    lineage: Array<Record<string, unknown>>;
}

/**
 * Comment-embedded tracker projection. Observed remote state, pending local
 * intent, and link existence are independent fields — UI must not collapse them.
 */
export interface CommentTrackerProjection {
    linkState: LinkState | null;
    provider?: string;
    externalId?: string;
    /** Repo-scoped issue number for display; `externalId` is the immutable forge id. */
    externalNumber?: string | null;
    externalUrl?: string | null;
    destination?: {
        connectorId: string;
        containerPath: string;
        containerKind: ContainerKind | string;
        generation: number;
    };
    remoteState?: string | null;
    remoteUpdatedAt?: string | null;
    pendingIntent?: string | null;
    syncState?: string | null;
    pausedReason?: string | null;
    bodyAuthority?: string | null;
    lastError?: ProviderErrorDto | null;
    notPromotableReason?: string | null;
}

export interface TrackerErrorPayload {
    detail: string;
    code?: TrackerErrorCode;
    requiredRole?: string;
    currentRevision?: number | null;
    class?: ProviderErrorClass;
    retryable?: boolean;
    resumeAt?: string | null;
}

/** Legacy comments.forge_* columns — read projection only. */
export interface LegacyForgeProjection {
    forgeProvider?: string | null;
    forgeIssueId?: string | null;
    forgeIssueUrl?: string | null;
    forgeSyncState?: string | null;
    tracker?: CommentTrackerProjection | null;
}

export interface CreateConnectorRequest {
    provider: string;
    displayName?: string;
    instanceKind: string;
    baseUrl?: string;
    /** Write-only Prism credentials. Never echoed on reads. */
    credentials?: Record<string, string>;
}

export interface UpdateConnectorRequest {
    displayName?: string;
    baseUrl?: string;
    credentials?: Record<string, string>;
}

export interface UpdateProjectTrackerRequest {
    connectorId: string;
    destination: ProjectTrackerSettings["destination"];
    autoMinSeverity?: string;
    autoTaskClass?: boolean;
    promoteMinRole?: string;
    labels?: ProjectTrackerSettings["labels"];
}

export interface OAuthBeginResponse {
    authorizeUrl: string;
}
