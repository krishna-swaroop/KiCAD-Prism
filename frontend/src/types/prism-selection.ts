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
    /** Symbol lib_id (library:part), for checking library presence. */
    symbolLibId?: string;
    /** 3D model file name, for checking library presence. */
    modelName?: string;
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
}

export interface PrismViewerClient {
    id: string;
    context: PrismSelectionContext;
    revisionKey?: string;
    isReady: () => boolean;
    applySelection: (selection: PrismSelection | null) => void | Promise<void>;
}

