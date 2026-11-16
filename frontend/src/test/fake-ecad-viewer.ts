import { vi } from "vitest";

import type {
    ECadViewerElement,
    EcadMeasureState,
    EcadPcbObjectVisibilityKind,
    EcadPcbViewState,
    EcadSchematicPageState,
} from "@/types/ecad-viewer";

/**
 * The shared test double for `<ecad-viewer>` (AC-21). It is registered as
 * `ecad-viewer`, so the adapter's `whenDefined` resolves and a component that
 * renders the tag gets one. The optional APIs exist only when asked for, as
 * an older bundle would lack them. State changes go through the same events
 * the vendored element sends.
 */
export interface FakeEcadViewerOptions {
    insets?: boolean;
    measure?: boolean;
    pcb?: EcadPcbViewState | null;
    pages?: EcadSchematicPageState[];
}

export class FakeEcadViewer extends HTMLElement implements ECadViewerElement {
    readonly isReady = true;
    ready: Promise<void> = Promise.resolve();
    readonly setVariant = vi.fn<ECadViewerElement["setVariant"]>(() => true);
    readonly getVariant = vi.fn((): string | null => null);
    readonly getVariants = vi.fn(() => []);
    readonly replaceSources = vi.fn<ECadViewerElement["replaceSources"]>(async () => undefined);
    readonly appendSources = vi.fn<ECadViewerElement["appendSources"]>(async () => undefined);
    readonly setActive = vi.fn();
    readonly setViewportInsets = vi.fn();
    readonly clearSelection = vi.fn();
    readonly setCommentOverlays = vi.fn(() => []);
    readonly clearCommentOverlays = vi.fn();
    readonly loadDocumentComparison = vi.fn(async () => { throw new Error("not faked"); });
    readonly prepareComparison = vi.fn(async () => { throw new Error("not faked"); });
    readonly selectDocumentDiff = vi.fn(async () => { throw new Error("not faked"); });
    readonly clearDocumentComparison = vi.fn();
    readonly zoomToLocation = vi.fn();
    readonly switchPage = vi.fn();
    readonly getScreenLocation = vi.fn(() => null);
    readonly requestCrossProbe = vi.fn(async () => ({ ok: true as const, targetContext: "PCB" as const, generation: 1 }));
    readonly enableInsets = vi.fn();
    readonly setInsetPeer = vi.fn<NonNullable<ECadViewerElement["setInsetPeer"]>>();
    readonly setInset3D = vi.fn<NonNullable<ECadViewerElement["setInset3D"]>>();
    insetMode?: boolean;
    setInsetMode?: (on: boolean) => void;
    measureMode?: boolean;
    measureState?: EcadMeasureState | null;
    setMeasureMode?: (on: boolean) => void;
    setMeasureUnits?: ECadViewerElement["setMeasureUnits"];
    getPcbViewState?: () => EcadPcbViewState | null;
    setPcbObjectVisibility?: ECadViewerElement["setPcbObjectVisibility"];
    setPcbLayerVisibility?: ECadViewerElement["setPcbLayerVisibility"];
    applyPcbLayerPreset?: ECadViewerElement["applyPcbLayerPreset"];
    getSchematicPages?: () => EcadSchematicPageState[];
    getActiveSchematicPage?: ECadViewerElement["getActiveSchematicPage"];

    /** Send an element event, as the vendored element does. */
    emit(type: string, detail?: unknown): void {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }

    /** Report a measure-state change. */
    measure(state: EcadMeasureState): void {
        this.measureState = state;
        this.emit("ecad-viewer:measure", state);
    }
}

function register(): string {
    for (const tag of ["ecad-viewer", "fake-ecad-viewer"]) {
        const existing = customElements.get(tag);
        if (existing === FakeEcadViewer) return tag;
        if (!existing) {
            customElements.define(tag, FakeEcadViewer);
            return tag;
        }
    }
    throw new Error("FakeEcadViewer could not be registered");
}

/** A fake element with the optional APIs asked for. */
export function fakeEcadViewer(options: FakeEcadViewerOptions = {}): FakeEcadViewer {
    register();
    const viewer = new FakeEcadViewer();
    if (options.insets) {
        viewer.insetMode = false;
        viewer.setInsetMode = vi.fn((on: boolean) => {
            viewer.insetMode = on;
            viewer.emit("ecad-viewer:inset-mode", { on });
        });
    }
    if (options.measure) {
        viewer.measureMode = false;
        viewer.measureState = null;
        viewer.setMeasureMode = vi.fn((on: boolean) => {
            viewer.measureMode = on;
            if (!on) viewer.measureState = null;
            viewer.emit("ecad-viewer:measure-mode", { on });
        });
        viewer.setMeasureUnits = vi.fn();
    }
    if (options.pcb !== undefined) {
        const state = options.pcb;
        // Like the element, hand out a fresh snapshot each time.
        viewer.getPcbViewState = vi.fn(() => (state ? { ...state, objectVisibility: { ...state.objectVisibility } } : null));
        viewer.setPcbObjectVisibility = vi.fn((kind: EcadPcbObjectVisibilityKind, visible: boolean) => {
            if (state) state.objectVisibility[kind] = visible;
        });
        viewer.setPcbLayerVisibility = vi.fn((name: string, visible: boolean) => {
            if (!state) return false;
            state.layers = state.layers.map((layer) => (layer.name === name ? { ...layer, visible } : layer));
            return true;
        });
        viewer.applyPcbLayerPreset = vi.fn();
    }
    if (options.pages) {
        const pages = options.pages;
        viewer.getSchematicPages = vi.fn(() => pages);
        viewer.getActiveSchematicPage = vi.fn(() => pages.find((page) => page.active) ?? null);
    }
    return viewer;
}
