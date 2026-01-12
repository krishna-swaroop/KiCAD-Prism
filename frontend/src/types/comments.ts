/**
 * Comment Types for KiCAD-Prism Collaboration Feature
 * 
 * These types match the JSON schema stored in .kicad-prism/comments.json
 */

/**
 * Comment status - can be OPEN or RESOLVED
 */
export type CommentStatus = "OPEN" | "RESOLVED";

/**
 * Comment context - PCB or Schematic
 */
export type CommentContext = "PCB" | "SCH";

/**
 * Location information for a comment
 */
export interface CommentLocation {
    /** X coordinate in board units (mm) */
    x: number;
    /** Y coordinate in board units (mm) */
    y: number;
    /** Layer name (e.g., "F.Cu", "B.Cu") */
    layer: string;
    /** Schematic page identifier (filename or path) */
    page?: string;
}

/**
 * A reply to a comment
 */
export interface CommentReply {
    /** Author username */
    author: string;
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Reply content */
    content: string;
}

/**
 * A design review comment
 */
export interface Comment {
    /** Unique comment ID (e.g., "c_8a7b9c") */
    id: string;
    /** Author username */
    author: string;
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Comment status */
    status: CommentStatus;
    /** Context: PCB or Schematic */
    context: CommentContext;
    /** Location on the design */
    location: CommentLocation;
    /** Comment content */
    content: string;
    /** Replies to this comment */
    replies: CommentReply[];
    /** Element designator (e.g., "U1") */
    elementRef?: string;
    /** Element type (e.g., "Footprint") */
    elementType?: string;
    /** Element ID (UUID) */
    elementId?: string;
}

/**
 * Metadata for the comments file
 */
export interface CommentsMeta {
    version: string;
    generator: string;
}

/**
 * Root structure of .kicad-prism/comments.json
 */
export interface CommentsFile {
    meta: CommentsMeta;
    comments: Comment[];
}

/**
 * Request payload for creating a new comment
 */
export interface CreateCommentRequest {
    context: CommentContext;
    location: CommentLocation;
    content: string;
}

/**
 * Request payload for adding a reply
 */
export interface CreateReplyRequest {
    content: string;
}

/**
 * Request payload for updating comment status
 */
export interface UpdateCommentRequest {
    status?: CommentStatus;
}
