export interface Manufacturer {
    id: string;
    name: string;
    contact: string;
    website: string;
    notes: string;
    created_at: string;
    updated_at: string;
}

export interface BoardSpec {
    project_id: string;
    specs: Record<string, unknown>;
    source: Record<string, string>;
    updated_at: string | null;
    updated_by: string;
}

export type RunStatus = "draft" | "ordered" | "in_production" | "received" | "closed";

export interface ManufacturingRun {
    id: string;
    project_id: string;
    project_name?: string;
    relative_path?: string;
    manufacturer_id: string | null;
    manufacturer_name?: string | null;
    commit_sha: string;
    quantity_ordered: number;
    quantity_good: number;
    status: RunStatus;
    notes: string;
    spec_snapshot: Record<string, unknown>;
    created_by: string;
    created_at: string;
    updated_at: string;
    defect_count?: number;
    defects?: RunDefect[];
}

export type DefectSeverity = "minor" | "major" | "critical";
export type DefectStatus = "open" | "resolved" | "accepted";

export interface EvidenceDescriptor {
    kind: "photo" | "report";
    filename: string;
    digest: string;
    media_type: string;
    size: number;
}

export interface RunDefect {
    id: string;
    run_id: string;
    category: string;
    severity: DefectSeverity;
    quantity_affected: number;
    description: string;
    status: DefectStatus;
    evidence: EvidenceDescriptor[];
    logged_by: string;
    created_at: string;
    resolved_at: string | null;
}

// The run lifecycle, in order, for status pickers and timelines.
export const RUN_STATUSES: RunStatus[] = ["draft", "ordered", "in_production", "received", "closed"];

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
    draft: "Draft",
    ordered: "Ordered",
    in_production: "In production",
    received: "Received",
    closed: "Closed",
};

export const DEFECT_CATEGORIES: { value: string; label: string }[] = [
    { value: "soldering", label: "Soldering / assembly" },
    { value: "open_circuit", label: "Open circuit" },
    { value: "short_circuit", label: "Short circuit" },
    { value: "missing_component", label: "Missing component" },
    { value: "wrong_component", label: "Wrong component" },
    { value: "misalignment", label: "Misalignment" },
    { value: "solder_mask", label: "Solder-mask defect" },
    { value: "silkscreen", label: "Silkscreen defect" },
    { value: "drill_plating", label: "Drill / plating defect" },
    { value: "warping", label: "Warping" },
    { value: "contamination", label: "Contamination" },
    { value: "mechanical_damage", label: "Mechanical damage" },
    { value: "other", label: "Other" },
];

export function defectCategoryLabel(value: string): string {
    return DEFECT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

// The board-spec form is generated from a user-defined schema (.config), parsed by
// the backend into these shapes. `type` mirrors the config's field types.
export type SpecFieldType = "text" | "int" | "number" | "bool" | "choice";

export interface SpecFieldDef {
    key: string;
    label: string;
    type: SpecFieldType;
    options: string[];
    default: unknown;
}

export interface SpecSectionDef {
    title: string;
    fields: SpecFieldDef[];
}

export interface ParsedSpecConfig {
    sections: SpecSectionDef[];
    errors: string[];
}

export interface SpecTemplate {
    id: string;
    manufacturer_id: string;
    manufacturer_name?: string;
    name: string;
    spec_config: string;
    created_at: string;
    updated_at: string;
}

// Keys the board extractor can fill, so the form can show a "from board" hint on
// matching fields and the Extract button knows which values to expect.
export const EXTRACTABLE_KEYS = new Set<string>([
    "layer_count",
    "board_thickness_mm",
    "board_width_mm",
    "board_height_mm",
    "surface_finish",
    "castellated",
    "edge_plating",
]);
