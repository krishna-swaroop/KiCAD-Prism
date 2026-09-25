import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
    fetchJson: vi.fn(),
    fetchApi: vi.fn(),
    readApiError: vi.fn(async () => "error"),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { fetchJson } from "@/lib/api";
import { LibraryBulkEditWorkspace } from "./library-bulk-edit-workspace";

// The editable cell holds a draft while the committed value lives in the grid.
// It used to mirror the value into the draft with an effect; the draft is now
// seeded when the cell is activated. These pin both halves of that trade: the
// draft must start from the committed value, and committing must not drag
// focus back into the cell the reviewer just left.

const FIELD = {
    id: "f1", key: "value", label: "Value", description: "", group: "core",
    type: "text", unit: "", enum_values: [], storage_kind: "column",
    storage_key: "value", built_in: true, required: false, display_order: 1,
    archived: false,
};

const COMPONENT = {
    id: "c1", name: "R1", mpn: "RC0402", value: "10k",
    workflow_stage: "draft", revision: 1, extra: {},
};

function route(url: string) {
    if (url.startsWith("/api/catalog/metadata/fields")) return { items: [FIELD] };
    if (url.startsWith("/api/catalog/metadata/grid-preferences")) {
        return { visible: ["value"], order: ["value"], widths: {}, pinned: [] };
    }
    if (url.startsWith("/api/catalog/categories")) return { categories: [] };
    if (url.startsWith("/api/catalog/metadata/grid")) {
        return { items: [COMPONENT], total: 1, page: 1, page_size: 50, pages: 1, schema: "v1", fields: [FIELD] };
    }
    return {};
}

beforeEach(() => {
    vi.mocked(fetchJson).mockImplementation(async (input) => route(String(input)) as never);
});
afterEach(() => vi.clearAllMocks());

const cell = () => screen.getByRole("gridcell", { name: "Value: 10k" });
const editor = () => screen.getByRole("textbox", { name: "Value" });

async function renderGrid() {
    render(<LibraryBulkEditWorkspace user={{ id: "u1", email: "a@b.c", role: "admin" } as never} />);
    await waitFor(() => expect(cell()).toBeInTheDocument());
}

describe("bulk edit cell drafting", () => {
    it("seeds the draft from the committed value when the cell is activated", async () => {
        await renderGrid();
        fireEvent.focus(cell());
        await waitFor(() => expect(editor()).toBeInTheDocument());
        expect((editor() as HTMLInputElement).value).toBe("10k");
    });

    it("keeps typing in the draft without writing it back to the grid", async () => {
        await renderGrid();
        fireEvent.focus(cell());
        await waitFor(() => expect(editor()).toBeInTheDocument());

        fireEvent.change(editor(), { target: { value: "22k" } });
        expect((editor() as HTMLInputElement).value).toBe("22k");
    });

    it("does not pull focus back into the cell after the blur that commits it", async () => {
        await renderGrid();
        const outside = document.createElement("button");
        document.body.appendChild(outside);

        fireEvent.focus(cell());
        await waitFor(() => expect(editor()).toBeInTheDocument());
        // The cell takes focus on activation; without that this proves nothing.
        await waitFor(() => expect(document.activeElement).toBe(editor()));

        fireEvent.change(editor(), { target: { value: "22k" } });
        // Moving focus away is what commits, so the commit re-render lands
        // while the reviewer is already somewhere else.
        outside.focus();
        fireEvent.blur(screen.queryByRole("textbox", { name: "Value" }) ?? outside);

        // The commit re-render happens here. Let every effect it schedules run
        // before asking where focus ended up.
        await act(async () => { await Promise.resolve(); });

        expect((editor() as HTMLInputElement).value).toBe("22k");
        expect(document.activeElement).toBe(outside);
        outside.remove();
    });
});
