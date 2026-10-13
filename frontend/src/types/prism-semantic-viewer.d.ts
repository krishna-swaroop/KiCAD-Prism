import type React from "react";
import type { PrismSelection } from "@/types/prism-selection";
import type { SystemScene } from "@/types/system";

export interface PrismSemanticViewerSelectionDetail {
    selection: PrismSelection | null;
}

export interface PrismRendererSelection {
    reference?: string;
    pin?: string;
    netName?: string;
    netUid?: string;
    netCode?: number;
    featureId?: number;
    /** mode="system": the board placement to select on (alone: the board itself). */
    occurrence?: string;
}

/** What a click in `<prism-semantic-viewer mode="system">` selected: a board's own selection with its placement, or the board. */
export type PrismSystemViewerSelection =
    | (PrismSelection & { occurrence?: string })
    | { kind: "board"; sourceContext: "3D"; occurrence: string; standIn?: string | null };

/** One placement of the loaded board; `key` (the occurrence path) returns on picks and selections. */
export interface PrismViewerPick {
    kind: "none" | "feature" | "board";
    occurrenceIndex: number;
    occurrenceKey: string | null;
    featureId: number;
    /** What a click there would select (reference, pin, net), when it hits a feature. */
    selection: Record<string, unknown> | null;
}

export interface PrismSemanticLayerState {
    id: number;
    name: string;
    color: string;
    visible: boolean;
}

/** PCB 3D controls the host renders when it sets `hide-panel`. */
export interface PrismSemanticViewState {
    /** "layer" is the stacked flat layer view. */
    mode: "3d" | "layer";
    layers: PrismSemanticLayerState[];
    showBoard: boolean;
    showComponents: boolean;
    /** Boxes standing in for footprints without a 3D model. */
    showPlaceholders: boolean;
    realisticColors: boolean;
    /** 0..1 */
    separation: number;
    isolateNet: boolean;
    hasNet: boolean;
    /** mode="system" (SB2-31e): a layer section per placed board, in placement order. */
    boards?: PrismSystemBoardViewState[];
    /** mode="system": the placement path the selection belongs to, or null. */
    selectedBoard?: string | null;
}

/** One placed board of a system scene and its copper layers (D-P2-26). */
export interface PrismSystemBoardViewState {
    /** The placement (occurrence) path. */
    key: string;
    name: string;
    /** Why the board draws as a box (restricted, loading, building, missing, failed), or null. */
    standIn: string | null;
    /** This placement's own stackup separation, 0..1 (SB2-31f). */
    separation: number;
    layers: PrismSemanticLayerState[];
}

/** `prism-semantic-viewer:contextmenu`: a right-click without a drag. */
export interface PrismSemanticContextMenuDetail {
    clientX: number;
    clientY: number;
    /** Component under the cursor, if any. */
    reference?: string;
    value?: string;
}

export type PrismSemanticLayerPreset = "all" | "none" | "outer" | "inner";

/** An inset camera in KiCad millimetres (IN-61). */
export interface PrismInsetView {
    center: [number, number];
    /** CSS pixels per mm. */
    zoom: number;
    /** Radians, clockwise on screen. */
    rotation: number;
    /** Seen from below. */
    mirror: boolean;
    /** Radians leaned back from straight down. */
    tilt: number;
    /** Runtime height the view pivots about (`insetSurfaceZ`). */
    focusZ: number;
}

/**
 * Members of both modes (AC-30). They act on the mounted scene and answer
 * their documented default before one is mounted.
 */
export interface PrismSemanticViewerCommon {
    /** Safe before ready and after reloads: the last selection is replayed on the next board mount. */
    setSelection(selection: PrismRendererSelection | null): void;
    resize(): void;
    /** Null until the viewer is ready. Changes arrive as `prism-semantic-viewer:viewstatechange`. */
    getViewState(): PrismSemanticViewState | null;
    /** In a system scene, `placement` names one placed board (every placement of the selected board when omitted). */
    setLayerVisible(layerId: number, visible: boolean, placement?: string | null): void;
    applyLayerPreset(preset: PrismSemanticLayerPreset, placement?: string | null): void;
    setShowBoard(visible: boolean): void;
    setShowComponents(visible: boolean): void;
    setShowPlaceholders(visible: boolean): void;
    setRealisticColors(enabled: boolean): void;
    /** In a system scene, `placement` names one placed board (every placement of the selected board when omitted). */
    setSeparation(value: number, placement?: string | null): void;
    showNetLayers(): void;
    setNetIsolation(enabled: boolean): void;
    /** Show the scene stats overlay (SB2-25); the backquote key toggles it. */
    setStatsOverlay(visible: boolean): void;
    /** What is under a client point, without selecting it (SB2-24). Null before ready. */
    pickAt(clientX: number, clientY: number): Promise<PrismViewerPick | null>;
}

