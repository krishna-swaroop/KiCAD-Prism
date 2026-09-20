import { describe, expect, it } from "vitest";

import {
    commentAnchor,
    commentIdFromOverlayHit,
    commentLocationFromArea,
    commentOverlaySet,
    commentScreenPosition,
    commentsForView,
    normalizeComment,
    worldToViewportScreen,
    type ScreenLocator,
} from "./comment-overlays";
import type { Comment, CommentContext, CommentLocation } from "@/types/comments";

function comment(
    id: string,
    context: CommentContext,
    location: Partial<CommentLocation> = {},
    extra: Partial<Comment> = {},
): Comment {
    return {
        id,
        author: "reviewer",
        timestamp: "2026-09-16T00:00:00Z",
        status: "OPEN",
        context,
        location: { x: 10, y: 20, layer: "", ...location },
        content: `Comment ${id}`,
        replies: [],
        authorKind: "legacy",
        updatedAt: "2026-09-16T00:00:00Z",
        revision: 1,
        anchor: { state: "unpinned" },
        commentClass: "general",
        severity: "info",
        mentions: [],
        ...extra,
    };
}

const activePage = {
    projectPath: "/root/power/",
    filename: "power.kicad_sch",
    page: "2",
};

function locator(
    screen: { x: number; y: number } | null,
    rect = { left: 100, top: 50 },
): ScreenLocator {
    return {
        getScreenLocation: () => screen,
        getBoundingClientRect: () => rect,
    };
}

describe("normalizeComment", () => {
    it("fills the fields older comment files omit", () => {
        const raw = {
            id: "c1",
            author: "a",
            timestamp: "t",
            status: "OPEN",
            context: "PCB",
            location: { x: 0, y: 0, layer: "F.Cu" },
            content: "x",
        } as unknown as Comment;
        expect(normalizeComment(raw)).toMatchObject({
            commentClass: "general",
            severity: "info",
            mentions: [],
            replies: [],
        });
    });

    it("keeps explicit values", () => {
        const explicit = comment("c1", "PCB", {}, { commentClass: "task", severity: "major", mentions: ["bob"] });
        expect(normalizeComment(explicit)).toEqual(explicit);
    });
});

describe("commentsForView", () => {
    const comments = [
        comment("sch-path", "SCH", { page: "/root/power/" }),
        comment("sch-file", "SCH", { page: "power.kicad_sch" }),
        comment("sch-page", "SCH", { page: "2" }),
        comment("sch-other", "SCH", { page: "/root/mcu/" }),
        comment("sch-nopage", "SCH"),
        comment("pcb", "PCB", { layer: "F.Cu" }),
    ];

    it("keeps schematic comments on the active sheet by path, filename or page number", () => {
        expect(commentsForView(comments, "SCH", activePage).map((entry) => entry.id)).toEqual([
            "sch-path",
            "sch-file",
            "sch-page",
            "sch-nopage",
        ]);
    });

    it("keeps every schematic comment when no sheet is active", () => {
        expect(commentsForView(comments, "SCH", null).map((entry) => entry.id)).toEqual([
            "sch-path",
            "sch-file",
            "sch-page",
            "sch-other",
            "sch-nopage",
        ]);
    });

    it("never narrows PCB comments by page", () => {
        expect(commentsForView(comments, "PCB", activePage).map((entry) => entry.id)).toEqual(["pcb"]);
    });
});

describe("commentAnchor", () => {
    it("anchors to the source object when the comment was left on one", () => {
        expect(commentAnchor(comment("c1", "SCH", { page: "/root/" }, { elementId: "uuid-1" }))).toEqual({
            kind: "source-item",
            uuid: "uuid-1",
            page: "/root/",
        });
        expect(commentAnchor(comment("c2", "PCB", { layer: "B.Cu" }, { elementId: "fp-1" }))).toEqual({
            kind: "source-item",
            uuid: "fp-1",
            page: undefined,
        });
    });

    it("anchors to the world coordinate otherwise", () => {
        expect(commentAnchor(comment("c1", "SCH", { x: 1, y: 2, page: "/root/" }))).toEqual({
            kind: "world",
            x: 1,
            y: 2,
            page: "/root/",
        });
        expect(commentAnchor(comment("c2", "PCB", { x: 3, y: 4, layer: "F.Cu" }))).toEqual({
            kind: "world",
            x: 3,
            y: 4,
            page: undefined,
        });
    });

    it("treats an empty element id as no object", () => {
        expect(commentAnchor(comment("c1", "PCB", {}, { elementId: "" })).kind).toBe("world");
    });
});

