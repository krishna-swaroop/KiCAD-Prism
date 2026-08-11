/**
 * Types for the Design Comparison result returned by the backend
 * `design_compare_service`. Mirrors `backend/app/services/design_compare_service.py`
 * and `backend/app/services/bom_diff_service.py`.
 */

export type ChangeKind = "added" | "removed" | "changed";
export type ChangeDomain = "schematic" | "pcb";

/** Matches the shared category taxonomy in `@/lib/diff-grouping`. */
export type ChangeCategory =
    | "rules"
    | "components"
    | "nets"
    | "board"
    | "zones"
    | "graphics"
    | "symbols"
    | "sheets"
    | "text"
    | "other";

export type FieldDiffValue =
    | { old?: unknown; new?: unknown }
    | string
    | number
    | boolean
    | null
    | undefined;

/** Compact UUID → world geometry sidecar entry, keyed by source item uuid. */
export interface GeometryEntry {
    kind:
        | "track"
        | "arc"
        | "via"
        | "zone"
        | "footprint"
        | "symbol"
        | "wire"
        | "label"
        | "junction"
        | "graphic";
    source_id?: string;
    semantic_id?: string;
    parent_source_id?: string;
    reference?: string;
    page?: string;
    x?: number;
    y?: number;
    rotation?: number;
    points?: Array<[number, number]>;
    width?: number;
    layer?: string;
    net?: string;
    radius?: number;
    bounds?: [number, number, number, number];
    lib_id?: string;
}

export interface NativeComparisonItem {
    source_id?: string | null;
    parent_source_id?: string | null;
    semantic_id?: string | null;
    page?: string | null;
    path?: string | null;
    layer?: string | null;
    /**
     * Every layer this revision's object occupies. A track names one layer; a
     * via names its span endpoints. Kept per revision so a focused routing
     * review can show each pane only the copper that revision carries.
     */
    layers?: string[] | null;
    reference?: string | null;
    net?: string | null;
}

export interface ChangeItem {
    id: string;
    kind: ChangeKind;
    domain: ChangeDomain;
    category: ChangeCategory | string;
    label: string;
    page?: string | null;
    alsoOnPages?: string[];
    uuid?: string;
    source_id_base?: string | null;
    source_id_compare?: string | null;
    parent_source_id_base?: string | null;
    parent_source_id_compare?: string | null;
    semantic_id?: string | null;
    reference?: string | null;
    classification?: "primary" | "secondary";
    net?: string;
    layers?: string[];
    geometry?: GeometryEntry;
    oldGeometry?: GeometryEntry;
    fields?: Record<string, FieldDiffValue>;
    base_item?: NativeComparisonItem | null;
    compare_item?: NativeComparisonItem | null;
    reasons?: ChangeReason[];
    details?: ChangeDetails;
    affected_source_ids_base?: string[];
    affected_source_ids_compare?: string[];
    source_side?: "reference" | "comparison";
    /** Native parser kind retained for reviewer-specific presentation policy. */
    object_kind?: string | null;
    /**
     * Set when this change only records another domain's authored edit being
     * propagated into this file. KiCad rewrites every copper object's net
     * reference after one schematic net rename; those rewrites are evidence of
     * the rename, not separate design decisions.
     */
    derivedFrom?: { kind: "net-rename"; old: string; new: string };
    position_base?: [number, number] | null;
    position_compare?: [number, number] | null;
    position_delta?: {
        dx: number;
        dy: number;
        distance: number;
    } | null;
}

export type ChangeReason =
    | "object-added"
    | "object-removed"
    | "symbol-fields-changed"
    | "instance-replaced"
    | "instance-count-changed"
    | "sheet-changed"
    | "net-renamed"
    | "connectivity-changed"
    | "label-count-changed"
    | "bus-membership-changed"
    | "moved"
    | "rotated"
    | "mirrored"
    | "layer-changed"
    | "net-changed"
    | "renamed"
    | "lib-changed"
    | "dnp-changed"
    | "re-pathed"
    | "properties-changed"
    | "content-changed";

