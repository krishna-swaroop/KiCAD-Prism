import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getBoardSpec = vi.fn();
const saveBoardSpec = vi.fn();
const extractBoardSpec = vi.fn();
const listRuns = vi.fn();
const getSpecConfig = vi.fn();
const saveSpecConfig = vi.fn();
const listTemplates = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    getBoardSpec: (...a: unknown[]) => getBoardSpec(...a),
    saveBoardSpec: (...a: unknown[]) => saveBoardSpec(...a),
    extractBoardSpec: (...a: unknown[]) => extractBoardSpec(...a),
    listRuns: (...a: unknown[]) => listRuns(...a),
    getSpecConfig: (...a: unknown[]) => getSpecConfig(...a),
    saveSpecConfig: (...a: unknown[]) => saveSpecConfig(...a),
    listTemplates: (...a: unknown[]) => listTemplates(...a),
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// The schema editor is a child; stub it so this suite stays focused on the form.
vi.mock("./spec-config-editor", () => ({
    SpecConfigEditor: () => null,
}));

import { ProjectManufacturing } from "./project-manufacturing";

// A parsed schema with the two fields the tests exercise.
const SCHEMA = {
    sections: [
        {
            title: "Stackup & physical",
            optional: false,
            fields: [
                { key: "layer_count", label: "Layer count", type: "int", options: [], default: null },
                { key: "board_thickness_mm", label: "Board thickness", type: "number", options: [], default: null },
            ],
        },
    ],
    errors: [],
};

describe("ProjectManufacturing", () => {
    beforeEach(() => {
        getBoardSpec.mockResolvedValue({ project_id: "p1", specs: {}, source: {}, active_sections: [], updated_at: null, updated_by: "" });
        getSpecConfig.mockResolvedValue({ spec_config: "[Stackup & physical]\nlayer_count: int", parsed: SCHEMA });
        saveSpecConfig.mockResolvedValue({ spec_config: "", parsed: SCHEMA });
        listTemplates.mockResolvedValue([]);
        listRuns.mockResolvedValue([]);
        saveBoardSpec.mockResolvedValue({ project_id: "p1", specs: {}, source: {}, active_sections: [], updated_at: null, updated_by: "" });
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

    it("collapses a section when its header is clicked", async () => {
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByLabelText(/Layer count/)).toBeTruthy());

        // Clicking the section header hides its fields.
        fireEvent.click(screen.getByRole("button", { name: /Stackup & physical/ }));
        await waitFor(() => expect(screen.queryByLabelText(/Layer count/)).toBeNull());
    });

    it("optional sections start off and their fields appear once toggled on", async () => {
        const withOptional = {
            sections: [
                ...SCHEMA.sections,
                {
                    title: "Assembly",
                    optional: true,
                    fields: [{ key: "smt_parts", label: "SMT parts", type: "int", options: [], default: null }],
                },
            ],
            errors: [],
        };
        getSpecConfig.mockResolvedValue({ spec_config: "x", parsed: withOptional });

        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText("Assembly")).toBeTruthy());
        // Off by default: its field is hidden.
        expect(screen.queryByLabelText(/SMT parts/)).toBeNull();

        // The On/Off toggle activates it.
        const toggle = screen.getByRole("checkbox");
        fireEvent.click(toggle);
        await waitFor(() => expect(screen.getByLabelText(/SMT parts/)).toBeTruthy());
    });

    it("persists active sections when saving", async () => {
        const withOptional = {
            sections: [
                ...SCHEMA.sections,
                { title: "Assembly", optional: true, fields: [] },
            ],
            errors: [],
        };
        getSpecConfig.mockResolvedValue({ spec_config: "x", parsed: withOptional });

        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText("Assembly")).toBeTruthy());

        fireEvent.click(screen.getByRole("checkbox")); // turn Assembly on
        fireEvent.click(screen.getByRole("button", { name: /Save/ }));

        await waitFor(() => expect(saveBoardSpec).toHaveBeenCalled());
        const activeSections = saveBoardSpec.mock.calls[0][3];
        expect(activeSections).toContain("Assembly");
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
