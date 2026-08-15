import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSpecConfig = vi.fn();
const saveSpecConfig = vi.fn();
const previewSpecConfig = vi.fn();
const listSpecTemplates = vi.fn();
const getSpecTemplate = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    getSpecConfig: (...a: unknown[]) => getSpecConfig(...a),
    saveSpecConfig: (...a: unknown[]) => saveSpecConfig(...a),
    previewSpecConfig: (...a: unknown[]) => previewSpecConfig(...a),
    listSpecTemplates: (...a: unknown[]) => listSpecTemplates(...a),
    getSpecTemplate: (...a: unknown[]) => getSpecTemplate(...a),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

import { SpecConfigEditor } from "./spec-config-editor";

const PARSED = {
    sections: [
        {
            title: "Stackup",
            fields: [{ key: "layer_count", label: "Layer count", type: "int", options: [], default: null }],
        },
    ],
    errors: [],
};

describe("SpecConfigEditor", () => {
    beforeEach(() => {
        getSpecConfig.mockResolvedValue({ spec_config: "[Stackup]\nlayer_count: int", parsed: PARSED });
        saveSpecConfig.mockResolvedValue({ spec_config: "[Stackup]\nlayer_count: int", parsed: PARSED });
        listSpecTemplates.mockResolvedValue([
            { id: "default", label: "Prism default" },
            { id: "jlcpcb", label: "JLCPCB" },
        ]);
        getSpecTemplate.mockResolvedValue("[JLCPCB]\nboard_thickness_mm: number");
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("loads the config and previews its parsed fields", async () => {
        render(<SpecConfigEditor projectId="p1" onClose={vi.fn()} onSaved={vi.fn()} />);
        await waitFor(() => expect((screen.getByLabelText(".config") as HTMLTextAreaElement).value).toContain("layer_count"));
        // Preview shows the parsed field and a valid badge.
        expect(screen.getByText("Layer count")).toBeTruthy();
        expect(screen.getByText(/Schema is valid/)).toBeTruthy();
    });

    it("shows parse errors from the live preview", async () => {
        render(<SpecConfigEditor projectId="p1" onClose={vi.fn()} onSaved={vi.fn()} />);
        await waitFor(() => expect(screen.getByLabelText(".config")).toBeTruthy());

        previewSpecConfig.mockResolvedValue({
            sections: [],
            errors: ["Line 1: unknown type `banana`."],
        });
        fireEvent.change(screen.getByLabelText(".config"), { target: { value: "[S]\nx: banana" } });

        await waitFor(() => expect(screen.getByText(/unknown type/)).toBeTruthy());
        expect(screen.getByText(/1 problem/)).toBeTruthy();
    });

    it("loads a template into the editor", async () => {
        render(<SpecConfigEditor projectId="p1" onClose={vi.fn()} onSaved={vi.fn()} />);
        await waitFor(() => expect(screen.getByLabelText("Load a template")).toBeTruthy());

        // The current text is non-empty, so loading confirms first.
        vi.stubGlobal("confirm", vi.fn(() => true));
        fireEvent.change(screen.getByLabelText("Load a template"), { target: { value: "jlcpcb" } });

        await waitFor(() => expect(getSpecTemplate).toHaveBeenCalledWith("jlcpcb"));
        await waitFor(() =>
            expect((screen.getByLabelText(".config") as HTMLTextAreaElement).value).toContain("board_thickness_mm"),
        );
    });

    it("saves the edited schema", async () => {
        const onSaved = vi.fn();
        render(<SpecConfigEditor projectId="p1" onClose={vi.fn()} onSaved={onSaved} />);
        await waitFor(() => expect(screen.getByLabelText(".config")).toBeTruthy());

        fireEvent.change(screen.getByLabelText(".config"), { target: { value: "[S]\nx: text" } });
        fireEvent.click(screen.getByRole("button", { name: "Save schema" }));

        await waitFor(() => expect(saveSpecConfig).toHaveBeenCalledWith("p1", "[S]\nx: text"));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });
});
