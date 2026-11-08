import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./catalog-client");
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";

import * as catalog from "./catalog-client";
import { LibraryBulkEditWorkspace } from "./library-bulk-edit-workspace";

import type { CatalogMetadataBatch } from "@/types/catalog";

// A cancelled metadata job is terminal. Before this was handled the poll
// predicate asked only whether the job had completed, so a cancelled job
// kept the review dialog busy forever. These pin the end of the wait: the
// job is read once, the reviewer sees the cancellation, and Apply is enabled.

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

const BATCH: CatalogMetadataBatch = {
    id: "b1", source: "grid", status: "ready", schema_version: "v1",
    change_summary: "Bulk update component metadata", unknown_fields: [],
    created_by: "", total_items: 1, valid_items: 1, applied_items: 0, failed_items: 0,
    created_at: "", updated_at: "",
    items: [{
        id: "i1", component_id: "c1", expected_revision_id: "r1", name: "R1", mpn: "RC0402",
        patch: { value: "22k" }, diff: [{ field: "value", label: "Value", before: "10k", after: "22k" }],
        validation_status: "valid", error_message: "", applied_revision_id: "",
    }],
};

beforeEach(() => {
    vi.mocked(catalog.listMetadataFields).mockResolvedValue({ items: [FIELD] } as never);
    vi.mocked(catalog.getMetadataGridPreferences).mockResolvedValue(
        { visible: ["value"], order: ["value"], widths: {}, pinned: [] },
    );
    vi.mocked(catalog.listCategories).mockResolvedValue({ categories: [] });
    vi.mocked(catalog.getMetadataGrid).mockResolvedValue(
        { items: [COMPONENT], total: 1, page: 1, page_size: 50, pages: 1, schema: "v1", fields: [FIELD] } as never,
    );
    vi.mocked(catalog.saveMetadataGridPreferences).mockResolvedValue({});
    vi.mocked(catalog.createMetadataBatch).mockResolvedValue(BATCH);
    vi.mocked(catalog.applyMetadataBatch).mockResolvedValue({ job_id: "job-1" });
});
afterEach(() => vi.clearAllMocks());

const cell = () => screen.getByRole("gridcell", { name: "Value: 10k" });
const editor = () => screen.getByRole("textbox", { name: "Value" });

async function openReviewWithStagedChange() {
    render(<LibraryBulkEditWorkspace user={{ id: "u1", email: "a@b.c", role: "admin" } as never} />);
    await waitFor(() => expect(cell()).toBeInTheDocument());

    fireEvent.focus(cell());
    await waitFor(() => expect(editor()).toBeInTheDocument());
    fireEvent.change(editor(), { target: { value: "22k" } });
    fireEvent.blur(editor());

    fireEvent.click(await screen.findByRole("button", { name: "Review 1 staged components" }));
    fireEvent.click(await screen.findByRole("button", { name: "Validate changes" }));
}

describe("bulk edit apply job", () => {
    it("ends the poll and clears busy when the job is cancelled", async () => {
        vi.mocked(catalog.getMetadataJob).mockResolvedValue({ status: "cancelled" });

        await openReviewWithStagedChange();
        const apply = await screen.findByRole("button", { name: "Apply 1 revisions" });
        await waitFor(() => expect(apply).toBeEnabled());
        fireEvent.click(apply);

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Job cancelled"));
        await waitFor(() => expect(apply).toBeEnabled());
        expect(catalog.getMetadataJob).toHaveBeenCalledTimes(1);
        expect(catalog.getMetadataBatch).not.toHaveBeenCalled();
    });
});