/**
 * The one-board mode (no `mode` attribute). In system mode these keep the
 * host's state for the next board mount and otherwise answer their defaults.
 */
export interface PrismSemanticBoardMode {
    /**
     * Replace the highlighted nets: every listed net renders emphasised
     * alongside the inspected selection. Safe before ready and after reloads.
     */
    setHighlightedNets(nets: readonly PrismRendererSelection[]): void;
    /**
     * Replaces the hidden component set (VAR-18). Safe before ready and after
     * reloads; ambiguous or unknown references stay visible.
     */
    setHiddenComponents(references: string[]): void;
    /** Every component reference on the board; empty until the viewer is ready. */
    getComponentReferences(): string[];
    setViewMode(mode: PrismSemanticViewState["mode"]): void;
    /**
     * IN-61: draw the board into a 2D `canvas` through an inset camera (KiCad
     * mm). `key` names the inset; false when nothing was drawn.
     */
    renderInset(canvas: HTMLCanvasElement, view: PrismInsetView, key: string): boolean;
    /** True once `renderInset` can draw (one-board PCB workspace, first frame done). */
    insetReady(): boolean;
    /** The board surface on one side, as `PrismInsetView.focusZ`; 0 before ready. */
    insetSurfaceZ(bottom: boolean): number;
    releaseInset(key: string): void;
    /** Called when the main view redrew or the viewer reloaded; returns an unsubscribe. Survives reloads. */
    onSceneChange(listener: () => void): () => void;
    /**
     * Analytic spike: draw the board's copper from a kicad_monkey
     * materialization pack instead of the mesh tiles. Survives reloads.
     */
    loadAnalyticPack(bytes: ArrayBuffer | Uint8Array, options?: PrismAnalyticPackOptions): Promise<PrismAnalyticStats | null>;
    /** Colour the analytic copper from a result; null clears it. Survives reloads. */
    setAnalyticOverlay(overlay: PrismAnalyticOverlay | null): void;
    /** The operation under a client point, its binding and overlay value; null off the analytic copper. */
    analyticAt(clientX: number, clientY: number): Promise<PrismAnalyticHit | null>;
    analyticStats(): PrismAnalyticStats | null;
    /** Back to mesh copper. */
    unloadAnalyticPack(): void;
}

export interface PrismAnalyticPackOptions {
    /** URL or bytes of the analytic WASM; defaults to the one served beside the element. */
    wasm?: string | URL | ArrayBuffer;
    /** Flattening tolerance for regions and cubic segments, nm (default 1000). */
    toleranceNm?: number;
}

export type PrismAnalyticOverlay =
    | { kind: "operation_values"; quantity: string; units: string; values: ArrayLike<number> | Record<number, number>; range?: [number, number] }
    | { kind: "field_tiles"; quantity: string; units: string; tiles: PrismAnalyticFieldTile[]; range?: [number, number] };

export interface PrismAnalyticFieldTile {
    slice_key: string;
    origin_nm: [number, number];
    pitch_nm: number;
    width: number;
    height: number;
    values: Float32Array | number[];
}

export interface PrismAnalyticHit {
    operationIndex: number;
    binding: Record<string, unknown> | null;
    value?: number;
    quantity?: string;
    units?: string;
}

export interface PrismAnalyticStats {
    operations: number;
    lowerMs: number;
    unmatched: string[];
    slices: { key: string; layerId: number; shapes: number; subtractShapes: number; regionBatches: number }[];
    overlay: number;
    gpuMemoryBytes: number;
    degraded: boolean;
}

/**
 * `mode="system"`: several boards from a system scene (SB2-31e). In board
 * mode these keep the host's state for the next system mount and otherwise
 * answer their defaults.
 */
