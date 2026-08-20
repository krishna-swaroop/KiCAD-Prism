import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedSpecConfig } from "@/types/manufacturing";

const previewSpecConfig = vi.fn();

vi.mock("@/lib/manufacturing", () => ({
    previewSpecConfig: (...a: unknown[]) => previewSpecConfig(...a),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

import { SpecConfigEditor } from "./spec-config-editor";

const PARSED: ParsedSpecConfig = {
    sections: [
        {
            title: "Stackup",
            optional: false,
            when: null,
            fields: [{ key: "layer_count", label: "Layer count", type: "int", options: [], default: null, when: null }],
        },
    ],
    errors: [],
};

function renderEditor(overrides: Partial<Parameters<typeof SpecConfigEditor>[0]> = {}) {
    const load = vi.fn(async () => ({ text: "[Stackup]\nlayer_count: int", parsed: PARSED }));
    const save = vi.fn(async () => PARSED);
    const onSaved = vi.fn();
    render(
        <SpecConfigEditor
            title="Edit schema"
            description="desc"
            load={load}
            save={save}
            onClose={vi.fn()}
            onSaved={onSaved}
            {...overrides}
        />,
    );
    return { load, save, onSaved };
}

describe("SpecConfigEditor", () => {
    beforeEach(() => {
        previewSpecConfig.mockResolvedValue(PARSED);
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("loads the config and previews its parsed fields", async () => {
        renderEditor();
        await waitFor(() =>
            expect((screen.getByLabelText(".config") as HTMLTextAreaElement).value).toContain("layer_count"),
        );
        expect(screen.getByText("Layer count")).toBeTruthy();
    });

    it("shows parse errors from the live preview", async () => {
        renderEditor();
        await waitFor(() => expect(screen.getByLabelText(".config")).toBeTruthy());

        previewSpecConfig.mockResolvedValue({
            sections: [],
            errors: ["Line 1: unknown type `banana`."],
        });
        fireEvent.change(screen.getByLabelText(".config"), { target: { value: "[S]\nx: banana" } });

        // The error surfaces in the preview pane.
        await waitFor(() => expect(screen.getByText(/unknown type/)).toBeTruthy());
    });

    it("saves the edited text through the save callback", async () => {
        const { save, onSaved } = renderEditor();
        await waitFor(() => expect(screen.getByLabelText(".config")).toBeTruthy());

        fireEvent.change(screen.getByLabelText(".config"), { target: { value: "[S]\nx: text" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => expect(save).toHaveBeenCalledWith("[S]\nx: text"));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it("downloads the current text as a .config file", async () => {
        const createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}`);
        const revokeObjectURL = vi.fn();
        vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
        const clickSpy = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => {});

        renderEditor({ fileBaseName: "my-schema" });
        await waitFor(() => expect(screen.getByLabelText(".config")).toBeTruthy());
        fireEvent.click(screen.getByTitle("Download this .config"));

        expect(createObjectURL).toHaveBeenCalled();
        const blob = createObjectURL.mock.calls[0][0];
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.size).toBeGreaterThan(0);
        expect(clickSpy).toHaveBeenCalled();
        clickSpy.mockRestore();
    });

    it("uploads a file into the editor and re-previews", async () => {
        renderEditor();
        await waitFor(() => expect(screen.getByLabelText(".config")).toBeTruthy());

        previewSpecConfig.mockResolvedValue({
            sections: [
                {
                    title: "Uploaded",
                    optional: false,
                    when: null,
                    fields: [{ key: "foo", label: "Foo", type: "text", options: [], default: null, when: null }],
                },
            ],
            errors: [],
        });
        // The hidden file input is the only file input in the pane.
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File(["[Uploaded]\nfoo: text"], "caps.config", { type: "text/plain" });
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() =>
            expect((screen.getByLabelText(".config") as HTMLTextAreaElement).value).toContain("Uploaded"),
        );
        await waitFor(() => expect(screen.getByText("Foo")).toBeTruthy());
    });

    it("renders a header slot (e.g. a template picker)", async () => {
        renderEditor({
            headerSlot: () => <button type="button">Apply template…</button>,
        });
        await waitFor(() => expect(screen.getByLabelText(".config")).toBeTruthy());
        expect(screen.getByRole("button", { name: "Apply template…" })).toBeTruthy();
    });
});
