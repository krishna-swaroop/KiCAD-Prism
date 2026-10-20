import type React from "react";
import type { PrismSelection } from "@/types/prism-selection";

export interface PrismSemanticViewerSelectionDetail {
    selection: PrismSelection | null;
}

export interface PrismRendererSelection {
    /** mode="system": the occurrence to select on (alone: the board itself). */
    occurrence?: string;
    reference?: string;
    pin?: string;
    netName?: string;
    netUid?: string;
    netCode?: number;
    featureId?: number;
}

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

export type PrismSemanticBoardLayerRole = "soldermask" | "silkscreen" | "paste";
export type PrismSemanticBoardSide = "front" | "back";

/** One side's solder mask, silkscreen or paste, by its KiCad name ("F.Mask", ...). */
export interface PrismSemanticBoardLayerState {
    role: PrismSemanticBoardLayerRole;
    side: PrismSemanticBoardSide;
    name: string;
    /** CSS colour. */
    color: string;
    visible: boolean;
}

/** PCB 3D controls the host renders when it sets `hide-panel`. */
export interface PrismSemanticViewState {
    /** "layer" is the stacked flat layer view. */
    mode: "3d" | "layer";
    layers: PrismSemanticLayerState[];
    /** Each side's solder mask, silkscreen and paste the stackup lists. */
    boardLayers?: PrismSemanticBoardLayerState[];
    showBoard: boolean;
    showComponents: boolean;
    /** Boxes standing in for footprints without a 3D model. */
    showPlaceholders: boolean;
    realisticColors: boolean;
    /** 0..1 */
    separation: number;
    /** mode="system": a section per placed board. */
    boards?: PrismSystemBoardViewState[];
    /** mode="system": the occurrence the selection belongs to, or null. */
    selectedBoard?: string | null;
    isolateNet: boolean;
    hasNet: boolean;
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
    /** Where a world point (metres, the viewer's frame) appears on screen in client px; null off screen. */
    projectPoint(point: [number, number, number], occurrenceKey?: string): { x: number; y: number } | null;
    /** Safe before ready and after reloads: the last selection is replayed on the next board mount. */
    setSelection(selection: PrismRendererSelection | null): void;
    resize(): void;
    /** Null until the viewer is ready. Changes arrive as `prism-semantic-viewer:viewstatechange`. */
    getViewState(): PrismSemanticViewState | null;
    setLayerVisible(layerId: number, visible: boolean): void;
    applyLayerPreset(preset: PrismSemanticLayerPreset): void;
    setShowBoard(visible: boolean): void;
    setShowComponents(visible: boolean): void;
    setShowPlaceholders(visible: boolean): void;
    setRealisticColors(enabled: boolean): void;
    /** Show or hide one side's solder mask, silkscreen or paste. */
    setBoardLayerVisible(role: PrismSemanticBoardLayerRole, side: PrismSemanticBoardSide, visible: boolean): void;
    /** In a system scene, `placement` names one placed board (the selected board when omitted). */
    setSeparation(value: number, placement?: string | null): void;
    showNetLayers(): void;
    setNetIsolation(enabled: boolean): void;
    /** Show the scene stats overlay (SB2-25); the backquote key toggles it. */
    setStatsOverlay(visible: boolean): void;
    /** What is under a client point, without selecting it (SB2-24). Null before ready. */
    pickAt(clientX: number, clientY: number): Promise<PrismViewerPick | null>;
}

/** The board's own members. */
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
    /** How result overlays look; returns the style in force. */
    setAnalyticStyle(style: Partial<PrismAnalyticStyle>): PrismAnalyticStyle | null;
    /** The named colormaps' hex stops and the default style. */
    analyticColormaps(): { colormaps: Record<string, string[]>; defaults: PrismAnalyticStyle } | null;
    /** Arrows of a vector result on the copper: its components as field grids; null clears them. */
    setAnalyticVectors(vectors: PrismAnalyticVectors | null): { count: number; max: number; reference: number; spacingMm: number } | null;
    /**
     * The field overlay's value under a client point from a CPU ray against the copper slices: no GPU
     * pick, so cheap per pointer move. No operation or binding; use `analyticAt` for those (and barrels).
     */
    analyticProbe(clientX: number, clientY: number): PrismAnalyticReading | null;
    /**
     * The field overlay as a relief over one copper layer, in place of the board: heights and colours
     * from the field, the outline from the exact copper of the overlay's net. Null returns to the board.
     * Survives reloads and overlay changes; returns the layer shown and those it can show.
     */
    setAnalyticRelief(options: { sliceKey?: string; heightShare?: number } | null): PrismAnalyticRelief | null;
    /** Whether a click on the board selects what is under it (default on); off while a host tool owns clicks. */
    setClickSelect(enabled: boolean): void;
    /** The operation under a client point, its binding and overlay value; null off the analytic copper. */
    analyticAt(clientX: number, clientY: number): Promise<PrismAnalyticHit | null>;
    analyticStats(): PrismAnalyticStats | null;
    /**
     * The current 3D view path-traced to a PNG (the Render action): rejects with an AbortError when
     * `signal` aborts. `onProgress` reports the worker's stages and samples.
     */
    renderImage(options: PrismRenderImageOptions): Promise<PrismRenderImageResult>;
    /** Back to mesh copper. */
    unloadAnalyticPack(): void;
}

