import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
    CameraState,
    EcadComparisonPresentation,
    EcadComparisonSession,
    EcadComparisonSessionMetrics,
    EcadDocumentComparisonPreparation,
    EcadDocumentComparisonRequest,
    EcadPcbLayerState,
} from "@/types/ecad-viewer";
import {
    comparisonLifecycleReducer,
    createComparisonLifecycleState,
} from "./comparison-lifecycle";
import { ComparisonPresentationShell } from "./comparison-presentation-shell";
import type { ChangeItem, KiCadProjectDiffBundle } from "./types";

class FakeEcadViewer extends HTMLElement {
    static instances: FakeEcadViewer[] = [];
    static sessions: FakeComparisonSession[] = [];

    readonly ready = Promise.resolve();
    readonly isReady = true;
    readonly cameraAssignments: CameraState[] = [];
    readonly layers: EcadPcbLayerState[] = [
        { name: "F.Cu", color: "#ff0000", visible: true, highlighted: false },
        { name: "In1.Cu", color: "#00ff00", visible: true, highlighted: false },
        { name: "B.Cu", color: "#0000ff", visible: true, highlighted: false },
        {
            name: "Edge.Cuts",
            color: "#ffff00",
            visible: true,
            highlighted: false,
        },
        {
            name: "F.SilkS",
            color: "#ffffff",
            visible: true,
            highlighted: false,
        },
    ];
    readonly setActive = vi.fn();
    readonly setViewportInsets = vi.fn();
    readonly resize = vi.fn();
    readonly abortDocumentComparisonLoad = vi.fn();
    readonly selectDocumentDiff = vi.fn(async () => ({
        status: "applied" as const,
        requestId: 1,
        clickToFrameMs: 0,
        paintCount: 0,
        parserCount: 0,
    }));
    readonly previewDocumentDiff = vi.fn();
    readonly showPage = vi.fn(async () => undefined);
    readonly focusBBox = vi.fn(async () => null);
    readonly focusItem = vi.fn(async () => null);
    readonly getPcbViewState = vi.fn(() => ({
        layers: this.layers,
        objectOpacity: {
            tracks: 1,
            vias: 1,
            pads: 1,
            zones: 1,
        },
        objectVisibility: {
            references: true,
            values: true,
            footprintText: true,
            hiddenText: true,
        },
        highlightTracks: false,
    }));
    readonly setPcbLayerVisibility = vi.fn(
        (name: string, visible: boolean) => {
            const layer = this.layers.find((candidate) => candidate.name === name);
            if (!layer) return false;
            layer.visible = visible;
            return true;
        },
    );

    private cameraState: CameraState | null = null;
    /**
     * How many "camerachange" listeners are attached right now.
     *
     * Camera sync arms only once both panes report layout readiness, which
     * travels a different async path than source loading does. A test that
     * dispatches before the listener exists loses the event outright -- nothing
     * re-fires it -- so this is the signal to wait on. Counted rather than
     * flagged, so a detach is visible too.
     */
    cameraListenerCount = 0;

    constructor() {
        super();
        FakeEcadViewer.instances.push(this);
    }

    override addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void {
        if (type === "camerachange") {
            this.cameraListenerCount += 1;
        }
        super.addEventListener(type, listener, options);
    }

    override removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ): void {
        if (type === "camerachange") {
            this.cameraListenerCount -= 1;
        }
        super.removeEventListener(type, listener, options);
    }

    override get clientWidth(): number {
        return 800;
    }

    override get clientHeight(): number {
        return 600;
    }

    get camera(): CameraState | null {
        return this.cameraState;
    }

    set camera(value: CameraState | null) {
        this.cameraState = value;
        if (value) {
            this.cameraAssignments.push(value);
            this.dispatchEvent(
                new CustomEvent("camerachange", { detail: value }),
            );
        }
    }

    readonly prepareComparison = vi.fn(
        async (request: EcadDocumentComparisonRequest) => {
            const session = new FakeComparisonSession(request);
            FakeEcadViewer.sessions.push(session);
            return session;
        },
    );
}

class FakeComparisonSession implements EcadComparisonSession {
    readonly comparisonKey: string;
    readonly preparation: EcadDocumentComparisonPreparation;
    readonly setPresentation = vi.fn(
        async (
            presentation: EcadComparisonPresentation,
            viewport?: HTMLElement,
        ) => {
            void viewport;
            return {
                presentation,
                preparation: this.preparation,
                switchMs: 1,
                parserCount: 0,
                paintCount: 1,
            };
        },
    );
    readonly dispose = vi.fn();

    constructor(request: EcadDocumentComparisonRequest) {
        const documentPath = request.documentPath ?? "main.kicad_sch";
        const hasDocument = (
            sources: EcadDocumentComparisonRequest["reference"]["sources"],
        ) => sources.some(({ filename }) => {
            const normalized = filename.replace(/\\/g, "/");
            return normalized === documentPath
                || normalized.endsWith(`/${documentPath}`)
                || documentPath.endsWith(`/${normalized}`);
        });
        this.comparisonKey = request.comparisonKey;
        this.preparation = {
            comparisonKey: request.comparisonKey,
            context: documentPath.endsWith(".kicad_pcb") ? "PCB" : "SCH",
            document: {
                path: documentPath,
                docType: documentPath.endsWith(".kicad_pcb")
                    ? "kicad_pcb"
                    : "kicad_sch",
                changes: [],
            },
            targets: new Map(),
            diagnostics: [],
            prepareMs: 1,
            sourceCacheHit: false,
            missingReference: !hasDocument(request.reference.sources),
            missingComparison: !hasDocument(request.comparison.sources),
        };
    }

    getPreparation(): EcadDocumentComparisonPreparation {
        return this.preparation;
    }

