import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const extractBoardSpec = vi.fn();
const listRuns = vi.fn();
const listManufacturers = vi.fn();
const listProjectManufacturers = vi.fn();
const attachManufacturer = vi.fn();
const detachManufacturer = vi.fn();
const listProjectSpecs = vi.fn();
const getProjectSpec = vi.fn();
const createProjectSpec = vi.fn();
const updateProjectSpec = vi.fn();
const deleteProjectSpec = vi.fn();
const listTemplates = vi.fn();
const downloadSpecSheet = vi.fn();
const getTemplate = vi.fn();
const getPcbRuleFields = vi.fn();
const extractPcbRules = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    extractBoardSpec: (...a: unknown[]) => extractBoardSpec(...a),
    listRuns: (...a: unknown[]) => listRuns(...a),
    listManufacturers: (...a: unknown[]) => listManufacturers(...a),
    listProjectManufacturers: (...a: unknown[]) => listProjectManufacturers(...a),
    attachManufacturer: (...a: unknown[]) => attachManufacturer(...a),
    detachManufacturer: (...a: unknown[]) => detachManufacturer(...a),
    listProjectSpecs: (...a: unknown[]) => listProjectSpecs(...a),
    getProjectSpec: (...a: unknown[]) => getProjectSpec(...a),
    createProjectSpec: (...a: unknown[]) => createProjectSpec(...a),
    updateProjectSpec: (...a: unknown[]) => updateProjectSpec(...a),
    deleteProjectSpec: (...a: unknown[]) => deleteProjectSpec(...a),
    getTemplate: (...a: unknown[]) => getTemplate(...a),
    listTemplates: (...a: unknown[]) => listTemplates(...a),
    downloadSpecSheet: (...a: unknown[]) => downloadSpecSheet(...a),
    getPcbRuleFields: (...a: unknown[]) => getPcbRuleFields(...a),
    extractPcbRules: (...a: unknown[]) => extractPcbRules(...a),
    previewSpecConfig: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Radix Dialog (the Add-spec dialog) needs these in jsdom.
vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
});
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}

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
            when: null,
            fields: [
                { key: "layer_count", label: "Layer count", type: "int", options: [], default: null, when: null },
                { key: "board_thickness_mm", label: "Board thickness", type: "number", options: [], default: null, when: null },
            ],
        },
    ],
    errors: [],
};

// Build a project spec payload (what getProjectSpec returns) with a given schema/values.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSpec(parsed: any = SCHEMA, specs: Record<string, unknown> = {}, active_sections: string[] = []) {
    return {
        id: "spec_1", project_id: "p1", manufacturer_id: "m1", manufacturer_name: "Acme Fab",
        name: "Default", spec_config: "x", specs, source: {}, active_sections,
        updated_at: null, updated_by: "", parsed,
    };
}