export interface PrismRenderImageOptions {
    width: number;
    height: number;
    /** Samples per pixel; denoised after. */
    samples: number;
    background?: "studio" | "transparent";
    signal?: AbortSignal;
    onProgress?: (progress: PrismRenderProgress) => void;
}

export interface PrismRenderProgress {
    /** "scene", "device", "bvh", "shaders", "pilot", "final", "denoising" or "encoding". */
    stage: string;
    elapsedMs: number;
    samples?: number;
    targetSamples?: number;
    amount?: number;
}

export interface PrismRenderImageResult {
    blob: Blob;
    width: number;
    height: number;
    samples: number;
    timings: Record<string, number | null>;
}

export interface PrismAnalyticStyle {
    /** A colormap name, or two or more #rrggbb stops. */
    fieldColormap: string | string[];
    arrowColormap: string | string[];
    /** Arrows across the board's longer side. */
    arrowDensity: number;
    /** Arrow half width, as a share of the spacing. */
    arrowWidth: number;
    /** The shortest arrow, as a share of the longest. */
    arrowMinLength: number;
    /** Outline colour and opacity, 0..1. */
    arrowOutline: [number, number, number, number];
}

export interface PrismAnalyticVectors {
    quantity: string;
    units: string;
    /** `prism.sim.field` grids of the board-frame x and y components. */
    x: PrismAnalyticFieldGrid;
    y: PrismAnalyticFieldGrid;
}

export interface PrismAnalyticPackOptions {
    /** URL or bytes of the analytic WASM; defaults to the one served beside the element. */
    wasm?: string | URL | ArrayBuffer;
    /** Flattening tolerance for regions and cubic segments, nm (default 1000). */
    toleranceNm?: number;
}

export type PrismAnalyticOverlay =
    | { kind: "operation_values"; quantity: string; units: string; values: ArrayLike<number> | Record<number, number>; range?: [number, number] }
    | { kind: "field_tiles"; quantity: string; units: string; tiles: PrismAnalyticFieldTile[]; range?: [number, number] }
    | { kind: "field_grid"; quantity: string; units: string; grid: PrismAnalyticFieldGrid; values?: Record<number, number>; range?: [number, number] };

/** A prism.sim.field grid document with each slice's values loaded (sim-adr-0018). */
export interface PrismAnalyticFieldGrid {
    origin_x_m: number;
    origin_y_m: number;
    dx_m: number;
    dy_m: number;
    slices: { slice_key: string; ix0: number; iy0: number; nx: number; ny: number; values: Float32Array }[];
}

export interface PrismAnalyticFieldTile {
    slice_key: string;
    origin_nm: [number, number];
    pitch_nm: number;
    width: number;
    height: number;
    values: Float32Array | number[];
}

export interface PrismAnalyticHit extends PrismAnalyticReading {
    operationIndex: number;
    binding: Record<string, unknown> | null;
}

/** A relief's layer and the layers a relief can raise (those with a field raster), with their copper cells. */
export interface PrismAnalyticRelief {
    sliceKey: string | null;
    slices: { key: string; layerId: number; cells: number }[];
}