export interface ChangeDetails {
    /** Structured review evidence with no independently paintable KiCad item. */
    reviewOnly?: boolean;
    fieldDeltas?: Record<string, FieldDiffValue>;
    connectivity?: {
        addedTerminals: string[];
        removedTerminals: string[];
    };
    instanceCount?: { old: number; new: number };
    netInstances?: { old: number; new: number };
    labelInstances?: { old: number; new: number };
    sheetChange?: { old?: string | null; new?: string | null };
    instanceReplacement?: { old: string[]; new: string[] };
    visualTargets?: Array<{
        side: "reference" | "comparison";
        status: "added" | "removed" | "modified";
        sourceId: string;
        parentSourceId?: string | null;
        kind?: string | null;
        documentPath?: string | null;
        at?: [number, number] | null;
        /** Native .kicad_sch filename used to load the paint document. */
        page?: string | null;
        /** Human hierarchy retained separately from the native filename. */
        sheetPath?: string | null;
        role:
            | "component"
            | "wire"
            | "bus"
            | "bus_entry"
            | "label"
            | "junction"
            | "terminal"
            | "sheet"
            | "sheet_pin"
            | "symbol"
            | "no_connect"
            | "graphic"
            | "footprint"
            | "pad"
            | "track"
            | "segment"
            | "arc"
            | "via"
            | "zone"
            | "footprint_graphic"
            | "footprint_text"
            | "image"
            | "table"
            | "group"
            | "net_class"
            | "net_class_assignment";
        reference?: string;
        pin?: string;
    }>;
}

export interface SemanticChangeGroup {
    id: string;
    category: ChangeCategory | string;
    status: ChangeKind;
    classification: "primary" | "secondary";
    label: string;
    semantic_id?: string | null;
    members: string[];
    old_fields: Record<string, unknown>;
    new_fields: Record<string, unknown>;
    unresolved_thread_count: number;
    reasons?: ChangeReason[];
    details?: ChangeDetails;
}

export interface DiffSummary {
    added: number;
    removed: number;
    changed: number;
}

export interface SchematicDiff {
    pages: string[];
    changes: ChangeItem[];
    groups: SemanticChangeGroup[];
    summary: DiffSummary;
}

export interface PcbDiff {
    changes: ChangeItem[];
    groups: SemanticChangeGroup[];
    summary: DiffSummary;
    route_metrics?: {
        base: Record<string, RouteMetrics>;
        compare: Record<string, RouteMetrics>;
    };
}

export interface RouteMetrics {
    centerline_length_mm: number;
    via_count: number;
    used_layers: string[];
    via_barrel_length_mm: number | null;
    propagation_delay: null;
    diagnostics: string[];
}

export type BomRowStatus = "added" | "removed" | "changed" | "unchanged";

export interface BomChangeRow {
    ref: string;
    status: BomRowStatus;
    old?: Record<string, string>;
    new?: Record<string, string>;
    diffs?: Record<string, { old: string; new: string }>;
}

export interface BomDiff {
    summary: DiffSummary;
    changes: BomChangeRow[];
    fields: string[];
    include_unchanged?: boolean;
}

export interface StackupLayer {
    name: string;
    type: string;
    thickness?: number | null;
    ordinal?: number;
    material?: string | null;
    color?: string | null;
    epsilon_r?: number | null;
    loss_tangent?: number | null;
}

export interface StackupSettings {
    copper_finish?: string | null;
    dielectric_constraints?: boolean | null;
}

export interface StackupDiff {
    base: StackupLayer[];
    head: StackupLayer[];
    base_settings?: StackupSettings;
    head_settings?: StackupSettings;
    changed: boolean;
    present: boolean;
}

export interface SourceFileRef {
    filename: string;
    path: string;
}

export type KiCadChangeKind =
    | "added"
    | "removed"
    | "modified"
    | "collision"
    | "duplicate_uuid";

/** Strict item shape produced by native KiCad PROJECT_DIFF. */
export interface NativeKiCadItemChange {
    id: string;
    typeName: string;
    kind: KiCadChangeKind;
    properties: Array<{
        name: string;
        before: { type: string; v?: unknown; label?: string };
        after: { type: string; v?: unknown; label?: string };
    }>;
    bbox: [number, number, number, number];
    refdes?: string;
    sourceSide?: "reference" | "comparison";
    retainReference?: boolean;
    children: NativeKiCadItemChange[];
}

/**
 * Prism supplies native identity and lets ecad-viewer measure geometry from
 * the parsed scene. Transitional callers may still include a bbox.
 */
export interface PrismItemChangeInput
    extends Omit<NativeKiCadItemChange, "bbox" | "children"> {
    bbox?: [number, number, number, number];
    children: PrismItemChangeInput[];
}

export interface KiCadDocumentDiff {
    path: string;
    docType: string;
    changes: PrismItemChangeInput[];
}

export interface KiCadProjectDiffBundle {
    schema: "prism.kicad_project_diff_v1" | string;
    provider: "prism-semantic" | "kicad-cli" | string;
    project: { documents: KiCadDocumentDiff[] };
    navigation: Record<
        string,
        {
            documentPath: string;
            changeId: string;
            changeIds?: string[];
            documents?: Array<{
                documentPath: string;
                changeId: string;
                changeIds: string[];
            }>;
        }
    >;
    diagnostics: Array<{ changeId: string; reason: string }>;
}

