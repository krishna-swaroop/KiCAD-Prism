import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ReplyTrackerState } from "./reply-tracker-state";

afterEach(cleanup);

const base = { id: "r_1", author: "Ana", timestamp: "2026-09-24T00:00:00Z", content: "hi" };

it("renders nothing for an ordinary Prism reply", () => {
    const { container } = render(<ReplyTrackerState reply={base} provider="github" />);
    expect(container.textContent).toBe("");
});

it("links an imported reply back to the issue comment", () => {
    render(<ReplyTrackerState provider="github" reply={{
        ...base, origin: "remote",
        sync: { state: "confirmed", externalUrl: "https://github.com/o/r/issues/1#issuecomment-2" },
    }} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://github.com/o/r/issues/1#issuecomment-2");
});

it("offers Share only when the server grants it, and passes the reply id", async () => {
    const onShare = vi.fn().mockResolvedValue(undefined);
    const unsynced = { ...base, sync: { state: "unsynced_local" } };
    const { rerender } = render(<ReplyTrackerState reply={unsynced} provider="github" onShare={onShare} />);
    expect(screen.getByText("Not shared to the github issue")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<ReplyTrackerState reply={{ ...unsynced, permissions: { canShare: true } }} provider="github" onShare={onShare} />);
    fireEvent.click(screen.getByRole("button", { name: /Share to github/ }));
    await waitFor(() => expect(onShare).toHaveBeenCalledWith("r_1"));
});
