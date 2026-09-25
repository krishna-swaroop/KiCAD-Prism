/**
 * Comment Types for KiCAD-Prism Collaboration Feature
 *
 * These types match the PostgreSQL-backed comments API and optional
 * .comments/comments.json export artifact.
 */

export type CommentStatus = "OPEN" | "RESOLVED";

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

export interface ReplySync {
    /** ``unsynced_local``: saved in Prism only; ``confirmed``: posted on the issue. */
    state: string;
    reason?: string | null;
    externalCommentId?: string | null;
    externalUrl?: string | null;
}

export interface CommentReply {
    id?: string;
    author: string;
    timestamp: string;
    content: string;
    /** ``remote`` replies were imported from the linked issue. */
    origin?: "prism" | "remote" | string;
    sync?: ReplySync | null;
    permissions?: { canEdit?: boolean; canDelete?: boolean; canShare?: boolean };
}

export interface Comment {
    id: string;
    author: string;
    timestamp: string;
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
    mentions: string[];
    metadata?: Record<string, unknown>;
    scope?: "canvas" | "comparison";
    baseCommit?: string;
    compareCommit?: string;
    comparisonDomain?: CommentContext;
    filePath?: string;
    semanticItemId?: string;
    anchorKind?: "comparison" | "file" | "item" | "group";
    /** Reserved for future GitHub/GitLab Issues sync */
    forgeProvider?: string;
    forgeIssueId?: string;
    forgeIssueUrl?: string;
    forgeSyncState?: string;
    tracker?: {
        linkState?: string | null;
        provider?: string | null;
        externalUrl?: string | null;
        syncState?: string | null;
        lastError?: { message?: string; retryable?: boolean } | null;
        notPromotableReason?: string | null;
    };
    revision?: number;
    permissions?: { canReply?: boolean; canEdit?: boolean; canDelete?: boolean; canResolve?: boolean;
        canPublish?: boolean; canRetry?: boolean };
    anchor?: { state: string; commit?: string | null; source?: string | null };
    anchorResolution?:
        | { state: "candidate"; binding: {
            commit: string;
            elementId?: string | null;
            location: CommentLocation;
            relativePoint?: [number, number] | null;
        } }
        | { state: "unresolved"; reason: string; lastBinding?: {
            commit: string; location: CommentLocation;
        } };
}

export interface CommentsMeta {
    version: string;
    generator: string;
}

export interface CommentsFile {
    meta: CommentsMeta;
    comments: Comment[];
    /** Last committed project comment event represented by this snapshot. */
    cursor?: number;
}

export interface CommentChangeEvent {
    type: "change";
    cursor: number;
    commentId: string;
    scope: "canvas" | "comparison";
    baseCommit?: string | null;
    compareCommit?: string | null;
    changeKind: string;
}

export interface CreateCommentRequest {
    context: CommentContext;
    location: CommentLocation;
    content: string;
    author?: string;
    elementId?: string;
    elementRef?: string;
    elementType?: string;
    commentClass?: CommentClass;
    severity?: CommentSeverity;
    mentions?: string[];
    metadata?: Record<string, unknown>;
    /** Exact revision displayed when this canvas comment was created. */
    revision?: { commit: string };
}

export interface CreateReplyRequest {
    content: string;
    author?: string;
}

export interface UpdateCommentRequest {
    status?: CommentStatus;
}

export interface MentionCandidate {
    email: string;
    role: string;
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
