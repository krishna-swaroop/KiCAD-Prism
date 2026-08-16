import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/types/project";

const createRun = vi.fn();
const listProjectManufacturers = vi.fn();
const listProjectSpecs = vi.fn();
const fetchApi = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    createRun: (...a: unknown[]) => createRun(...a),
    listProjectManufacturers: (...a: unknown[]) => listProjectManufacturers(...a),
    listProjectSpecs: (...a: unknown[]) => listProjectSpecs(...a),
}));

vi.mock("@/lib/api", () => ({
    fetchApi: (...a: unknown[]) => fetchApi(...a),
}));

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

import { NewRunWizard } from "./new-run-wizard";

const projects: Project[] = [
    { id: "p1", name: "Board One", description: "", path: "", last_modified: "" },
];

function renderWizard() {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<NewRunWizard open projects={projects} onClose={onClose} onCreated={onCreated} />);
    return { onCreated, onClose };
}

// Advance from Project to the Manufacturer step for a project that has manufacturers.
async function reachManufacturer(quantity = "50") {
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
    await waitFor(() => expect(listProjectManufacturers).toHaveBeenCalledWith("p1"));
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> quantity
    fireEvent.change(screen.getByLabelText("Quantity ordered"), { target: { value: quantity } });
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> manufacturer
    await screen.findByLabelText("Manufacturer");
}

describe("NewRunWizard", () => {
    beforeEach(() => {
        createRun.mockResolvedValue({ id: "run_1" });
        fetchApi.mockResolvedValue({ ok: true, json: async () => ({ releases: [] }) });
        listProjectManufacturers.mockResolvedValue([
            { id: "m1", name: "Acme Fab", contact: "", website: "", notes: "", created_at: "", updated_at: "", attached_at: "" },
        ]);
        listProjectSpecs.mockResolvedValue([]);
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("blocks Next until a project is chosen", () => {
        renderWizard();
        const next = screen.getByRole("button", { name: "Next" });
        expect(next).toHaveProperty("disabled", true);

        fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
        expect(next).toHaveProperty("disabled", false);
    });

    it("blocks Next on the manufacturer step until one is chosen", async () => {
        renderWizard();
        await reachManufacturer();

        const next = screen.getByRole("button", { name: "Next" });
        expect(next).toHaveProperty("disabled", true);
        fireEvent.change(screen.getByLabelText("Manufacturer"), { target: { value: "m1" } });
        expect(next).toHaveProperty("disabled", false);
    });

    it("lists only the project's manufacturers and records the run", async () => {
        const { onCreated } = renderWizard();
        await reachManufacturer();

        // The picker holds the project-scoped manufacturer.
        expect(screen.getByRole("option", { name: "Acme Fab" })).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Manufacturer"), { target: { value: "m1" } });
        await waitFor(() => expect(listProjectSpecs).toHaveBeenCalledWith("p1", "m1"));
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> spec
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> details
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> confirm

        fireEvent.click(screen.getByRole("button", { name: "Create run" }));

        await waitFor(() => expect(createRun).toHaveBeenCalled());
        const body = createRun.mock.calls[0][0];
        expect(body.project_id).toBe("p1");
        expect(body.quantity_ordered).toBe(50);
        expect(body.manufacturer_id).toBe("m1");
        await waitFor(() => expect(onCreated).toHaveBeenCalledWith("run_1"));
    });

    it("offers the manufacturer's specs and records the chosen one", async () => {
        listProjectSpecs.mockResolvedValue([
            {
                id: "spec_1", project_id: "p1", manufacturer_id: "m1", name: "4L ENIG",
                spec_config: "", specs: {}, source: {}, active_sections: [], updated_at: "", updated_by: "",
            },
        ]);
        const { onCreated } = renderWizard();
        await reachManufacturer("10");
        fireEvent.change(screen.getByLabelText("Manufacturer"), { target: { value: "m1" } });
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> spec

        const specPicker = await screen.findByLabelText("Spec (optional)");
        fireEvent.change(specPicker, { target: { value: "spec_1" } });
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> details
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> confirm
        fireEvent.click(screen.getByRole("button", { name: "Create run" }));

        await waitFor(() => expect(createRun).toHaveBeenCalled());
        const body = createRun.mock.calls[0][0];
        expect(body.spec_id).toBe("spec_1");
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
    });

    it("shows an empty state when the project has no manufacturers", async () => {
        listProjectManufacturers.mockResolvedValue([]);
        renderWizard();
        fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
        await waitFor(() => expect(listProjectManufacturers).toHaveBeenCalledWith("p1"));
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> quantity
        fireEvent.change(screen.getByLabelText("Quantity ordered"), { target: { value: "5" } });
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> manufacturer

        expect(await screen.findByText(/no manufacturers yet/i)).toBeTruthy();
        // Cannot advance without a manufacturer.
        expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
    });

    it("first step's Back button cancels", () => {
        const { onClose } = renderWizard();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onClose).toHaveBeenCalled();
    });
});
