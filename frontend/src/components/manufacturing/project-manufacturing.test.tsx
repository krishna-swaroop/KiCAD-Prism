import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const extractBoardSpec = vi.fn();
const listRuns = vi.fn();
const listManufacturers = vi.fn();
const listProjectManufacturers = vi.fn();
const attachManufacturer = vi.fn();
const detachManufacturer = vi.fn();
const getProjectSpecForManufacturer = vi.fn();
const getProjectSpec = vi.fn();
const updateProjectSpec = vi.fn();
const updateTemplate = vi.fn();
const listTemplates = vi.fn();
const applyTemplateToSpec = vi.fn();
const downloadSpecSheet = vi.fn();
const getTemplate = vi.fn();
const getPcbRuleFields = vi.fn();
const extractPcbRules = vi.fn();
const createManufacturer = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    extractBoardSpec: (...a: unknown[]) => extractBoardSpec(...a),
    listRuns: (...a: unknown[]) => listRuns(...a),
    listManufacturers: (...a: unknown[]) => listManufacturers(...a),
    listProjectManufacturers: (...a: unknown[]) => listProjectManufacturers(...a),
    attachManufacturer: (...a: unknown[]) => attachManufacturer(...a),
    detachManufacturer: (...a: unknown[]) => detachManufacturer(...a),
    getProjectSpecForManufacturer: (...a: unknown[]) => getProjectSpecForManufacturer(...a),
    getProjectSpec: (...a: unknown[]) => getProjectSpec(...a),
    updateProjectSpec: (...a: unknown[]) => updateProjectSpec(...a),
    updateTemplate: (...a: unknown[]) => updateTemplate(...a),
    getTemplate: (...a: unknown[]) => getTemplate(...a),
    listTemplates: (...a: unknown[]) => listTemplates(...a),
    applyTemplateToSpec: (...a: unknown[]) => applyTemplateToSpec(...a),
    downloadSpecSheet: (...a: unknown[]) => downloadSpecSheet(...a),
    getPcbRuleFields: (...a: unknown[]) => getPcbRuleFields(...a),
    extractPcbRules: (...a: unknown[]) => extractPcbRules(...a),
    createManufacturer: (...a: unknown[]) => createManufacturer(...a),
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
    SchemaCapabilitiesDialog: () => null,
}));

// The drawer and the dialog are children with their own suites; stub them to see what the tab hands them.
vi.mock("./run-drawer", () => ({
    RunDrawer: (props: { runId: string | null; projectLink?: boolean }) =>
        props.runId ? <div data-project-link={String(props.projectLink)}>drawer:{props.runId}</div> : null,
}));
vi.mock("./new-production-dialog", () => ({
    NewProductionDialog: (props: { initialProjectId?: string; initialManufacturerId?: string; projects: { name: string }[]; onCreated: (id: string) => void }) => (
        <div>
            dialog:{props.initialProjectId}:{props.initialManufacturerId ?? "none"}:{props.projects[0]?.name}
            <button type="button" onClick={() => props.onCreated("run_new")}>finish</button>
        </div>
    ),
}));

import { ProjectManufacturing } from "./project-manufacturing";

const renderTab = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

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
function makeSpec(parsed: unknown = SCHEMA, specs: Record<string, unknown> = {}, active_sections: string[] = []) {
    return {
        id: "spec_1", project_id: "p1", manufacturer_id: "m1", manufacturer_name: "Acme Fab",
        name: "Default", spec_config: "x", specs, source: {}, active_sections,
        updated_at: null, updated_by: "", parsed,
    };
}


const MFR = { contact: "", website: "", notes: "", created_at: "", updated_at: "", attached_at: "" };

function run(overrides: Record<string, unknown> = {}) {
    return {
        id: "run_1", job_number: "JOB-2026-0001", project_id: "p1", manufacturer_id: "m1",
        manufacturer_name: "Acme Fab", commit_sha: "", release_tag: "", quantity_ordered: 50,
        quantity_good: 48, status: "received", notes: "", spec_snapshot: {}, created_by: "",
        created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", ...overrides,
    };
}

