export type PrismSelectionContext = "SCH" | "PCB" | "3D" | "BOM";

export interface PrismSourceAnchor {
    context: PrismSelectionContext;
    itemType?: string;
    uuid?: string;
    crossIndex?: string;
    sheet?: string;
    page?: string;
    layer?: string;
    sourceRevisionKey?: string;
    world?: {
        x: number;
        y: number;
    };
}

interface PrismSelectionBase {
    sourceContext: PrismSelectionContext;
    sourceRevisionKey?: string;
    anchor?: PrismSourceAnchor;
}

export interface PrismComponentSelection extends PrismSelectionBase {
    kind: "component";
    reference: string;
    componentUid?: string;
    uuid?: string;
    crossIndex?: string;
}

export interface PrismNetSelection extends PrismSelectionBase {
    kind: "net";
    netName: string;
    netUid?: string;
    netCode?: number;
    uuid?: string;
    crossIndex?: string;
}

export interface PrismTerminalSelection extends PrismSelectionBase {
    kind: "terminal";
    reference: string;
    pin: string;
    terminalUid?: string;
    componentUid?: string;
    netUid?: string;
    netName?: string;
    netCode?: number;
    uuid?: string;
}

export type PrismSelection =
    | PrismComponentSelection
    | PrismNetSelection
    | PrismTerminalSelection;

export interface SemanticSchematicRef {
    sheetInstancePath?: string;
    page?: string;
    symbolUuid?: string;
    /**
     * Full occurrence identity (`<sheetInstancePath>/<symbolUuid>`) for the
     * unit this reference belongs to, when the assembly state resolved it.
     */
    occurrenceId?: string;
    crossIndex?: string;
    wireUuids?: string[];
    labelUuids?: string[];
    junctionUuids?: string[];
    pinUuids?: string[];
}

export interface SemanticPcbRef {
    footprintUuid?: string;
    crossIndex?: string;
    trackUuids?: string[];
    arcUuids?: string[];
    viaUuids?: string[];
    zoneUuids?: string[];
    padUuids?: string[];
}

export interface SemanticWebGpuRef {
    featureId?: number;
    nodeIds?: number[];
    numericNetId?: number;
    tileIds?: string[];
    bounds?: number[];
}

export interface SemanticComponent {
    componentUid: string;
    reference: string;
    value?: string;
    footprint?: string;
    fields?: Record<string, string | number | boolean | null>;
    schematicRefs?: SemanticSchematicRef[];
    pcbRefs?: SemanticPcbRef[];
    webgpuRefs?: SemanticWebGpuRef[];
}

export interface SemanticNet {
    netUid: string;
    name: string;
    netCode?: number;
    netClass?: string;
    aliases?: string[];
    schematicRefs?: SemanticSchematicRef[];
    pcbRefs?: SemanticPcbRef[];
    webgpuRefs?: SemanticWebGpuRef[];
}

export interface SemanticTerminal {
    terminalUid: string;
    componentUid: string;
    reference: string;
    pin: string;
    netUid?: string;
    netName?: string;
    schematicPinUuid?: string;
    pcbPadUuid?: string;
}

export interface SemanticIndexMaps {
    componentByReference?: Record<string, number>;
    componentBySchematicUuid?: Record<string, number>;
    componentByPcbFootprintUuid?: Record<string, number>;
    terminalBySchematicPinUuid?: Record<string, number>;
    terminalByPcbPadUuid?: Record<string, number>;
    terminalByReferencePin?: Record<string, number>;
    netByName?: Record<string, number>;
    netByNetCode?: Record<string, number>;
    netBySchematicUuid?: Record<string, number>;
    netByPcbUuid?: Record<string, number>;
}

/**
 * Assembly state (contract packet v1.0 section 3.2/3.3). Named maps are
 * differential against the effective default; default maps against the
 * all-false neutral state. Booleans are explicit in overrides.
 */
export type AssemblyFlag =
    | "dnp"
    | "excludeFromBom"
    | "excludeFromBoard"
    | "excludeFromSim"
    | "excludeFromPosFiles";

export interface AssemblyCatalogEntry {
    name: string;
    description: string | null;
    sources: Array<"project" | "pcb" | "schematic" | "footprint">;
}

export interface AssemblyOccurrenceDefault {
    reference: string;
    componentUid?: string;
    dnp?: true;
    excludeFromBom?: true;
    excludeFromBoard?: true;
    excludeFromSim?: true;
    excludeFromPosFiles?: true;
}

export interface AssemblyComponentDefault {
    dnp?: true;
    excludeFromBom?: true;
    excludeFromBoard?: true;
    excludeFromSim?: true;
    excludeFromPosFiles?: true;
}

export interface AssemblyFootprintDefault {
    reference: string;
    componentUid: string | null;
    dnp?: true;
    excludeFromBom?: true;
    excludeFromPosFiles?: true;
}

export interface AssemblyOverride {
    dnp?: boolean;
    excludeFromBom?: boolean;
    excludeFromBoard?: boolean;
    excludeFromSim?: boolean;
    excludeFromPosFiles?: boolean;
    fields?: Record<string, string>;
}

export interface AssemblyFootprintOverride {
    dnp?: boolean;
    excludeFromBom?: boolean;
    excludeFromPosFiles?: boolean;
    fields?: Record<string, string>;
}

export interface AssemblyDiagnostic {
    code: string;
    severity: "info" | "warning" | "error";
    message: string;
    source?: "project" | "schematic" | "pcb";
    variant?: string;
    componentUid?: string;
    occurrenceId?: string;
    footprintUuid?: string;
    path?: string;
    detail?: unknown;
    /**
     * Reference-level join aids emitted by the index alongside the frozen
     * keys above (fixture diagnostics key on reference, and 3D grouping keys
     * on the footprint UUID list).
     */
    reference?: string;
    footprintUuids?: string[];
}

export interface AssemblyVariantState {
    name: string;
    occurrences: Record<string, AssemblyOverride>;
    components: Record<string, AssemblyOverride>;
    footprints: Record<string, AssemblyFootprintOverride>;
}

export interface AssemblyState {
    schema: "prism.assembly_state_a0";
    catalog: AssemblyCatalogEntry[];
    /** Complete physical identity, including neutral and PCB-only footprints. */
    footprintInventory?: Array<{ uuid: string; reference: string }>;
    default: {
        occurrences: Record<string, AssemblyOccurrenceDefault>;
        components: Record<string, AssemblyComponentDefault>;
        footprints: Record<string, AssemblyFootprintDefault>;
    };
    variants: AssemblyVariantState[];
    diagnostics: AssemblyDiagnostic[];
}

export type PhysicalVisibility = "visible" | "hidden" | "ambiguous" | "absent";

export interface PrismSemanticIndex {
    schema: "prism.semantic_index_a0";
    sourceRevisionKey: string;
    generator?: {
        name: string;
        version: string;
        build?: string;
    };
    generatedAt?: string;
    components: SemanticComponent[];
    nets: SemanticNet[];
    terminals: SemanticTerminal[];
    indexes: SemanticIndexMaps;
    assembly?: AssemblyState;
}

export interface PrismViewerClient {
    id: string;
    context: PrismSelectionContext;
    revisionKey?: string;
    isReady: () => boolean;
    applySelection: (selection: PrismSelection | null) => void | Promise<void>;
}

