import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manufacturer } from "@/types/manufacturing";

const createManufacturer = vi.fn();
const updateManufacturer = vi.fn();
const deleteManufacturer = vi.fn();
const listTemplates = vi.fn();
const getPcbRuleFields = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    createManufacturer: (...a: unknown[]) => createManufacturer(...a),
    updateManufacturer: (...a: unknown[]) => updateManufacturer(...a),
    deleteManufacturer: (...a: unknown[]) => deleteManufacturer(...a),
    listTemplates: (...a: unknown[]) => listTemplates(...a),
    getPcbRuleFields: (...a: unknown[]) => getPcbRuleFields(...a),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock("./spec-config-editor", () => ({ SpecConfigEditor: () => null }));

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

import { ManufacturersPanel } from "./manufacturers-panel";

const RULE_FIELDS = [
    { key: "min_track_width", label: "Min track width", type: "number", unit: "mm" },
    { key: "allow_microvias", label: "Microvias", type: "bool" },
];

const acme: Manufacturer = {
    id: "m1", name: "Acme Fab", contact: "", website: "", notes: "",
    capabilities: {}, created_at: "", updated_at: "",
};

describe("ManufacturersPanel", () => {
    beforeEach(() => {
        listTemplates.mockResolvedValue([]);
        getPcbRuleFields.mockResolvedValue(RULE_FIELDS);
        updateManufacturer.mockResolvedValue(undefined);
        createManufacturer.mockResolvedValue({ id: "m_new" });
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("saves a manufacturer's capabilities", async () => {
        render(<ManufacturersPanel manufacturers={[acme]} canEdit onChanged={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "Edit Acme Fab" }));
        // The capability fields load from getPcbRuleFields.
        const track = await screen.findByLabelText("Min track width (mm)");
        fireEvent.change(track, { target: { value: "0.127" } });
        fireEvent.click(screen.getByLabelText("Microvias"));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => expect(updateManufacturer).toHaveBeenCalled());
        const [id, body] = updateManufacturer.mock.calls[0];
        expect(id).toBe("m1");
        expect(body.capabilities).toEqual({ min_track_width: 0.127, allow_microvias: true });
    });
});
