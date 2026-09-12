import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
    fetchJson: vi.fn(),
    fetchApi: vi.fn(),
    readApiError: vi.fn(async () => "error"),
    ApiHttpError: class ApiHttpError extends Error {
        status: number;
        code?: string;
        constructor(message: string, status: number, code?: string) {
            super(message);
            this.status = status;
            this.code = code;
        }
    },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { ApiHttpError, fetchJson } from "@/lib/api";
import type { CatalogComponent } from "@/types/catalog";
import {
    AssetAttachDialog,
    assetAttachSessionFrom,
} from "./library-component-asset-dialog";
import { LibraryComponentWorkspace } from "./library-component-workspace";
import {
    MetadataEditDialog,
    metadataEditSessionFrom,
} from "./library-component-metadata-dialog";

function catalogComponent(id = "comp-a"): CatalogComponent {
    return {
        id,
        slug: id,
        name: id.toUpperCase(),
        mpn: "RC0603",
        value: "10k",
        manufacturer: "Yageo",
        description: "Resistor",
        datasheet_url: "https://example.test/ds",
        extra_fields: {},
        library_name: "PrismLib",
        change_kind: "metadata",
        change_summary: "Initial",
        created_by: "someone",
        manifest_hash: "",
        workflow_stage: "draft",
        revision: 1,
        revision_id: `${id}-rev1`,
        parent_revision_id: "",
        version: 1,
        assets: [],
        representations: [],
        extra: {},
        availability_state: "active",
        validation_status: "unknown",
        identity_kind: "mpn",
        source: "manual",
        preview_status: {},
        previews: [],
        validation: { status: "unknown", error_count: 0, warning_count: 0 },
        missing_assets: [],
        place_enabled: false,
    } as unknown as CatalogComponent;
}

function chooseFile(file: File) {
    const input = document.getElementById("component-asset-file");
    if (!(input instanceof HTMLInputElement)) throw new Error("file input missing");
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    fireEvent.change(input);
}

