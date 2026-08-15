import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getBoardSpec = vi.fn();
const saveBoardSpec = vi.fn();
const extractBoardSpec = vi.fn();
const listRuns = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    getBoardSpec: (...a: unknown[]) => getBoardSpec(...a),
    saveBoardSpec: (...a: unknown[]) => saveBoardSpec(...a),
    extractBoardSpec: (...a: unknown[]) => extractBoardSpec(...a),
    listRuns: (...a: unknown[]) => listRuns(...a),
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { ProjectManufacturing } from "./project-manufacturing";

describe("ProjectManufacturing", () => {
    beforeEach(() => {
        getBoardSpec.mockResolvedValue({ project_id: "p1", specs: {}, source: {}, updated_at: null, updated_by: "" });
        listRuns.mockResolvedValue([]);
        saveBoardSpec.mockResolvedValue({ project_id: "p1", specs: {}, source: {}, updated_at: null, updated_by: "" });
        extractBoardSpec.mockResolvedValue({ suggested: {} });
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("shows spec groups and an empty runs state once loaded", async () => {
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText("Board specifications")).toBeTruthy());
        expect(screen.getByText("Stackup & physical")).toBeTruthy();
        expect(screen.getByText(/No runs yet/)).toBeTruthy();
    });

    it("hides edit controls when canEdit is false", async () => {
        render(<ProjectManufacturing projectId="p1" canEdit={false} />);
        await waitFor(() => expect(screen.getByText("Board specifications")).toBeTruthy());
        expect(screen.queryByRole("button", { name: /Extract from board/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull();
    });

    it("Save is disabled until a field changes", async () => {
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText("Board specifications")).toBeTruthy());
        const save = screen.getByRole("button", { name: /Save/ });
        expect(save).toHaveProperty("disabled", true);

        const layerCount = screen.getByLabelText(/Layer count/);
        fireEvent.change(layerCount, { target: { value: "4" } });
        expect(save).toHaveProperty("disabled", false);
    });

    it("extract fills fields and marks them as from the board", async () => {
        extractBoardSpec.mockResolvedValue({ suggested: { layer_count: 6, board_thickness_mm: 1.6 } });
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText("Board specifications")).toBeTruthy());

        fireEvent.click(screen.getByRole("button", { name: /Extract from board/ }));

        await waitFor(() => expect((screen.getByLabelText(/Layer count/) as HTMLInputElement).value).toBe("6"));
        // "from board" provenance badge appears for extracted fields.
        expect(screen.getAllByText("from board").length).toBeGreaterThan(0);
    });

    it("saves the current values", async () => {
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText("Board specifications")).toBeTruthy());

        fireEvent.change(screen.getByLabelText(/Layer count/), { target: { value: "2" } });
        fireEvent.click(screen.getByRole("button", { name: /Save/ }));

        await waitFor(() => expect(saveBoardSpec).toHaveBeenCalled());
        const [projectId, specs] = saveBoardSpec.mock.calls[0];
        expect(projectId).toBe("p1");
        expect(specs.layer_count).toBe(2);
    });
});
