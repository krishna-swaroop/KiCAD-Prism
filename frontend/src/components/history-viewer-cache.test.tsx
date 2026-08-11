import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HistoryViewer } from "./history-viewer";

vi.mock("./design-comparison/design-comparison-workspace", () => ({
    DesignComparisonWorkspace: () => (
        <div data-testid="comparison-workspace">comparison</div>
    ),
}));

function historyView(active: boolean) {
    return (
        <MemoryRouter
            initialEntries={[
                "/project/p1?section=history&base=base-sha&compare=compare-sha&view=semantic",
            ]}
        >
            <HistoryViewer
                projectId="p1"
                onViewCommit={vi.fn()}
                onOpenVisualizer={vi.fn()}
                canCompareDiffs
                canComment
                active={active}
            />
        </MemoryRouter>
    );
}

describe("cached history viewer", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            const payload = url.includes("/releases?")
                ? { releases: [], has_more: false }
                : { commits: [], has_more: false };
            return new Response(JSON.stringify(payload), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }));
    });

    it("retains loaded history while suppressing its portalled comparison when inactive", async () => {
        const view = render(historyView(true));

        await waitFor(() => {
            expect(screen.getByTestId("comparison-workspace")).toBeInTheDocument();
        });
        expect(fetch).toHaveBeenCalledTimes(2);

        view.rerender(historyView(false));
        expect(screen.queryByTestId("comparison-workspace")).not.toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(2);

        view.rerender(historyView(true));
        expect(screen.getByTestId("comparison-workspace")).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
