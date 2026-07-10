export type CrossProbeContext = "SCH" | "PCB";
export type CrossProbeMode = "hover" | "select" | "focus";
export type CrossProbeKind = "designator" | "net" | "crossIndex" | "uuid";
export type CrossProbeFailureReason =
    | "cross-probe-disabled"
    | "missing-probe-value"
    | "designator-not-found"
    | "uuid-not-found"
    | "target-not-available"
    | "not-implemented"
    | "internal-error";

export interface CrossProbeRequest {
    sourceContext: CrossProbeContext;
    targetContext?: CrossProbeContext;
    mode: CrossProbeMode;
    kind: CrossProbeKind;
    value: string;
    sheet?: string;
    page?: string;
    designator?: string;
    net?: string;
    crossIndex?: string;
}

export interface CrossProbeTargetHint {
    context: CrossProbeContext;
    sheet?: string;
    page?: string;
    designator?: string;
    net?: string;
    crossIndex?: string;
    uuid?: string;
}

export interface CrossProbeResult {
    resolved: boolean;
    reason?: CrossProbeFailureReason;
    request: CrossProbeRequest;
    targetHint?: CrossProbeTargetHint;
}

export interface KiCanvasSelectDetail {
    item: unknown;
    previous: unknown;
    sourceContext?: CrossProbeContext;
}

/** Value-based camera state from <ecad-viewer> (world center + zoom + rotation). */
export interface CameraState {
    x: number;
    y: number;
    zoom: number;
    rotation: number;
}

export interface ECadViewerElement extends HTMLElement {
    setCommentMode(enabled: boolean): void;
    zoomToLocation(x: number, y: number): void;
    /** Resolves once the project has loaded (parse + first paint). */
    readonly ready: Promise<void>;
    /** Switch schematic page and resolve once it's actually loaded. Awaits
        readiness first, and reconciles against any post-load auto-load. */
    showPage(pageId: string): Promise<void>;
    /** Back-compat fire-and-forget page switch. Prefer showPage(). */
    switchPage(pageId: string): void;
    getScreenLocation(x: number, y: number): { x: number; y: number } | null;
    // Cross-probe API is OPTIONAL — the Huaqiu base fork does not implement it.
    // Callers must guard (typeof viewer.requestCrossProbe === "function").
    setCrossProbeEnabled?(enabled: boolean): void;
    isCrossProbeEnabled?(): boolean;
    requestCrossProbe?(request: CrossProbeRequest): CrossProbeResult;
    /** Active tab's camera as a plain value, or null before load. Settable. */
    camera: CameraState | null;
}

declare global {
    interface HTMLElementTagNameMap {
        "ecad-viewer": ECadViewerElement;
    }

    interface HTMLElementEventMap {
        "ecad-viewer:crossprobe:request": CustomEvent<CrossProbeRequest>;
        "ecad-viewer:crossprobe:result": CustomEvent<CrossProbeResult>;
        "kicanvas:select": CustomEvent<KiCanvasSelectDetail>;
        "camerachange": CustomEvent<CameraState>;
    }

    namespace JSX {
        interface IntrinsicElements {
            'ecad-viewer-embedded': React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement> & {
                    url?: string;
                    'is-bom'?: string;
                },
                HTMLElement
            >;
            'ecad-viewer': React.DetailedHTMLProps<
                React.HTMLAttributes<ECadViewerElement> & {
                    url?: string;
                    "show-header"?: boolean | "true" | "false";
                    "header-sections"?: string;
                },
                ECadViewerElement
            >;
            'ecad-source': React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement> & {
                    src?: string;
                },
                HTMLElement
            >;
            'ecad-blob': React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement> & {
                    filename?: string;
                    content?: string;
                },
                HTMLElement
            >;
        }
    }
}