describe("metadata edit session", () => {
    beforeEach(() => {
        vi.mocked(fetchJson).mockReset();
    });

    it("opens a fresh buffer after cancel so edited fields do not leak", async () => {
        const first = metadataEditSessionFrom(catalogComponent());
        const { rerender } = render(
            <MetadataEditDialog session={first} onClose={vi.fn()} onSuccess={vi.fn()} />,
        );

        fireEvent.change(screen.getByLabelText("Value *"), { target: { value: "leaked-value" } });
        expect(screen.getByLabelText("Value *")).toHaveValue("leaked-value");

        const second = metadataEditSessionFrom(catalogComponent());
        rerender(
            <MetadataEditDialog key={second.openedAt} session={second} onClose={vi.fn()} onSuccess={vi.fn()} />,
        );

        expect(screen.getByLabelText("Value *")).toHaveValue("10k");
        expect(screen.queryByDisplayValue("leaked-value")).not.toBeInTheDocument();
    });

    it("sends the revision captured when the session opened", async () => {
        vi.mocked(fetchJson).mockResolvedValue(catalogComponent() as never);
        const onSuccess = vi.fn();
        const session = metadataEditSessionFrom({
            ...catalogComponent(),
            revision_id: "rev-at-open",
        });
        render(<MetadataEditDialog session={session} onClose={vi.fn()} onSuccess={onSuccess} />);

        fireEvent.click(screen.getByRole("button", { name: /save new revision/i }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        const body = JSON.parse(String(vi.mocked(fetchJson).mock.calls[0]?.[1]?.body));
        expect(body.expected_revision_id).toBe("rev-at-open");
    });
});

describe("asset attach session", () => {
    beforeEach(() => {
        vi.mocked(fetchJson).mockReset();
    });

    it("drops a selected file when a new asset type session opens", async () => {
        const onClose = vi.fn();
        const symbol = assetAttachSessionFrom(catalogComponent(), "symbol");
        const { rerender } = render(
            <AssetAttachDialog session={symbol} onClose={onClose} onSuccess={vi.fn()} />,
        );

        chooseFile(new File(["sym"], "part.kicad_sym"));
        expect(screen.getByText("part.kicad_sym")).toBeInTheDocument();

        const footprint = assetAttachSessionFrom(catalogComponent(), "footprint");
        rerender(
            <AssetAttachDialog key={footprint.openedAt} session={footprint} onClose={onClose} onSuccess={vi.fn()} />,
        );

        expect(screen.getByRole("heading", { name: "Add footprint" })).toBeInTheDocument();
        expect(screen.queryByText("part.kicad_sym")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Target library")).toHaveValue("PrismLib");
    });

    it("does not keep a selection_required picker after cancel and reopen", async () => {
        vi.mocked(fetchJson).mockResolvedValue({
            mode: "selection_required",
            discovered_symbols: ["SYM_A", "SYM_B"],
        } as never);
        const first = assetAttachSessionFrom(catalogComponent(), "symbol");
        const { rerender } = render(
            <AssetAttachDialog session={first} onClose={vi.fn()} onSuccess={vi.fn()} />,
        );

        chooseFile(new File(["sym"], "multi.kicad_sym"));
        fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
        expect(await screen.findByText("SYM_A")).toBeInTheDocument();

        const second = assetAttachSessionFrom(catalogComponent(), "symbol");
        rerender(
            <AssetAttachDialog key={second.openedAt} session={second} onClose={vi.fn()} onSuccess={vi.fn()} />,
        );

        expect(screen.queryByText("SYM_A")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /attach file/i })).toBeInTheDocument();
    });

    it("ignores a delayed upload that completes after the session unmounts", async () => {
        let finish: ((value: { component: CatalogComponent }) => void) | undefined;
        vi.mocked(fetchJson).mockImplementation(() => new Promise((resolve) => {
            finish = resolve;
        }));
        const onSuccess = vi.fn();
        const session = assetAttachSessionFrom(catalogComponent(), "symbol");
        const { unmount } = render(
            <AssetAttachDialog session={session} onClose={vi.fn()} onSuccess={onSuccess} />,
        );

        chooseFile(new File(["sym"], "part.kicad_sym"));
        fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
        unmount();
        finish!({ component: catalogComponent() });
        await waitFor(() => expect(onSuccess).not.toHaveBeenCalled());
        const request = vi.mocked(fetchJson).mock.calls[0];
        expect(String(request?.[0])).toContain("/symbol-import");
        const body = request?.[1]?.body as FormData;
        expect(body.get("expected_revision_id")).toBe("comp-a-rev1");
    });

    it("closes on revision_conflict so the next open recaptures the head", async () => {
        vi.mocked(fetchJson).mockRejectedValue(
            new ApiHttpError("Refresh the component before saving.", 409, "revision_conflict"),
        );
        const onClose = vi.fn();
        const onSuccess = vi.fn();
        const session = assetAttachSessionFrom(catalogComponent(), "symbol");
        render(<AssetAttachDialog session={session} onClose={onClose} onSuccess={onSuccess} />);

        chooseFile(new File(["sym"], "part.kicad_sym"));
        fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("keeps the session open on a non-revision 409", async () => {
        vi.mocked(fetchJson).mockRejectedValue(
            new ApiHttpError("That asset is still referenced.", 409, "asset_referenced"),
        );
        const onClose = vi.fn();
        const session = assetAttachSessionFrom(catalogComponent(), "symbol");
        render(<AssetAttachDialog session={session} onClose={onClose} onSuccess={vi.fn()} />);

        chooseFile(new File(["sym"], "part.kicad_sym"));
        fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
        await waitFor(() => expect(fetchJson).toHaveBeenCalled());
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole("heading", { name: "Add symbol" })).toBeInTheDocument();
    });
});

describe("workspace dialog sessions", () => {
    beforeEach(() => {
        vi.mocked(fetchJson).mockImplementation(async (input) => {
            const url = String(input);
            if (url === "/api/catalog/components/comp-a") return catalogComponent() as never;
            return { items: [] } as never;
        });
    });
    afterEach(() => vi.clearAllMocks());

    it("reopens metadata from the current component, not the cancelled buffer", async () => {
        render(
            <MemoryRouter initialEntries={["/?section=library-manager"]}>
                <LibraryComponentWorkspace
                    componentId="comp-a"
                    user={{ id: "u1", email: "a@b.c", role: "admin" } as never}
                    projects={[]}
                    onBack={vi.fn()}
                />
            </MemoryRouter>,
        );

        fireEvent.click(await screen.findByRole("button", { name: /edit metadata/i }));
        fireEvent.change(screen.getByLabelText("Value *"), { target: { value: "cancelled-edit" } });
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Edit component metadata" })).not.toBeInTheDocument());

        fireEvent.click(screen.getByRole("button", { name: /edit metadata/i }));
        expect(screen.getByLabelText("Value *")).toHaveValue("10k");
        expect(screen.queryByDisplayValue("cancelled-edit")).not.toBeInTheDocument();
    });
});
