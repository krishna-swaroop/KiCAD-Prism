import { vi } from "vitest";

import type {
    PrismAnalyticHit,
    PrismAnalyticReading,
    PrismAnalyticRelief,
    PrismAnalyticStats,
    PrismSemanticViewerElement,
    PrismSemanticViewState,
    PrismSystemSceneHarnessState,
    PrismSystemSceneMoveState,
    PrismSurfacePick,
    PrismSystemViewerSelection,
    PrismViewerPick,
} from "@/types/prism-semantic-viewer";

/**
 * The shared test double for `<prism-semantic-viewer mode="system">` (AC-21).
 * It is registered as `prism-semantic-viewer`, so a component that renders the
 * tag gets one and the adapter's `whenDefined` resolves. Every member of the
 * element's three mode interfaces is a spy; `selectHarness` answers false
 * until `drawHarnesses` says the tubes exist, as the element does.
 */
export class FakeSemanticViewer extends HTMLElement implements PrismSemanticViewerElement {
    harnessesDrawn = true;
    readonly setSelection = vi.fn();
    readonly setHiddenComponents = vi.fn();
    readonly resize = vi.fn();
    readonly getViewState = vi.fn((): PrismSemanticViewState | null => null);
    readonly setSystemScene = vi.fn();
    readonly setNetEmphasis = vi.fn<NonNullable<PrismSemanticViewerElement["setNetEmphasis"]>>(() => []);
    readonly frameNetEmphasis = vi.fn<NonNullable<PrismSemanticViewerElement["frameNetEmphasis"]>>(() => true);
    readonly frameBoard = vi.fn<NonNullable<PrismSemanticViewerElement["frameBoard"]>>(() => true);
    readonly frameParts = vi.fn<NonNullable<PrismSemanticViewerElement["frameParts"]>>(() => true);
    readonly frameAll = vi.fn();
    readonly selectHarness = vi.fn((id: string | null) => id === null || this.harnessesDrawn);
    readonly setMoveMode = vi.fn();
    readonly setMoveSpace = vi.fn();
    readonly previewPose = vi.fn();
    readonly cancelMove = vi.fn();
    readonly targetHarnessNode = vi.fn();
    readonly cancelHarnessNode = vi.fn();
    readonly setNetIsolation = vi.fn();
    readonly setLabelsVisible = vi.fn();
    readonly setHarnessesVisible = vi.fn();
    readonly setStatsOverlay = vi.fn();
    readonly setHelpVisible = vi.fn();
    readonly isHelpVisible = vi.fn(() => false);
    readonly pickSurfaceAt = vi.fn((): PrismSurfacePick | null => null);
    readonly viewAxis = vi.fn();
    readonly focusMoveTarget = vi.fn(() => false);
    // Members of both modes and of the board mode the System tab does not call (AC-30: the element always has them).
    readonly setLayerVisible = vi.fn();
    readonly applyLayerPreset = vi.fn();
    readonly setShowBoard = vi.fn();
    readonly setShowComponents = vi.fn();
    readonly setShowPlaceholders = vi.fn();
    readonly setRealisticColors = vi.fn();
    readonly setBoardLayerVisible = vi.fn();
    readonly setSeparation = vi.fn();
    readonly showNetLayers = vi.fn();
    readonly pickAt = vi.fn(async (): Promise<PrismViewerPick | null> => null);
    readonly setHighlightedNets = vi.fn();
    readonly getComponentReferences = vi.fn((): string[] => []);
    readonly setViewMode = vi.fn();
    readonly renderInset = vi.fn(() => false);
    readonly insetReady = vi.fn(() => false);
    readonly insetSurfaceZ = vi.fn(() => 0);
    readonly releaseInset = vi.fn();
    readonly onSceneChange = vi.fn(() => () => {});
    readonly loadAnalyticPack = vi.fn(async (): Promise<PrismAnalyticStats | null> => null);
    readonly setAnalyticOverlay = vi.fn();
    readonly setAnalyticVectors = vi.fn(() => null);
    readonly setAnalyticStyle = vi.fn(() => null);
    readonly analyticColormaps = vi.fn(() => null);
    readonly analyticAt = vi.fn(async (): Promise<PrismAnalyticHit | null> => null);
    readonly analyticProbe = vi.fn((): PrismAnalyticReading | null => null);
    readonly setClickSelect = vi.fn();
    readonly setAnalyticRelief = vi.fn((): PrismAnalyticRelief | null => null);
    readonly projectPoint = vi.fn((): { x: number; y: number } | null => null);
    readonly analyticStats = vi.fn((): PrismAnalyticStats | null => null);
    readonly unloadAnalyticPack = vi.fn();

    /** A click in the view. */
    pick(selection: PrismSystemViewerSelection | null): void {
        this.dispatchEvent(new CustomEvent("prism-semantic-viewer:selectionchange", { detail: { selection } }));
    }

    move(state: PrismSystemSceneMoveState): void {
        this.dispatchEvent(new CustomEvent("prism-semantic-viewer:move", { detail: state }));
    }

    harness(state: PrismSystemSceneHarnessState): void {
        this.dispatchEvent(new CustomEvent("prism-semantic-viewer:harness", { detail: state }));
    }

    emit(type: keyof HTMLElementEventMap, detail: unknown): void {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}

/** Make `<prism-semantic-viewer>` the fake (idempotent). */
export function defineFakeSemanticViewer(): void {
    if (!customElements.get("prism-semantic-viewer")) customElements.define("prism-semantic-viewer", FakeSemanticViewer);
}

export function fakeSemanticViewer(): FakeSemanticViewer {
    defineFakeSemanticViewer();
    return new FakeSemanticViewer();
}

/** The fake a rendered component mounted. */
export function mountedSemanticViewer(): FakeSemanticViewer {
    const element = document.querySelector("prism-semantic-viewer");
    if (!(element instanceof FakeSemanticViewer)) throw new Error("No fake <prism-semantic-viewer> is mounted");
    return element;
}