    getMetrics(): EcadComparisonSessionMetrics {
        return {
            prepareMs: 1,
            parserCount: 2,
            switchCount: this.setPresentation.mock.calls.length,
            lastSwitchMs: 1,
            maxSwitchMs: 1,
            lastSwitchParserCount: 0,
            retainedViewports: new Set(
                this.setPresentation.mock.calls
                    .map(([, viewport]) => viewport)
                    .filter(Boolean),
            ).size,
            retainedScenes: 2,
            sourceBytes: 128,
        };
    }
}

const documentDiff: KiCadProjectDiffBundle = {
    schema: "prism.kicad_project_diff_v1",
    provider: "prism-semantic",
    project: {
        documents: [{
            path: "main.kicad_sch",
            docType: "kicad_sch",
            changes: [],
        }],
    },
    navigation: {},
    diagnostics: [],
};

const pcbDocumentDiff: KiCadProjectDiffBundle = {
    ...documentDiff,
    project: {
        documents: [{
            path: "board.kicad_pcb",
            docType: "kicad_pcb",
            changes: [],
        }],
    },
};

const pcbFiles = {
    base: [{ filename: "board.kicad_pcb", path: "board.kicad_pcb" }],
    head: [{ filename: "board.kicad_pcb", path: "board.kicad_pcb" }],
};

function visibleLayers(instance: number): string[] {
    return (FakeEcadViewer.instances[instance]?.layers ?? [])
        .filter((layer) => layer.visible)
        .map((layer) => layer.name);
}

const shellProps = {
    projectId: "project",
    domain: "schematic" as const,
    base: "base-revision",
    compare: "compare-revision",
    documentDiff,
    files: {
        base: [{ filename: "main.kicad_sch", path: "main.kicad_sch" }],
        head: [{ filename: "main.kicad_sch", path: "main.kicad_sch" }],
    },
    selection: null,
    reviewGroups: [],
    initialVisibleLayers: [],
    onVisibleLayersChange: vi.fn(),
};

beforeAll(() => {
    if (!customElements.get("ecad-viewer")) {
        customElements.define("ecad-viewer", FakeEcadViewer);
    }
});