export interface PrismSemanticSystemMode {
    /** The system to show, a `prism.system_scene.a0` descriptor. Safe before ready. */
    setSystemScene(descriptor: SystemScene): void;
    /** Light system nets on every board they reach; the report also arrives as `prism-semantic-viewer:emphasis`. [] before ready. */
    setNetEmphasis(sets: readonly PrismSystemSceneEmphasisSet[]): PrismSystemSceneEmphasisResult[];
    /** Frame a lit set's copper (or all), on one placement or all; false when nothing is lit there. */
    frameNetEmphasis(key?: string | null, occurrence?: string | null): boolean;
    /** Frame every placed board. */
    frameAll(): void;
    /** Frame one placed board. */
    frameBoard(key: string): boolean;
    /** Frame parts on their placements (SB2-32: a hop's two connectors); a null reference frames
     *  its whole occurrence (SB2-108); false when none is drawn. */
    frameParts(parts: readonly { occurrence: string; reference: string | null }[]): boolean;
    /** Move mode (SB2-29); state arrives as `prism-semantic-viewer:move`. Who may move is the `move-allowed` attribute. */
    setMoveMode(enabled: boolean, options?: { route?: boolean }): void;
    setMoveSpace(space: "world" | "local"): void;
    /** Show a pose for the move target without saving it; null shows the saved pose. */
    previewPose(pose: PrismScenePose | null): void;
    cancelMove(): void;
    /** Harness editing (SB2-45b); state arrives as `prism-semantic-viewer:harness`. */
    targetHarnessNode(id: string | null): void;
    /** SB2-61: pick a root-level harness by id as a click would; null drops the pick; false when not drawn. */
    selectHarness(id: string | null): boolean;
    cancelHarnessNode(): void;
    /** Board name labels (on by default). */
    setLabelsVisible(visible: boolean): void;
    /** The proxy harnesses (SB2-34), shown by default. */
    setHarnessesVisible(visible: boolean): void;
    /** The keyboard list (also `?`). */
    setHelpVisible(visible: boolean): void;
    isHelpVisible(): boolean;
    /** SB2-48b: where a client point meets a `pickSurface` model, in world mm with the normal facing the viewer. */
    pickSurfaceAt(clientX: number, clientY: number): PrismSurfacePick | null;
    /** SB2-48b: look along a world axis from its + side (`opposite`: its − side), framing the scene. */
    viewAxis(axis: "x" | "y" | "z", opposite?: boolean): void;
    /** SB2-48b: put the move gizmo on an occurrence by path; false when it is not placed yet. */
    focusMoveTarget(path: string): boolean;
}

/**
 * `<prism-semantic-viewer>`: both modes' members are always defined. The
 * element also has members Prism does not call (stats, LOD, GPU budget,
 * inset diagnostics, harness and move state reads); the pixel-diff harness
 * uses them, and kicad-prism-viewer/viewer/src/viewer-controllers.js lists
 * them all.
 */
export interface PrismSemanticViewerElement
    extends HTMLElement, PrismSemanticViewerCommon, PrismSemanticBoardMode, PrismSemanticSystemMode {}

/** A surface pick (SB2-48b): the hit in world mm, the face normal and the direction to the camera (unit). */
export interface PrismSurfacePick {
    occurrence: string;
    pointMm: [number, number, number];
    normal: [number, number, number];
    toCamera: [number, number, number];
}

export interface PrismScenePose {
    translationMm: [number, number, number];
    /** Unit quaternion x, y, z, w (canonical, w ≥ 0). */
    rotation: [number, number, number, number];
}

/** `prism-semantic-viewer:move` (mode="system", SB2-29). "commit" asks the host to save `target.pose`. */
export interface PrismSystemSceneMoveState {
    /** "sync": the host gave a re-read scene (a save landed, or bundles changed). */
    phase?: "mode" | "target" | "preview" | "commit" | "cancel" | "sync";
    allowed: boolean;
    enabled: boolean;
    /** D-P2-51: Route mode, move mode for harness routes only (boards take no gizmo). */
    route?: boolean;
    space: "world" | "local";
    dragging: boolean;
    target: {
        occurrence: string;
        instanceId: string;
        displayPath: string;
        kind: string;
        restricted: boolean;
        pose: PrismScenePose;
        source: "default" | "manual" | "auto";
        /** The pose shown is a preview that is not saved yet. */
        unsaved: boolean;
    } | null;
}

