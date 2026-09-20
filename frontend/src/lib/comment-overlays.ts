/**
 * Pure comment-to-overlay shaping for the ECAD viewers.
 *
 * The visualizer owns the imperative side (attaching overlays to a viewer,
 * listening for hits, cleaning up). Everything here is a function of its
 * arguments so overlay presentation can change, and be tested, without
 * touching the component that coordinates schematic, PCB, 3D and selection.
 */

import type {
    EcadCommentAnchor,
    EcadCommentAreaDetail,
    EcadCommentOverlayHitDetail,
    EcadCommentOverlaySet,
} from "@/types/ecad-viewer";
import {
    DEFAULT_COMMENT_CLASS,
    DEFAULT_COMMENT_SEVERITY,
    type Comment,
    type CommentContext,
    type CommentLocation,
    type CommentReply,
} from "@/types/comments";

/** Identity of the schematic sheet a viewer currently shows. */
export interface ActiveSchematicPage {
    projectPath: string;
    filename: string;
    page?: string;
}

/** The subset of the viewer element a screen projection needs. */
export interface ScreenLocator {
    getScreenLocation(x: number, y: number): { x: number; y: number } | null;
    getBoundingClientRect(): { left: number; top: number };
}

export interface ScreenPoint {
    x: number;
    y: number;
}

/** A reply as a pre-1.1 server or comments.json 1.0 file wrote it. */
type LegacyReply = Partial<CommentReply> & Pick<CommentReply, "author" | "timestamp" | "content">;

type LegacyComment = Partial<Comment> &
    Pick<Comment, "id" | "author" | "timestamp" | "status" | "context" | "location" | "content"> & {
        replies?: LegacyReply[];
    };

function normalizeReply(raw: LegacyReply, commentId: string, index: number): CommentReply {
    return {
        ...raw,
        // Servers before format 1.1 sent replies without ids. A positional key
        // keeps React lists and selection stable until the thread reloads from
        // a server that has the real id; it is never sent back.
        id: raw.id ?? `legacy:${commentId}:${index}`,
        authorKind: raw.authorKind ?? "legacy",
        updatedAt: raw.updatedAt ?? raw.timestamp,
        revision: raw.revision ?? 1,
        origin: raw.origin ?? "prism",
    };
}

/**
 * Fill the optional fields older comment files and servers omit.
 *
 * Anything without a stable author key is `legacy` (no owner), and anything
 * without an anchor is `unpinned`; both are the contract's reading of
 * pre-identity data, never a guess at who wrote it or which commit it meant.
 */
export function normalizeComment(raw: LegacyComment): Comment {
    const replies = (raw.replies ?? []).map((reply, index) => normalizeReply(reply, raw.id, index));
    return {
        ...raw,
        authorKind: raw.authorKind ?? "legacy",
        updatedAt: raw.updatedAt ?? raw.timestamp,
        revision: raw.revision ?? 1,
        commentClass: raw.commentClass ?? DEFAULT_COMMENT_CLASS,
        severity: raw.severity ?? DEFAULT_COMMENT_SEVERITY,
        mentions: raw.mentions ?? [],
        replies,
        anchor: raw.anchor ?? {
            state: "unpinned",
            source: null,
            commit: null,
            sourceRevisionKey: null,
            baseCommit: raw.baseCommit ?? null,
            compareCommit: raw.compareCommit ?? null,
        },
    };
}

/**
 * Comments that belong on the given view. Schematic comments are further
 * narrowed to the active sheet. New comments record the unique instance path;
 * filename and page identifiers are still accepted so existing comment files
 * keep showing.
 */
export function commentsForView(
    comments: Comment[],
    context: CommentContext,
    activePage?: ActiveSchematicPage | null,
): Comment[] {
    return comments.filter((comment) => {
        if (comment.context !== context) return false;
        if (context === "SCH" && activePage && comment.location.page) {
            return [activePage.projectPath, activePage.filename, activePage.page]
                .filter(Boolean)
                .includes(comment.location.page);
        }
        return true;
    });
}

/**
 * Where a comment attaches on the canvas: to the source object it was left on
 * when it has one, otherwise to the world coordinate it was left at.
 */
export function commentAnchor(comment: Comment): EcadCommentAnchor {
    const page = comment.location.page;
    if (comment.elementId) {
        return { kind: "source-item", uuid: comment.elementId, page };
    }
    return { kind: "world", x: comment.location.x, y: comment.location.y, page };
}

export function commentOverlay(comment: Comment): EcadCommentOverlaySet["comments"][number] {
    return {
        id: comment.id,
        anchor: commentAnchor(comment),
        areaBounds: comment.location.bounds,
        metadata: { commentId: comment.id },
        accessibilityLabel: comment.content.slice(0, 80),
    };
}

/** The overlay set a viewer should show for one view. */
export function commentOverlaySet(
    comments: Comment[],
    context: CommentContext,
    activePage?: ActiveSchematicPage | null,
): EcadCommentOverlaySet {
    return {
        context,
        comments: commentsForView(comments, context, activePage).map(commentOverlay),
    };
}

/**
 * Project a world coordinate to viewport screen space. Null when the viewer
 * cannot place it: no viewer, or geometry the current view does not show.
 */
export function worldToViewportScreen(
    viewer: ScreenLocator | null | undefined,
    x: number,
    y: number,
): ScreenPoint | null {
    if (!viewer) return null;
    const local = viewer.getScreenLocation(x, y);
    if (!local) return null;
    const rect = viewer.getBoundingClientRect();
    return { x: rect.left + local.x, y: rect.top + local.y };
}

/** Screen position of an existing comment's own anchor point. */
export function commentScreenPosition(
    viewer: ScreenLocator | null | undefined,
    comment: Pick<Comment, "location">,
): ScreenPoint | null {
    return worldToViewportScreen(viewer, comment.location.x, comment.location.y);
}

/** The comment an overlay hit refers to, preferring the metadata we published. */
export function commentIdFromOverlayHit(detail: EcadCommentOverlayHitDetail): string | null {
    const metadata = detail.metadata as { commentId?: string } | null | undefined;
    const commentId = metadata?.commentId ?? detail.commentId;
    return commentId ? commentId : null;
}

/** The location a new comment gets from a drawn area on either view. */
export function commentLocationFromArea(detail: EcadCommentAreaDetail): CommentLocation {
    return {
        x: detail.x,
        y: detail.y,
        layer: detail.layer ?? "",
        page: detail.page,
        bounds: detail.bounds,
    };
}
