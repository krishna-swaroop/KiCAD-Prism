import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import type { ManufacturingRun } from "@/types/manufacturing";

const getRun = vi.fn();
const deleteRun = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    getRun: (...a: unknown[]) => getRun(...a),
    deleteRun: (...a: unknown[]) => deleteRun(...a),
    downloadRunReport: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

import { RunQuickView } from "./run-quick-view";

const inRouter = (node: ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

function makeRun(): ManufacturingRun {
    return {
        id: "run_1",
        project_id: "p1",
        project_name: "Board One",
        manufacturer_id: "m1",
        manufacturer_name: "Acme Fab",
        commit_sha: "abc1234def",
        release_tag: "",
        quantity_ordered: 100,
        quantity_good: 90,
        status: "received",
        notes: "",
        spec_snapshot: {},
        created_by: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        defects: [
            {
                id: "d1", run_id: "run_1", category: "soldering", severity: "major",
                quantity_affected: 5, description: "cold joints", status: "open",
                evidence: [], logged_by: "", created_at: "", resolved_at: null,
            },
        ],
    };
}

describe("RunQuickView", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("shows a run summary with project, manufacturer, quantities and defects", async () => {
        getRun.mockResolvedValue(makeRun());
        inRouter(<RunQuickView runId="run_1" onClose={vi.fn()} onOpenFull={vi.fn()} />);

        await waitFor(() => expect(screen.getByText("Board One")).toBeTruthy());
        // Appears in both the header subtitle and the Manufacturer row.
        expect(screen.getAllByText("Acme Fab").length).toBeGreaterThan(0);
        expect(screen.getByText("90 / 100")).toBeTruthy();
        expect(screen.getByText("Soldering / assembly")).toBeTruthy();
    });

    it("opens the full view and closes", async () => {
        getRun.mockResolvedValue(makeRun());
        const onOpenFull = vi.fn();
        const onClose = vi.fn();
        inRouter(<RunQuickView runId="run_1" onClose={onClose} onOpenFull={onOpenFull} />);
        await waitFor(() => expect(screen.getByText("Board One")).toBeTruthy());

        fireEvent.click(screen.getByRole("button", { name: /Open full view/ }));
        expect(onOpenFull).toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: /Close production quick view/ }));
        expect(onClose).toHaveBeenCalled();
    });

    it("shows an error with retry when the run fails to load", async () => {
        getRun.mockRejectedValue(new Error("boom"));
        inRouter(<RunQuickView runId="run_1" onClose={vi.fn()} onOpenFull={vi.fn()} />);
        await waitFor(() => expect(screen.getByText(/Could not load production/)).toBeTruthy());
        expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    });

    it("hides delete unless allowed, and opens a confirm when it is", async () => {
        getRun.mockResolvedValue(makeRun());
        const { unmount } = inRouter(<RunQuickView runId="run_1" onClose={vi.fn()} onOpenFull={vi.fn()} />);
        await waitFor(() => expect(screen.getByText("Board One")).toBeTruthy());
        expect(screen.queryByRole("button", { name: "Delete production" })).toBeNull();
        unmount();

        inRouter(<RunQuickView runId="run_1" canDelete onClose={vi.fn()} onOpenFull={vi.fn()} onDeleted={vi.fn()} />);
        await waitFor(() => expect(screen.getByText("Board One")).toBeTruthy());
        fireEvent.click(screen.getByRole("button", { name: "Delete production" }));
        expect(await screen.findByText("Delete production?")).toBeTruthy();
    });

    it("links a release to the project History at its commit", async () => {
        getRun.mockResolvedValue({ ...makeRun(), release_tag: "v1.2.0" });
        inRouter(<RunQuickView runId="run_1" onClose={vi.fn()} onOpenFull={vi.fn()} />);
        await waitFor(() => expect(screen.getByText("Board One")).toBeTruthy());

        const link = screen.getByRole("link", { name: /v1.2.0/ });
        expect(link.getAttribute("href")).toBe("/project/p1?section=history&commit=abc1234def");
    });
});
