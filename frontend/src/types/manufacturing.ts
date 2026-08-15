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

// The board-spec fields the per-project form edits, grouped for layout. `auto`
// marks a field the backend can suggest from the .kicad_pcb.
export interface SpecField {
    key: string;
    label: string;
    kind: "number" | "text" | "boolean" | "select";
    unit?: string;
    auto?: boolean;
    options?: string[];
}

export const SPEC_GROUPS: { title: string; fields: SpecField[] }[] = [
    {
        title: "Stackup & physical",
        fields: [
            { key: "layer_count", label: "Layer count", kind: "number", auto: true },
            { key: "board_thickness_mm", label: "Board thickness", kind: "number", unit: "mm", auto: true },
            { key: "board_width_mm", label: "Board width", kind: "number", unit: "mm", auto: true },
            { key: "board_height_mm", label: "Board height", kind: "number", unit: "mm", auto: true },
            { key: "copper_weight_oz", label: "Copper weight", kind: "number", unit: "oz" },
            { key: "min_track_mm", label: "Min track / space", kind: "number", unit: "mm" },
            { key: "min_drill_mm", label: "Min drill", kind: "number", unit: "mm" },
            { key: "material", label: "Material", kind: "text" },
        ],
    },
    {
        title: "Finish & cosmetic",
        fields: [
            { key: "solder_mask_color", label: "Solder-mask color", kind: "text" },
            { key: "silkscreen_color", label: "Silkscreen color", kind: "text" },
            {
                key: "surface_finish",
                label: "Surface finish",
                kind: "select",
                options: ["HASL", "Lead-free HASL", "ENIG", "OSP", "Immersion Silver", "Immersion Tin", "Hard Gold"],
                auto: true,
            },
            { key: "mask_type", label: "Mask type", kind: "select", options: ["Glossy", "Matte"] },
        ],
    },
    {
        title: "Process",
        fields: [
            { key: "impedance_controlled", label: "Impedance controlled", kind: "boolean" },
            { key: "castellated", label: "Castellated / edge plating", kind: "boolean", auto: true },
            { key: "ipc_class", label: "IPC class", kind: "select", options: ["1", "2", "3"] },
            { key: "panelization", label: "Panelization notes", kind: "text" },
        ],
    },
];
