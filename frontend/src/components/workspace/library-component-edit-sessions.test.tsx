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
        constructor(status: number, message: string, code?: string) {
            super(message);
            this.name = "ApiHttpError";
            this.status = status;
            this.code = code;
        }
    },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { ApiHttpError, fetchJson } from "@/lib/api";
import type { CatalogComponent, CatalogMetadataField } from "@/types/catalog";
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

function metadataField(
    partial: Partial<CatalogMetadataField> & Pick<CatalogMetadataField, "key" | "label" | "storage_key">,
): CatalogMetadataField {
    return {
        id: `field-${partial.key}`,
        description: "",
        group: "core",
        type: "text",
        unit: "",
        enum_values: [],
        storage_kind: "column",
        built_in: true,
        required: false,
        display_order: 0,
        archived: false,
        created_by: "",
        updated_by: "",
        created_at: "",
        updated_at: "",
        ...partial,
    };
}

function builtinEditorFields(): CatalogMetadataField[] {
    return [
        metadataField({ key: "value", label: "Value", storage_key: "value", required: true, display_order: 1 }),
        metadataField({ key: "manufacturer", label: "Manufacturer", storage_key: "manufacturer", required: true, display_order: 2 }),
        metadataField({ key: "mpn", label: "Manufacturer Part Number", storage_key: "mpn", required: true, display_order: 3 }),
        metadataField({ key: "datasheet_url", label: "Datasheet", storage_key: "datasheet_url", type: "url", required: true, display_order: 4 }),
        metadataField({ key: "description", label: "Description", storage_key: "description", required: true, display_order: 5 }),
    ];
}

function patchCallBody() {
    const request = vi.mocked(fetchJson).mock.calls.find((call) => call[1]?.method === "PATCH");
    return JSON.parse(String(request?.[1]?.body)) as Record<string, unknown>;
}

