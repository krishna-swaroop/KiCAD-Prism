/**
 * RV-03 — Prism multi-net highlight integration (contract C1).
 *
 * Three layers are exercised together: the pure host state and mapping, the
 * presentational chips, and the Visualizer wiring through a fake
 * `<ecad-viewer>` that mirrors the sealed RV-01 semantics closely enough to
 * prove request routing, echo suppression and revision clearing.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));

import { Visualizer } from "@/components/visualizer";
import {
    applyHighlightIntent,
    createReviewHighlightState,
    highlightRefKey,
    mapSelectionToHighlightRef,
    noticeForMappingFailure,
    reviewHighlightReducer,
    REVIEW_HIGHLIGHT_ORIGIN,
} from "@/lib/review-highlight-state";
import type {
    EcadSemanticSelectionDetail,
    HighlightChangeDetail,
    HighlightRequest,
    HighlightResult,
    HighlightUnresolvedReason,
    ScopedNetRef,
} from "@/types/ecad-viewer";
import type { PrismSemanticIndex } from "@/types/prism-selection";
import { HighlightControls } from "./highlight-controls";

// ---------------------------------------------------------------------------
// Fake <ecad-viewer>: mirrors the sealed highlight-set semantics.
// ---------------------------------------------------------------------------

type SourceUpdate = {
    revisionKey: string;
    sources: Array<{ filename: string; content: string }>;
};

const ROOT_UUID = "11111111-1111-4111-8111-111111111111";
const POWER_UUID = "44444444-4444-4444-8444-444444444444";

function sameRefSet(a: readonly ScopedNetRef[], b: readonly ScopedNetRef[]): boolean {
    if (a.length !== b.length) return false;
    const keys = new Set(a.map(highlightRefKey));
    return b.every((ref) => keys.has(highlightRefKey(ref)));
}

class FakeEcadViewer extends HTMLElement {
    static instances: FakeEcadViewer[] = [];

    static pcbNets = new Set<string>();
    static schNets = new Set<string>();

    readonly ready = Promise.resolve();
    currentRevisionKey: string | null = null;
    documentKeys: string[] = [];
    context: "SCH" | "PCB" | null = null;
    highlightedNets: ScopedNetRef[] = [];
    dimming = false;
    variant: string | null = null;

    readonly replaceSources = vi.fn(async (update: SourceUpdate) => {
        const revisionChanged =
            this.currentRevisionKey !== null
            && this.currentRevisionKey !== update.revisionKey;
        this.currentRevisionKey = update.revisionKey;
        this.documentKeys = update.sources.map((source) => source.filename);
        this.context = this.documentKeys.some((name) => name.endsWith(".kicad_pcb"))
            ? "PCB"
            : "SCH";
        if (revisionChanged) {
            const previous = this.highlightedNets;
            this.highlightedNets = [];
            this.emitHighlightChange({
                revisionKey: update.revisionKey,
                documentKey: previous[0]?.documentKey ?? "",
                operation: "clear",
                origin: "ecad-viewer",
                requestId: "",
                changed: true,
                nets: [],
                accepted: [],
                unresolved: [],
                cause: "revision-reset",
            });
        }
    });
    readonly appendSources = vi.fn(async (update: SourceUpdate) => {
        this.documentKeys = [
            ...this.documentKeys,
            ...update.sources.map((source) => source.filename),
        ];
    });
    readonly setActive = vi.fn();
    readonly setViewportInsets = vi.fn();
    readonly setCommentMode = vi.fn();
    readonly setCommentOverlays = vi.fn();
    readonly clearCommentOverlays = vi.fn();
    readonly switchPage = vi.fn();
    readonly zoomToLocation = vi.fn();
    readonly navigateSchematicPage = vi.fn(() => false);
    readonly navigateSchematicParent = vi.fn(() => false);
    readonly getSchematicPages = vi.fn(() => []);
    readonly getActiveSchematicPage = vi.fn(() => null);
    readonly getPcbViewState = vi.fn(() => null);
    readonly getNetStatistics = vi.fn(() => null);
    readonly showPage = vi.fn(async () => undefined);
    readonly requestCrossProbe = vi.fn(async () => ({
        ok: true as const,
        targetContext: "PCB" as const,
        generation: 1,
    }));
    readonly setVariant = vi.fn((name: string | null) => {
        this.variant = name;
        return true;
    });
    readonly getVariant = vi.fn(() => this.variant);
    readonly getVariants = vi.fn(() => []);
    readonly clearSelection = vi.fn(() => {
        this.highlightedNets = [];
    });
    readonly focusHighlightedNets = vi.fn(() => this.highlightedNets.length > 0);
    readonly setHighlightDimming = vi.fn((enabled: boolean) => {
        this.dimming = enabled;
        return true;
    });
    readonly getHighlightedNets = vi.fn(() => this.highlightedNets);
    constructor() {
        super();
        FakeEcadViewer.instances.push(this);
    }

    readonly updateHighlightedNets = vi.fn(
        (request: HighlightRequest): HighlightResult => {
            if (
                this.currentRevisionKey === null
                || request.revisionKey !== this.currentRevisionKey
            ) {
                return {
                    changed: false,
                    accepted: [],
                    unresolved: request.nets.map((ref) => ({
                        ref,
                        reason: "revision-mismatch" as const,
                    })),
                    cameraMoved: false,
                };
            }
            if (!this.documentKeys.includes(request.documentKey)) {
                return {
                    changed: false,
                    accepted: [],
                    unresolved: request.nets.map((ref) => ({
                        ref,
                        reason: "document-mismatch" as const,
                    })),
                    cameraMoved: false,
                };
            }
            if (request.operation === "clear") {
                const changed = this.highlightedNets.length > 0;
                this.highlightedNets = [];
                if (changed) {
                    this.emitHighlightChange(this.changeFor(request, [], []));
                }
                return { changed, accepted: [], unresolved: [], cameraMoved: false };
            }
            const accepted: ScopedNetRef[] = [];
            const unresolved: Array<{
                ref: ScopedNetRef;
                reason: HighlightUnresolvedReason;
            }> = [];
            for (const ref of request.nets) {
                if (
                    ref.documentKey !== request.documentKey
                    || !this.documentKeys.includes(ref.documentKey)
                ) {
                    unresolved.push({ ref, reason: "document-mismatch" });
                    continue;
                }
                const known =
                    this.context === "PCB" ? FakeEcadViewer.pcbNets : FakeEcadViewer.schNets;
                if (!known.has(ref.netKey)) {
                    unresolved.push({ ref, reason: "unknown-net" });
                    continue;
                }
                accepted.push(ref);
            }
            if (request.operation === "replace") {
                const changed = !sameRefSet(this.highlightedNets, accepted);
                if (changed) {
                    this.highlightedNets = [...accepted];
                    this.emitHighlightChange(this.changeFor(request, accepted, unresolved));
                }
                return { changed, accepted, unresolved, cameraMoved: false };
            }
            let changed = false;
            for (const ref of accepted) {
                const index = this.highlightedNets.findIndex(
                    (candidate) => highlightRefKey(candidate) === highlightRefKey(ref),
                );
                if (request.operation === "add") {
                    if (index < 0) {
                        this.highlightedNets = [...this.highlightedNets, ref];
                        changed = true;
                    }
                } else if (request.operation === "toggle") {
                    if (index >= 0) {
                        this.highlightedNets = this.highlightedNets.filter(
                            (_candidate, position) => position !== index,
                        );
                        changed = true;
                    } else {
                        this.highlightedNets = [...this.highlightedNets, ref];
                        changed = true;
                    }
                } else if (request.operation === "remove" && index >= 0) {
                    this.highlightedNets = this.highlightedNets.filter(
                        (_candidate, position) => position !== index,
                    );
                    changed = true;
                }
            }
            if (changed) {
                this.emitHighlightChange(this.changeFor(request, accepted, unresolved));
            }
            return { changed, accepted, unresolved, cameraMoved: false };
        },
    );

    private changeFor(
        request: HighlightRequest,
        accepted: readonly ScopedNetRef[],
        unresolved: readonly { ref: ScopedNetRef; reason: HighlightUnresolvedReason }[],
    ): HighlightChangeDetail {
        return {
            revisionKey: request.revisionKey,
            documentKey: request.documentKey,
            operation: request.operation,
            origin: request.origin,
            requestId: request.requestId,
            changed: true,
            nets: this.highlightedNets,
            accepted,
            unresolved,
            cause: "request",
        };
    }

    private emitHighlightChange(detail: HighlightChangeDetail): void {
        this.dispatchEvent(
            new CustomEvent("ecad-viewer:highlight-change", {
                detail,
                bubbles: true,
                composed: true,
            }),
        );
    }
}

// ---------------------------------------------------------------------------
// Fixtures and helpers.
// ---------------------------------------------------------------------------

const SEMANTIC_INDEX: PrismSemanticIndex = {
    schema: "prism.semantic_index_a0",
    sourceRevisionKey: "rev-1",
    components: [],
    nets: [
        {
            netUid: "net-sense",
            name: "SENSE",
            schematicRefs: [
                { page: "root.kicad_sch", sheetInstancePath: `/${ROOT_UUID}` },
            ],
        },
    ],
    terminals: [],
    indexes: { netByName: { SENSE: 0 } },
    assembly: {
        schema: "prism.assembly_state_a0",
        catalog: [{ name: "Lite", description: null, sources: ["project"] }],
        default: { occurrences: {}, components: {}, footprints: {} },
        variants: [{ name: "Lite", occurrences: {}, components: {}, footprints: {} }],
        diagnostics: [],
    },
};

const PCB_REF_A: ScopedNetRef = {
    revisionKey: "pcb:r1",
    documentKey: "board.kicad_pcb",
    context: "PCB",
    netKey: "A",
    netCode: 1,
};
const PCB_REF_B: ScopedNetRef = {
    revisionKey: "pcb:r1",
    documentKey: "board.kicad_pcb",
    context: "PCB",
    netKey: "B",
    netCode: 2,
};
const SCH_REF_SENSE: ScopedNetRef = {
    revisionKey: "schematic:r1",
    documentKey: "root.kicad_sch",
    context: "SCH",
    netKey: "SENSE",
    occurrencePath: `/${ROOT_UUID}`,
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function textResponse(body: string, status = 200): Response {
    return new Response(body, { status });
}

let subsheetFiles: Array<{ name: string; url: string }> = [];

function stubViewerFetch(): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/viewer/support-files")) return jsonResponse({ files: [] });
            if (url.includes("/semantic-index/identity")) return jsonResponse(SEMANTIC_INDEX);
            if (url.includes("/comments/mention-candidates")) return jsonResponse([]);
            if (url.includes("/comments")) return jsonResponse({ comments: [] });
            if (url.includes("/Subsheets/")) return textResponse("(kicad_sch)");
            if (url.includes("/schematic/subsheets")) return jsonResponse({ files: subsheetFiles });
            if (url.includes("/schematic")) return textResponse("(kicad_sch)");
            if (url.includes("/pcb")) return textResponse("(kicad_pcb)");
            return textResponse("", 404);
        }),
    );
}

function viewerFor(context: "SCH" | "PCB"): FakeEcadViewer {
    const viewer = FakeEcadViewer.instances.find(
        (candidate) => candidate.context === context,
    );
    if (!viewer) throw new Error(`no ${context} viewer mounted`);
    return viewer;
}

function selectionDetail(
    context: "SCH" | "PCB",
    overrides: Partial<EcadSemanticSelectionDetail> = {},
): EcadSemanticSelectionDetail {
    return {
        sourceContext: context,
        itemType: context === "PCB" ? "track" : "label",
        operation: "toggle",
        modifiers: { shift: true },
        ...overrides,
    };
}

function shiftClick(viewer: FakeEcadViewer, overrides: Partial<EcadSemanticSelectionDetail> = {}): void {
    const detail = selectionDetail(viewer.context ?? "PCB", overrides);
    act(() => {
        viewer.dispatchEvent(
            new CustomEvent("ecad-viewer:selection", {
                detail,
                bubbles: true,
                composed: true,
            }),
        );
    });
}

function highlightRequests(viewer: FakeEcadViewer): HighlightRequest[] {
    return viewer.updateHighlightedNets.mock.calls.map(([request]) => request);
}

async function mountVisualizer(commit = "c1") {
    const view = render(
        <MemoryRouter initialEntries={["/projects/p1?tab=sch"]}>
            <Visualizer projectId="p1" user={null} commit={commit} />
        </MemoryRouter>,
    );
    await waitFor(() => {
        expect(FakeEcadViewer.instances.some((viewer) => viewer.context === "SCH")).toBe(true);
    });
    const schematic = viewerFor("SCH");
    await waitFor(() => expect(schematic.replaceSources).toHaveBeenCalled());
    return { view, schematic };
}

async function mountWithPcb(commit = "c1") {
    const mounted = await mountVisualizer(commit);
    fireEvent.click(document.querySelector('[data-visualizer-tab="pcb"]') as HTMLElement);
    await waitFor(() => {
        expect(FakeEcadViewer.instances.some((viewer) => viewer.context === "PCB")).toBe(true);
    });
    const pcb = viewerFor("PCB");
    await waitFor(() => expect(pcb.replaceSources).toHaveBeenCalled());
    return { ...mounted, pcb };
}

function selectedNetList(): HTMLElement {
    return screen.getByRole("list", { name: "Selected nets" });
}

beforeAll(() => {
    if (!customElements.get("ecad-viewer")) {
        customElements.define("ecad-viewer", FakeEcadViewer);
    }
});

beforeEach(() => {
    FakeEcadViewer.instances = [];
    FakeEcadViewer.pcbNets = new Set(["A", "B"]);
    FakeEcadViewer.schNets = new Set(["SENSE", "VBUS"]);
    subsheetFiles = [];
    stubViewerFetch();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Pure state and mapping.
// ---------------------------------------------------------------------------

describe("rv-03: highlight collection", () => {
    it("adds, toggles, dedupes and removes refs by their scoped key", () => {
        let refs = applyHighlightIntent([], PCB_REF_A, "add");
        expect(refs).toEqual([PCB_REF_A]);

        refs = applyHighlightIntent(refs, PCB_REF_A, "add");
        expect(refs).toHaveLength(1);

        refs = applyHighlightIntent(refs, PCB_REF_A, "toggle");
        expect(refs).toEqual([]);

        refs = applyHighlightIntent(refs, PCB_REF_A, "toggle");
        refs = applyHighlightIntent(refs, PCB_REF_B, "add");
        expect(refs.map((ref) => ref.netKey)).toEqual(["A", "B"]);

        refs = applyHighlightIntent(refs, { ...PCB_REF_A }, "toggle");
        expect(refs.map((ref) => ref.netKey)).toEqual(["B"]);
    });

    it("keeps SCH occurrences distinct even when the label text matches", () => {
        const stageA: ScopedNetRef = { ...SCH_REF_SENSE, occurrencePath: `/${ROOT_UUID}/a` };
        const stageB: ScopedNetRef = { ...SCH_REF_SENSE, occurrencePath: `/${ROOT_UUID}/b` };
        const refs = applyHighlightIntent(applyHighlightIntent([], stageA, "add"), stageB, "add");
        expect(refs).toHaveLength(2);
    });

    it("drops a ref the viewer rejected and surfaces a notice", () => {
        let state = createReviewHighlightState();
        state = reviewHighlightReducer(state, {
            type: "intent",
            ref: PCB_REF_A,
            intent: "add",
            requestId: "r1",
        });
        state = reviewHighlightReducer(state, {
            type: "notice",
            notice: {
                key: highlightRefKey(PCB_REF_A),
                label: "A",
                reason: "unknown-net",
                message: '"A" could not be found in the loaded revision.',
                ref: PCB_REF_A,
            },
        });
        expect(state.refs).toEqual([]);
        expect(state.notices).toHaveLength(1);
    });
});

describe("rv-03: selection mapping", () => {
    it("maps a PCB net detail to the loaded board document", () => {
        const result = mapSelectionToHighlightRef({
            context: "PCB",
            detail: {
                sourceContext: "PCB",
                itemType: "track",
                net: "A",
                netCode: 1,
                page: "board.kicad_pcb",
            },
            revisionKey: "pcb:r1",
            documentKeys: ["board.kicad_pcb"],
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.ref).toMatchObject({
            revisionKey: "pcb:r1",
            documentKey: "board.kicad_pcb",
            context: "PCB",
            netKey: "A",
            netCode: 1,
        });
    });

    it("maps a schematic net label to its document and occurrence path", () => {
        const result = mapSelectionToHighlightRef({
            context: "SCH",
            detail: {
                sourceContext: "SCH",
                itemType: "label",
                net: "SENSE",
                page: `root.kicad_sch:/${ROOT_UUID}`,
            },
            revisionKey: "schematic:r1",
            documentKeys: ["root.kicad_sch"],
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.ref).toMatchObject({
            context: "SCH",
            documentKey: "root.kicad_sch",
            netKey: "SENSE",
            occurrencePath: `/${ROOT_UUID}`,
        });
    });

    it("refuses an unmappable schematic net instead of guessing a document", () => {
        const result = mapSelectionToHighlightRef({
            context: "SCH",
            detail: {
                sourceContext: "SCH",
                itemType: "label",
                net: "SENSE",
                page: `missing.kicad_sch:/${ROOT_UUID}`,
            },
            revisionKey: "schematic:r1",
            documentKeys: ["root.kicad_sch"],
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe("document-mismatch");
        expect(result.message).toContain("missing.kicad_sch");
    });

    it("reports an ambiguous repeated sheet from the semantic index", () => {
        const repeated: PrismSemanticIndex = {
            ...SEMANTIC_INDEX,
            nets: [
                {
                    netUid: "net-sense",
                    name: "SENSE",
                    schematicRefs: [
                        {
                            page: "stage.kicad_sch",
                            sheetInstancePath: `/${ROOT_UUID}/22222222-2222-4222-8222-222222222222`,
                        },
                        {
                            page: "stage.kicad_sch",
                            sheetInstancePath: `/${ROOT_UUID}/33333333-3333-4333-8333-333333333333`,
                        },
                    ],
                },
            ],
            indexes: { netByName: { SENSE: 0 } },
        };
        const result = mapSelectionToHighlightRef({
            context: "SCH",
            detail: {
                sourceContext: "SCH",
                itemType: "label",
                net: "SENSE",
                page: "stage.kicad_sch",
            },
            selection: {
                kind: "net",
                sourceContext: "SCH",
                netName: "SENSE",
                netUid: "net-sense",
            },
            semanticIndex: repeated,
            revisionKey: "schematic:r1",
            documentKeys: ["stage.kicad_sch"],
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe("ambiguous-occurrence");
    });

    it("reports a non-net gesture as unsupported rather than nameless", () => {
        const result = mapSelectionToHighlightRef({
            context: "PCB",
            detail: { sourceContext: "PCB", itemType: "footprint", uuid: "fp-1" },
            revisionKey: "pcb:r1",
            documentKeys: ["board.kicad_pcb"],
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe("unsupported-context");
    });
});

describe("rv-03: echo suppression and revision handling", () => {
    const echo = (overrides: Partial<HighlightChangeDetail> = {}): HighlightChangeDetail => ({
        revisionKey: "pcb:r1",
        documentKey: "board.kicad_pcb",
        operation: "toggle",
        origin: REVIEW_HIGHLIGHT_ORIGIN,
        requestId: "r1",
        changed: true,
        nets: [],
        accepted: [],
        unresolved: [],
        cause: "request",
        ...overrides,
    });

    function withIntent(): ReturnType<typeof createReviewHighlightState> {
        return reviewHighlightReducer(createReviewHighlightState(), {
            type: "intent",
            ref: PCB_REF_A,
            intent: "add",
            requestId: "r1",
        });
    }

    it("ignores the element echo of an issued request even when it is stale", () => {
        const state = reviewHighlightReducer(withIntent(), {
            type: "viewer-change",
            context: "PCB",
            detail: echo({ nets: [] }),
        });
        expect(state.refs).toEqual([PCB_REF_A]);
    });

    it("adopts a foreign-origin change without re-applying it", () => {
        const state = reviewHighlightReducer(withIntent(), {
            type: "viewer-change",
            context: "PCB",
            detail: echo({ origin: "ecad-standalone", requestId: "", nets: [PCB_REF_B] }),
        });
        expect(state.refs).toEqual([PCB_REF_B]);
    });

    it("clears the context on a revision reset and drops the other on a key change", () => {
        let state = withIntent();
        state = reviewHighlightReducer(state, {
            type: "intent",
            ref: SCH_REF_SENSE,
            intent: "add",
            requestId: "r2",
        });

        const afterReset = reviewHighlightReducer(state, {
            type: "viewer-change",
            context: "PCB",
            detail: echo({
                origin: "ecad-viewer",
                requestId: "",
                cause: "revision-reset",
            }),
        });
        expect(afterReset.refs).toEqual([SCH_REF_SENSE]);

        const afterKeyChange = reviewHighlightReducer(afterReset, {
            type: "revision",
            revisionKeys: { PCB: "pcb:r2", SCH: "schematic:r2" },
        });
        expect(afterKeyChange.refs).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Presentational controls.
// ---------------------------------------------------------------------------

describe("rv-03: HighlightControls", () => {
    const props = {
        refs: [PCB_REF_A, SCH_REF_SENSE],
        notices: [],
        dimming: false,
        onRemove: vi.fn(),
        onClear: vi.fn(),
        onToggleDimming: vi.fn(),
        onFit: vi.fn(),
        canFit: true,
    };

    it("renders chips with independent remove actions and a Clear", () => {
        const onRemove = vi.fn();
        const onClear = vi.fn();
        render(<HighlightControls {...props} onRemove={onRemove} onClear={onClear} />);

        expect(within(selectedNetList()).getByText("A")).toBeTruthy();
        expect(within(selectedNetList()).getByText("SENSE")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Remove A from highlights" }));
        expect(onRemove).toHaveBeenCalledWith(PCB_REF_A);
        expect(onRemove).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it("toggles dimming and fits on demand", () => {
        const onToggleDimming = vi.fn();
        const onFit = vi.fn();
        render(
            <HighlightControls
                {...props}
                onToggleDimming={onToggleDimming}
                onFit={onFit}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Dim context" }));
        expect(onToggleDimming).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByRole("button", { name: /Fit highlighted/ }));
        expect(onFit).toHaveBeenCalledTimes(1);
    });

    it("shows viewer rejections as visible feedback", () => {
        const failure = mapSelectionToHighlightRef({
            context: "SCH",
            detail: {
                sourceContext: "SCH",
                itemType: "label",
                net: "SENSE",
                page: `missing.kicad_sch:/${ROOT_UUID}`,
            },
            revisionKey: "schematic:r1",
            documentKeys: ["root.kicad_sch"],
        });
        expect(failure.ok).toBe(false);
        if (failure.ok) return;

        render(
            <HighlightControls
                {...props}
                refs={[]}
                notices={[noticeForMappingFailure(failure)]}
            />,
        );
        expect(screen.getByRole("status", { name: "Highlight problems" })).toHaveTextContent("missing.kicad_sch");
    });
});

// ---------------------------------------------------------------------------
// Visualizer wiring.
// ---------------------------------------------------------------------------

describe("rv-03: Visualizer highlight wiring", () => {
    it("accumulates a PCB and a schematic net and toggles them independently", async () => {
        const { schematic, pcb } = await mountWithPcb();

        shiftClick(pcb, { net: "A", netCode: 1, page: "board.kicad_pcb" });
        await waitFor(() => expect(within(selectedNetList()).getByText("A")).toBeTruthy());

        shiftClick(schematic, { net: "SENSE", page: `root.kicad_sch:/${ROOT_UUID}` });
        await waitFor(() => expect(within(selectedNetList()).getByText("SENSE")).toBeTruthy());
        expect(within(selectedNetList()).getByText("A")).toBeTruthy();

        // Toggling the PCB net off leaves the schematic net alone.
        shiftClick(pcb, { net: "A", netCode: 1, page: "board.kicad_pcb" });
        await waitFor(() => expect(within(selectedNetList()).queryByText("A")).toBeNull());
        expect(within(selectedNetList()).getByText("SENSE")).toBeTruthy();

        const pcbRequests = highlightRequests(pcb).filter((request) => request.nets.length > 0);
        expect(pcbRequests).toHaveLength(2);
        expect(pcbRequests[0]).toMatchObject({
            revisionKey: "pcb:p1:c1",
            documentKey: "board.kicad_pcb",
            operation: "toggle",
            origin: REVIEW_HIGHLIGHT_ORIGIN,
        });
        expect(pcbRequests[0]!.nets[0]).toMatchObject({
            context: "PCB",
            netKey: "A",
            documentKey: "board.kicad_pcb",
            revisionKey: "pcb:p1:c1",
        });

        const schRequests = highlightRequests(schematic).filter((request) => request.nets.length > 0);
        expect(schRequests).toHaveLength(1);
        expect(schRequests[0]).toMatchObject({
            revisionKey: "schematic:p1:c1",
            documentKey: "root.kicad_sch",
            operation: "toggle",
        });
        expect(schRequests[0]!.nets[0]).toMatchObject({
            context: "SCH",
            netKey: "SENSE",
            occurrencePath: `/${ROOT_UUID}`,
        });
    });

    it("routes chip removal and Clear to the owning viewer with exact refs", async () => {
        const { schematic, pcb } = await mountWithPcb();
        shiftClick(pcb, { net: "A", netCode: 1, page: "board.kicad_pcb" });
        shiftClick(schematic, { net: "SENSE", page: `root.kicad_sch:/${ROOT_UUID}` });
        await waitFor(() => expect(within(selectedNetList()).getByText("SENSE")).toBeTruthy());

        fireEvent.click(screen.getByRole("button", { name: "Remove SENSE from highlights" }));
        await waitFor(() => expect(within(selectedNetList()).queryByText("SENSE")).toBeNull());
        const removeRequest = highlightRequests(schematic).find(
            (request) => request.operation === "remove",
        );
        expect(removeRequest).toBeDefined();
        expect(removeRequest!.nets).toEqual([
            expect.objectContaining({ context: "SCH", netKey: "SENSE" }),
        ]);

        const controls = screen.getByRole("region", { name: "Highlighted nets" });
        fireEvent.click(within(controls).getByRole("button", { name: "Clear" }));
        await waitFor(() => {
            expect(
                highlightRequests(pcb).some((request) => request.operation === "clear"),
            ).toBe(true);
            expect(
                highlightRequests(schematic).some((request) => request.operation === "clear"),
            ).toBe(true);
        });
        expect(screen.queryByRole("list", { name: "Selected nets" })).toBeNull();
    });

    it("shows unresolved feedback for an unmappable schematic net without calling the viewer", async () => {
        const { schematic } = await mountVisualizer();
        shiftClick(schematic, {
            net: "SENSE",
            page: `missing.kicad_sch:/${ROOT_UUID}`,
        });

        await waitFor(() =>
            expect(screen.getByRole("status", { name: "Highlight problems" })).toHaveTextContent("missing.kicad_sch"),
        );
        expect(schematic.updateHighlightedNets).not.toHaveBeenCalled();
    });

    it("never moves the camera on add; Fit highlighted calls focusHighlightedNets", async () => {
        const { pcb } = await mountWithPcb();
        shiftClick(pcb, { net: "A", netCode: 1, page: "board.kicad_pcb" });
        await waitFor(() => expect(within(selectedNetList()).getByText("A")).toBeTruthy());
        expect(pcb.focusHighlightedNets).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: /Fit highlighted/ }));
        expect(pcb.focusHighlightedNets).toHaveBeenCalledTimes(1);
    });

    it("suppresses a stale echo of an issued request", async () => {
        const { pcb } = await mountWithPcb();
        shiftClick(pcb, { net: "A", netCode: 1, page: "board.kicad_pcb" });
        await waitFor(() => expect(within(selectedNetList()).getByText("A")).toBeTruthy());

        const issued = highlightRequests(pcb).find((request) => request.nets.length > 0)!;
        const callsBefore = pcb.updateHighlightedNets.mock.calls.length;
        act(() => {
            pcb.dispatchEvent(
                new CustomEvent("ecad-viewer:highlight-change", {
                    detail: {
                        revisionKey: "pcb:p1:c1",
                        documentKey: "board.kicad_pcb",
                        operation: "toggle",
                        origin: REVIEW_HIGHLIGHT_ORIGIN,
                        requestId: issued.requestId,
                        changed: true,
                        nets: [],
                        accepted: [],
                        unresolved: [],
                        cause: "request",
                    } satisfies HighlightChangeDetail,
                    bubbles: true,
                    composed: true,
                }),
            );
        });

        expect(within(selectedNetList()).getByText("A")).toBeTruthy();
        expect(pcb.updateHighlightedNets.mock.calls.length).toBe(callsBefore);
    });

    it("clears highlights on a revision change and preserves them on a variant change", async () => {
        const { view, pcb } = await mountWithPcb();
        shiftClick(pcb, { net: "A", netCode: 1, page: "board.kicad_pcb" });
        await waitFor(() => expect(within(selectedNetList()).getByText("A")).toBeTruthy());

        // Same-revision variant change: the refs survive and nothing is cleared.
        fireEvent.change(screen.getByLabelText("Variant"), { target: { value: "Lite" } });
        await waitFor(() => expect(pcb.setVariant).toHaveBeenCalledWith("Lite"));
        expect(within(selectedNetList()).getByText("A")).toBeTruthy();
        expect(
            highlightRequests(pcb).some((request) => request.operation === "clear"),
        ).toBe(false);

        // A different commit is a different revision: the set must not replay.
        view.rerender(
            <MemoryRouter initialEntries={["/projects/p1?tab=sch"]}>
                <Visualizer projectId="p1" user={null} commit="c2" />
            </MemoryRouter>,
        );
        await waitFor(() =>
            expect(screen.queryByRole("list", { name: "Selected nets" })).toBeNull(),
        );
        await waitFor(() =>
            expect(pcb.replaceSources).toHaveBeenCalledWith(
                expect.objectContaining({ revisionKey: "pcb:p1:c2" }),
            ),
        );
        expect(
            highlightRequests(pcb)
                .filter((request) => request.nets.length > 0)
                .every((request) => request.revisionKey === "pcb:p1:c1"),
        ).toBe(true);
    });

    it("keeps the retained set when empty canvas clears the inspected selection", async () => {
        const { schematic, pcb } = await mountWithPcb();
        shiftClick(pcb, { net: "A", netCode: 1, page: "board.kicad_pcb" });
        shiftClick(schematic, { net: "SENSE", page: `root.kicad_sch:/${ROOT_UUID}` });
        await waitFor(() => expect(within(selectedNetList()).getByText("SENSE")).toBeTruthy());

        const pcbCallsBefore = pcb.updateHighlightedNets.mock.calls.length;
        const schematicCallsBefore = schematic.updateHighlightedNets.mock.calls.length;

        act(() => {
            pcb.dispatchEvent(
                new CustomEvent("ecad-viewer:selection", {
                    detail: { sourceContext: "PCB", itemType: "", operation: "replace" },
                    bubbles: true,
                    composed: true,
                }),
            );
        });

        // The inspected object clears, the retained set does not.
        await waitFor(() => expect(pcb.clearSelection).toHaveBeenCalled());
        expect(schematic.clearSelection).toHaveBeenCalled();
        expect(within(selectedNetList()).getByText("A")).toBeTruthy();
        expect(within(selectedNetList()).getByText("SENSE")).toBeTruthy();

        // The cleared viewer re-projects its own context over clearSelection.
        const pcbReplace = highlightRequests(pcb)
            .slice(pcbCallsBefore)
            .find((request) => request.operation === "replace");
        expect(pcbReplace).toBeDefined();
        expect(pcbReplace!.origin).toBe(REVIEW_HIGHLIGHT_ORIGIN);
        expect(pcbReplace!.documentKey).toBe("board.kicad_pcb");
        expect(pcbReplace!.nets.map((ref) => ref.netKey)).toEqual(["A"]);
        expect(pcb.highlightedNets.map((ref) => ref.netKey)).toEqual(["A"]);

        const schematicReplace = highlightRequests(schematic)
            .slice(schematicCallsBefore)
            .find((request) => request.operation === "replace");
        expect(schematicReplace).toBeDefined();
        expect(schematicReplace!.documentKey).toBe("root.kicad_sch");
        expect(schematicReplace!.nets.map((ref) => ref.netKey)).toEqual(["SENSE"]);
    });

    it("re-projects one request per document after clearSelection", async () => {
        subsheetFiles = [
            {
                name: "Subsheets/power.kicad_sch",
                url: "/api/projects/p1/Subsheets/power.kicad_sch",
            },
        ];
        const { schematic } = await mountVisualizer();
        await waitFor(() =>
            expect(schematic.documentKeys).toContain("Subsheets/power.kicad_sch"),
        );

        shiftClick(schematic, { net: "SENSE", page: `root.kicad_sch:/${ROOT_UUID}` });
        shiftClick(schematic, {
            net: "VBUS",
            page: `Subsheets/power.kicad_sch:/${ROOT_UUID}/${POWER_UUID}`,
        });
        await waitFor(() => expect(within(selectedNetList()).getByText("VBUS")).toBeTruthy());

        const before = schematic.updateHighlightedNets.mock.calls.length;
        act(() => {
            schematic.dispatchEvent(
                new CustomEvent("ecad-viewer:selection", {
                    detail: { sourceContext: "SCH", itemType: "" },
                    bubbles: true,
                    composed: true,
                }),
            );
        });

        // One request per document: the authoritative first group is a
        // replace, the remaining groups are adds (a second replace would clear
        // the first document again per sealed C1).
        await waitFor(() => {
            const requests = highlightRequests(schematic).slice(before);
            expect(requests.filter((request) => request.operation === "replace")).toHaveLength(1);
            expect(requests.filter((request) => request.operation === "add")).toHaveLength(1);
        });
        const requests = highlightRequests(schematic).slice(before);
        const replace = requests.find((request) => request.operation === "replace")!;
        const add = requests.find((request) => request.operation === "add")!;
        expect(replace.documentKey).toBe("root.kicad_sch");
        expect(replace.nets.map((ref) => ref.netKey)).toEqual(["SENSE"]);
        expect(add.documentKey).toBe("Subsheets/power.kicad_sch");
        expect(add.nets.map((ref) => ref.netKey)).toEqual(["VBUS"]);
        // The element's effective set holds both documents.
        expect(schematic.highlightedNets.map((ref) => ref.netKey).sort()).toEqual([
            "SENSE",
            "VBUS",
        ]);
        expect(within(selectedNetList()).getByText("SENSE")).toBeTruthy();
        expect(within(selectedNetList()).getByText("VBUS")).toBeTruthy();
    });

    it("clears the selection and the highlight set on Escape", async () => {
        const { schematic, pcb } = await mountWithPcb();
        shiftClick(pcb, { net: "A", netCode: 1, page: "board.kicad_pcb" });
        shiftClick(schematic, { net: "SENSE", page: `root.kicad_sch:/${ROOT_UUID}` });
        await waitFor(() => expect(within(selectedNetList()).getByText("SENSE")).toBeTruthy());

        fireEvent.keyDown(window, { key: "Escape" });

        await waitFor(() =>
            expect(screen.queryByRole("list", { name: "Selected nets" })).toBeNull(),
        );
        expect(pcb.clearSelection).toHaveBeenCalled();
        expect(schematic.clearSelection).toHaveBeenCalled();
        expect(
            highlightRequests(pcb).some((request) => request.operation === "clear"),
        ).toBe(true);
        expect(
            highlightRequests(schematic).some((request) => request.operation === "clear"),
        ).toBe(true);
    });

    it("applies the context dimming toggle to the board viewer", async () => {
        const { pcb } = await mountWithPcb();
        shiftClick(pcb, { net: "A", netCode: 1, page: "board.kicad_pcb" });
        await waitFor(() => expect(within(selectedNetList()).getByText("A")).toBeTruthy());

        fireEvent.click(screen.getByRole("button", { name: "Dim context" }));
        await waitFor(() => expect(pcb.setHighlightDimming).toHaveBeenCalledWith(true));
    });
});