export interface GeometrySnapshot {
    schematic: Record<string, GeometryEntry>;
    pcb: Record<string, GeometryEntry>;
}

/**
 * One plotted layer of the fabrication package, compared between revisions.
 * The regions are in KiCad board millimetres so they cross-probe against the
 * same coordinate space as every other visual target.
 */
export interface FabricationRegion {
    index: number;
    kind: "added" | "removed" | "changed";
    /** Bottom-left corner of the marker. */
    x: number;
    y: number;
    width: number;
    height: number;
    addedOps: number;
    removedOps: number;
}

export interface FabricationLayerDiff {
    /** Gerber X2 file function, e.g. `Copper,L1,Top`. */
    function: string;
    /** KiCad layer name, e.g. `F.Cu`. */
    name: string;
    file: { base: string | null; compare: string | null };
    status: "changed" | "unchanged" | "added" | "removed" | "unreadable";
    regions: FabricationRegion[];
    warnings: string[];
    /**
     * Sidecar names for this layer's artwork, drawn from the same operations
     * the comparison comes from. Resolve through `sidecarUrls`.
     */
    render?: { base?: string; compare?: string };
}

export interface FabricationDiff {
    present: boolean;
    summary: {
        layers: number;
        changedLayers: number;
        regions: number;
        addedRegions?: number;
        removedRegions?: number;
        changedRegions?: number;
    };
    /**
     * Board profile in KiCad board millimetres, used to frame the difference
     * markers.
     */
    outline?: {
        segments: number[][][];
        bounds: [number, number, number, number];
    } | null;
    layers: FabricationLayerDiff[];
    warnings: string[];
    /**
     * Rectangle every layer render is drawn in, in KiCad board millimetres.
     * The difference markers use the same space, so they overlay the artwork
     * without a second coordinate system.
     */
    bounds: [number, number, number, number] | null;
    /**
     * The board profile, which is what the view fits to. Fabrication and
     * courtyard layers carry annotation well outside it, and fitting to the
     * drawn extent instead leaves the board adrift in the middle of the pane.
     */
    board: [number, number, number, number] | null;
}

export interface DesignCompareResult {
    schema?: "prism.semantic_comparison_v2" | "prism.semantic_comparison_v3" | string;
    base: string;
    head: string;
    compare?: string;
    diagnostics?: string[];
    schematic: SchematicDiff;
    pcb: PcbDiff;
    bom: BomDiff | null;
    stackup: StackupDiff;
    /** Absent on comparisons produced before the fabrication domain existed. */
    fabrication?: FabricationDiff;
    /** Legacy debug sidecar; current viewers consume document_diff and source files. */
    geometry?: {
        base: GeometrySnapshot;
        head: GeometrySnapshot;
    };
    files: {
        base: SourceFileRef[];
        head: SourceFileRef[];
    };
    document_diff: KiCadProjectDiffBundle;
    readiness?: DesignCompareReadiness;
    /** Sidecar name → URL, for payloads that reference artifacts by name. */
    sidecarUrls?: Record<string, string>;
}

export interface DesignCompareBundle {
    schema: "prism.design_compare_bundle_v1";
    resultSchema?: string;
    base: string;
    head: string;
    compare?: string;
    readiness?: DesignCompareReadiness;
    domains: Record<
        DesignCompareDomain,
        {
            summary?: { added: number; removed: number; changed: number } | null;
            changeCount: number;
            groupCount: number;
        }
    >;
    /**
     * Named immutable artifacts. Beyond the fixed domain payloads this also
     * carries per-layer fabrication artwork under `fab:<layer>:<side>`, so the
     * count is open-ended.
     */
    sidecars: Record<
        string,
        {
            digest: string;
            sizeBytes: number;
            mediaType: string;
            url: string;
        }
    >;
}

export type DesignCompareDomain =
    | "schematic"
    | "bom"
    | "pcb"
    | "stackup"
    | "fabrication";
export type DesignCompareDomainStatus = "pending" | "building" | "ready" | "failed";

export interface DesignCompareReadiness {
    stage: "building-initial" | "initial-ready" | "complete" | string;
    domains: Record<DesignCompareDomain, DesignCompareDomainStatus>;
}

export interface DesignCompareJobStatus {
    job_id: string;
    status: "running" | "completed" | "failed";
    message: string;
    percent: number;
    logs: string[];
    base?: string;
    head?: string;
    result_version?: number;
    ready_domains?: DesignCompareDomain[];
    readiness?: DesignCompareReadiness;
}

export type ViewerSide = "base" | "head";