/**
 * `prism-semantic-viewer:harness` (mode="system", SB2-45b): the picked harness.
 * Points are in the harness's level frame (mm). "commit" asks the host to save
 * `node.positionMm`; "delete" to remove the node.
 */
export interface PrismSystemSceneHarnessState {
    phase?: "select" | "target" | "preview" | "commit" | "delete" | "cancel" | "sync" | "route-drag";
    /** On "route-drag" (D-P2-53): where the bend started on the tube and where it was released (level frame, mm). */
    atMm?: [number, number, number];
    positionMm?: [number, number, number];
    /** On "route-drag": Alt was held, so a breakout rather than a waypoint. */
    breakout?: boolean;
    harness: { id: string; level: string | null; name: string } | null;
    /** The picked segment: its tree nodes (`auto` for the automatic breakout) and samples from `from`. */
    segment: { id: string; from: string; to: string; samplesMm: [number, number, number][] } | null;
    pointMm: [number, number, number] | null;
    /** Where the automatic breakout is drawn, when the tree has one. */
    autoMm: [number, number, number] | null;
    node: {
        id: string;
        kind: "breakout" | "waypoint";
        auto: boolean;
        pinned: boolean;
        positionMm: [number, number, number];
        unsaved: boolean;
    } | null;
    /** A root-level harness and a reader who may edit. */
    editable: boolean;
}

/** A system net to light (SB2-31): board nets by occurrence path. */
export interface PrismSystemSceneEmphasisSet {
    key: string;
    /** "#rrggbb"; omitted takes the next palette colour. */
    color?: string;
    members: readonly { occurrence: string; net: string }[];
    /** SB2-34: harness wires the net runs through; `occurrence` (a board the wire reaches) tells child-system copies apart. */
    wires?: readonly { harness: string; wire: string; occurrence?: string }[];
}

/** What a set lit (`setNetEmphasis`'s return and `prism-semantic-viewer:emphasis`). */
export interface PrismSystemSceneEmphasisResult {
    key: string;
    color: string;
    lit: number;
    /** Harness wires lit (SB2-34). */
    wires?: number;
    unresolved: { occurrence: string; net: string; reason: "not-drawn" | "loading" | "restricted" | "unknown-net" }[];
}

/** `prism-semantic-viewer:error`: the viewer could not start or load. */
export interface PrismSemanticViewerErrorDetail {
    error?: { message?: string } | string;
}

declare global {
    interface HTMLElementTagNameMap {
        "prism-semantic-viewer": PrismSemanticViewerElement;
    }

    interface HTMLElementEventMap {
        /** A click selected something (mode="system": with its placement), or nothing. */
        "prism-semantic-viewer:selectionchange": CustomEvent<{ selection: PrismSystemViewerSelection | null }>;
        "prism-semantic-viewer:viewstatechange": CustomEvent<PrismSemanticViewState>;
        "prism-semantic-viewer:emphasis": CustomEvent<{ results: PrismSystemSceneEmphasisResult[] }>;
        "prism-semantic-viewer:error": CustomEvent<PrismSemanticViewerErrorDetail>;
        /** The board is visible; detail is the viewer's performance milestone. */
        "prism-semantic-viewer:ready": CustomEvent<Record<string, unknown>>;
        "prism-semantic-viewer:performance": CustomEvent<Record<string, unknown>>;
        "prism-semantic-viewer:contextmenu": CustomEvent<PrismSemanticContextMenuDetail>;
        "prism-semantic-viewer:move": CustomEvent<PrismSystemSceneMoveState>;
        "prism-semantic-viewer:harness": CustomEvent<PrismSystemSceneHarnessState>;
    }

    namespace JSX {
        interface IntrinsicElements {
            "prism-semantic-viewer": React.DetailedHTMLProps<
                React.HTMLAttributes<PrismSemanticViewerElement> & {
                    "bundle-url"?: string;
                    workspace?: "pcb" | "stackup";
                    active?: string;
                    "hide-panel"?: string;
                    /** "system": several boards from `setSystemScene` (SB2-31e). */
                    mode?: "system";
                    /** mode="system": "true" lets this reader move boards (SB2-29). */
                    "move-allowed"?: "true" | "false";
                },
                PrismSemanticViewerElement
            >;
        }
    }
}

export {};
