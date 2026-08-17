import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ManufacturingRun, RunDefect } from "@/types/manufacturing";

const getRun = vi.fn();
const updateRun = vi.fn();
const updateRunStatus = vi.fn();
const logDefect = vi.fn();
const updateDefect = vi.fn();
const deleteDefect = vi.fn();
const uploadEvidence = vi.fn();
const deleteEvidence = vi.fn();
const deleteRun = vi.fn();
const previewSpecConfig = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    getRun: (...a: unknown[]) => getRun(...a),
    updateRun: (...a: unknown[]) => updateRun(...a),
    updateRunStatus: (...a: unknown[]) => updateRunStatus(...a),
    deleteRun: (...a: unknown[]) => deleteRun(...a),
    logDefect: (...a: unknown[]) => logDefect(...a),
    updateDefect: (...a: unknown[]) => updateDefect(...a),
    deleteDefect: (...a: unknown[]) => deleteDefect(...a),
    uploadEvidence: (...a: unknown[]) => uploadEvidence(...a),
    deleteEvidence: (...a: unknown[]) => deleteEvidence(...a),
    previewSpecConfig: (...a: unknown[]) => previewSpecConfig(...a),
    downloadRunReport: vi.fn(),
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
        release_tag: "",
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
    beforeEach(() => {
        previewSpecConfig.mockResolvedValue({ sections: [], errors: [] });
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    // Defects live under the Defects tab in the full-view layout.
    const goToDefects = () => fireEvent.click(screen.getByRole("button", { name: /Defects/ }));

    it("shows quantities and an empty defect state", async () => {
        getRun.mockResolvedValue(makeRun());
        render(<RunDetail runId="run_1" canEdit canLogDefects canChangeStatus onBack={vi.fn()} />);
        await waitFor(() => expect(screen.getByRole("heading", { name: "Board One" })).toBeTruthy());
        goToDefects();
        expect(screen.getByText(/No defects logged/)).toBeTruthy();
    });

    it("shows the frozen manufacturer spec on Overview", async () => {
        getRun.mockResolvedValue({
            ...makeRun(),
            spec_snapshot: {
                spec_config: "[Stackup]\nlayers: choice(2,4) | Layer count",
                specs: { layers: "4" },
                active_sections: [],
            },
        });
        previewSpecConfig.mockResolvedValue({
            sections: [
                {
                    title: "Stackup",
                    optional: false,
                    when: null,
                    fields: [
                        { key: "layers", label: "Layer count", type: "choice", options: ["2", "4"], default: "", when: null },
                    ],
                },
            ],
            errors: [],
        });
        render(<RunDetail runId="run_1" canEdit canLogDefects canChangeStatus onBack={vi.fn()} />);
        await waitFor(() => expect(screen.getByRole("heading", { name: "Board One" })).toBeTruthy());

        expect(await screen.findByText("Manufacturer spec at time of run")).toBeTruthy();
        expect(screen.getByText("Layer count")).toBeTruthy();
        expect(screen.getByText("4")).toBeTruthy();
        expect(previewSpecConfig).toHaveBeenCalledWith("[Stackup]\nlayers: choice(2,4) | Layer count");
    });

    it("fills a field's schema default when the snapshot didn't store its value", async () => {
        // An older run whose snapshot froze only one value; the other field falls
        // back to its schema default rather than showing blank.
        getRun.mockResolvedValue({
            ...makeRun(),
            spec_snapshot: {
                spec_config: "x",
                specs: { finish: "ENIG" },
                active_sections: [],
            },
        });
        previewSpecConfig.mockResolvedValue({
            sections: [
                {
                    title: "Base",
                    optional: false,
                    when: null,
                    fields: [
                        { key: "material", label: "Material", type: "choice", options: ["FR-4", "Flex"], default: "FR-4", when: null },
                        { key: "finish", label: "Finish", type: "choice", options: ["HASL", "ENIG"], default: "HASL", when: null },
                    ],
                },
            ],
            errors: [],
        });
        render(<RunDetail runId="run_1" canEdit canLogDefects canChangeStatus onBack={vi.fn()} />);
        await waitFor(() => expect(screen.getByRole("heading", { name: "Board One" })).toBeTruthy());

        expect(await screen.findByText("Material")).toBeTruthy();
        expect(screen.getByText("FR-4")).toBeTruthy(); // schema default, not blank
        expect(screen.getByText("ENIG")).toBeTruthy(); // stored value wins over default
    });

    it("logs a defect through the dialog", async () => {
        getRun.mockResolvedValue(makeRun());
        logDefect.mockResolvedValue({ id: "def_new" });
        render(<RunDetail runId="run_1" canEdit canLogDefects canChangeStatus onBack={vi.fn()} />);
        await waitFor(() => expect(screen.getByRole("heading", { name: "Board One" })).toBeTruthy());
        goToDefects();

        fireEvent.click(screen.getByRole("button", { name: /^Log defect$/ }));
        fireEvent.change(screen.getByLabelText("Units affected"), { target: { value: "3" } });
        fireEvent.change(screen.getByLabelText("Description"), { target: { value: "bridge on U2" } });
        fireEvent.click(screen.getAllByRole("button", { name: "Log defect" }).at(-1)!);

        await waitFor(() => expect(logDefect).toHaveBeenCalled());
        const [runId, body] = logDefect.mock.calls[0];
        expect(runId).toBe("run_1");
        expect(body.quantity_affected).toBe(3);
        expect(body.description).toBe("bridge on U2");
    });

    it("renders an existing defect and its resolve action", async () => {
        getRun.mockResolvedValue(makeRun([makeDefect()]));
        updateDefect.mockResolvedValue(undefined);
        render(<RunDetail runId="run_1" canEdit canLogDefects canChangeStatus onBack={vi.fn()} />);
        await waitFor(() => expect(screen.getByRole("heading", { name: "Board One" })).toBeTruthy());
        goToDefects();
        expect(screen.getByText("Soldering / assembly")).toBeTruthy();
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
                onBack={vi.fn()}
            />,
        );
        await waitFor(() => expect(screen.getByRole("heading", { name: "Board One" })).toBeTruthy());
        // Status editor lives in the header, editable by QA.
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
                onBack={vi.fn()}
            />,
        );
        await waitFor(() => expect(screen.getByRole("heading", { name: "Board One" })).toBeTruthy());
        // No status editor; the status shows as a static badge instead.
        expect(screen.queryByLabelText("Status")).toBeNull();
        expect(screen.getByText("Received")).toBeTruthy();
    });
});
