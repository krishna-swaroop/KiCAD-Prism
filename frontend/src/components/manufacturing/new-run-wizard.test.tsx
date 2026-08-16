import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/types/project";
import type { Manufacturer } from "@/types/manufacturing";

const createRun = vi.fn();
const fetchApi = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    createRun: (...a: unknown[]) => createRun(...a),
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
const manufacturers: Manufacturer[] = [
    { id: "m1", name: "Acme Fab", contact: "", website: "", notes: "", created_at: "", updated_at: "" },
];

function renderWizard() {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(
        <NewRunWizard
            open
            projects={projects}
            manufacturers={manufacturers}
            onClose={onClose}
            onCreated={onCreated}
        />,
    );
    return { onCreated, onClose };
}

describe("NewRunWizard", () => {
    beforeEach(() => {
        createRun.mockResolvedValue({ id: "run_1" });
        // Default: no releases for the project.
        fetchApi.mockResolvedValue({ ok: true, json: async () => ({ releases: [] }) });
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

    it("blocks Next until quantity is positive", () => {
        renderWizard();
        fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> quantity step

        const next = screen.getByRole("button", { name: "Next" });
        expect(next).toHaveProperty("disabled", true);
        fireEvent.change(screen.getByLabelText("Quantity ordered"), { target: { value: "50" } });
        expect(next).toHaveProperty("disabled", false);
    });

    it("creates the run with the collected values on confirm", async () => {
        const { onCreated } = renderWizard();
        fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        fireEvent.change(screen.getByLabelText("Quantity ordered"), { target: { value: "50" } });
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> manufacturer
        fireEvent.change(screen.getByLabelText("Manufacturer"), { target: { value: "m1" } });
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

    it("offers the project's releases and records the chosen one", async () => {
        fetchApi.mockResolvedValue({
            ok: true,
            json: async () => ({
                releases: [
                    { tag: "v1.2.0", commit_hash: "abc1234", full_hash: "abc1234def", date: "", message: "" },
                ],
            }),
        });
        const { onCreated } = renderWizard();
        fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
        // Releases load for the chosen project.
        await waitFor(() => expect(fetchApi).toHaveBeenCalledWith("/api/projects/p1/releases?limit=100"));

        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        fireEvent.change(screen.getByLabelText("Quantity ordered"), { target: { value: "10" } });
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> manufacturer
        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> details

        // The release picker is present; pick the tag.
        const picker = await screen.findByLabelText("Release (optional)");
        fireEvent.change(picker, { target: { value: "v1.2.0" } });
        // Its commit fills in.
        expect((screen.getByLabelText("Commit (optional)") as HTMLInputElement).value).toBe("abc1234def");

        fireEvent.click(screen.getByRole("button", { name: "Next" })); // -> confirm
        fireEvent.click(screen.getByRole("button", { name: "Create run" }));

        await waitFor(() => expect(createRun).toHaveBeenCalled());
        const body = createRun.mock.calls[0][0];
        expect(body.commit_sha).toBe("abc1234def");
        expect(body.notes).toContain("Release: v1.2.0");
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
    });

    it("first step's Back button cancels", () => {
        const { onClose } = renderWizard();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onClose).toHaveBeenCalled();
    });
});
