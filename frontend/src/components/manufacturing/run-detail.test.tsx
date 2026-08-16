import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ManufacturingRun, RunDefect } from "@/types/manufacturing";

const getRun = vi.fn();
const updateRun = vi.fn();
const updateRunStatus = vi.fn();
const logDefect = vi.fn();
const updateDefect = vi.fn();
const deleteDefect = vi.fn();
const uploadEvidence = vi.fn();
const deleteEvidence = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    getRun: (...a: unknown[]) => getRun(...a),
    updateRun: (...a: unknown[]) => updateRun(...a),
    updateRunStatus: (...a: unknown[]) => updateRunStatus(...a),
    logDefect: (...a: unknown[]) => logDefect(...a),
    updateDefect: (...a: unknown[]) => updateDefect(...a),
    deleteDefect: (...a: unknown[]) => deleteDefect(...a),
    uploadEvidence: (...a: unknown[]) => uploadEvidence(...a),
    deleteEvidence: (...a: unknown[]) => deleteEvidence(...a),
    evidenceUrl: (runId: string, digest: string) => `/api/x/${runId}/${digest}`,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

import { RunDetail } from "./run-detail";

function makeRun(defects: RunDefect[] = []): ManufacturingRun {
    return {
        id: "run_1",
        project_id: "p1",
        project_name: "Board One",
        manufacturer_id: null,
        manufacturer_name: null,
        commit_sha: "",
        quantity_ordered: 100,
        quantity_good: 90,
        status: "received",
        notes: "",
        spec_snapshot: {},
        created_by: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        defects,
    };
}

function makeDefect(overrides: Partial<RunDefect> = {}): RunDefect {
    return {
        id: "def_1",
        run_id: "run_1",
        category: "soldering",
        severity: "major",
        quantity_affected: 5,
        description: "cold joints",
        status: "open",
        evidence: [],
        logged_by: "qa@x",
        created_at: new Date().toISOString(),
        resolved_at: null,
        ...overrides,
    };
}

describe("RunDetail", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("shows quantities and an empty defect state", async () => {
        getRun.mockResolvedValue(makeRun());
        render(<RunDetail runId="run_1" canEdit canLogDefects canChangeStatus manufacturers={[]} onBack={vi.fn()} />);
        await waitFor(() => expect(screen.getByText("Board One")).toBeTruthy());
        expect(screen.getByText(/No defects logged/)).toBeTruthy();
    });

    it("logs a defect through the dialog", async () => {
        getRun.mockResolvedValue(makeRun());
        logDefect.mockResolvedValue({ id: "def_new" });
        render(<RunDetail runId="run_1" canEdit canLogDefects canChangeStatus manufacturers={[]} onBack={vi.fn()} />);
        await waitFor(() => expect(screen.getByText("Board One")).toBeTruthy());

        fireEvent.click(screen.getByRole("button", { name: /Log defect/ }));
        fireEvent.change(screen.getByLabelText("Units affected"), { target: { value: "3" } });
        fireEvent.change(screen.getByLabelText("Description"), { target: { value: "bridge on U2" } });
        fireEvent.click(screen.getByRole("button", { name: "Log defect" }));

        await waitFor(() => expect(logDefect).toHaveBeenCalled());
        const [runId, body] = logDefect.mock.calls[0];
        expect(runId).toBe("run_1");
        expect(body.quantity_affected).toBe(3);
        expect(body.description).toBe("bridge on U2");
    });

    it("renders an existing defect and its resolve action", async () => {
        getRun.mockResolvedValue(makeRun([makeDefect()]));
        updateDefect.mockResolvedValue(undefined);
        render(<RunDetail runId="run_1" canEdit canLogDefects canChangeStatus manufacturers={[]} onBack={vi.fn()} />);
        await waitFor(() => expect(screen.getByText("Soldering / assembly")).toBeTruthy());
        expect(screen.getByText("cold joints")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
        await waitFor(() => expect(updateDefect).toHaveBeenCalledWith("def_1", { status: "resolved" }));
    });

    it("a QA user can change status even without run-edit rights", async () => {
        getRun.mockResolvedValue(makeRun());
        updateRunStatus.mockResolvedValue(undefined);
        render(
            <RunDetail
                runId="run_1"
                canEdit={false}
                canLogDefects
                canChangeStatus
                manufacturers={[]}
                onBack={vi.fn()}
            />,
        );
        await waitFor(() => expect(screen.getByText("Board One")).toBeTruthy());
        // QA can log defects and edit the status via its dedicated endpoint.
        expect(screen.getByRole("button", { name: /Log defect/ })).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Status"), { target: { value: "closed" } });
        await waitFor(() => expect(updateRunStatus).toHaveBeenCalledWith("run_1", "closed"));
    });

    it("a user without QA rights sees status read-only", async () => {
        getRun.mockResolvedValue(makeRun());
        render(
            <RunDetail
                runId="run_1"
                canEdit
                canLogDefects={false}
                canChangeStatus={false}
                manufacturers={[]}
                onBack={vi.fn()}
            />,
        );
        await waitFor(() => expect(screen.getByText("Board One")).toBeTruthy());
        // No status editor; the status shows as a static badge instead.
        expect(screen.queryByLabelText("Status")).toBeNull();
        expect(screen.getByText("Received")).toBeTruthy();
    });
});
