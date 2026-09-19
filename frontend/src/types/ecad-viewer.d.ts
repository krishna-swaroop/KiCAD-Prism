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

/** Pointer modifiers observed on a selection gesture. */
export interface EcadSelectionModifiers {
    shift?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    alt?: boolean;
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
    /**
     * Additive selection intent observed at the gesture. Hosts must not
     * reconstruct it from a later global keyboard state.
     */
    operation?: "replace" | "add" | "toggle";
    modifiers?: EcadSelectionModifiers;
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

/**
 * Object kinds the viewer can show or hide on the board. The first four are
 * footprint text layers; the label kinds drive the zoom-gated pad-number and
 * net-name overlays (KiCad's "Show pad numbers" / "Show net names").
 */
export type EcadPcbObjectVisibilityKind =
    | "references"
    | "values"
    | "footprintText"
    | "hiddenText"
    | "padNumbers"
    | "padNetNames"
    | "trackNetNames";

export interface EcadPcbViewState {
    layers: EcadPcbLayerState[];
    objectOpacity: Record<"tracks" | "vias" | "pads" | "zones", number>;
    objectVisibility: Record<EcadPcbObjectVisibilityKind, boolean>;
    highlightTracks: boolean;
}

/**
 * Routing summary for one board net, as `getNetStatistics` reports it.
 * `routedLength` is millimetres along track centrelines (straight and arc
 * tracks; pads and via barrels excluded); `layers` is every copper layer a
 * track of the net sits on, in board stack order.
 */
export interface EcadNetStatistics {
    net: string;
    netCode: number;
    routedLength: number;
    layers: string[];
    trackCount: number;
    viaCount: number;
}

export interface EcadNetStatisticsRef {
    name?: string;
    netCode?: number;
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

/**
 * Multi-net highlight API (contract C1), shipped by the vendored bundle from
 * ecad-viewer a170968. The element keeps a revision-scoped set; Prism is the
 * authoritative host store and each viewer projects it.
 */
export type HighlightOperation = "replace" | "add" | "remove" | "toggle" | "clear";

export type HighlightContext = "PCB" | "SCH";

export type HighlightUnresolvedReason =
    | "revision-mismatch"
    | "document-mismatch"
    | "unknown-net"
    | "ambiguous-occurrence"
    | "unsupported-context";

export interface ScopedNetRef {
    /** Must equal the revisionKey passed to replaceSources for the loaded revision. */
    revisionKey: string;
    /** Board or schematic filename inside that revision (for example "h1_two_nets.kicad_pcb"). */
    documentKey: string;
    context: HighlightContext;
    /** Revision-scoped canonical net key: the board net name for PCB, or a host key for SCH. */
    netKey: string;
    /** Optional board-local hint resolved only within this revision. */
    netCode?: number;
    /** Required for SCH nets whose document is instantiated more than once. */
    occurrencePath?: string;
}

export interface HighlightRequest {
    revisionKey: string;
    documentKey: string;
    operation: HighlightOperation;
    nets: readonly ScopedNetRef[];
    /** Stable producer identity, for example "prism-selection", "ecad-standalone", "rv-01-test". */
    origin: string;
    /** Caller-unique id used to suppress echoes; a replay of the same replacement reuses no id. */
    requestId: string;
    /** false/default: never move the camera as a side effect. */
    focus?: boolean;
}

export interface HighlightResult {
    changed: boolean;
    accepted: readonly ScopedNetRef[];
    unresolved: readonly { ref: ScopedNetRef; reason: HighlightUnresolvedReason }[];
    cameraMoved: boolean;
}

export interface HighlightChangeDetail {
    revisionKey: string;
    documentKey: string;
    operation: HighlightOperation;
    origin: string;
    requestId: string;
    changed: boolean;
    /** Effective resulting set, bounded and duplicate-free. */
    nets: readonly ScopedNetRef[];
    accepted: readonly ScopedNetRef[];
    unresolved: readonly { ref: ScopedNetRef; reason: HighlightUnresolvedReason }[];
    cause: "request" | "revision-reset" | "source-reload";
}

export interface ECadViewerElement extends HTMLElement {
    readonly isReady: boolean;
    /** Design-variant API (packet 3.4); required by the vendored bundle. */
    setVariant(name: string | null): boolean;
    getVariant(): string | null;
    getVariants(): Array<{ name: string; description: string | null }>;
    replaceSources(update: { revisionKey: string; sources: Array<{ filename: string; content: string }> }): Promise<void>;
    appendSources(update: { revisionKey: string; sources: Array<{ filename: string; content: string }> }): Promise<void>;
    setActive(active: boolean): void;
    setViewportInsets(insets: EcadViewportInsets | null): void;
    resize?(): void;
    /**
     * Clears the inspected object and the element's highlight set, restoring
     * the exact user layer state (contract C1).
     */
    clearSelection(): void;
    /**
     * Apply one highlight-set request synchronously. Validates revision and
     * document first, resolves each reference, mutates the retained set and
     * emits exactly one `ecad-viewer:highlight-change` for an effective change.
     */
    updateHighlightedNets(request: HighlightRequest): HighlightResult;
    /** Current highlight set, insertion order, duplicate-free. */
    getHighlightedNets(): readonly ScopedNetRef[];
    /** Fit the union of selected geometry; false when the set is empty. */
    focusHighlightedNets(): boolean;
    /** Visual emphasis toggle only; never edits the user visibility map. */
    setHighlightDimming(enabled: boolean): boolean;
    /**
     * Routing summary for a board net, resolved by name first and net code
     * second. Null until the board has loaded or when the net is not on it.
     */
    getNetStatistics?(ref: EcadNetStatisticsRef): EcadNetStatistics | null;
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
    setPcbObjectVisibility?(kind: EcadPcbObjectVisibilityKind, visible: boolean): void;
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
        "ecad-viewer:highlight-change": CustomEvent<HighlightChangeDetail>;
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