describe("commentOverlaySet", () => {
    it("shapes one overlay per visible comment with its own identity in metadata", () => {
        const long = "x".repeat(120);
        const set = commentOverlaySet(
            [
                comment("obj", "SCH", { page: "/root/power/", bounds: [1, 2, 3, 4] }, { elementId: "sym-1" }),
                comment("world", "SCH", { x: 5, y: 6, page: "power.kicad_sch" }, { content: long }),
                comment("hidden", "SCH", { page: "/root/mcu/" }),
                comment("pcb", "PCB"),
            ],
            "SCH",
            activePage,
        );
        expect(set.context).toBe("SCH");
        expect(set.comments).toEqual([
            {
                id: "obj",
                anchor: { kind: "source-item", uuid: "sym-1", page: "/root/power/" },
                areaBounds: [1, 2, 3, 4],
                metadata: { commentId: "obj" },
                accessibilityLabel: "Comment obj",
            },
            {
                id: "world",
                anchor: { kind: "world", x: 5, y: 6, page: "power.kicad_sch" },
                areaBounds: undefined,
                metadata: { commentId: "world" },
                accessibilityLabel: "x".repeat(80),
            },
        ]);
    });

    it("produces an empty set for a view with no comments", () => {
        expect(commentOverlaySet([comment("sch", "SCH")], "PCB")).toEqual({ context: "PCB", comments: [] });
    });
});

describe("worldToViewportScreen", () => {
    it("offsets the viewer-local point by the viewer's viewport rectangle", () => {
        expect(worldToViewportScreen(locator({ x: 7, y: 9 }), 1, 2)).toEqual({ x: 107, y: 59 });
    });

    it("is null without a viewer", () => {
        expect(worldToViewportScreen(null, 1, 2)).toBeNull();
        expect(worldToViewportScreen(undefined, 1, 2)).toBeNull();
    });

    it("is null when the view cannot place the geometry", () => {
        expect(worldToViewportScreen(locator(null), 1, 2)).toBeNull();
    });
});

describe("commentScreenPosition", () => {
    it("projects the comment's own anchor point on either view", () => {
        const sch = comment("s", "SCH", { x: 1, y: 2, page: "/root/" });
        const pcb = comment("p", "PCB", { x: 3, y: 4, layer: "F.Cu" });
        const calls: Array<[number, number]> = [];
        const viewer: ScreenLocator = {
            getScreenLocation: (x, y) => {
                calls.push([x, y]);
                return { x: x * 10, y: y * 10 };
            },
            getBoundingClientRect: () => ({ left: 0, top: 1000 }),
        };
        expect(commentScreenPosition(viewer, sch)).toEqual({ x: 10, y: 1020 });
        expect(commentScreenPosition(viewer, pcb)).toEqual({ x: 30, y: 1040 });
        expect(calls).toEqual([
            [1, 2],
            [3, 4],
        ]);
    });

    it("is null for geometry the current view does not show", () => {
        expect(commentScreenPosition(locator(null), comment("s", "SCH"))).toBeNull();
        expect(commentScreenPosition(null, comment("p", "PCB"))).toBeNull();
    });
});

describe("commentIdFromOverlayHit", () => {
    const base = { context: "SCH" as const, x: 0, y: 0 };

    it("prefers the identity published in metadata", () => {
        expect(commentIdFromOverlayHit({ ...base, commentId: "viewer-id", metadata: { commentId: "ours" } })).toBe("ours");
    });

    it("falls back to the viewer's comment id", () => {
        expect(commentIdFromOverlayHit({ ...base, commentId: "viewer-id" })).toBe("viewer-id");
        expect(commentIdFromOverlayHit({ ...base, commentId: "viewer-id", metadata: null })).toBe("viewer-id");
        expect(commentIdFromOverlayHit({ ...base, commentId: "viewer-id", metadata: "opaque" })).toBe("viewer-id");
    });

    it("is null when neither names a comment", () => {
        expect(commentIdFromOverlayHit({ ...base, commentId: "" })).toBeNull();
        expect(commentIdFromOverlayHit({ ...base, commentId: "", metadata: {} })).toBeNull();
    });
});

describe("commentLocationFromArea", () => {
    it("carries the drawn area, page and layer into a comment location", () => {
        expect(
            commentLocationFromArea({
                context: "PCB",
                x: 1,
                y: 2,
                bounds: [1, 2, 3, 4],
                layer: "B.Cu",
            }),
        ).toEqual({ x: 1, y: 2, layer: "B.Cu", page: undefined, bounds: [1, 2, 3, 4] });
    });

    it("records an empty layer for a schematic area and keeps its page", () => {
        expect(
            commentLocationFromArea({
                context: "SCH",
                x: 1,
                y: 2,
                bounds: [1, 2, 3, 4],
                page: "/root/power/",
            }),
        ).toEqual({ x: 1, y: 2, layer: "", page: "/root/power/", bounds: [1, 2, 3, 4] });
    });
});
