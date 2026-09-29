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
    /** Every component reference on the board; empty until the viewer is ready. */
    getComponentReferences?: () => string[];
    resize: () => void;
    /** Null until the viewer is ready. Changes arrive as `prism-semantic-viewer:viewstatechange`. */
    getViewState?: () => PrismSemanticViewState | null;
    setViewMode?: (mode: PrismSemanticViewState["mode"]) => void;
    setLayerVisible?: (layerId: number, visible: boolean) => void;
    applyLayerPreset?: (preset: PrismSemanticLayerPreset) => void;
    setShowBoard?: (visible: boolean) => void;
    setShowComponents?: (visible: boolean) => void;
    setShowPlaceholders?: (visible: boolean) => void;
    setRealisticColors?: (enabled: boolean) => void;
    setSeparation?: (value: number) => void;
    showNetLayers?: () => void;
    setNetIsolation?: (enabled: boolean) => void;
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
                },
                PrismSemanticViewerElement
            >;
        }
    }
}

export {};
