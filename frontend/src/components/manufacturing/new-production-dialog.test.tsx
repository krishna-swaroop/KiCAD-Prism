import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRun = vi.fn();
const listProjectManufacturers = vi.fn();
const getProjectSpecForManufacturer = vi.fn();
const getProjectSpec = vi.fn();
const getPcbRuleFields = vi.fn();
const extractPcbRules = vi.fn();
const fetchApi = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    createRun: (...a: unknown[]) => createRun(...a),
    listProjectManufacturers: (...a: unknown[]) => listProjectManufacturers(...a),
    getProjectSpecForManufacturer: (...a: unknown[]) => getProjectSpecForManufacturer(...a),
    getProjectSpec: (...a: unknown[]) => getProjectSpec(...a),
    getPcbRuleFields: (...a: unknown[]) => getPcbRuleFields(...a),
    extractPcbRules: (...a: unknown[]) => extractPcbRules(...a),
}));
vi.mock("@/lib/api", () => ({ fetchApi: (...a: unknown[]) => fetchApi(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix Dialog needs these in jsdom.
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

import { NewProductionDialog } from "./new-production-dialog";

const PROJECTS = [
    { id: "p1", name: "Board One" },
    { id: "p2", name: "Board Two" },
];
const MFR = { contact: "", website: "", notes: "", created_at: "", updated_at: "", attached_at: "" };
const SCHEMA = {
    sections: [
        {
            title: "Board", optional: false, when: null,
            fields: [
                { key: "layers", label: "Layers", type: "int", options: [], default: null, when: null },
                { key: "thickness", label: "Thickness", type: "number", options: [], default: null, when: null },
            ],
        },
    ],
    errors: [],
};

function spec(specs: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
    return {
        id: "spec_1", project_id: "p1", manufacturer_id: "m1", name: "Default", spec_config: "x",
        specs, source: {}, active_sections: [], updated_at: null, updated_by: "", parsed: SCHEMA,
        template_name: "Standard", ...extra,
    };
}

function renderDialog(props: Partial<React.ComponentProps<typeof NewProductionDialog>> = {}) {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(
        <MemoryRouter>
            <NewProductionDialog open projects={PROJECTS} onClose={onClose} onCreated={onCreated} {...props} />
        </MemoryRouter>,
    );
    return { onCreated, onClose };
}

describe("NewProductionDialog", () => {
    beforeEach(() => {
        listProjectManufacturers.mockResolvedValue([{ id: "m1", name: "Acme Fab", ...MFR }]);
        getProjectSpecForManufacturer.mockResolvedValue(spec());
        getProjectSpec.mockResolvedValue(spec({ layers: 4, thickness: 1.6 }));
        getPcbRuleFields.mockResolvedValue({ fields: [] });
        extractPcbRules.mockResolvedValue({ rules: {} });
        createRun.mockResolvedValue({ id: "run_new" });
        fetchApi.mockResolvedValue({
            ok: true,
            json: async () => ({
                releases: [
                    { tag: "v1.0", commit_hash: "aaa1111", full_hash: "aaa1111222", date: "2026-01-01" },
                    { tag: "v1.1", commit_hash: "bbb2222", full_hash: "bbb2222333", date: "2026-02-01" },
                ],
            }),
        });
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("needs a project, manufacturer and quantity before it can create", async () => {
        renderDialog();
        const create = screen.getByRole("button", { name: "Create production" });
        expect(create).toHaveProperty("disabled", true);

        fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
        await waitFor(() => expect(screen.getByLabelText("Manufacturer")).toHaveProperty("value", "m1"));
        expect(create).toHaveProperty("disabled", true);
        fireEvent.change(screen.getByLabelText("Quantity ordered"), { target: { value: "50" } });
        await waitFor(() => expect(create).toHaveProperty("disabled", false));
    });

    it("selects the only manufacturer and the newest release automatically", async () => {
        renderDialog({ initialProjectId: "p1" });
        await waitFor(() => expect(screen.getByLabelText("Manufacturer")).toHaveProperty("value", "m1"));
        await waitFor(() => expect(screen.getByLabelText("Release")).toHaveProperty("value", "v1.1"));
    });

    it("locks the project when opened from a project", async () => {
        renderDialog({ initialProjectId: "p1" });
        expect(screen.getByLabelText("Project")).toHaveProperty("disabled", true);
        expect(screen.getByLabelText("Project")).toHaveProperty("value", "p1");
    });

    it("creates the run with the release, its commit, the spec and the notes", async () => {
        const { onCreated } = renderDialog({ initialProjectId: "p1" });
        await waitFor(() => expect(screen.getByLabelText("Release")).toHaveProperty("value", "v1.1"));
        await waitFor(() => expect(getProjectSpec).toHaveBeenCalled());
        fireEvent.change(screen.getByLabelText("Quantity ordered"), { target: { value: "50" } });
        fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Rush" } });
        fireEvent.click(screen.getByRole("button", { name: "Create production" }));

        await waitFor(() =>
            expect(createRun).toHaveBeenCalledWith({
                project_id: "p1",
                manufacturer_id: "m1",
                spec_id: "spec_1",
                commit_sha: "bbb2222333",
                release_tag: "v1.1",
                quantity_ordered: 50,
                notes: "Rush",
            }),
        );
        expect(onCreated).toHaveBeenCalledWith("run_new");
    });

    it("takes a commit instead when no release is chosen", async () => {
        renderDialog({ initialProjectId: "p1" });
        await waitFor(() => expect(screen.getByLabelText("Release")).toHaveProperty("value", "v1.1"));
        expect(screen.queryByLabelText("Commit (optional)")).toBeNull();

        fireEvent.change(screen.getByLabelText("Release"), { target: { value: "" } });
        fireEvent.change(await screen.findByLabelText("Commit (optional)"), { target: { value: "deadbee" } });
        await waitFor(() => expect(getProjectSpec).toHaveBeenCalled());
        fireEvent.change(screen.getByLabelText("Quantity ordered"), { target: { value: "5" } });
        fireEvent.click(screen.getByRole("button", { name: "Create production" }));
        await waitFor(() =>
            expect(createRun).toHaveBeenCalledWith(expect.objectContaining({ release_tag: "", commit_sha: "deadbee" })),
        );
    });

    it("preselects a given manufacturer when the project has several", async () => {
        listProjectManufacturers.mockResolvedValue([
            { id: "m1", name: "Acme Fab", ...MFR },
            { id: "m2", name: "Beta Fab", ...MFR },
        ]);
        renderDialog({ initialProjectId: "p1", initialManufacturerId: "m2" });
        await waitFor(() => expect(screen.getByLabelText("Manufacturer")).toHaveProperty("value", "m2"));
    });

    it("leaves the manufacturer to the user when the project has several", async () => {
        listProjectManufacturers.mockResolvedValue([
            { id: "m1", name: "Acme Fab", ...MFR },
            { id: "m2", name: "Beta Fab", ...MFR },
        ]);
        renderDialog({ initialProjectId: "p1" });
        await waitFor(() => expect(screen.getByRole("option", { name: "Beta Fab" })).toBeTruthy());
        expect(screen.getByLabelText("Manufacturer")).toHaveProperty("value", "");
    });

    it("points to the project's Manufacturing tab when it has no manufacturers", async () => {
        listProjectManufacturers.mockResolvedValue([]);
        renderDialog({ initialProjectId: "p1" });
        const link = await screen.findByRole("link", { name: /Attach one on its Manufacturing tab/ });
        expect(link.getAttribute("href")).toBe("/project/p1?section=manufacturing");
    });

    it("says what will be frozen", async () => {
        renderDialog({ initialProjectId: "p1" });
        expect(await screen.findByText(/Standard spec,/)).toBeTruthy();
        expect(screen.getByText("2 of 2")).toBeTruthy();
        expect(screen.queryByText(/The spec is empty/)).toBeNull();
    });

    it("warns, without blocking, about an empty spec", async () => {
        getProjectSpec.mockResolvedValue(spec({}));
        renderDialog({ initialProjectId: "p1" });
        expect(await screen.findByText(/The spec is empty/)).toBeTruthy();
        expect(screen.getByRole("link", { name: "Review the spec" }).getAttribute("href")).toBe(
            "/project/p1?section=manufacturing",
        );
        fireEvent.change(screen.getByLabelText("Quantity ordered"), { target: { value: "5" } });
        expect(screen.getByRole("button", { name: "Create production" })).toHaveProperty("disabled", false);
    });

    it("warns when the board is below the process minimums", async () => {
        getPcbRuleFields.mockResolvedValue({
            fields: [{ key: "min_track_width", label: "Min track width", type: "number", unit: "mm" }],
        });
        getProjectSpec.mockResolvedValue(spec({ layers: 4, thickness: 1.6 }, { template_capabilities: { min_track_width: 0.1 } }));
        extractPcbRules.mockResolvedValue({ rules: { min_track_width: 0.08 } });
        renderDialog({ initialProjectId: "p1" });
        expect(await screen.findByText(/1 rule is below the process minimums/)).toBeTruthy();
    });
});