describe("ProjectManufacturing", () => {
    beforeEach(() => {
        listManufacturers.mockResolvedValue([{ id: "m1", name: "Acme Fab", contact: "", website: "", notes: "", created_at: "", updated_at: "" }]);
        listProjectManufacturers.mockResolvedValue([
            { id: "m1", name: "Acme Fab", contact: "", website: "", notes: "", created_at: "", updated_at: "", attached_at: "" },
        ]);
        listProjectSpecs.mockResolvedValue([
            { id: "spec_1", project_id: "p1", manufacturer_id: "m1", name: "Default", spec_config: "x", specs: {}, source: {}, active_sections: [], updated_at: null, updated_by: "" },
        ]);
        getProjectSpec.mockResolvedValue(makeSpec());
        listTemplates.mockResolvedValue([]);
        listRuns.mockResolvedValue([]);
        updateProjectSpec.mockResolvedValue(undefined);
        extractBoardSpec.mockResolvedValue({ suggested: {} });
        getPcbRuleFields.mockResolvedValue([]);
        extractPcbRules.mockResolvedValue({ rules: {} });
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    // The form appears once the first manufacturer + spec auto-select and load.
    const waitForForm = () => waitFor(() => expect(screen.getByLabelText(/Layer count/)).toBeTruthy());

    it("shows the manufacturer, its spec, and an empty runs state", async () => {
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText("Manufacturers")).toBeTruthy());
        await waitForForm();
        expect(screen.getByText("Stackup & physical")).toBeTruthy();
        expect(screen.getByText(/No runs yet/)).toBeTruthy();
    });

    it("shows an empty state when the project has no manufacturers", async () => {
        listProjectManufacturers.mockResolvedValue([]);
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText(/No manufacturers yet/)).toBeTruthy());
    });

    it("shows the selected spec's linked-template capabilities read-only", async () => {
        getPcbRuleFields.mockResolvedValue([
            { key: "min_track_width", label: "Min track width", type: "number", unit: "mm" },
            { key: "allow_microvias", label: "Microvias", type: "bool" },
        ]);
        // The spec carries its linked template's capabilities (from getProjectSpec).
        getProjectSpec.mockResolvedValue({
            ...makeSpec(),
            template_name: "flex",
            template_capabilities: { min_track_width: 0.127, allow_microvias: true },
        });
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText("Capabilities")).toBeTruthy());

        // The linked template's capability values render in the read-only table.
        expect(await screen.findByText("Min track width")).toBeTruthy();
        expect(screen.getByText("0.127 mm")).toBeTruthy();
        expect(screen.getByText("Yes")).toBeTruthy();
    });

    it("quick-adds a spec from a manufacturer schema, named after it", async () => {
        listTemplates.mockResolvedValue([
            { id: "tmpl_1", manufacturer_id: "m1", manufacturer_name: "Acme Fab", name: "Acme standard", spec_config: "[X]\nk: int | K", created_at: "", updated_at: "" },
        ]);
        getTemplate.mockResolvedValue({ id: "tmpl_1", manufacturer_id: "m1", name: "Acme standard", spec_config: "[X]\nk: int | K", created_at: "", updated_at: "" });
        createProjectSpec.mockResolvedValue({ id: "spec_2" });
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitForForm();

        // Picking the schema from the "Add schema" dropdown creates the spec at once,
        // no naming step.
        fireEvent.change(screen.getByLabelText("Add a schema"), { target: { value: "tmpl_1" } });

        await waitFor(() => expect(createProjectSpec).toHaveBeenCalled());
        expect(getTemplate).toHaveBeenCalledWith("tmpl_1");
        const [projectId, body] = createProjectSpec.mock.calls[0];
        expect(projectId).toBe("p1");
        expect(body).toMatchObject({ manufacturer_id: "m1", name: "Acme standard", spec_config: "[X]\nk: int | K" });
    });

    it("hides edit controls when canEdit is false", async () => {
        render(<ProjectManufacturing projectId="p1" canEdit={false} />);
        await waitForForm();
        expect(screen.queryByRole("button", { name: /Extract from board/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull();
    });

    it("Save is disabled until a field changes", async () => {
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitForForm();
        const save = screen.getByRole("button", { name: /Save/ });
        expect(save).toHaveProperty("disabled", true);

        fireEvent.change(screen.getByLabelText(/Layer count/), { target: { value: "4" } });
        expect(save).toHaveProperty("disabled", false);
    });

    it("extract fills fields from the board", async () => {
        extractBoardSpec.mockResolvedValue({ suggested: { layer_count: 6, board_thickness_mm: 1.6 } });
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitForForm();

        fireEvent.click(screen.getByRole("button", { name: /Extract from board/ }));
        await waitFor(() => expect((screen.getByLabelText(/Layer count/) as HTMLInputElement).value).toBe("6"));
    });

    it("an extracted number selects its option in a choice field", async () => {
        const choiceSchema = {
            sections: [
                {
                    title: "Base",
                    optional: false,
                    when: null,
                    fields: [
                        { key: "layer_count", label: "Layers", type: "choice", options: ["1", "2", "4", "6"], default: null, when: null },
                    ],
                },
            ],
            errors: [],
        };
        getProjectSpec.mockResolvedValue(makeSpec(choiceSchema));
        extractBoardSpec.mockResolvedValue({ suggested: { layer_count: 4 } });

        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByLabelText("Layers")).toBeTruthy());
        expect((screen.getByLabelText("Layers") as HTMLSelectElement).value).toBe("");

        fireEvent.click(screen.getByRole("button", { name: /Extract from board/ }));
        await waitFor(() => expect((screen.getByLabelText("Layers") as HTMLSelectElement).value).toBe("4"));
    });

    it("collapses a section when its header is clicked", async () => {
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitForForm();

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
                    when: null,
                    fields: [{ key: "smt_parts", label: "SMT parts", type: "int", options: [], default: null, when: null }],
                },
            ],
            errors: [],
        };
        getProjectSpec.mockResolvedValue(makeSpec(withOptional));

        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText("Assembly")).toBeTruthy());
        expect(screen.queryByLabelText(/SMT parts/)).toBeNull();

        fireEvent.click(screen.getByRole("switch"));
        await waitFor(() => expect(screen.getByLabelText(/SMT parts/)).toBeTruthy());
    });

    it("persists active sections when saving", async () => {
        const withOptional = {
            sections: [...SCHEMA.sections, { title: "Assembly", optional: true, when: null, fields: [] }],
            errors: [],
        };
        getProjectSpec.mockResolvedValue(makeSpec(withOptional));

        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByText("Assembly")).toBeTruthy());

        fireEvent.click(screen.getByRole("switch")); // turn Assembly on
        fireEvent.click(screen.getByRole("button", { name: /Save/ }));

        await waitFor(() => expect(updateProjectSpec).toHaveBeenCalled());
        const [specId, body] = updateProjectSpec.mock.calls[0];
        expect(specId).toBe("spec_1");
        expect(body.active_sections).toContain("Assembly");
    });

    it("gates a field on another field's value", async () => {
        const gated = {
            sections: [
                {
                    title: "Base",
                    optional: false,
                    when: null,
                    fields: [
                        { key: "material", label: "Material", type: "choice", options: ["FR-4", "Flex"], default: "Flex", when: null },
                        {
                            key: "inner_copper",
                            label: "Inner copper",
                            type: "choice",
                            options: ["1", "2"],
                            default: null,
                            when: { key: "material", op: "=", values: ["FR-4"] },
                        },
                    ],
                },
            ],
            errors: [],
        };
        getProjectSpec.mockResolvedValue(makeSpec(gated, { material: "Flex" }));

        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitFor(() => expect(screen.getByLabelText("Material")).toBeTruthy());
        expect(screen.queryByLabelText("Inner copper")).toBeNull();

        fireEvent.change(screen.getByLabelText("Material"), { target: { value: "FR-4" } });
        await waitFor(() => expect(screen.getByLabelText("Inner copper")).toBeTruthy());
    });

    it("saves the current values to the selected spec", async () => {
        render(<ProjectManufacturing projectId="p1" canEdit />);
        await waitForForm();

        fireEvent.change(screen.getByLabelText(/Layer count/), { target: { value: "2" } });
        fireEvent.click(screen.getByRole("button", { name: /Save/ }));

        await waitFor(() => expect(updateProjectSpec).toHaveBeenCalled());
        const [specId, body] = updateProjectSpec.mock.calls[0];
        expect(specId).toBe("spec_1");
        expect((body.specs as Record<string, unknown>).layer_count).toBe(2);
    });
});
