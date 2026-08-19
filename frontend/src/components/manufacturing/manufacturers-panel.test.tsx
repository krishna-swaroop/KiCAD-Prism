import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manufacturer } from "@/types/manufacturing";

const createManufacturer = vi.fn();
const updateManufacturer = vi.fn();
const deleteManufacturer = vi.fn();
const listTemplates = vi.fn();
const updateTemplate = vi.fn();
const getPcbRuleFields = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    createManufacturer: (...a: unknown[]) => createManufacturer(...a),
    updateManufacturer: (...a: unknown[]) => updateManufacturer(...a),
    deleteManufacturer: (...a: unknown[]) => deleteManufacturer(...a),
    listTemplates: (...a: unknown[]) => listTemplates(...a),
    updateTemplate: (...a: unknown[]) => updateTemplate(...a),
    getPcbRuleFields: (...a: unknown[]) => getPcbRuleFields(...a),
    getTemplate: vi.fn(async () => ({ id: "tpl_1", spec_config: "", capability_config: "" })),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    previewSpecConfig: vi.fn(async () => ({ sections: [], errors: [] })),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// Capture the tabs the panel passes to the unified dialog so a test can drive a
// tab's save directly and assert what it persists.
let lastTabs: Array<{ id: string; label: string; save: (t: string) => Promise<unknown>; disabledNote?: string }> = [];
vi.mock("./spec-config-editor", () => ({
    SchemaCapabilitiesDialog: (props: { tabs: typeof lastTabs }) => {
        lastTabs = props.tabs;
        return null;
    },
}));

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
    { key: "min_via_diameter", label: "Min via diameter", type: "number", unit: "mm" },
];

const acme: Manufacturer = {
    id: "m1", name: "Acme Fab", contact: "", website: "", notes: "",
    created_at: "", updated_at: "",
};

const flexTemplate = {
    id: "tpl_1", manufacturer_id: "m1", manufacturer_name: "Acme Fab", name: "flex",
    spec_config: "", capabilities: {}, created_at: "", updated_at: "",
};

describe("ManufacturersPanel", () => {
    beforeEach(() => {
        listTemplates.mockResolvedValue([flexTemplate]);
        getPcbRuleFields.mockResolvedValue({ fields: RULE_FIELDS });
        updateManufacturer.mockResolvedValue(undefined);
        updateTemplate.mockResolvedValue(undefined);
        createManufacturer.mockResolvedValue({ id: "m_new" });
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("edits a template through a unified Schema + Capabilities dialog", async () => {
        render(<ManufacturersPanel manufacturers={[acme]} canEdit onChanged={vi.fn()} />);

        // Expand the manufacturer's templates and open the flex template editor.
        fireEvent.click(screen.getByRole("button", { name: /Spec templates/ }));
        await waitFor(() => expect(listTemplates).toHaveBeenCalledWith("m1"));
        fireEvent.click(await screen.findByRole("button", { name: "Edit flex" }));

        await waitFor(() => expect(lastTabs.length).toBe(2));
        expect(lastTabs.map((t) => t.label)).toEqual(["Schema", "Capabilities"]);
    });

    it("saves capability .config text from the Capabilities tab", async () => {
        render(<ManufacturersPanel manufacturers={[acme]} canEdit onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: /Spec templates/ }));
        await waitFor(() => expect(listTemplates).toHaveBeenCalledWith("m1"));
        fireEvent.click(await screen.findByRole("button", { name: "Edit flex" }));
        await waitFor(() => expect(lastTabs.length).toBe(2));

        const capTab = lastTabs.find((t) => t.id === "capabilities")!;
        await capTab.save("[Board rules]\nmin_track_width: number = 0.09 | Min track (mm)\n");

        expect(updateTemplate).toHaveBeenCalledWith("tpl_1", {
            capability_config: "[Board rules]\nmin_track_width: number = 0.09 | Min track (mm)\n",
        });
    });
});
