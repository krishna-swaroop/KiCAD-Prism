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

/** Fill the optional fields older comment files omit. */
export function normalizeComment(raw: Comment): Comment {
    return {
        ...raw,
        commentClass: raw.commentClass ?? DEFAULT_COMMENT_CLASS,
        severity: raw.severity ?? DEFAULT_COMMENT_SEVERITY,
        mentions: raw.mentions ?? [],
        replies: raw.replies ?? [],
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
        if (comment.anchorResolution?.state === "unresolved") return false;
        const location = commentCurrentLocation(comment);
        if (context === "SCH" && activePage && location.page) {
            return [activePage.projectPath, activePage.filename, activePage.page]
                .filter(Boolean)
                .includes(location.page);
        }
        return true;
    });
}

export function commentCurrentLocation(comment: Comment): CommentLocation {
    return comment.anchorResolution?.state === "candidate"
        ? comment.anchorResolution.binding.location
        : comment.location;
}

function commentRelativePoint(comment: Comment): [number, number] | undefined {
    const point = comment.anchorResolution?.state === "candidate"
        ? comment.anchorResolution.binding.relativePoint
        : comment.metadata?.anchorRelativePoint;
    return Array.isArray(point) && point.length === 2
        && point.every((value) => typeof value === "number" && Number.isFinite(value)
            && value >= 0 && value <= 1)
        ? point as [number, number]
        : undefined;
}

/**
 * Where a comment attaches on the canvas: to the source object it was left on
 * when it has one, otherwise to the world coordinate it was left at.
 */
export function commentAnchor(comment: Comment): EcadCommentAnchor {
    const location = commentCurrentLocation(comment);
    const page = location.page;
    const elementId = comment.anchorResolution?.state === "candidate"
        ? comment.anchorResolution.binding.elementId
        : comment.elementId;
    if (elementId) {
        const relativePoint = commentRelativePoint(comment);
        return { kind: "source-item", uuid: elementId, page,
            ...(relativePoint ? { relativePoint } : {}) };
    }
    return { kind: "world", x: location.x, y: location.y, page };
}

export function commentOverlay(comment: Comment): EcadCommentOverlaySet["comments"][number] {
    return {
        id: comment.id,
        anchor: commentAnchor(comment),
        areaBounds: commentCurrentLocation(comment).bounds,
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
