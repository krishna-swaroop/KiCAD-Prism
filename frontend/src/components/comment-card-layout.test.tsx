import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommentCard, authorInitials, cardPlacement, relativeTime } from "./comment-card";
import type { Comment, CommentReply } from "@/types/comments";

// TR-46 live finding: the floating card overflowed the viewport on long
// threads and its scroll region sat off-screen. The card now derives its
// max-height from where it is placed, keeps the composer pinned, and shows
// the thread as one identity-led list instead of a wall of badges.

const reply = (overrides: Partial<CommentReply> = {}): CommentReply => ({
    id: "r_1",
    author: "Alex Chen",
    authorUserId: "u_alex",
    authorKind: "user",
    timestamp: "2026-09-21T09:00:00Z",
    updatedAt: "2026-09-21T09:00:00Z",
    revision: 1,
    content: "Looks fine to me.",
    origin: "prism",
    ...overrides,
});

const comment = (overrides: Partial<Comment> = {}): Comment => ({
    id: "c1",
    author: "Priya Natarajan",
    authorUserId: "u_priya",
    authorKind: "user",
    timestamp: "2026-09-21T08:00:00Z",
    updatedAt: "2026-09-21T08:00:00Z",
    revision: 3,
    status: "OPEN",
    context: "PCB",
    location: { x: 1, y: 2, layer: "F.Cu" },
    content: "Check this footprint.",
    replies: [],
    elementRef: "R12",
    anchor: { state: "unpinned" },
    commentClass: "task",
    severity: "major",
    mentions: [{ userId: "u_alex", displayName: "Alex Chen" }],
    permissions: { canReply: true, canEdit: true, canDelete: true, canResolve: true, canPublish: false },
    ...overrides,
});

function renderCard(overrides: Partial<Comment> = {}, position: { x: number; y: number } | null = { x: 40, y: 40 }) {
    const onResolve = vi.fn();
    render(
        <CommentCard
            comment={comment(overrides)}
            screenPosition={position}
            onClose={vi.fn()}
            onResolve={onResolve}
            onReply={vi.fn().mockResolvedValue(undefined)}
            onDelete={vi.fn().mockResolvedValue(undefined)}
            onEdit={vi.fn().mockResolvedValue(undefined)}
        />,
    );
    return { onResolve };
}

afterEach(cleanup);

describe("cardPlacement", () => {
    const viewport = { width: 1280, height: 800 };

    it("sits beside the marker and caps height to the room below its top edge", () => {
        const placed = cardPlacement({ x: 100, y: 500 }, viewport);
        expect(placed.left).toBe(112);
        expect(placed.top).toBe(492);
        expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(viewport.height - 8);
    });

    it("never places the card lower than a minimum-height card can fit", () => {
        const placed = cardPlacement({ x: 100, y: 790 }, viewport);
        expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(viewport.height - 8);
        expect(placed.maxHeight).toBeGreaterThanOrEqual(260);
    });

    it("flips to the left of a marker near the right edge", () => {
        const placed = cardPlacement({ x: 1200, y: 100 }, viewport);
        expect(placed.left + 336).toBeLessThanOrEqual(1200);
        expect(placed.left).toBeGreaterThanOrEqual(8);
    });

    it("centres and fits when there is no marker position", () => {
        const placed = cardPlacement(null, { width: 900, height: 500 });
        expect(placed.left).toBe(282);
        expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(492);
    });
});

describe("relativeTime / authorInitials", () => {
    it("renders compact relative timestamps", () => {
        const now = new Date("2026-09-21T12:00:00Z");
        expect(relativeTime("2026-09-21T11:59:50Z", now)).toBe("just now");
        expect(relativeTime("2026-09-21T11:30:00Z", now)).toBe("30m ago");
        expect(relativeTime("2026-09-21T06:00:00Z", now)).toBe("6h ago");
        expect(relativeTime("2026-09-18T12:00:00Z", now)).toBe("3d ago");
        expect(relativeTime("not a date", now)).toBe("");
    });

    it("derives initials from names, handles and emails", () => {
        expect(authorInitials("Priya Natarajan")).toBe("PN");
        expect(authorInitials("Alexandria")).toBe("AL");
        expect(authorInitials("krishna-swaroop")).toBe("KS");
        expect(authorInitials("")).toBe("?");
    });
});

describe("CommentCard layout", () => {
    it("caps the dialog height from its placement and scrolls only the discussion", () => {
        renderCard({}, { x: 100, y: 500 });
        const dialog = screen.getByRole("dialog", { name: "Comment details" }) as HTMLDialogElement;
        const placed = cardPlacement({ x: 100, y: 500 }, { width: window.innerWidth, height: window.innerHeight });
        expect(dialog.style.maxHeight).toBe(`${placed.maxHeight}px`);
        expect(dialog.style.top).toBe(`${placed.top}px`);
        expect(dialog.className).toContain("overflow-hidden");
        expect(screen.getByTestId("comment-card-scroll").className).toContain("overflow-y-auto");
    });

    it("shows identity, one quiet meta line and the body in body type", () => {
        renderCard();
        expect(screen.getByText("Priya Natarajan")).toBeTruthy();
        expect(screen.getByTestId("comment-meta-line").textContent).toMatch(/ago.*Major.*Task.*R12/);
        // Metadata is plain text, not a wall of badges.
        expect(document.querySelectorAll('[data-testid="comment-meta-line"] [data-slot="badge"]').length).toBe(0);
        expect(screen.getByTestId("comment-body").className).toContain("text-sm");
        expect(screen.getByTestId("comment-mentions").textContent).toBe("@Alex Chen");
        expect(screen.queryByTestId("comment-status-pill")).toBeNull();
    });

    it("marks resolved threads with a pill and a reopen action instead of dimming", () => {
        const { onResolve } = renderCard({ status: "RESOLVED" });
        expect(screen.getByTestId("comment-status-pill").textContent).toMatch(/resolved/i);
        const dialog = screen.getByRole("dialog", { name: "Comment details" });
        expect(dialog.className).not.toContain("opacity-");
        fireEvent.click(screen.getByRole("button", { name: "Reopen comment" }));
        expect(onResolve).toHaveBeenCalledWith("c1", false);
    });

    it("lists replies with attribution and keeps the composer pinned outside the scroll region", () => {
        renderCard({
            replies: [
                reply(),
                reply({
                    id: "r_2",
                    author: "krishna-swaroop",
                    authorKind: "remote",
                    origin: "remote",
                    content: "From the forge",
                    remoteAttribution: { provider: "github", login: "krishna-swaroop", url: "https://github.com/krishna-swaroop" },
                }),
            ],
        });
        expect(screen.getByTestId("comment-replies").querySelectorAll("li").length).toBe(2);
        expect(screen.getByTestId("reply-attribution").textContent).toBe("Alex Chen");
        expect(screen.getByTestId("reply-attribution-link").textContent).toBe("krishna-swaroop on GitHub");
        const scroll = screen.getByTestId("comment-card-scroll");
        const composer = screen.getByRole("button", { name: "Reply" });
        expect(scroll.contains(composer)).toBe(false);
        fireEvent.click(composer);
        expect(scroll.contains(screen.getByRole("textbox", { name: "Reply" }))).toBe(false);
    });

    it("hides the composer entirely when the caller cannot reply", () => {
        renderCard({ permissions: { canReply: false, canEdit: false, canDelete: false, canResolve: false, canPublish: false } });
        expect(screen.queryByRole("button", { name: "Reply" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Edit comment" })).toBeNull();
    });
});