beforeEach(() => {
    FakeEcadViewer.instances = [];
    FakeEcadViewer.sessions = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.includes("/viewer/support-files")) {
                return new Response(JSON.stringify({ files: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response("(kicad_sch)", { status: 200 });
        }),
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("comparison lifecycle", () => {
    it("rejects stale layout readiness after a host key changes", () => {
        let state = createComparisonLifecycleState();
        state = comparisonLifecycleReducer(state, {
            type: "attach",
            slot: "base",
            key: "base:a",
        });
        state = comparisonLifecycleReducer(state, {
            type: "attach",
            slot: "base",
            key: "base:b",
        });
        state = comparisonLifecycleReducer(state, {
            type: "layout-ready",
            slot: "base",
            key: "base:a",
        });
        expect(state.base).toMatchObject({
            key: "base:b",
            phase: "waiting-layout",
            layoutReady: false,
        });
    });
});

describe("ComparisonPresentationShell", () => {
    it("still shows a panel when nothing in this domain changed", async () => {
        // The diff bundle lists only documents that changed, so a PCB-only
        // commit leaves it with no schematic entry. That used to replace the
        // whole panel with "No schematic document for this comparison", making
        // the schematic unopenable exactly when a reviewer wanted to confirm it
        // had not moved. The revision's own files are what decide this now.
        const noSchematicChanges: KiCadProjectDiffBundle = {
            ...documentDiff,
            project: { documents: [] },
        };

        render(
            <ComparisonPresentationShell
                {...shellProps}
                documentDiff={noSchematicChanges}
                presentationMode="side-by-side"
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances.length).toBeGreaterThan(0);
        });
        expect(screen.queryByText(/No schematic document/)).toBeNull();
        expect(screen.queryByText(/Document missing in both revisions/)).toBeNull();
    });

    it("mounts only the composite host in composite mode", async () => {
        render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="composite"
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances).toHaveLength(1);
            expect(
                FakeEcadViewer.instances[0]?.prepareComparison,
            ).toHaveBeenCalledTimes(1);
        });
    });

    it("does not reload Composite when selection changes on the same document", async () => {
        const change: ChangeItem = {
            id: "changed-r5",
            kind: "changed",
            domain: "schematic",
            category: "components",
            label: "R5",
            page: "main.kicad_sch",
        };
        const groups = [{ id: "component-r5", changes: [change] }];
        const diff: KiCadProjectDiffBundle = {
            ...documentDiff,
            navigation: {
                [change.id]: {
                    documentPath: "main.kicad_sch",
                    changeId: "/r5",
                    changeIds: ["/r5"],
                },
            },
        };
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                documentDiff={diff}
                presentationMode="composite"
                selection={{ kind: "group", id: "component-r5" }}
                reviewGroups={groups}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.prepareComparison)
                .toHaveBeenCalledTimes(1);
        });
        view.rerender(
            <ComparisonPresentationShell
                {...shellProps}
                documentDiff={diff}
                presentationMode="composite"
                selection={{ kind: "item", id: change.id }}
                reviewGroups={groups}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.prepareComparison)
                .toHaveBeenCalledTimes(1);
        });
    });

    it("keeps visited presentation hosts mounted across mode switches", async () => {
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="composite"
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances).toHaveLength(1);
            expect(FakeEcadViewer.instances[0]?.prepareComparison)
                .toHaveBeenCalledTimes(1);
        });
        const primary = FakeEcadViewer.instances[0]!;
        const preparedSession = FakeEcadViewer.sessions[0]!;

        view.rerender(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="side-by-side"
            />,
        );
        await waitFor(() => {
            expect(FakeEcadViewer.instances).toHaveLength(2);
            expect(preparedSession.setPresentation)
                .toHaveBeenCalledWith("reference", primary);
            expect(preparedSession.setPresentation)
                .toHaveBeenCalledWith(
                    "comparison",
                    FakeEcadViewer.instances[1],
                );
        });

        view.rerender(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="composite"
            />,
        );
        await waitFor(() => {
            expect(FakeEcadViewer.instances).toHaveLength(2);
            expect(preparedSession.setPresentation)
                .toHaveBeenLastCalledWith("composite", primary);
            expect(primary.prepareComparison).toHaveBeenCalledTimes(1);
        });
    });

    it("reapplies the selected difference after a presentation switch settles", async () => {
        const selectedChange: ChangeItem = {
            id: "changed-r5-across-presentations",
            kind: "changed",
            domain: "schematic",
            category: "components",
            label: "R5",
            page: "main.kicad_sch",
        };
        const diff: KiCadProjectDiffBundle = {
            ...documentDiff,
            navigation: {
                [selectedChange.id]: {
                    documentPath: "main.kicad_sch",
                    changeId: "/r5",
                    changeIds: ["/r5"],
                },
            },
        };
        const props = {
            ...shellProps,
            documentDiff: diff,
            selection: { kind: "item" as const, id: selectedChange.id },
            reviewGroups: [{ id: "component-r5", changes: [selectedChange] }],
        };
        const view = render(
            <ComparisonPresentationShell
                {...props}
                presentationMode="composite"
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.selectDocumentDiff)
                .toHaveBeenCalledWith({ kind: "change", id: "/r5" });
        });
        FakeEcadViewer.instances[0]!.selectDocumentDiff.mockClear();

        view.rerender(
            <ComparisonPresentationShell
                {...props}
                presentationMode="side-by-side"
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.selectDocumentDiff)
                .toHaveBeenCalledWith({ kind: "change", id: "/r5" });
            expect(FakeEcadViewer.instances[1]?.selectDocumentDiff)
                .toHaveBeenCalledWith({ kind: "change", id: "/r5" });
        });
    });

    it("frames the pane that cannot resolve the change on the one that can", async () => {
        // A removed route exists only in the base revision, so the compare
        // pane reports "missing" and never moves its own camera. Proving an
        // absence means seeing the place it is absent from, so the resolving
        // pane's framing has to be carried across — camera sync is suppressed
        // while a selection is being applied.
        const route = (id: string) => ({
            id,
            kind: "removed" as const,
            domain: "pcb" as const,
            category: "nets",
            classification: "primary" as const,
            label: "AUX.DATA3",
            object_kind: "track",
            net: "AUX.DATA3",
            details: {
                visualTargets: [{
                    side: "reference" as const,
                    status: "removed" as const,
                    sourceId: "/r9",
                    role: "track" as const,
                }],
            },
        });
        const diff = {
            ...shellProps.documentDiff,
            navigation: {
                "removed-a": {
                    documentPath: shellProps.documentDiff.project.documents[0]!.path,
                    changeId: "/r9",
                },
                "removed-b": {
                    documentPath: shellProps.documentDiff.project.documents[0]!.path,
                    changeId: "/r9",
                },
            },
        };
        const props = {
            ...shellProps,
            documentDiff: diff,
            presentationMode: "side-by-side" as const,
        };

        const view = render(
            <ComparisonPresentationShell
                {...props}
                selection={{ kind: "item", id: "removed-a" }}
                reviewGroups={[{ id: "net-a", changes: [route("removed-a")] }]}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[1]?.selectDocumentDiff)
                .toHaveBeenCalled();
        });

        const base = FakeEcadViewer.instances[0]!;
        const compare = FakeEcadViewer.instances[1]!;
        base.selectDocumentDiff.mockResolvedValue({
            status: "applied" as const,
            requestId: 2,
            clickToFrameMs: 0,
            paintCount: 0,
            parserCount: 0,
        });
        compare.selectDocumentDiff.mockResolvedValue({
            status: "missing" as unknown as "applied",
            requestId: 2,
            clickToFrameMs: 0,
            paintCount: 0,
            parserCount: 0,
        });
        base.camera = { x: 10, y: 20, zoom: 3 } as never;
        const before = compare.cameraAssignments.length;

        // A different selection id so the shell applies a fresh selection to
        // the viewers already mounted, rather than remounting them.
        view.rerender(
            <ComparisonPresentationShell
                {...props}
                selection={{ kind: "item", id: "removed-b" }}
                reviewGroups={[{ id: "net-b", changes: [route("removed-b")] }]}
            />,
        );

        await waitFor(() => {
            expect(compare.cameraAssignments.length).toBeGreaterThan(before);
        });
        expect(compare.cameraAssignments.at(-1))
            .toEqual({ x: 10, y: 20, zoom: 3 });
    });

    it("renders host toolbar content once, beside its own Old/New toggle", async () => {
        // The presentation switcher lives in this bar but is owned by the
        // workspace, because both domain shells stay mounted and a
        // shell-rendered switcher would put two in the DOM under one
        // accessible name. The shell renders whatever it is handed, once.
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="old-new"
                toolbarContent={(
                    <div role="group" aria-label="Presentation mode" />
                )}
            />,
        );

        expect(view.getAllByRole("group", { name: "Presentation mode" }))
            .toHaveLength(1);
        // Both groups share the bar; the revision-side buttons must still
        // resolve unambiguously against a bare /Old/ query.
        expect(view.getByRole("button", { name: /Old/ }).textContent)
            .toContain("Old");
        expect(view.getAllByRole("group", { name: "Revision side" }))
            .toHaveLength(1);
    });

    it("mounts and loads exactly two hosts in side-by-side mode", async () => {
        render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="side-by-side"
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances).toHaveLength(2);
            expect(FakeEcadViewer.instances[0]?.prepareComparison)
                .toHaveBeenCalledTimes(1);
            expect(FakeEcadViewer.instances[1]?.prepareComparison)
                .not.toHaveBeenCalled();
            expect(FakeEcadViewer.sessions).toHaveLength(1);
            expect(FakeEcadViewer.sessions[0]?.setPresentation)
                .toHaveBeenCalledWith(
                    "reference",
                    FakeEcadViewer.instances[0],
                );
            expect(FakeEcadViewer.sessions[0]?.setPresentation)
                .toHaveBeenCalledWith(
                    "comparison",
                    FakeEcadViewer.instances[1],
                );
        });

        // ecadReadyRevision is written straight onto the element, while camera
        // sync arms from a React effect that cannot run until the lifecycle
        // reducer's "ready" state has been committed. Waiting on the dataset
        // therefore samples a different clock than the listener does, and under
        // a loaded suite the poll lands in the gap between them -- measured at
        // roughly one run in eight. The event is one-shot, so dispatching into
        // that gap drops it for good and leaves the assertion polling a value
        // nothing will ever change. Wait on the listener itself.
        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.cameraListenerCount)
                .toBeGreaterThan(0);
        });

        const camera: CameraState = { x: 12, y: 24, zoom: 3, rotation: 0 };
        FakeEcadViewer.instances[0]?.dispatchEvent(
            new CustomEvent("camerachange", { detail: camera }),
        );
        // Sync is synchronous once armed, so this needs no polling at all.
        expect(FakeEcadViewer.instances[1]?.cameraAssignments)
            .toContainEqual(camera);
    });

    it("cross-probes a selected difference in both side-by-side panes", async () => {
        const selectedChange: ChangeItem = {
            id: "changed-r5",
            kind: "changed",
            domain: "schematic",
            category: "components",
            label: "R5",
            page: "main.kicad_sch",
            oldGeometry: {
                kind: "symbol",
                bounds: [10, 20, 4, 6],
            },
            geometry: {
                kind: "symbol",
                bounds: [30, 40, 4, 6],
            },
        };
        const diff: KiCadProjectDiffBundle = {
            ...documentDiff,
            navigation: {
                [selectedChange.id]: {
                    documentPath: "main.kicad_sch",
                    changeId: "/r5",
                    changeIds: ["/r5"],
                },
            },
        };
        render(
            <ComparisonPresentationShell
                {...shellProps}
                documentDiff={diff}
                presentationMode="side-by-side"
                selection={{ kind: "item", id: selectedChange.id }}
                reviewGroups={[{ id: "component-r5", changes: [selectedChange] }]}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.selectDocumentDiff)
                .toHaveBeenCalled();
            expect(FakeEcadViewer.instances[1]?.selectDocumentDiff)
                .toHaveBeenCalled();
        });
    });

    it("treats intentional structured-only evidence as a valid review state", async () => {
        const ruleChange: ChangeItem = {
            id: "drc-exclusion-added",
            kind: "added",
            domain: "schematic",
            category: "rules",
            label: "DRC exclusions",
            page: "main.kicad_sch",
            details: { reviewOnly: true, visualTargets: [] },
        };
        render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="old-new"
                selection={{ kind: "item", id: ruleChange.id }}
                reviewGroups={[{ id: "drc-exclusions", changes: [ruleChange] }]}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.sessions[0]?.setPresentation).toHaveBeenCalled();
        });
        expect(screen.queryByText(/could not be resolved on the canvas/i)).toBeNull();
        expect(screen.queryByText(/derived connectivity/i)).toBeNull();
    });

    it("warns only when expected canvas evidence cannot be resolved", async () => {
        const unresolvedChange: ChangeItem = {
            id: "unresolved-wire",
            kind: "changed",
            domain: "schematic",
            category: "nets",
            label: "USB_D+",
            page: "main.kicad_sch",
            details: {
                visualTargets: [{
                    side: "comparison",
                    status: "modified",
                    sourceId: "wire-1",
                    role: "wire",
                }],
            },
        };
        render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="side-by-side"
                selection={{ kind: "item", id: unresolvedChange.id }}
                reviewGroups={[{ id: "net-usb", changes: [unresolvedChange] }]}
            />,
        );

        expect(await screen.findByText(/could not be resolved on the canvas/i))
            .toBeTruthy();
    });

    it("uses native document selection for side-relative label targets", async () => {
        const labelChange: ChangeItem = {
            id: "pf-01-count",
            kind: "changed",
            domain: "schematic",
            category: "nets",
            label: "PF_01",
            net: "PF_01",
            page: "main.kicad_sch",
            reasons: ["label-count-changed"],
            details: {
                labelInstances: { old: 2, new: 0 },
                visualTargets: [
                    {
                        side: "reference",
                        status: "removed",
                        sourceId: "label-a",
                        page: "main.kicad_sch",
                        role: "label",
                    },
                    {
                        side: "reference",
                        status: "removed",
                        sourceId: "label-b",
                        page: "main.kicad_sch",
                        role: "label",
                    },
                ],
            },
        };
        const diff: KiCadProjectDiffBundle = {
            ...documentDiff,
            navigation: {
                [labelChange.id]: {
                    documentPath: "main.kicad_sch",
                    changeId: "/label-a",
                    changeIds: ["/label-a", "/label-b"],
                },
            },
        };
        render(
            <ComparisonPresentationShell
                {...shellProps}
                documentDiff={diff}
                presentationMode="side-by-side"
                selection={{ kind: "group", id: "net-pf-01" }}
                reviewGroups={[{ id: "net-pf-01", changes: [labelChange] }]}
            />,
        );

        // Every native label the semantic item resolved is selected, not just
        // the first. Highlighting one of a net's two labels reads as if the
        // rest of the net were unchanged.
        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.selectDocumentDiff)
                .toHaveBeenCalledWith({
                    kind: "changes",
                    ids: ["/label-a", "/label-b"],
                });
            expect(FakeEcadViewer.instances[1]?.selectDocumentDiff)
                .toHaveBeenCalledWith({
                    kind: "changes",
                    ids: ["/label-a", "/label-b"],
                });
        });
    });

    it("selects every native object behind a single semantic item", async () => {
        // A route or net picked as one row must light up all of its copper or
        // wiring, not the one parser change that happened to sort first.
        const routeChange: ChangeItem = {
            id: "pcb-changed-route",
            kind: "changed",
            domain: "pcb",
            category: "nets",
            label: "USB_DP",
            object_kind: "track",
            net: "USB_DP",
            reasons: ["content-changed"],
        };
        const diff: KiCadProjectDiffBundle = {
            ...pcbDocumentDiff,
            navigation: {
                [routeChange.id]: {
                    documentPath: "board.kicad_pcb",
                    changeId: "/track-1",
                    changeIds: ["/track-1", "/track-2", "/via-1"],
                },
            },
        };
        render(
            <ComparisonPresentationShell
                {...shellProps}
                domain="pcb"
                documentDiff={diff}
                files={pcbFiles}
                presentationMode="composite"
                selection={{ kind: "item", id: routeChange.id }}
                reviewGroups={[{ id: "net-usb-dp", changes: [routeChange] }]}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.selectDocumentDiff)
                .toHaveBeenCalledWith({
                    kind: "changes",
                    ids: ["/track-1", "/track-2", "/via-1"],
                });
        });
    });

    it("applies a selection that had to wait for a page transition", async () => {
        // Selecting a change on another sheet re-prepares the session. The
        // first pass runs against the outgoing page and resolves nothing; the
        // selection must be retried once the new page is ready rather than
        // waiting for the reviewer to pick something else and come back.
        const onPageTwo: ChangeItem = {
            id: "sch-changed-two",
            kind: "changed",
            domain: "schematic",
            category: "nets",
            label: "VCC",
            net: "VCC",
            page: "two.kicad_sch",
            reasons: ["content-changed"],
        };
        const diff: KiCadProjectDiffBundle = {
            ...documentDiff,
            project: {
                documents: [
                    { path: "one.kicad_sch", docType: "kicad_sch", changes: [] },
                    { path: "two.kicad_sch", docType: "kicad_sch", changes: [] },
                ],
            },
            navigation: {
                [onPageTwo.id]: {
                    documentPath: "two.kicad_sch",
                    changeId: "/wire-1",
                    changeIds: ["/wire-1", "/wire-2"],
                },
            },
        };
        const files = {
            base: [
                { filename: "one.kicad_sch", path: "one.kicad_sch" },
                { filename: "two.kicad_sch", path: "two.kicad_sch" },
            ],
            head: [
                { filename: "one.kicad_sch", path: "one.kicad_sch" },
                { filename: "two.kicad_sch", path: "two.kicad_sch" },
            ],
        };
        const reviewGroups = [{ id: "net-vcc", changes: [onPageTwo] }];
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                documentDiff={diff}
                files={files}
                presentationMode="composite"
                selection={null}
                reviewGroups={reviewGroups}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.sessions.length).toBeGreaterThan(0);
        });

        view.rerender(
            <ComparisonPresentationShell
                {...shellProps}
                documentDiff={diff}
                files={files}
                presentationMode="composite"
                selection={{ kind: "item", id: onPageTwo.id }}
                reviewGroups={reviewGroups}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.selectDocumentDiff)
                .toHaveBeenCalledWith({
                    kind: "changes",
                    ids: ["/wire-1", "/wire-2"],
                });
        });
    });

    it("toggles Old/New without reloading either revision", async () => {
        // Old/New flips the already prepared session inside one viewport.
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="old-new"
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances).toHaveLength(1);
            expect(FakeEcadViewer.sessions[0]?.setPresentation)
                .toHaveBeenCalledWith(
                    "comparison",
                    FakeEcadViewer.instances[0],
                );
        });
        const prepareCallsBefore =
            FakeEcadViewer.instances[0]!.prepareComparison.mock.calls.length;

        view.getByRole("button", { name: /Old/ }).click();
        await waitFor(() => {
            expect(
                view.getByRole("button", { name: /Old/ }).getAttribute("aria-pressed"),
            ).toBe("true");
        });

        expect(FakeEcadViewer.sessions[0]?.setPresentation)
            .toHaveBeenLastCalledWith(
                "reference",
                FakeEcadViewer.instances[0],
            );
        expect(FakeEcadViewer.instances[0]?.prepareComparison)
            .toHaveBeenCalledTimes(prepareCallsBefore);
    });

    it("keeps the Old/New viewport mounted across a toggle", async () => {
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="old-new"
            />,
        );
        await waitFor(() => {
            expect(FakeEcadViewer.instances).toHaveLength(1);
        });

        const first = FakeEcadViewer.instances[0]!;
        first.camera = { x: 1, y: 2, zoom: 3 } as never;

        view.getByRole("button", { name: /Old/ }).click();
        await waitFor(() => {
            expect(
                view.getByRole("button", { name: /Old/ }).getAttribute("aria-pressed"),
            ).toBe("true");
        });

        expect(first.camera).toEqual({ x: 1, y: 2, zoom: 3 });
        expect(FakeEcadViewer.instances).toHaveLength(1);
    });

    it("does not replace Old/New sources when selection changes", async () => {
        const change: ChangeItem = {
            id: "changed-r5",
            kind: "changed",
            domain: "schematic",
            category: "components",
            label: "R5",
            page: "main.kicad_sch",
        };
        const groups = [{ id: "component-r5", changes: [change] }];
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="old-new"
                selection={{ kind: "group", id: "component-r5" }}
                reviewGroups={groups}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.prepareComparison)
                .toHaveBeenCalledTimes(1);
        });
        view.rerender(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="old-new"
                selection={{ kind: "item", id: change.id }}
                reviewGroups={groups}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.prepareComparison)
                .toHaveBeenCalledTimes(1);
        });
    });

    it("does not ask an absent side to show a compare-only schematic", async () => {
        const compareOnlyDiff: KiCadProjectDiffBundle = {
            ...documentDiff,
            project: {
                documents: [{
                    path: "Subsheets/USB.kicad_sch",
                    docType: "kicad_sch",
                    changes: [],
                }],
            },
        };
        render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="side-by-side"
                documentDiff={compareOnlyDiff}
                files={{
                    base: [{ filename: "main.kicad_sch", path: "main.kicad_sch" }],
                    head: [{
                        filename: "USB.kicad_sch",
                        path: "Subsheets/USB.kicad_sch",
                    }],
                }}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.showPage).not.toHaveBeenCalled();
            expect(FakeEcadViewer.instances[1]?.showPage).not.toHaveBeenCalled();
            expect(FakeEcadViewer.sessions[0]?.preparation.missingReference)
                .toBe(true);
        });
        expect(
            document.body.textContent,
        ).toContain("Not present in the base revision");
        expect(FakeEcadViewer.instances[0]?.setActive)
            .toHaveBeenLastCalledWith(false);
    });

    it("uses the prepared session's source inventory for hierarchical sheets", async () => {
        Object.defineProperty(FakeEcadViewer.prototype, "getSchematicPages", {
            configurable: true,
            value: function getSchematicPages(this: FakeEcadViewer) {
                const side = FakeEcadViewer.instances.indexOf(this);
                const filename = side === 0
                    ? "main.kicad_sch"
                    : "Subsheets/USB.kicad_sch";
                return [{
                    projectPath: filename,
                    sheetPath: filename,
                    filename,
                    depth: 0,
                    active: true,
                }];
            },
        });
        const compareOnlyDiff: KiCadProjectDiffBundle = {
            ...documentDiff,
            project: {
                documents: [{
                    path: "Subsheets/USB.kicad_sch",
                    docType: "kicad_sch",
                    changes: [],
                }],
            },
        };
        try {
            render(
                <ComparisonPresentationShell
                    {...shellProps}
                    presentationMode="side-by-side"
                    documentDiff={compareOnlyDiff}
                    files={{
                        base: [
                            { filename: "main.kicad_sch", path: "main.kicad_sch" },
                            {
                                filename: "USB.kicad_sch",
                                path: "Subsheets/USB.kicad_sch",
                            },
                        ],
                        head: [{
                            filename: "USB.kicad_sch",
                            path: "Subsheets/USB.kicad_sch",
                        }],
                    }}
                />,
            );

            await waitFor(() => {
                expect(document.body.textContent)
                    .not.toContain("Not present in the base revision");
                expect(FakeEcadViewer.sessions[0]?.preparation.missingReference)
                    .toBe(false);
                expect(FakeEcadViewer.instances[0]?.showPage).not.toHaveBeenCalled();
                expect(FakeEcadViewer.instances[1]?.showPage).not.toHaveBeenCalled();
            });
        } finally {
            delete (FakeEcadViewer.prototype as unknown as {
                getSchematicPages?: unknown;
            }).getSchematicPages;
        }
    });

    it("loads the explicit page child of a multi-page selection", async () => {
        const change: ChangeItem = {
            id: "multi-page-net",
            kind: "changed",
            domain: "schematic",
            category: "nets",
            label: "VCC",
            net: "VCC",
        };
        const multiPageDiff: KiCadProjectDiffBundle = {
            ...documentDiff,
            project: {
                documents: [
                    { path: "one.kicad_sch", docType: "kicad_sch", changes: [] },
                    { path: "two.kicad_sch", docType: "kicad_sch", changes: [] },
                ],
            },
            navigation: {
                [change.id]: {
                    documentPath: "one.kicad_sch",
                    changeId: "/wire-one",
                    changeIds: ["/wire-one"],
                    documents: [
                        {
                            documentPath: "one.kicad_sch",
                            changeId: "/wire-one",
                            changeIds: ["/wire-one"],
                        },
                        {
                            documentPath: "two.kicad_sch",
                            changeId: "/wire-two",
                            changeIds: ["/wire-two"],
                        },
                    ],
                },
            },
        };
        render(
            <ComparisonPresentationShell
                {...shellProps}
                documentDiff={multiPageDiff}
                files={{
                    base: [
                        { filename: "one.kicad_sch", path: "one.kicad_sch" },
                        { filename: "two.kicad_sch", path: "two.kicad_sch" },
                    ],
                    head: [
                        { filename: "one.kicad_sch", path: "one.kicad_sch" },
                        { filename: "two.kicad_sch", path: "two.kicad_sch" },
                    ],
                }}
                presentationMode="composite"
                selection={{
                    kind: "item",
                    id: change.id,
                    documentPath: "two.kicad_sch",
                }}
                reviewGroups={[{ id: "net-vcc", changes: [change] }]}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[0]?.prepareComparison)
                .toHaveBeenCalledWith(
                    expect.objectContaining({ documentPath: "two.kicad_sch" }),
                );
        });
    });

    it("applies URL layer visibility to both active PCB panes", async () => {
        const pcbDocumentDiff: KiCadProjectDiffBundle = {
            ...documentDiff,
            project: {
                documents: [{
                    path: "board.kicad_pcb",
                    docType: "kicad_pcb",
                    changes: [],
                }],
            },
        };
        render(
            <ComparisonPresentationShell
                {...shellProps}
                domain="pcb"
                presentationMode="side-by-side"
                documentDiff={pcbDocumentDiff}
                files={{
                    base: [{
                        filename: "board.kicad_pcb",
                        path: "board.kicad_pcb",
                    }],
                    head: [{
                        filename: "board.kicad_pcb",
                        path: "board.kicad_pcb",
                    }],
                }}
                initialVisibleLayers={["B.Cu"]}
            />,
        );

        await waitFor(() => {
            expect(
                FakeEcadViewer.instances[0]?.setPcbLayerVisibility,
            ).toHaveBeenCalledWith("F.Cu", false);
            expect(
                FakeEcadViewer.instances[1]?.setPcbLayerVisibility,
            ).toHaveBeenCalledWith("F.Cu", false);
        });
        expect(visibleLayers(0)).toEqual(["B.Cu"]);
        expect(visibleLayers(1)).toEqual(["B.Cu"]);
    });

    it("shows each pane only the copper its own revision routes", async () => {
        const change: ChangeItem = {
            id: "pcb-changed-route",
            kind: "changed",
            domain: "pcb",
            category: "nets",
            label: "USB_DP",
            object_kind: "track",
            net: "USB_DP",
            reasons: ["layer-changed"],
            base_item: { source_id: "t1", layers: ["F.Cu"] },
            compare_item: { source_id: "t1", layers: ["B.Cu"] },
        };
        render(
            <ComparisonPresentationShell
                {...shellProps}
                domain="pcb"
                presentationMode="side-by-side"
                documentDiff={pcbDocumentDiff}
                files={pcbFiles}
                selection={{ kind: "group", id: "net-usb-dp" }}
                reviewGroups={[{ id: "net-usb-dp", changes: [change] }]}
            />,
        );

        // The reference pane proves the route left F.Cu; the comparison pane
        // proves it arrived on B.Cu. Neither borrows the other's copper, and
        // the untouched inner layer stays out of the review entirely.
        await waitFor(() => {
            expect(visibleLayers(0)).toEqual(["F.Cu", "Edge.Cuts"]);
        });
        expect(visibleLayers(1)).toEqual(["B.Cu", "Edge.Cuts"]);
    });

    it("restores the reviewer's layers when the routing selection clears", async () => {
        const change: ChangeItem = {
            id: "pcb-changed-route",
            kind: "changed",
            domain: "pcb",
            category: "nets",
            label: "USB_DP",
            object_kind: "track",
            net: "USB_DP",
            reasons: ["content-changed"],
            base_item: { source_id: "t1", layers: ["F.Cu"] },
            compare_item: { source_id: "t1", layers: ["F.Cu"] },
        };
        const reviewGroups = [{ id: "net-usb-dp", changes: [change] }];
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                domain="pcb"
                presentationMode="side-by-side"
                documentDiff={pcbDocumentDiff}
                files={pcbFiles}
                initialVisibleLayers={["F.Cu", "B.Cu", "F.SilkS"]}
                selection={null}
                reviewGroups={reviewGroups}
            />,
        );

        await waitFor(() => {
            expect(visibleLayers(0)).toEqual(["F.Cu", "B.Cu", "F.SilkS"]);
        });

        view.rerender(
            <ComparisonPresentationShell
                {...shellProps}
                domain="pcb"
                presentationMode="side-by-side"
                documentDiff={pcbDocumentDiff}
                files={pcbFiles}
                initialVisibleLayers={["F.Cu", "B.Cu", "F.SilkS"]}
                selection={{ kind: "group", id: "net-usb-dp" }}
                reviewGroups={reviewGroups}
            />,
        );
        await waitFor(() => {
            expect(visibleLayers(0)).toEqual(["F.Cu", "Edge.Cuts"]);
        });

        view.rerender(
            <ComparisonPresentationShell
                {...shellProps}
                domain="pcb"
                presentationMode="side-by-side"
                documentDiff={pcbDocumentDiff}
                files={pcbFiles}
                initialVisibleLayers={["F.Cu", "B.Cu", "F.SilkS"]}
                selection={null}
                reviewGroups={reviewGroups}
            />,
        );
        await waitFor(() => {
            expect(visibleLayers(0)).toEqual(["F.Cu", "B.Cu", "F.SilkS"]);
        });
    });

    it("leaves layer visibility alone for a non-routing selection", async () => {
        const change: ChangeItem = {
            id: "pcb-changed-footprint",
            kind: "changed",
            domain: "pcb",
            category: "components",
            label: "U1",
            object_kind: "footprint",
            reference: "U1",
            reasons: ["moved"],
            base_item: { source_id: "f1", layers: ["F.Cu"] },
            compare_item: { source_id: "f1", layers: ["F.Cu"] },
        };
        render(
            <ComparisonPresentationShell
                {...shellProps}
                domain="pcb"
                presentationMode="side-by-side"
                documentDiff={pcbDocumentDiff}
                files={pcbFiles}
                selection={{ kind: "group", id: "component-u1" }}
                reviewGroups={[{ id: "component-u1", changes: [change] }]}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances.length).toBeGreaterThan(1);
        });
        expect(visibleLayers(0)).toEqual([
            "F.Cu",
            "In1.Cu",
            "B.Cu",
            "Edge.Cuts",
            "F.SilkS",
        ]);
    });

    it("hands layer control back to the reviewer after a manual toggle", async () => {
        const change: ChangeItem = {
            id: "pcb-changed-route",
            kind: "changed",
            domain: "pcb",
            category: "nets",
            label: "USB_DP",
            object_kind: "track",
            net: "USB_DP",
            reasons: ["content-changed"],
            base_item: { source_id: "t1", layers: ["F.Cu"] },
            compare_item: { source_id: "t1", layers: ["F.Cu"] },
        };
        const onVisibleLayersChange = vi.fn();
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                domain="pcb"
                presentationMode="side-by-side"
                documentDiff={pcbDocumentDiff}
                files={pcbFiles}
                onVisibleLayersChange={onVisibleLayersChange}
                selection={{ kind: "group", id: "net-usb-dp" }}
                reviewGroups={[{ id: "net-usb-dp", changes: [change] }]}
                rightRailTab="layers"
            />,
        );

        await waitFor(() => {
            expect(visibleLayers(0)).toEqual(["F.Cu", "Edge.Cuts"]);
        });
        // The focus never writes the reviewer's shareable layer state.
        expect(onVisibleLayersChange).not.toHaveBeenCalled();

        const toggle = await view.findByRole("button", { name: "Show In1.Cu" });
        fireEvent.click(toggle);

        await waitFor(() => {
            expect(visibleLayers(0)).toEqual(["F.Cu", "In1.Cu", "Edge.Cuts"]);
        });
        expect(onVisibleLayersChange).toHaveBeenCalledWith([
            "F.Cu",
            "In1.Cu",
            "Edge.Cuts",
        ]);
    });

    it("overlays the shared PCB rail and insets only the compare pane", async () => {
        const originalRect = HTMLElement.prototype.getBoundingClientRect;
        const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockImplementation(function measuredRect(this: HTMLElement) {
                if (this.getAttribute("aria-label") === "Comparison tools") {
                    return {
                        x: 0,
                        y: 0,
                        width: 320,
                        height: 600,
                        top: 0,
                        right: 320,
                        bottom: 600,
                        left: 0,
                        toJSON: () => ({}),
                    };
                }
                return originalRect.call(this);
            });
        const pcbDocumentDiff: KiCadProjectDiffBundle = {
            ...documentDiff,
            project: {
                documents: [{
                    path: "board.kicad_pcb",
                    docType: "kicad_pcb",
                    changes: [],
                }],
            },
        };
        const onRailChange = vi.fn();
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                domain="pcb"
                presentationMode="side-by-side"
                documentDiff={pcbDocumentDiff}
                files={{
                    base: [{ filename: "board.kicad_pcb", path: "board.kicad_pcb" }],
                    head: [{ filename: "board.kicad_pcb", path: "board.kicad_pcb" }],
                }}
                rightRailTab="layers"
                onRightRailTabChange={onRailChange}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances).toHaveLength(2);
            expect(FakeEcadViewer.instances[0]?.setViewportInsets)
                .toHaveBeenLastCalledWith(expect.objectContaining({ right: 0 }));
            expect(FakeEcadViewer.instances[1]?.setViewportInsets)
                .toHaveBeenLastCalledWith(expect.objectContaining({ right: 320 }));
        });
        // ComparisonViewerHost coalesces its initial sized-canvas notification
        // into the next animation frame. Let that initialization settle before
        // measuring what the rail-only rerender adds.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const resizeCounts = FakeEcadViewer.instances.map(
            (viewer) => viewer.resize.mock.calls.length,
        );

        view.rerender(
            <ComparisonPresentationShell
                {...shellProps}
                domain="pcb"
                presentationMode="side-by-side"
                documentDiff={pcbDocumentDiff}
                files={{
                    base: [{ filename: "board.kicad_pcb", path: "board.kicad_pcb" }],
                    head: [{ filename: "board.kicad_pcb", path: "board.kicad_pcb" }],
                }}
                rightRailTab={null}
                onRightRailTabChange={onRailChange}
            />,
        );

        await waitFor(() => {
            expect(FakeEcadViewer.instances[1]?.setViewportInsets)
                .toHaveBeenLastCalledWith(expect.objectContaining({ right: 0 }));
        });
        // Closing the rail re-checks each pane's canvas size exactly once. That
        // check is a no-op when the backing store already matches layout, so it
        // costs no repaint — what matters is that the rail does not reload or
        // re-prepare anything, which the insets-only calls above establish.
        //
        // This previously asserted *zero* added resizes, which only held
        // because the sources effect listed `files` and aborted its own fetch
        // on every render: the panes never finished loading, so they never
        // reached the point of reacting to a layout change at all.
        expect(FakeEcadViewer.instances.map(
            (viewer) => viewer.resize.mock.calls.length,
        )).toEqual(resizeCounts.map((count) => count + 1));
        rectSpy.mockRestore();
    });

    it("closes without crashing when the viewer is already torn down", async () => {
        const view = render(
            <ComparisonPresentationShell
                {...shellProps}
                presentationMode="composite"
            />,
        );

        // Wait for the session to reach "ready": the preview effect returns
        // early before that, so unmounting sooner registers no cleanup at all
        // and the test would pass without exercising anything.
        await waitFor(() => {
            expect(FakeEcadViewer.instances).toHaveLength(1);
            expect(FakeEcadViewer.sessions[0]?.setPresentation).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(
                FakeEcadViewer.instances[0]?.previewDocumentDiff,
            ).toHaveBeenCalled();
        });

        // Closing runs the preview effect's cleanup, but `useEffect` destroys are
        // passive: React detaches the DOM first and flushes them afterwards, so
        // the real viewer has already released its renderer and throws
        // `Uninitialized` from `start_layer`. A throw in a cleanup reaches the
        // nearest error boundary, so pressing Esc blanked the panel instead of
        // closing it.
        for (const instance of FakeEcadViewer.instances) {
            instance.previewDocumentDiff.mockImplementation(() => {
                if (!instance.isConnected) throw new Error("Uninitialized");
            });
        }

        expect(() => view.unmount()).not.toThrow();
    });
});