/** An overlay value read on the copper (what `analyticProbe` returns). */
export interface PrismAnalyticReading {
    value?: number;
    quantity?: string;
    units?: string;
    /** Raster overlays: the copper slice and board point (mm) the value was read at. */
    sliceKey?: string;
    boardMm?: [number, number];
    /** World point (m) on the slice's face. */
    world?: [number, number, number];
    /** A ring lying on that face, in client px: shows which surface is read. */
    marker?: { centre: { x: number; y: number }; ring: { x: number; y: number }[] } | null;
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
 * `<prism-semantic-viewer>`. The element also has members Prism does not call
 * (stats, GPU budget, inset diagnostics); the pixel-diff harness uses them,
 * and kicad-prism-viewer/viewer/src/viewer-controllers.js lists them all.
 */
export interface PrismSemanticViewerElement
    extends HTMLElement, PrismSemanticViewerCommon, PrismSemanticBoardMode, PrismSemanticSystemMode {}

/** What a click in `<prism-semantic-viewer mode="system">` selected: a board's own selection with its occurrence, or the board. */
export type PrismSystemViewerSelection =
    | (PrismSelection & { occurrence?: string })
    | { kind: "board"; sourceContext: "3D"; occurrence: string; standIn?: string | null };

/** One placed board of a system scene (the system view state's `boards`). */
export interface PrismSystemBoardViewState {
    /** The occurrence id. */
    key: string;
    name: string;
    /** Why the board draws as a box (restricted, loading, building, missing, failed), or null. */
    standIn: string | null;
    /** This board's own stackup separation, 0..1. */
    separation: number;
    layers: PrismSemanticLayerState[];
}

export interface PrismScenePose {
    translationMm: [number, number, number];
    /** Unit quaternion x, y, z, w (canonical, w ≥ 0). */
    rotation: [number, number, number, number];
}

/** `prism-semantic-viewer:move` (mode="system"). "commit" asks the host to save `target.pose`. */
export interface PrismSystemSceneMoveState {
    /** "sync": the host gave a re-read scene (a save landed, or bundles changed). */
    phase?: "mode" | "target" | "preview" | "commit" | "cancel" | "sync" | "snap";
    allowed: boolean;
    enabled: boolean;
    space: "world" | "local";
    dragging: boolean;
    /** The gizmo's steps (Shift: a tenth of `mm`, and 1°). */
    snap?: { mm: number; deg: number };
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

/** A system net to light: board nets by occurrence id. */
export interface PrismSystemSceneEmphasisSet {
    key: string;
    /** "#rrggbb"; omitted takes the next palette colour. */
    color?: string;
    members: readonly { occurrence: string; net: string }[];
}

/** What a set lit (`setNetEmphasis`'s return and `prism-semantic-viewer:emphasis`). */
export interface PrismSystemSceneEmphasisResult {
    key: string;
    color: string;
    lit: number;
    unresolved: { occurrence: string; net: string; reason: "not-drawn" | "loading" | "restricted" | "unknown-net" }[];
}

/** `mode="system"`: several boards from a system scene descriptor (System Builder stage 3b). */
export interface PrismSemanticSystemMode {
    /** The system to show, a `prism.system_scene.a0` descriptor. Safe before ready. */
    setSystemScene(descriptor: unknown): void;
    /** Light system nets on every board they reach; [] before ready. */
    setNetEmphasis(sets: readonly PrismSystemSceneEmphasisSet[]): PrismSystemSceneEmphasisResult[];
    frameNetEmphasis(key?: string | null, occurrence?: string | null): boolean;
    frameAll(): void;
    frameBoard(key: string): boolean;
    /** Frame parts on their occurrences; a null reference frames the whole occurrence. */
    frameParts(parts: readonly { occurrence: string; reference: string | null }[]): boolean;
    /** Move mode; state arrives as `prism-semantic-viewer:move`. Who may move is the `move-allowed` attribute. */
    setMoveMode(enabled: boolean): void;
    setMoveSpace(space: "world" | "local"): void;
    /** The gizmo's steps in millimetres and degrees. */
    setMoveSnap(snap: { mm: number; deg: number }): void;
    /** Show a pose for the move target without saving it; null shows the saved pose. */
    previewPose(pose: PrismScenePose | null): void;
    cancelMove(): void;
    getMoveState(): PrismSystemSceneMoveState | null;
    /** Slide mated boards apart along their mate axes, 0 (assembled)..1. */
    setAssemblyExplode(amount: number): void;
    /** Board name labels (on by default). */
    setLabelsVisible(visible: boolean): void;
    setHelpVisible(visible: boolean): void;
    isHelpVisible(): boolean;
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
        /** A click selected something, or nothing. */
        "prism-semantic-viewer:selectionchange": CustomEvent<{ selection: PrismSelection | null }>;
        "prism-semantic-viewer:viewstatechange": CustomEvent<PrismSemanticViewState>;
        "prism-semantic-viewer:error": CustomEvent<PrismSemanticViewerErrorDetail>;
        /** The board is visible; detail is the viewer's performance milestone. */
        "prism-semantic-viewer:ready": CustomEvent<Record<string, unknown>>;
        "prism-semantic-viewer:performance": CustomEvent<Record<string, unknown>>;
        "prism-semantic-viewer:contextmenu": CustomEvent<PrismSemanticContextMenuDetail>;
        "prism-semantic-viewer:emphasis": CustomEvent<{ results: PrismSystemSceneEmphasisResult[] }>;
        "prism-semantic-viewer:move": CustomEvent<PrismSystemSceneMoveState>;
    }

    namespace JSX {
        interface IntrinsicElements {
            "prism-semantic-viewer": React.DetailedHTMLProps<
                React.HTMLAttributes<PrismSemanticViewerElement> & {
                    "bundle-url"?: string;
                    workspace?: "pcb" | "stackup";
                    active?: string;
                    "hide-panel"?: string;
                    /** "system": several boards from `setSystemScene`. */
                    mode?: "system";
                    /** mode="system": "true" lets this reader move boards. */
                    "move-allowed"?: "true" | "false";
                },
                PrismSemanticViewerElement
            >;
        }
    }
}

export {};