describe("ProjectManufacturing", () => {
    beforeEach(() => {
        listManufacturers.mockResolvedValue([{ id: "m1", name: "Acme Fab", ...MFR }]);
        listProjectManufacturers.mockResolvedValue([{ id: "m1", name: "Acme Fab", ...MFR }]);
        getProjectSpecForManufacturer.mockResolvedValue(makeSpec());
        getProjectSpec.mockResolvedValue(makeSpec());
        listTemplates.mockResolvedValue([]);
        applyTemplateToSpec.mockResolvedValue(undefined);
        listRuns.mockResolvedValue([]);
        updateProjectSpec.mockResolvedValue(undefined);
        extractBoardSpec.mockResolvedValue({ suggested: {} });
        getPcbRuleFields.mockResolvedValue({ fields: [] });
        extractPcbRules.mockResolvedValue({ rules: {} });
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    // The form appears once the first manufacturer + spec auto-select and load.
    const waitForForm = () => waitFor(() => expect(screen.getByLabelText(/Layer count/)).toBeTruthy());
    const openProcessMenu = async () => {
        fireEvent.keyDown(screen.getByRole("combobox", { name: "Process" }), { key: "Enter" });
    };

    describe("layout", () => {
        it("shows the manufacturer tab, its spec form and the summary", async () => {
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            expect(screen.getByRole("tab", { name: "Acme Fab", selected: true })).toBeTruthy();
            expect(screen.getByText("Stackup & physical")).toBeTruthy();
            expect(screen.getByText("Capability check")).toBeTruthy();
            expect(screen.getByText(/None with Acme Fab yet/)).toBeTruthy();
        });

        it("keeps Production on its own sub-tab", async () => {
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            expect(screen.queryByText("No production yet.")).toBeNull();

            fireEvent.mouseDown(screen.getByRole("tab", { name: /Production/ }));
            expect(await screen.findByText("No production yet.")).toBeTruthy();
            expect(screen.queryByLabelText(/Layer count/)).toBeNull();
            expect(screen.getAllByRole("button", { name: /New production/ }).length).toBeGreaterThan(0);
        });

        it("lists this project's productions and opens one in a drawer, in place", async () => {
            listRuns.mockResolvedValue([run({ status: "ordered" })]);
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.mouseDown(screen.getByRole("tab", { name: /Production/ }));
            fireEvent.click(await screen.findByText("JOB-2026-0001"));
            expect(await screen.findByText("drawer:run_1")).toBeTruthy();
        });

        it("opens runs without a link back to the page it is already on", async () => {
            listRuns.mockResolvedValue([run()]);
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.mouseDown(screen.getByRole("tab", { name: /Production/ }));
            fireEvent.click(await screen.findByText("JOB-2026-0001"));
            const drawer = await screen.findByText("drawer:run_1");
            expect(drawer.getAttribute("data-project-link")).toBe("false");
        });

        it("counts the project's productions on the sub-tab", async () => {
            listRuns.mockResolvedValue([run(), run({ id: "run_2" })]);
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            expect(screen.getByRole("tab", { name: /Production/ }).textContent).toContain("2");
        });

        it("shows the last production for the manufacturer and starts a new one in place", async () => {
            listRuns.mockResolvedValue([
                run({ id: "old", job_number: "JOB-OLD", created_at: "2025-01-01T00:00:00Z" }),
                run({ id: "new", job_number: "JOB-NEW", status: "in_production" }),
                run({ id: "other", job_number: "JOB-OTHER", manufacturer_id: "m9", created_at: "2027-01-01T00:00:00Z" }),
            ]);
            renderTab(<ProjectManufacturing projectId="p1" projectName="Board One" canEdit />);
            await waitForForm();

            fireEvent.click(await screen.findByRole("button", { name: /JOB-NEW/ }));
            expect(await screen.findByText("drawer:new")).toBeTruthy();
            expect(screen.queryByText("JOB-OTHER")).toBeNull();

            fireEvent.click(screen.getByRole("button", { name: "Start production" }));
            // The dialog opens for this project and the manufacturer on screen.
            expect(await screen.findByText("dialog:p1:m1:Board One")).toBeTruthy();
        });

        it("opens a production created from the dialog, on the Production sub-tab", async () => {
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.click(screen.getByRole("button", { name: "Start production" }));
            fireEvent.click(await screen.findByRole("button", { name: "finish" }));
            expect(await screen.findByText("drawer:run_new")).toBeTruthy();
            expect(screen.queryByText(/dialog:/)).toBeNull();
            // The list was refreshed, and the Production sub-tab is showing.
            await waitFor(() => expect(listRuns).toHaveBeenCalledTimes(2));
            expect(screen.queryByLabelText(/Layer count/)).toBeNull();
        });

        it("falls back to the project id when it has no name", async () => {
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.click(screen.getByRole("button", { name: "Start production" }));
            expect(await screen.findByText("dialog:p1:m1:p1")).toBeTruthy();
        });

        it("shows an empty state when the project has no manufacturers", async () => {
            listProjectManufacturers.mockResolvedValue([]);
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitFor(() => expect(screen.getByText(/No manufacturers on this project yet/)).toBeTruthy());
            expect(screen.getByText(/Add one above/)).toBeTruthy();
        });

        it("points to the global Manufacturing page when none exist to attach", async () => {
            listProjectManufacturers.mockResolvedValue([]);
            listManufacturers.mockResolvedValue([]);
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitFor(() => expect(screen.getByText(/add one from Manufacturing in the sidebar/)).toBeTruthy());
            expect(screen.queryByText(/Add one above/)).toBeNull();
        });

        it("has no way to create a manufacturer here, only to attach existing ones", async () => {
            listManufacturers.mockResolvedValue([
                { id: "m1", name: "Acme Fab", ...MFR },
                { id: "m2", name: "Beta Fab", ...MFR },
            ]);
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            expect(screen.queryByRole("button", { name: /New manufacturer/ })).toBeNull();
            expect(screen.getByRole("combobox", { name: "Add a manufacturer" })).toBeTruthy();
        });

        it("does not offer a cancelled production as the last one", async () => {
            listRuns.mockResolvedValue([
                run({ id: "done", job_number: "JOB-DONE", status: "closed", created_at: "2025-01-01T00:00:00Z" }),
                run({ id: "off", job_number: "JOB-OFF", status: "cancelled", created_at: "2026-06-01T00:00:00Z" }),
            ]);
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            expect(await screen.findByRole("button", { name: /JOB-DONE/ })).toBeTruthy();
            expect(screen.queryByRole("button", { name: /JOB-OFF/ })).toBeNull();
        });
    });

    describe("capability check", () => {
        const fields = [
            { key: "min_track_width", label: "Min track width", type: "number", unit: "mm" },
            { key: "min_via_diameter", label: "Min via diameter", type: "number", unit: "mm" },
        ];

        it("lists only the rules where the board is below the minimum", async () => {
            getPcbRuleFields.mockResolvedValue({ fields });
            getProjectSpec.mockResolvedValue({
                ...makeSpec(),
                template_name: "Standard",
                template_capabilities: { min_track_width: 0.1, min_via_diameter: 0.25 },
            });
            extractPcbRules.mockResolvedValue({ rules: { min_track_width: 0.09, min_via_diameter: 0.3 } });
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitFor(() => expect(extractPcbRules).toHaveBeenCalledWith("p1"));

            expect(await screen.findByText("1 rule below minimum")).toBeTruthy();
            expect(screen.getByText("Min track width")).toBeTruthy();
            expect(screen.getByText("0.09 mm")).toBeTruthy();
            // The passing rule is not listed until the full table is opened.
            expect(screen.queryByText("Min via diameter")).toBeNull();
            fireEvent.click(screen.getByRole("button", { name: /Show all rules/ }));
            expect(await screen.findByText("Min via diameter")).toBeTruthy();
            expect(screen.getByText("0.25 mm")).toBeTruthy();
            expect(screen.getByText("Board")).toBeTruthy();
        });

        it("says so when every compared rule meets the minimum", async () => {
            getPcbRuleFields.mockResolvedValue({ fields });
            getProjectSpec.mockResolvedValue({
                ...makeSpec(),
                template_name: "Standard",
                template_capabilities: { min_track_width: 0.1, min_via_diameter: 0.25 },
            });
            extractPcbRules.mockResolvedValue({ rules: { min_track_width: 0.1 } });
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            expect(await screen.findByText(/All 1 checked rule meets the Standard minimums/)).toBeTruthy();
        });

        it("asks for a process when the spec has none", async () => {
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            expect(screen.getByText("Pick a process to see its minimums.")).toBeTruthy();
        });

        it("shows custom capabilities only under All, with no board value", async () => {
            getPcbRuleFields.mockResolvedValue({
                fields: [{ key: "min_track_width", label: "Min track width", type: "number", unit: "mm" }],
            });
            getProjectSpec.mockResolvedValue({
                ...makeSpec(),
                template_name: "flex",
                template_capabilities: { min_track_width: 0.09, max_board_width_mm: 234 },
                template_capability_meta: { max_board_width_mm: { label: "Max board width", unit: "mm" } },
            });
            extractPcbRules.mockResolvedValue({ rules: { min_track_width: 0.1 } });
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            fireEvent.click(await screen.findByRole("button", { name: /Show all rules/ }));

            expect(await screen.findByText("Min track width")).toBeTruthy();
            expect(screen.queryByText("Max board width")).toBeNull();
            fireEvent.click(screen.getByRole("button", { name: "All" }));
            expect(await screen.findByText("Max board width")).toBeTruthy();
            expect(screen.getByText("234 mm")).toBeTruthy();
        });
    });

    describe("spec form", () => {
        it("counts the fields that are set, per section and overall", async () => {
            getProjectSpec.mockResolvedValue(makeSpec(SCHEMA, { layer_count: 4 }));
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            expect(screen.getByText("1 of 2 set")).toBeTruthy();
            expect(screen.getByRole("progressbar", { name: "Spec completeness" }).getAttribute("aria-valuenow")).toBe("1");
            fireEvent.change(screen.getByLabelText(/Board thickness/), { target: { value: "1.6" } });
            expect(await screen.findByText("2 of 2 set")).toBeTruthy();
        });

        it("renders short choices and Yes/No as buttons and long lists as a select", async () => {
            getProjectSpec.mockResolvedValue(
                makeSpec({
                    sections: [
                        {
                            title: "Base", optional: false, when: null,
                            fields: [
                                { key: "layers", label: "Layers", type: "choice", options: ["1", "2", "4"], default: null, when: null },
                                { key: "finish", label: "Finish", type: "choice", options: ["a", "b", "c", "d", "e", "f"], default: null, when: null },
                                { key: "impedance", label: "Impedance control", type: "bool", options: [], default: null, when: null },
                            ],
                        },
                    ],
                    errors: [],
                }),
            );
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            const layers = await screen.findByRole("radiogroup", { name: "Layers" });
            fireEvent.click(within(layers).getByRole("radio", { name: "4" }));
            expect(within(layers).getByRole("radio", { name: "4" }).getAttribute("aria-checked")).toBe("true");

            expect((screen.getByLabelText("Finish") as HTMLSelectElement).tagName).toBe("SELECT");

            const impedance = screen.getByRole("radiogroup", { name: "Impedance control" });
            fireEvent.click(within(impedance).getByRole("radio", { name: "Yes" }));
            fireEvent.click(screen.getByRole("button", { name: "Save spec" }));
            await waitFor(() => expect(updateProjectSpec).toHaveBeenCalled());
            const body = updateProjectSpec.mock.calls[0][1];
            expect(body.specs).toMatchObject({ layers: "4", impedance: true });
        });

        it("shows a numeric field's unit beside its input", async () => {
            getProjectSpec.mockResolvedValue(
                makeSpec({
                    sections: [
                        {
                            title: "Base", optional: false, when: null,
                            fields: [{ key: "thickness", label: "Board thickness", type: "number", unit: "mm", options: [], default: 1.6, when: null }],
                        },
                    ],
                    errors: [],
                }),
            );
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            const input = (await screen.findByLabelText("Board thickness")) as HTMLInputElement;
            expect(input.value).toBe("1.6");
            expect(screen.getByText("mm")).toBeTruthy();
        });

        it("marks where each value came from", async () => {
            getProjectSpec.mockResolvedValue({
                ...makeSpec(
                    {
                        sections: [
                            {
                                title: "Base", optional: false, when: null,
                                fields: [
                                    { key: "layer_count", label: "Layer count", type: "int", options: [], default: null, when: null },
                                    { key: "thickness", label: "Thickness", type: "number", options: [], default: null, when: null },
                                    { key: "color", label: "Color", type: "text", options: [], default: "Green", when: null },
                                ],
                            },
                        ],
                        errors: [],
                    },
                    { layer_count: 4, thickness: 1.6 },
                ),
                source: { layer_count: "extracted", thickness: "manual" },
            });
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            expect(screen.getByText("From board")).toBeTruthy();
            expect(screen.getByText("Edited")).toBeTruthy();
            expect(screen.getByText("Default")).toBeTruthy();
        });

        it("shows read-only viewers the values as text", async () => {
            getProjectSpec.mockResolvedValue(makeSpec(SCHEMA, { layer_count: 4 }));
            renderTab(<ProjectManufacturing projectId="p1" canEdit={false} />);
            await waitFor(() => expect(screen.getByText("Layer count")).toBeTruthy());
            expect(screen.queryByLabelText(/Layer count/)).toBeNull();
            expect(screen.getByText("4")).toBeTruthy();
            expect(screen.getByText("Not set")).toBeTruthy();
            expect(screen.queryByRole("button", { name: /Fill from board/ })).toBeNull();
            expect(screen.queryByRole("button", { name: "New manufacturer" })).toBeNull();
        });

        it("collapses a section when its header is clicked", async () => {
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.click(screen.getByRole("button", { name: /Stackup & physical/ }));
            await waitFor(() => expect(screen.queryByLabelText(/Layer count/)).toBeNull());
        });

        it("optional sections start off and their fields appear once switched on", async () => {
            const withOptional = {
                sections: [
                    ...SCHEMA.sections,
                    {
                        title: "Assembly", optional: true, when: null,
                        fields: [{ key: "smt_parts", label: "SMT parts", type: "int", options: [], default: null, when: null }],
                    },
                ],
                errors: [],
            };
            getProjectSpec.mockResolvedValue(makeSpec(withOptional));
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitFor(() => expect(screen.getByText("Assembly")).toBeTruthy());
            expect(screen.queryByLabelText(/SMT parts/)).toBeNull();

            fireEvent.click(screen.getByRole("switch", { name: "Enable Assembly" }));
            await waitFor(() => expect(screen.getByLabelText(/SMT parts/)).toBeTruthy());
        });

        it("persists active sections when saving", async () => {
            const withOptional = {
                sections: [...SCHEMA.sections, { title: "Assembly", optional: true, when: null, fields: [] }],
                errors: [],
            };
            getProjectSpec.mockResolvedValue(makeSpec(withOptional));
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitFor(() => expect(screen.getByText("Assembly")).toBeTruthy());

            fireEvent.click(screen.getByRole("switch", { name: "Enable Assembly" }));
            fireEvent.click(screen.getByRole("button", { name: "Save spec" }));
            await waitFor(() => expect(updateProjectSpec).toHaveBeenCalled());
            expect(updateProjectSpec.mock.calls[0][1].active_sections).toContain("Assembly");
        });

        it("gates a field on another field's value and draws it as a sub-option", async () => {
            const gated = {
                sections: [
                    {
                        title: "Base", optional: false, when: null,
                        fields: [
                            { key: "material", label: "Material", type: "choice", options: ["FR-4", "Flex"], default: "Flex", when: null },
                            {
                                key: "inner_copper", label: "Inner copper", type: "choice", options: ["1", "2"], default: null,
                                when: { key: "material", op: "=", values: ["FR-4"] },
                            },
                        ],
                    },
                ],
                errors: [],
            };
            getProjectSpec.mockResolvedValue(makeSpec(gated, { material: "Flex" }));
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            const material = await screen.findByRole("radiogroup", { name: "Material" });
            expect(screen.queryByRole("radiogroup", { name: "Inner copper" })).toBeNull();

            fireEvent.click(within(material).getByRole("radio", { name: "FR-4" }));
            const inner = await screen.findByRole("radiogroup", { name: "Inner copper" });
            // The sub-option sits in an indented row.
            expect(inner.closest("div.ml-4")).not.toBeNull();
        });
    });

    describe("saving", () => {
        it("shows the save bar only once something changes, and saves", async () => {
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();

            fireEvent.change(screen.getByLabelText(/Layer count/), { target: { value: "2" } });
            expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: "Save spec" }));

            await waitFor(() => expect(updateProjectSpec).toHaveBeenCalled());
            const [specId, body] = updateProjectSpec.mock.calls[0];
            expect(specId).toBe("spec_1");
            expect((body.specs as Record<string, unknown>).layer_count).toBe(2);
            await waitFor(() => expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull());
        });

        it("discards edits by reloading the saved spec", async () => {
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.change(screen.getByLabelText(/Layer count/), { target: { value: "9" } });
            fireEvent.click(screen.getByRole("button", { name: "Discard" }));
            await waitFor(() => expect((screen.getByLabelText(/Layer count/) as HTMLInputElement).value).toBe(""));
            expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
            expect(updateProjectSpec).not.toHaveBeenCalled();
        });

        it("warns on page unload only while there are unsaved edits", async () => {
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            const clean = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(clean);
            expect(clean.defaultPrevented).toBe(false);

            fireEvent.change(screen.getByLabelText(/Layer count/), { target: { value: "2" } });
            const dirty = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(dirty);
            expect(dirty.defaultPrevented).toBe(true);
        });

        it("Fill from board fills fields and marks them", async () => {
            extractBoardSpec.mockResolvedValue({ suggested: { layer_count: 6, board_thickness_mm: 1.6 } });
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.click(screen.getByRole("button", { name: /Fill from board/ }));
            await waitFor(() => expect((screen.getByLabelText(/Layer count/) as HTMLInputElement).value).toBe("6"));
            expect(screen.getAllByText("From board").length).toBe(2);
            expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeTruthy();
        });

        it("an extracted number selects its option in a choice field", async () => {
            getProjectSpec.mockResolvedValue(
                makeSpec({
                    sections: [
                        {
                            title: "Base", optional: false, when: null,
                            fields: [{ key: "layer_count", label: "Layers", type: "choice", options: ["1", "2", "4", "6"], default: null, when: null }],
                        },
                    ],
                    errors: [],
                }),
            );
            extractBoardSpec.mockResolvedValue({ suggested: { layer_count: 4 } });
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            const group = await screen.findByRole("radiogroup", { name: "Layers" });
            expect(within(group).getByRole("radio", { name: "4" }).getAttribute("aria-checked")).toBe("false");

            fireEvent.click(screen.getByRole("button", { name: /Fill from board/ }));
            await waitFor(() =>
                expect(within(group).getByRole("radio", { name: "4" }).getAttribute("aria-checked")).toBe("true"),
            );
        });
    });

    describe("guards and confirmations", () => {
        const TWO = [
            { id: "m1", name: "Acme Fab", ...MFR },
            { id: "m2", name: "Beta Fab", ...MFR },
        ];

        it("asks before dropping unsaved edits when switching manufacturer", async () => {
            listProjectManufacturers.mockResolvedValue(TWO);
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.change(screen.getByLabelText(/Layer count/), { target: { value: "4" } });

            fireEvent.click(screen.getByRole("tab", { name: "Beta Fab" }));
            expect(await screen.findByText("Discard unsaved changes?")).toBeTruthy();
            // Cancelling keeps the current manufacturer and the edit.
            fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
            await waitFor(() => expect(screen.queryByText("Discard unsaved changes?")).toBeNull());
            expect(getProjectSpecForManufacturer).toHaveBeenCalledTimes(1);
            expect((screen.getByLabelText(/Layer count/) as HTMLInputElement).value).toBe("4");

            fireEvent.click(screen.getByRole("tab", { name: "Beta Fab" }));
            fireEvent.click(await screen.findByRole("button", { name: "Discard changes" }));
            await waitFor(() => expect(getProjectSpecForManufacturer).toHaveBeenCalledWith("p1", "m2"));
        });

        it("switches manufacturer without asking when nothing is unsaved", async () => {
            listProjectManufacturers.mockResolvedValue(TWO);
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.click(screen.getByRole("tab", { name: "Beta Fab" }));
            await waitFor(() => expect(getProjectSpecForManufacturer).toHaveBeenCalledWith("p1", "m2"));
            expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
        });

        const twoProcesses = () => {
            listTemplates.mockResolvedValue([
                { id: "t1", manufacturer_id: "m1", name: "Standard", spec_config: "", capabilities: {} },
                { id: "t2", manufacturer_id: "m1", name: "Advanced", spec_config: "", capabilities: {} },
            ]);
            getProjectSpecForManufacturer.mockResolvedValue({ ...makeSpec(), template_id: "t1", template_name: "Standard" });
            getProjectSpec.mockResolvedValue({ ...makeSpec(), template_id: "t1", template_name: "Standard" });
        };

        it("confirms before switching the spec's process, then applies it", async () => {
            twoProcesses();
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();

            await openProcessMenu();
            fireEvent.click(await screen.findByRole("option", { name: "Advanced" }));
            expect(await screen.findByText("Switch to Advanced?")).toBeTruthy();
            expect(applyTemplateToSpec).not.toHaveBeenCalled();

            fireEvent.click(screen.getByRole("button", { name: "Switch process" }));
            await waitFor(() => expect(applyTemplateToSpec).toHaveBeenCalledWith("spec_1", "t2"));
        });

        it("does not switch the process when the confirmation is cancelled", async () => {
            twoProcesses();
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            await openProcessMenu();
            fireEvent.click(await screen.findByRole("option", { name: "Advanced" }));
            fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
            await waitFor(() => expect(screen.queryByText("Switch to Advanced?")).toBeNull());
            expect(applyTemplateToSpec).not.toHaveBeenCalled();
        });

        it("mentions unsaved edits in the process confirmation", async () => {
            twoProcesses();
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.change(screen.getByLabelText(/Layer count/), { target: { value: "4" } });
            await openProcessMenu();
            fireEvent.click(await screen.findByRole("option", { name: "Advanced" }));
            expect(await screen.findByText(/unsaved changes to this spec are also discarded/)).toBeTruthy();
        });

        it("removes a manufacturer from the project through the menu, after confirming", async () => {
            detachManufacturer.mockResolvedValue(undefined);
            renderTab(<ProjectManufacturing projectId="p1" canEdit />);
            await waitForForm();
            fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Acme Fab" }), { key: "Enter" });
            fireEvent.click(await screen.findByRole("menuitem", { name: /Remove from project/ }));
            expect(detachManufacturer).not.toHaveBeenCalled();
            fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
            await waitFor(() => expect(detachManufacturer).toHaveBeenCalledWith("p1", "m1"));
        });

        it("hides every edit control when canEdit is false", async () => {
            renderTab(<ProjectManufacturing projectId="p1" canEdit={false} />);
            await waitFor(() => expect(screen.getByText("Layer count")).toBeTruthy());
            expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
            expect(screen.queryByRole("button", { name: "Start production" })).toBeNull();
            expect(screen.queryByRole("button", { name: /Save spec/ })).toBeNull();
        });
    });
});
