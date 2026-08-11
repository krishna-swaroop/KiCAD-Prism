export type CrossProbeContext = "SCH" | "PCB" | "3D" | "BOM";
export type EcadCrossProbeContext = Extract<CrossProbeContext, "SCH" | "PCB">;
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
    netCode?: number;
    pin?: string;
    crossIndex?: string;
    uuid?: string;
    uuids?: string[];
    componentUid?: string;
    netUid?: string;
    terminalUid?: string;
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
    semantic?: EcadSemanticSelectionDetail;
}

export interface EcadSemanticSelectionDetail {
    sourceContext: "SCH" | "PCB";
    itemType: string;
    uuid?: string;
    crossIndex?: string;
    reference?: string;
    pin?: string;
    net?: string;
    netCode?: number;
    sheet?: string;
    page?: string;
    projectPath?: string;
    sheetPath?: string;
    filename?: string;
    layer?: string;
    x?: number;
    y?: number;
    bounds?: [number, number, number, number];
}

export interface EcadSchematicPageState {
    projectPath: string;
    sheetPath: string;
    filename: string;
    parentProjectPath?: string;
    name?: string;
    page?: string;
    depth: number;
    active: boolean;
}

export interface EcadPcbLayerState {
    name: string;
    color: string;
    visible: boolean;
    highlighted: boolean;
}

export interface EcadPcbViewState {
    layers: EcadPcbLayerState[];
    objectOpacity: Record<"tracks" | "vias" | "pads" | "zones", number>;
    objectVisibility: Record<"references" | "values" | "footprintText" | "hiddenText", boolean>;
    highlightTracks: boolean;
}

export interface EcadViewportInsets {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
}

export type EcadCommentContext = "SCH" | "PCB";

export type EcadCommentAnchor =
    | { kind: "world"; x: number; y: number; page?: string }
    | { kind: "source-item"; uuid: string; page?: string };

export interface EcadCommentOverlaySet {
    context: EcadCommentContext;
    comments: Array<{
        id: string;
        anchor: EcadCommentAnchor;
        areaBounds?: [number, number, number, number];
        accessibilityLabel?: string;
        metadata?: unknown;
    }>;
}

export interface EcadCommentOverlayHitDetail {
    commentId: string;
    context: "SCH" | "PCB";
    x: number;
    y: number;
    bounds?: [number, number, number, number];
    page?: string;
    metadata?: unknown;
}

export interface EcadCommentAreaDetail {
    context: "SCH" | "PCB";
    x: number;
    y: number;
    bounds: [number, number, number, number];
    page?: string;
    layer?: string;
}

export interface EcadPreparedDiffTarget {
    id: string;
    kind: "change" | "group" | "changes";
    category: "added" | "removed" | "modified" | "conflict";
    label: string;
    memberIds: string[];
    sourceIds: string[];
    bounds: [number, number, number, number];
    sourceSide: "reference" | "comparison";
    routing: boolean;
    overlayLines: Array<Array<[number, number]>>;
}

export type EcadDiffResolutionReason =
    | "missing-source-id"
    | "item-not-found"
    | "source-id-ambiguous"
    | "duplicate-change-target"
    | "paint-bounds-not-found";

export interface EcadDiffResolutionDiagnostic {
    changeId: string;
    sourceId?: string;
    side: "reference" | "comparison";
    reason: EcadDiffResolutionReason;
    /** Paint items claiming this source id. */
    matchCount?: number;
    /** KiCad type name, for grouping failures by object kind. */
    typeName?: string;
}

/** Resolution counters after native identity has been matched and painted. */
export interface EcadDiffResolutionSummary {
    changes: number;
    sourceResolved: number;
    ambiguousSourceIds: number;
    duplicateChangeTargets: number;
    targets: number;
    targetsWithPaintedBounds: number;
    targetsUsingProvidedBounds: number;
    targetsNonFocusable: number;
    visuals: number;
    visualsWithPaintedBounds: number;
    visualsUsingProvidedBounds: number;
    visualsNonFocusable: number;
}

export interface EcadDocumentComparisonPreparation {
    comparisonKey: string;
    context: "SCH" | "PCB";
    document: { path: string; docType: string; changes: unknown[] };
    targets: ReadonlyMap<string, EcadPreparedDiffTarget>;
    diagnostics: Array<EcadDiffResolutionDiagnostic>;
    resolution?: EcadDiffResolutionSummary;
    prepareMs: number;
    sourceCacheHit: boolean;
    /** True when the reference revision has no matching document file. */
    missingReference?: boolean;
    /** True when the comparison revision has no matching document file. */
    missingComparison?: boolean;
}

