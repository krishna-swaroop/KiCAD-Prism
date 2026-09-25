import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackerIssueAction } from "./tracker-issue-action";
import type { Comment } from "@/types/comments";

afterEach(cleanup);

function comment(): Comment {
    return {
        id: "comment-1", author: "Reviewer", timestamp: "2026-09-24T00:00:00Z",
        status: "OPEN", context: "PCB", location: { x: 1, y: 2, layer: "F.Cu" },
        content: "Review this", replies: [], commentClass: "general", severity: "info", mentions: [],
        permissions: { canPublish: true }, tracker: { provider: "github" },
    };
}

describe("TrackerIssueAction", () => {
    it("queues publication and exposes a confirmed issue without trusting an unsafe URL", async () => {
        const promote = vi.fn().mockResolvedValue(undefined);
        const { rerender } = render(<TrackerIssueAction comment={comment()} onPromote={promote} />);
        fireEvent.click(screen.getByRole("button", { name: "Create github issue" }));
        await waitFor(() => expect(promote).toHaveBeenCalledWith("comment-1"));

        rerender(<TrackerIssueAction comment={{ ...comment(), permissions: { canPublish: false },
            tracker: { linkState: "linked", syncState: "confirmed", externalUrl: "javascript:alert(1)" } }} />);
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByText("confirmed")).toBeInTheDocument();

        rerender(<TrackerIssueAction comment={{ ...comment(), permissions: { canPublish: false },
            tracker: { linkState: "linked", syncState: "confirmed",
                externalUrl: "https://github.com/acme/board/issues/42" } }} />);
        expect(screen.getByRole("link", { name: /open linked issue/i })).toHaveAttribute(
            "href", "https://github.com/acme/board/issues/42",
        );
    });
});