function mockMetadataRoutes(options?: {
    fields?: CatalogMetadataField[];
    component?: CatalogComponent;
    delayFields?: () => Promise<{ items: CatalogMetadataField[] }>;
    delayPatch?: () => Promise<CatalogComponent>;
}) {
    vi.mocked(fetchJson).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === "/api/catalog/metadata/fields") {
            if (options?.delayFields) return options.delayFields() as never;
            return { items: options?.fields ?? builtinEditorFields() } as never;
        }
        if (url.startsWith("/api/catalog/components/") && init?.method === "PATCH") {
            if (options?.delayPatch) return options.delayPatch() as never;
            return (options?.component ?? catalogComponent()) as never;
        }
        if (url === "/api/catalog/components/comp-a") return (options?.component ?? catalogComponent()) as never;
        return { items: [] } as never;
    });
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
        mockMetadataRoutes();
    });

    it("opens a fresh buffer after cancel so edited fields do not leak", async () => {
        const first = metadataEditSessionFrom(catalogComponent());
        const { rerender } = render(
            <MetadataEditDialog session={first} onClose={vi.fn()} onSuccess={vi.fn()} />,
        );

        fireEvent.change(await screen.findByLabelText("Value *"), { target: { value: "leaked-value" } });
        expect(screen.getByLabelText("Value *")).toHaveValue("leaked-value");

        const second = metadataEditSessionFrom(catalogComponent());
        rerender(
            <MetadataEditDialog key={second.openedAt} session={second} onClose={vi.fn()} onSuccess={vi.fn()} />,
        );

        expect(await screen.findByLabelText("Value *")).toHaveValue("10k");
        expect(screen.queryByDisplayValue("leaked-value")).not.toBeInTheDocument();
    });

    it("sends the revision captured when the session opened", async () => {
        const onSuccess = vi.fn();
        const session = metadataEditSessionFrom({
            ...catalogComponent(),
            revision_id: "rev-at-open",
        });
        render(<MetadataEditDialog session={session} onClose={vi.fn()} onSuccess={onSuccess} />);

        fireEvent.click(await screen.findByRole("button", { name: /save new revision/i }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(patchCallBody().expected_revision_id).toBe("rev-at-open");
    });

    it("renders a custom enum field from definitions and round-trips unknown extras", async () => {
        mockMetadataRoutes({
            fields: [
                ...builtinEditorFields(),
                metadataField({
                    key: "application_note",
                    label: "Application note",
                    type: "text",
                    storage_kind: "extra",
                    storage_key: "application_note",
                    built_in: false,
                    display_order: 6,
                }),
                metadataField({
                    key: "dielectric",
                    label: "Dielectric",
                    type: "number",
                    storage_kind: "extra",
                    storage_key: "dielectric",
                    built_in: false,
                    display_order: 7,
                }),
                metadataField({
                    key: "tolerance",
                    label: "Tolerance",
                    type: "enum",
                    enum_values: ["1%", "5%"],
                    storage_kind: "extra",
                    storage_key: "tolerance",
                    built_in: false,
                    display_order: 8,
                }),
            ],
            component: {
                ...catalogComponent(),
                extra_fields: {
                    application_note: "bias",
                    dielectric: "2.2",
                    tolerance: "5%",
                    leftover_note: "keep-me",
                },
            },
        });
        const onSuccess = vi.fn();
        render(
            <MetadataEditDialog
                session={metadataEditSessionFrom({
                    ...catalogComponent(),
                    extra_fields: {
                        application_note: "bias",
                        dielectric: "2.2",
                        tolerance: "5%",
                        leftover_note: "keep-me",
                    },
                })}
                onClose={vi.fn()}
                onSuccess={onSuccess}
            />,
        );

        expect(await screen.findByLabelText("Application note")).toHaveValue("bias");
        expect(screen.getByLabelText("Dielectric")).toHaveValue("2.2");
        expect(screen.getByLabelText("Tolerance")).toHaveValue("5%");
        expect(screen.getByLabelText("Unknown extra fields (JSON object)")).toHaveValue(
            JSON.stringify({ leftover_note: "keep-me" }, null, 2),
        );
        fireEvent.change(screen.getByLabelText("Dielectric"), { target: { value: "not-a-number" } });
        expect(screen.getByRole("alert")).toHaveTextContent("Invalid number");
        expect(screen.getByRole("button", { name: /save new revision/i })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Dielectric"), { target: { value: "4.7" } });
        fireEvent.change(screen.getByLabelText("Tolerance"), { target: { value: "1%" } });
        fireEvent.click(screen.getByRole("button", { name: /save new revision/i }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(patchCallBody().extra_fields).toEqual({
            leftover_note: "keep-me",
            application_note: "bias",
            dielectric: "4.7",
            tolerance: "1%",
        });
    });

    it("blocks save when a required identity field is cleared", async () => {
        render(
            <MetadataEditDialog
                session={metadataEditSessionFrom(catalogComponent())}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />,
        );

        fireEvent.change(await screen.findByLabelText("Value *"), { target: { value: "" } });
        expect(screen.getByRole("alert")).toHaveTextContent("Required");
        expect(screen.getByRole("button", { name: /save new revision/i })).toBeDisabled();
    });

    it("does not require MPN for a provisional identity", async () => {
        const onSuccess = vi.fn();
        render(
            <MetadataEditDialog
                session={metadataEditSessionFrom({
                    ...catalogComponent(),
                    identity_kind: "provisional_ipn",
                    mpn: "",
                })}
                onClose={vi.fn()}
                onSuccess={onSuccess}
            />,
        );

        expect(await screen.findByLabelText("Manufacturer Part Number")).toHaveValue("");
        expect(screen.getByText(/Manufacturer part number is optional/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /save new revision/i }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(patchCallBody().mpn).toBe("");
    });

    it("ignores field definitions that arrive after the session unmounts", async () => {
        let finish: ((value: { items: CatalogMetadataField[] }) => void) | undefined;
        mockMetadataRoutes({
            delayFields: () => new Promise((resolve) => {
                finish = resolve;
            }),
        });
        const { unmount } = render(
            <MetadataEditDialog
                session={metadataEditSessionFrom(catalogComponent())}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />,
        );

        unmount();
        finish!({
            items: [
                metadataField({ key: "tolerance", label: "Tolerance", storage_key: "tolerance" }),
            ],
        });
        await waitFor(() => expect(fetchJson).toHaveBeenCalled());
        expect(screen.queryByLabelText("Tolerance")).not.toBeInTheDocument();
    });

    it("does not apply a delayed definitions payload to a later session", async () => {
        let finishFirst: ((value: { items: CatalogMetadataField[] }) => void) | undefined;
        let calls = 0;
        vi.mocked(fetchJson).mockImplementation(async (input) => {
            const url = String(input);
            if (url !== "/api/catalog/metadata/fields") return { items: [] } as never;
            calls += 1;
            if (calls === 1) {
                return new Promise((resolve) => {
                    finishFirst = resolve;
                });
            }
            return { items: builtinEditorFields() } as never;
        });
        const first = metadataEditSessionFrom(catalogComponent());
        const { rerender } = render(
            <MetadataEditDialog session={first} onClose={vi.fn()} onSuccess={vi.fn()} />,
        );
        const second = metadataEditSessionFrom(catalogComponent());
        rerender(
            <MetadataEditDialog key={second.openedAt} session={second} onClose={vi.fn()} onSuccess={vi.fn()} />,
        );

        expect(await screen.findByLabelText("Value *")).toBeInTheDocument();
        finishFirst!({
            items: [metadataField({ key: "tolerance", label: "Tolerance", storage_key: "tolerance" })],
        });
        await waitFor(() => expect(screen.queryByLabelText("Tolerance")).not.toBeInTheDocument());
        expect(screen.getByLabelText("Value *")).toBeInTheDocument();
    });

    it("ignores a delayed metadata save that completes after unmount", async () => {
        let finish: ((value: CatalogComponent) => void) | undefined;
        mockMetadataRoutes({
            delayPatch: () => new Promise((resolve) => {
                finish = resolve;
            }),
        });
        const onSuccess = vi.fn();
        const { unmount } = render(
            <MetadataEditDialog
                session={metadataEditSessionFrom(catalogComponent())}
                onClose={vi.fn()}
                onSuccess={onSuccess}
            />,
        );

        fireEvent.click(await screen.findByRole("button", { name: /save new revision/i }));
        await waitFor(() => expect(vi.mocked(fetchJson).mock.calls.some((call) => call[1]?.method === "PATCH")).toBe(true));
        unmount();
        finish!(catalogComponent());
        await waitFor(() => expect(onSuccess).not.toHaveBeenCalled());
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
            new ApiHttpError(409, "Refresh the component before saving.", "revision_conflict"),
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
            new ApiHttpError(409, "That asset is still referenced.", "asset_referenced"),
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
        mockMetadataRoutes();
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
        fireEvent.change(await screen.findByLabelText("Value *"), { target: { value: "cancelled-edit" } });
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Edit component metadata" })).not.toBeInTheDocument());

        fireEvent.click(screen.getByRole("button", { name: /edit metadata/i }));
        expect(await screen.findByLabelText("Value *")).toHaveValue("10k");
        expect(screen.queryByDisplayValue("cancelled-edit")).not.toBeInTheDocument();
    });
});