export interface EcadDocumentComparisonSelectionResult {
    status: "applied" | "missing" | "superseded";
    requestId: number;
    target?: EcadPreparedDiffTarget;
    clickToFrameMs: number;
    paintCount: number;
    parserCount: number;
}

export type EcadDocumentComparisonSelection =
    | { kind: "change" | "group"; id: string }
    | { kind: "changes"; ids: string[] };

export type EcadComparisonPresentation =
    | "composite"
    | "reference"
    | "comparison";

export interface EcadComparisonPresentationResult {
    presentation: EcadComparisonPresentation;
    preparation: EcadDocumentComparisonPreparation;
    switchMs: number;
    parserCount: number;
    paintCount: number;
}

export interface EcadComparisonSessionMetrics {
    prepareMs: number;
    parserCount: number;
    switchCount: number;
    lastSwitchMs: number;
    maxSwitchMs: number;
    lastSwitchParserCount: number;
    retainedViewports: number;
    retainedScenes: number;
    sourceBytes: number;
    heapBytesAtPrepare?: number;
    heapBytesCurrent?: number;
}

export interface EcadComparisonSession {
    readonly comparisonKey: string;
    readonly preparation: EcadDocumentComparisonPreparation;
    setPresentation(
        presentation: EcadComparisonPresentation,
        viewport?: ECadViewerElement,
    ): Promise<EcadComparisonPresentationResult>;
    getPreparation(
        viewport?: ECadViewerElement,
    ): EcadDocumentComparisonPreparation | null;
    getSchematicPages(): {
        reference: EcadSchematicPageState[];
        comparison: EcadSchematicPageState[];
    };
    getMetrics(): EcadComparisonSessionMetrics;
    dispose(): void;
}

export interface EcadDocumentComparisonRequest {
    comparisonKey: string;
    reference: {
        revisionKey: string;
        sources: Array<{ filename: string; content: string }>;
    };
    comparison: {
        revisionKey: string;
        sources: Array<{ filename: string; content: string }>;
    };
    diff: unknown;
    /** Native KiCad requires bbox; Prism resolves geometry after paint. */
    diffFormat?: "native-kicad" | "prism";
    documentPath?: string;
    /** Exact hierarchical schematic project path for the reference revision. */
    referenceSheetPath?: string;
    /** Exact hierarchical schematic project path for the comparison revision. */
    comparisonSheetPath?: string;
    /** Compatibility alias for clients that do not send side-specific paths. */
    activeSheetPath?: string;
}

/** Value-based camera state from <ecad-viewer> (world center + zoom + rotation). */
export interface CameraState {
    x: number;
    y: number;
    zoom: number;
    rotation: number;
}

export interface EcadTransitionTraceDetail {
    sequence: number;
    timestamp: string;
    event: string;
    status?: "start" | "ready" | "missing" | "superseded" | "error";
    generation?: number;
    revisionKey?: string | null;
    requestedPage?: string | null;
    resolvedPage?: {
        projectPath: string;
        sheetPath: string;
        filename: string;
        parentProjectPath?: string;
        name?: string;
        page?: string;
    } | null;
    activePage?: string | null;
    detail?: Record<string, unknown>;
}

