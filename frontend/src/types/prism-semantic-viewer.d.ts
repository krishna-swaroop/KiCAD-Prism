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
    resize: () => void;
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
                },
                PrismSemanticViewerElement
            >;
        }
    }
}

export {};
