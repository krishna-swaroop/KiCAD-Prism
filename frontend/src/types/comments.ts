/**
 * Comment Types for KiCAD-Prism Collaboration Feature
 *
 * These types match the PostgreSQL-backed comments API and optional
 * .comments/comments.json export artifact (format 1.1). The wire shapes are
 * frozen in docs/tracker-integration/dto-examples.json; additive fields are
 * fine, renames are a contract revision.
 */

export type CommentStatus = "OPEN" | "RESOLVED";

/**
 * How a root or reply was attributed. `legacy` rows predate authenticated
 * authorship and have no owner; `remote` replies came from the tracker.
 */
export type AuthorKind = "user" | "service" | "guest" | "legacy" | "remote";

export type CommentAnchorState = "pinned" | "unpinned";

/** Where the comment is pinned and how that is known. Never inferred. */
export interface CommentAnchor {
    state: CommentAnchorState;
    source?: "client" | "manual" | null;
    commit?: string | null;
    sourceRevisionKey?: string | null;
    baseCommit?: string | null;
    compareCommit?: string | null;
    selectedSide?: "base" | "compare" | null;
}

/**
 * What the current caller may do to one root or reply. Rendered as-is;
 * the UI never re-derives policy from roles or names.
 */
export interface CommentPermissions {
    canReply: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canResolve: boolean;
    canPublish: boolean;
}

/** Privacy-safe mention: stable user id plus display name, never an email. */
export interface Mention {
    userId: string;
    displayName: string;
}

export interface RemoteAttribution {
    provider: string;
    login: string;
    url?: string;
}

export type CommentContext = "PCB" | "SCH";

export type CommentClass = "general" | "observation" | "question" | "task";

export type CommentSeverity = "info" | "minor" | "major" | "critical";

export const COMMENT_CLASSES: CommentClass[] = [
    "general",
    "observation",
    "question",
    "task",
];

export const COMMENT_SEVERITIES: CommentSeverity[] = [
    "info",
    "minor",
    "major",
    "critical",
];

export const DEFAULT_COMMENT_CLASS: CommentClass = "general";
export const DEFAULT_COMMENT_SEVERITY: CommentSeverity = "info";

export interface CommentLocation {
    /** X coordinate in board/schematic units (mm) */
    x: number;
    /** Y coordinate in board/schematic units (mm) */
    y: number;
    /** Layer name (e.g., "F.Cu", "B.Cu") */
    layer: string;
    /** Schematic page identifier (filename or path) */
    page?: string;
    /** Optional area bounds [x, y, w, h] for rectangle comments */
    bounds?: [number, number, number, number];
}

export interface CommentReply {
    id: string;
    author: string;
    authorUserId?: string | null;
    authorKind: AuthorKind;
    timestamp: string;
    updatedAt: string;
    revision: number;
    content: string;
    origin: "prism" | "remote";
    remoteAttribution?: RemoteAttribution | null;
    deletedAt?: string | null;
    permissions?: CommentPermissions;
}

export interface Comment {
    id: string;
    author: string;
    authorUserId?: string | null;
    authorKind: AuthorKind;
    timestamp: string;
    updatedAt: string;
    revision: number;
    status: CommentStatus;
    context: CommentContext;
    location: CommentLocation;
    content: string;
    replies: CommentReply[];
    elementRef?: string;
    elementType?: string;
    elementId?: string;
    commentClass: CommentClass;
    severity: CommentSeverity;
    mentions: Mention[];
    metadata?: Record<string, unknown>;
    scope?: "canvas" | "comparison";
    baseCommit?: string;
    compareCommit?: string;
    comparisonDomain?: CommentContext;
    filePath?: string;
    semanticItemId?: string;
    anchorKind?: "comparison" | "file" | "item" | "group";
    anchor: CommentAnchor;
    permissions?: CommentPermissions;
    deletedAt?: string | null;
    /** Reserved for future GitHub/GitLab Issues sync */
    forgeProvider?: string;
    forgeIssueId?: string;
    forgeIssueUrl?: string;
    forgeSyncState?: string;
}

export interface CommentsMeta {
    version: string;
    generator: string;
}

export interface CommentsFile {
    meta: CommentsMeta;
    comments: Comment[];
}

/**
 * The commit (or worktree) the comment was authored against. Distinct from
 * `Comment.revision`, which is the thread's integer edit counter.
 */
export interface CreateCommentDisplayedRevision {
    commit?: string | null;
    worktree?: boolean;
    sourceRevisionKey?: string | null;
}

/**
 * Outgoing payloads carry no author: the server records the session's
 * identity, so nothing a browser sends can change attribution.
 */
export interface CreateCommentRequest {
    context: CommentContext;
    location: CommentLocation;
    content: string;
    elementId?: string;
    elementRef?: string;
    elementType?: string;
    commentClass?: CommentClass;
    severity?: CommentSeverity;
    mentions?: Mention[];
    revision?: CreateCommentDisplayedRevision;
    metadata?: Record<string, unknown>;
}

export interface CreateComparisonCommentRequest {
    baseCommit: string;
    compareCommit: string;
    domain: CommentContext;
    content: string;
    filePath?: string;
    semanticItemId?: string;
    semanticItemRef?: string;
    anchorKind?: "comparison" | "file" | "item" | "group";
    commentClass?: CommentClass;
    severity?: CommentSeverity;
    mentions?: Mention[];
    selectedSide?: "base" | "compare" | null;
}

export interface CreateReplyRequest {
    content: string;
}

/**
 * Root edits and status changes. `expectedRevision` is the revision the
 * client displayed; the server answers 409 `revision_conflict` when the
 * thread moved on, and nothing is written.
 */
export interface UpdateCommentRequest {
    content?: string;
    severity?: CommentSeverity;
    commentClass?: CommentClass;
    mentions?: Mention[];
    status?: CommentStatus;
    expectedRevision?: number;
}

export interface UpdateReplyRequest {
    content: string;
    expectedRevision?: number;
}

export interface CommentRevision {
    targetKind: "root" | "reply";
    targetId: string;
    revision: number;
    changeKind: "create" | "edit" | "status" | "delete";
    content?: string | null;
    severity?: CommentSeverity | null;
    commentClass?: CommentClass | null;
    status?: CommentStatus | null;
    editorUserId?: string | null;
    editorKind: string;
    editorDisplay: string;
    origin: "prism" | "remote";
    editedAt: string;
}

/** Machine-readable refusals the comments API returns beside `detail`. */
export type CommentMutationErrorCode =
    | "revision_conflict"
    | "publication_required"
    | "status_role_required"
    | "not_owner"
    | "legacy_admin_only"
    | "remote_object_read_only"
    | "provider_token_read_only"
    | "identity_unresolved"
    | "scope_required";

export interface CommentMutationErrorPayload {
    detail: string;
    code?: CommentMutationErrorCode | string;
    currentRevision?: number | null;
    requiredRole?: string;
}

export interface MentionCandidate {
    userId: string;
    displayName: string;
    role: string;
    linkedProviders?: string[];
}

export function commentClassLabel(value: CommentClass): string {
    switch (value) {
        case "general":
            return "General";
        case "observation":
            return "Observation";
        case "question":
            return "Question";
        case "task":
            return "Task";
    }
}

export function commentSeverityLabel(value: CommentSeverity): string {
    switch (value) {
        case "info":
            return "Info";
        case "minor":
            return "Minor";
        case "major":
            return "Major";
        case "critical":
            return "Critical";
    }
}