export interface ECadViewerElement extends HTMLElement {
    readonly isReady: boolean;
    replaceSources(update: { revisionKey: string; sources: Array<{ filename: string; content: string }> }): Promise<void>;
    appendSources(update: { revisionKey: string; sources: Array<{ filename: string; content: string }> }): Promise<void>;
    setActive(active: boolean): void;
    setViewportInsets(insets: EcadViewportInsets | null): void;
    resize?(): void;
    clearSelection(): void;
    setCommentMode?(enabled: boolean): void;
    setCommentOverlays(request: EcadCommentOverlaySet): void;
    clearCommentOverlays(context?: EcadCommentContext): void;
    loadDocumentComparison(
        request: EcadDocumentComparisonRequest,
    ): Promise<EcadDocumentComparisonPreparation>;
    prepareComparison(
        request: EcadDocumentComparisonRequest,
    ): Promise<EcadComparisonSession>;
    selectDocumentDiff(
        selection: EcadDocumentComparisonSelection,
    ): Promise<EcadDocumentComparisonSelectionResult>;
    previewDocumentDiff?(
        selection: EcadDocumentComparisonSelection | null,
    ): void;
    clearDocumentDiffSelection?(): void;
    /** Abort in-flight comparison loads without tearing down painted presentation. */
    abortDocumentComparisonLoad?(): void;
    clearDocumentComparison(): void;
    zoomToLocation(x: number, y: number): void;
    switchPage(pageId: string): void;
    /** Resolves once the project has loaded (parse + first paint). */
    readonly ready: Promise<void>;
    /** Switch schematic page and resolve once applied. Awaits readiness first. */
    showPage?(pageId: string): Promise<void>;
    /** Fit the active viewer to a world-space bbox; resolves the settled camera. */
    focusBBox?(x: number, y: number, w: number, h: number): Promise<CameraState | null>;
    /** Focus an item by uuid; resolves the settled camera or null. */
    focusItem?(uuid: string, opts?: { select?: boolean; pad?: number }): Promise<CameraState | null>;
    /**
     * Label / global-label instances that share `name` (for Selection Next/Prev).
     */
    findLabelInstances?(name: string): Array<{
        uuid: string;
        sheet: string;
        name: string;
        kind?: "global" | "net" | "hierarchical";
    }>;
    /** Switch sheet if needed, frame the label uuid, and emit selection. */
    focusLabelInstance?(uuid: string): Promise<boolean>;
    /** Convenience cross-probe by designator/uuid in the active viewer. Prefer requestCrossProbe. */
    crossProbe?(reference: string): Promise<CameraState | null>;
    /** Active tab's camera as a plain value, or null before load. Settable. */
    camera?: CameraState | null;
    navigateSchematicPage?(direction: -1 | 1): boolean;
    navigateSchematicParent?(): boolean;
    getSchematicPages?(): EcadSchematicPageState[];
    getActiveSchematicPage?(): {
        projectPath: string;
        sheetPath: string;
        filename: string;
        name?: string;
        page?: string;
    } | null;
    getPcbViewState?(): EcadPcbViewState | null;
    setPcbLayerVisibility?(name: string, visible: boolean): boolean;
    setPcbLayerHighlight?(name: string | null): boolean;
    applyPcbLayerPreset?(preset: "front" | "back" | "copper" | "outer-copper" | "inner-copper" | "drawings" | "all" | "none"): void;
    setPcbObjectOpacity?(kind: "tracks" | "vias" | "pads" | "zones", opacity: number): void;
    setPcbObjectVisibility?(kind: "references" | "values" | "footprintText" | "hiddenText", visible: boolean): void;
    setPcbTrackHighlight?(enabled: boolean): void;
    getScreenLocation(x: number, y: number): { x: number; y: number } | null;
    requestCrossProbe(request: CrossProbeRequest): Promise<
        | { ok: true; targetContext: "SCH" | "PCB"; generation: number }
        | {
              ok: false;
              reason: "empty-value" | "load-error" | "target-unavailable" | "not-found";
              targetContext?: "SCH" | "PCB";
              generation: number;
              message?: string;
          }
    >;
}

declare global {
    interface HTMLElementTagNameMap {
        "ecad-viewer": ECadViewerElement;
    }

    interface HTMLElementEventMap {
        "ecad-viewer:crossprobe:request": CustomEvent<CrossProbeRequest>;
        "ecad-viewer:crossprobe:result": CustomEvent<CrossProbeResult>;
        "ecad-viewer:selection": CustomEvent<EcadSemanticSelectionDetail>;
        "ecad-viewer:crossprobe": CustomEvent<EcadSemanticSelectionDetail>;
        "ecad-viewer:view-state-change": CustomEvent<void>;
        "ecad-viewer:comment-overlay-click": CustomEvent<EcadCommentOverlayHitDetail>;
        "ecad-viewer:document-comparison-ready": CustomEvent<EcadDocumentComparisonPreparation>;
        "ecad-viewer:document-comparison-frame": CustomEvent<EcadDocumentComparisonSelectionResult>;
        "ecad-viewer:transition-trace": CustomEvent<EcadTransitionTraceDetail>;
        "ecad-viewer:comment-area": CustomEvent<EcadCommentAreaDetail>;
        "kicanvas:select": CustomEvent<KiCanvasSelectDetail>;
        camerachange: CustomEvent<CameraState>;
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
                "show-selection-panel"?: string;
                "hide-chrome"?: boolean | "true" | "false";
                "source-mode"?: "auto" | "host";
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
