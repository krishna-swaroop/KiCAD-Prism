import type React from "react";
import type { PrismSelection } from "@/types/prism-selection";

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

export interface PrismViewerLodThresholds {
    /** Components draw at or above this projected radius. */
    fullPx: number;
    /** Copper, barrels, silkscreen and paste draw at or above this. */
    boardPx: number;
    /** Below this the board is a box; between it and boardPx only the substrate and mask draw. */
    boxPx: number;
    /** Hysteresis: a finer level holds until the size drops below threshold × keep. */
    keep: number;
}

export interface PrismViewerStats {
    occurrences: number;
    /** Occurrences per level of detail in the last culled frame. */
    lod: { full: number; board: number; body: number; box: number; culled: number };
    triangles: number;
    draws: number;
    gpuMemoryBytes: number;
    /** SB2-26: the GPU budget, the component tier and the browser asset cache. */
    gpuBudgetBytes: number;
    componentTier: "idle" | "loading" | "loaded";
    componentEvictions: number;
    tileEvictions: number;
    cache: {
        enabled: boolean;
        files?: number;
        bytes?: number;
        hits?: number;
        misses?: number;
        networkBytes?: number;
        cachedBytes?: number;
    };
    frameIntervalMs: number;
    frameIntervalP95Ms: number;
    frameCpuMs: number;
    frameCpuP95Ms: number;
    fps: number;
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

export interface PrismSemanticViewerElement extends HTMLElement {
    setSelection: (selection: PrismRendererSelection | null) => void;
    /**
     * Replace the highlighted nets: every listed net renders emphasised
     * alongside the inspected selection. Safe before ready and after reloads.
     */
    setHighlightedNets?: (nets: readonly PrismRendererSelection[]) => void;
    /**
     * Replaces the hidden component set (VAR-18). Safe before ready and after
     * reloads; ambiguous or unknown references stay visible.
     */
    setHiddenComponents: (references: string[]) => void;
    /** What is under a client point, without selecting it (SB2-24). Null before ready. */
    pickAt?: (clientX: number, clientY: number) => Promise<PrismViewerPick | null>;
    /** mode="system" (SB2-48b): where a client point meets a `pickSurface` model, in world mm with the normal facing the viewer. */
    pickSurfaceAt?: (clientX: number, clientY: number) => PrismSurfacePick | null;
    /** mode="system" (SB2-48b): look along a world axis from its + side (`opposite`: its − side), framing the scene. */
    viewAxis?: (axis: "x" | "y" | "z", opposite?: boolean) => void;
    /** mode="system" (SB2-48b): put the move gizmo on an occurrence by path; false when it is not placed yet. */
    focusMoveTarget?: (path: string) => boolean;
    /** Client coordinates of a component's centre (mode="system": on one placement), or null off screen. */
    projectComponent?: (reference: string, occurrenceKey?: string) => { x: number; y: number } | null;
    /** Client coordinates of a board-local runtime point (metres; mode="system": on one placement). */
    projectPoint?: (point: readonly [number, number, number], occurrenceKey?: string) => { x: number; y: number } | null;
    /** Show the scene stats overlay (SB2-25); the backquote key toggles it. */
    setStatsOverlay?: (visible: boolean) => void;
    /** The numbers behind the stats overlay, or null before ready. */
    getStats?: () => PrismViewerStats | null;
    /** Force a level of detail on every occurrence (0 full, 1 board, 2 body, 3 box), or null for automatic. */
    setLodOverride?: (lod: 0 | 1 | 2 | 3 | null) => void;
    /** mode="system" (SB2-30a): thresholds in CSS px of a board's projected radius, merged; null restores the defaults. Kept per browser. */
    setLodThresholds?: (thresholds: Partial<PrismViewerLodThresholds> | null) => PrismViewerLodThresholds | null;
    /** GPU memory budget in bytes (default 1.5 GB); over it, tiers no occurrence needs are evicted. */
    setGpuBudget?: (bytes: number) => void;
    /** Every component reference on the board; empty until the viewer is ready. */
    getComponentReferences?: () => string[];
    /**
     * IN-61: draw the board into a 2D `canvas` through an inset camera (KiCad
     * mm). `key` names the inset; false when nothing was drawn.
     */
    renderInset?: (canvas: HTMLCanvasElement, view: PrismInsetView, key: string) => boolean;
    /** True once `renderInset` can draw (one-board PCB workspace, first frame done). */
    insetReady?: () => boolean;
    /** The board surface on one side, as `PrismInsetView.focusZ`. */
    insetSurfaceZ?: (bottom: boolean) => number;
    releaseInset?: (key: string) => void;
    /** Called when the main view redrew or the viewer reloaded; returns an unsubscribe. */
    onSceneChange?: (listener: () => void) => () => void;
    resize: () => void;
    /** Null until the viewer is ready. Changes arrive as `prism-semantic-viewer:viewstatechange`. */
    getViewState?: () => PrismSemanticViewState | null;
    setViewMode?: (mode: PrismSemanticViewState["mode"]) => void;
    /** In a system scene, `placement` names one placed board (every placement of the selected board when omitted). */
    setLayerVisible?: (layerId: number, visible: boolean, placement?: string | null) => void;
    applyLayerPreset?: (preset: PrismSemanticLayerPreset, placement?: string | null) => void;
    setShowBoard?: (visible: boolean) => void;
    setShowComponents?: (visible: boolean) => void;
    setShowPlaceholders?: (visible: boolean) => void;
    setRealisticColors?: (enabled: boolean) => void;
    /** In a system scene, `placement` names one placed board (every placement of the selected board when omitted). */
    setSeparation?: (value: number, placement?: string | null) => void;
    showNetLayers?: () => void;
    setNetIsolation?: (enabled: boolean) => void;
    /** mode="system" (SB2-31e): the system to show, a `prism.system_scene.a0` descriptor. Safe before ready. */
    setSystemScene?: (descriptor: unknown) => void;
    /** mode="system": light system nets on every board they reach; the report also arrives as `prism-semantic-viewer:emphasis`. */
    setNetEmphasis?: (sets: readonly PrismSystemSceneEmphasisSet[]) => PrismSystemSceneEmphasisResult[];
    /** mode="system": frame a lit set's copper (or all), on one placement or all; false when nothing is lit there. */
    frameNetEmphasis?: (key?: string | null, occurrence?: string | null) => boolean;
    /** mode="system": frame every placed board. */
    frameAll?: () => void;
    /** mode="system" move mode (SB2-29); state arrives as `prism-semantic-viewer:move`. Who may move is the `move-allowed` attribute. */
    setMoveMode?: (enabled: boolean, options?: { route?: boolean }) => void;
    /** D-P2-51: move mode for harness routes only. */
    setRouteMode?: (enabled: boolean) => void;
    setMoveSpace?: (space: "world" | "local") => void;
    /** Show a pose for the move target without saving it; null shows the saved pose. */
    previewPose?: (pose: PrismScenePose | null) => void;
    cancelMove?: () => void;
    getMoveState?: () => PrismSystemSceneMoveState | null;
    /** mode="system" harness editing (SB2-45b); state arrives as `prism-semantic-viewer:harness`. */
    targetHarnessNode?: (id: string | null) => void;
    /** mode="system" (SB2-61): pick a root-level harness by id as a click would; null drops the pick; false when not drawn. */
    selectHarness?: (id: string | null) => boolean;
    /** Show the targeted node at a level-frame position without saving it; null shows its saved place. */
    previewHarnessNode?: (positionMm: [number, number, number] | null) => void;
    cancelHarnessNode?: () => void;
    getHarnessState?: () => PrismSystemSceneHarnessState | null;
    /** mode="system": board name labels (on by default). */
    setLabelsVisible?: (visible: boolean) => void;
    /** mode="system": the proxy harnesses (SB2-34), shown by default. */
    setHarnessesVisible?: (visible: boolean) => void;
    /** mode="system": the keyboard list (also `?`). */
    setHelpVisible?: (visible: boolean) => void;
    isHelpVisible?: () => boolean;
    /** mode="system": frame one placed board. */
    frameBoard?: (key: string) => boolean;
    /** mode="system": frame parts on their placements (SB2-32: a hop's two connectors); a null reference frames
     *  its whole occurrence (SB2-108); false when none is drawn. */
    frameParts?: (parts: readonly { occurrence: string; reference: string | null }[]) => boolean;
}

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

declare global {
    interface HTMLElementTagNameMap {
        "prism-semantic-viewer": PrismSemanticViewerElement;
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
